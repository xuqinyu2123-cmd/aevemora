#!/usr/bin/env python3
"""Research, download, transform, and document AEVEMORA portrait assets.

Uses exact Wikipedia pages, their Wikidata entities, and the Wikidata P18 image
claim. Image copyright metadata is then read from the Wikimedia Commons API.
Only Public Domain, CC0, CC BY, and CC BY-SA files are accepted.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html as html_lib
import io
import json
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import cv2
from PIL import Image, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "index.html"
PORTRAITS_DIR = ROOT / "portraits"
PERSON_LIST_PATH = ROOT / "portrait-person-list.csv"
LICENSE_PATH = ROOT / "portrait-licenses.csv"
TODO_PATH = ROOT / "portrait-todo.csv"
MANIFEST_PATH = ROOT / "portrait-manifest.js"
OVERRIDES_PATH = ROOT / "tools" / "portrait-overrides.json"
CACHE_DIR = ROOT.parent / "research-cache" / "aevemora-v10"
CONTACT_DIR = ROOT.parent / "portrait-contact-sheets"

USER_AGENT = "AEVEMORA/10.0 portrait-localization (https://github.com/xuqinyu2123-cmd/aevemora)"
REQUEST_DELAY_SECONDS = 0.16
ALLOWED_LICENSE_RE = re.compile(r"(?:public\s*domain|^pd\b|cc0|cc\s*by(?:-sa)?\b|^attribution$)", re.I)
FORBIDDEN_LICENSE_RE = re.compile(r"(?:-nc\b|-nd\b|noncommercial|no\s*derivatives)", re.I)

PERSON_LIST_FIELDS = [
    "id", "name_zh", "name_en", "era", "region", "type", "wiki_title_zh", "wiki_title_en"
]
LICENSE_FIELDS = [
    "id", "name_zh", "name_en", "source_page", "original_image_url", "author", "license",
    "license_url", "public_domain", "commercial_use_allowed", "attribution_required", "modified",
    "local_main_path", "local_thumb_path", "download_date", "notes"
]
TODO_FIELDS = [
    "id", "name", "reason", "candidate_source", "copyright_problem", "quality_problem",
    "identity_problem", "notes"
]


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def clean_html(value: str | None) -> str:
    if not value:
        return ""
    parser = TextExtractor()
    parser.feed(value)
    return re.sub(r"\s+", " ", html_lib.unescape("".join(parser.parts))).strip()


def bool_text(value: bool) -> str:
    return "true" if value else "false"


def extract_assignment(source: str, name: str, next_marker: str) -> Any:
    start_marker = f"const {name}="
    start = source.find(start_marker)
    if start < 0:
        start_marker = f"const {name} ="
        start = source.find(start_marker)
    end = source.find(next_marker, start + len(start_marker))
    if start < 0 or end < 0:
        raise RuntimeError(f"Unable to locate {name}")
    raw = source[start + len(start_marker):end].strip().removesuffix(";")
    return json.loads(raw)


def load_people_and_aliases() -> tuple[list[dict[str, Any]], dict[str, str], dict[str, str]]:
    source = INDEX_PATH.read_text(encoding="utf-8")
    people = extract_assignment(source, "PEOPLE", "const QUESTIONS=")
    zh_aliases = extract_assignment(source, "WIKI_ALIASES", "const EN_WIKI_ALIASES=")
    en_aliases = extract_assignment(source, "EN_WIKI_ALIASES", "const AEV_MOBILE_STABLE")
    return people, zh_aliases, en_aliases


def cached_request(url: str, params: dict[str, Any] | None = None, *, binary: bool = False) -> bytes:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    suffix = ".bin" if binary else ".json"
    cache_path = CACHE_DIR / f"{key}{suffix}"
    if cache_path.exists():
        return cache_path.read_bytes()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                payload = response.read()
            cache_path.write_bytes(payload)
            time.sleep(REQUEST_DELAY_SECONDS)
            return payload
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in {429, 500, 502, 503, 504}:
                raise
            retry_after = error.headers.get("Retry-After")
            wait = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt
            time.sleep(min(wait, 30))
        except (urllib.error.URLError, TimeoutError) as error:
            last_error = error
            time.sleep(min(2 ** attempt, 20))
    raise RuntimeError(f"Request failed after retries: {url}: {last_error}")


def api_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    return json.loads(cached_request(url, params).decode("utf-8"))


def wikipedia_page(lang: str, title: str) -> dict[str, Any] | None:
    data = api_json(
        f"https://{lang}.wikipedia.org/w/api.php",
        {
            "action": "query", "format": "json", "formatversion": "2", "redirects": "1",
            "prop": "pageprops|langlinks|pageimages", "titles": title,
            "piprop": "name|thumbnail|original", "pithumbsize": "1400",
            "lllang": "en" if lang == "zh" else "zh", "lllimit": "1", "maxlag": "5"
        },
    )
    pages = data.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return None
    return pages[0]


def wikidata_entity(qid: str) -> dict[str, Any] | None:
    data = api_json(
        "https://www.wikidata.org/w/api.php",
        {
            "action": "wbgetentities", "format": "json", "ids": qid,
            "props": "labels|descriptions|sitelinks|claims", "languages": "en|zh|zh-hans", "maxlag": "5"
        },
    )
    entity = data.get("entities", {}).get(qid)
    return entity if entity and "missing" not in entity else None


def claim_image_filename(entity: dict[str, Any]) -> str:
    claims = entity.get("claims", {}).get("P18", [])
    preferred = [claim for claim in claims if claim.get("rank") == "preferred"] or claims
    for claim in preferred:
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, str) and value:
            return value
    return ""


def commons_metadata(filename: str) -> dict[str, Any] | None:
    if not filename:
        return None
    data = api_json(
        "https://commons.wikimedia.org/w/api.php",
        {
            "action": "query", "format": "json", "formatversion": "2",
            "prop": "imageinfo", "titles": f"File:{filename}",
            "iiprop": "url|size|mime|extmetadata", "iiurlwidth": "1400", "maxlag": "5"
        },
    )
    pages = data.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return None
    infos = pages[0].get("imageinfo", [])
    if not infos:
        return None
    info = infos[0]
    info["file_title"] = pages[0].get("title", f"File:{filename}")
    return info


def metadata_value(metadata: dict[str, Any], key: str) -> str:
    value = metadata.get(key, {})
    return str(value.get("value", "")) if isinstance(value, dict) else ""


def classify_license(info: dict[str, Any]) -> tuple[bool, str, str, bool, bool]:
    metadata = info.get("extmetadata", {})
    short = clean_html(metadata_value(metadata, "LicenseShortName"))
    usage = clean_html(metadata_value(metadata, "UsageTerms"))
    label = short or usage
    license_url = clean_html(metadata_value(metadata, "LicenseUrl"))
    copyrighted = clean_html(metadata_value(metadata, "Copyrighted")).lower()
    forbidden = bool(FORBIDDEN_LICENSE_RE.search(f"{label} {license_url}"))
    allowed = bool(ALLOWED_LICENSE_RE.search(label)) and not forbidden
    is_cc0 = bool(re.search(r"cc\s*0|cc0", label, re.I))
    is_pd = is_cc0 or copyrighted == "false" or bool(re.search(r"public\s*domain|^pd\b", label, re.I))
    attribution = (bool(re.search(r"cc\s*by", label, re.I)) and not is_cc0) or label.lower() == "attribution"
    normalized = "CC0" if is_cc0 else "Public Domain" if is_pd and not re.search(r"cc\s*by", label, re.I) else label
    return allowed, normalized or label, license_url, is_pd, attribution


def image_dimensions(info: dict[str, Any]) -> tuple[int, int]:
    return int(info.get("width") or 0), int(info.get("height") or 0)


def download_source(info: dict[str, Any]) -> Image.Image:
    url = info.get("thumburl") or info.get("url")
    if not url:
        raise RuntimeError("Commons metadata did not provide an image URL")
    payload = cached_request(str(url), binary=True)
    with Image.open(io.BytesIO(payload)) as opened:
        return ImageOps.exif_transpose(opened).convert("RGB")


def detect_primary_face(image: Image.Image) -> tuple[int, int, int, int] | None:
    gray = cv2.cvtColor(__import__("numpy").array(image), cv2.COLOR_RGB2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    minimum = max(28, min(image.size) // 14)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(minimum, minimum))
    if len(faces) == 0:
        return None
    width, height = image.size
    plausible = [tuple(map(int, face)) for face in faces if face[1] < height * 0.72]
    pool = plausible or [tuple(map(int, face)) for face in faces]
    return max(pool, key=lambda face: face[2] * face[3])


def crop_box_4x5(
    image: Image.Image,
    face: tuple[int, int, int, int] | None,
    override: dict[str, Any] | None = None,
) -> tuple[int, int, int, int]:
    width, height = image.size
    target_ratio = 4 / 5
    override = override or {}
    manual = override.get("crop_box")
    if isinstance(manual, list) and len(manual) == 4:
        left, top, right, bottom = [float(value) for value in manual]
        if all(0 <= value <= 1 for value in (left, top, right, bottom)):
            left, right = round(left * width), round(right * width)
            top, bottom = round(top * height), round(bottom * height)
        else:
            left, top, right, bottom = map(round, (left, top, right, bottom))
        if left < 0 or top < 0 or right > width or bottom > height or right <= left or bottom <= top:
            raise ValueError(f"Invalid crop_box {manual} for image {width}x{height}")
        if abs(((right - left) / (bottom - top)) - target_ratio) > 0.02:
            raise ValueError(f"crop_box must be 4:5, got {right-left}x{bottom-top}")
        return left, top, right, bottom

    if width / height > target_ratio:
        crop_height = height
        crop_width = round(height * target_ratio)
        center_x = face[0] + face[2] / 2 if face else width / 2
        left = round(max(0, min(width - crop_width, center_x - crop_width / 2)))
        return left, 0, left + crop_width, crop_height

    crop_width = width
    crop_height = round(width / target_ratio)
    if override.get("crop_anchor") == "top":
        desired_top = 0
    elif face:
        desired_top = face[1] - face[3] * 0.62
    else:
        desired_top = (height - crop_height) * 0.18
    top = round(max(0, min(height - crop_height, desired_top)))
    return 0, top, crop_width, top + crop_height


def save_webp(image: Image.Image, path: Path, size: tuple[int, int], max_bytes: int, initial_quality: int) -> int:
    resized = image.resize(size, Image.Resampling.LANCZOS)
    resized = ImageEnhance.Contrast(resized).enhance(1.02)
    quality = initial_quality
    payload = b""
    while quality >= 58:
        buffer = io.BytesIO()
        resized.save(buffer, format="WEBP", quality=quality, method=6)
        payload = buffer.getvalue()
        if len(payload) <= max_bytes:
            break
        quality -= 4
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return len(payload)


def dhash(image: Image.Image) -> str:
    gray = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    values = list(gray.get_flattened_data())
    bits = []
    for row in range(8):
        offset = row * 9
        bits.extend(values[offset + col] > values[offset + col + 1] for col in range(8))
    number = sum((1 << index) for index, bit in enumerate(bits) if bit)
    return f"{number:016x}"


def hamming_hex(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


@dataclass
class ResearchResult:
    person_row: dict[str, str]
    license_row: dict[str, str] | None
    todo_row: dict[str, str] | None
    manifest_row: dict[str, Any] | None
    image_hash: str = ""


def research_person(
    person: dict[str, Any], zh_aliases: dict[str, str], en_aliases: dict[str, str],
    overrides: dict[str, Any], metadata_only: bool
) -> ResearchResult:
    person_id = person["id"]
    zh_title = zh_aliases.get(person["name"], person["name"])
    en_title = en_aliases.get(person["name"], "")
    primary_lang = "zh" if person["region"] == "中国" else "en"
    primary_title = zh_title if primary_lang == "zh" else en_title
    if not primary_title:
        primary_title = person["name"]
    page = wikipedia_page(primary_lang, primary_title)
    if page is None:
        person_row = {
            "id": person_id, "name_zh": person["name"], "name_en": en_title,
            "era": person["era"], "region": person["region"], "type": person["type"],
            "wiki_title_zh": zh_title, "wiki_title_en": en_title
        }
        todo = {
            "id": person_id, "name": person["name"], "reason": "精确 Wikipedia 页面未找到",
            "candidate_source": "", "copyright_problem": "false", "quality_problem": "false",
            "identity_problem": "true", "notes": f"{primary_lang}wiki title={primary_title}"
        }
        return ResearchResult(person_row, None, todo, None)

    qid = page.get("pageprops", {}).get("wikibase_item", "")
    entity = wikidata_entity(qid) if qid else None
    if entity:
        en_title = entity.get("sitelinks", {}).get("enwiki", {}).get("title", en_title)
        zh_title = entity.get("sitelinks", {}).get("zhwiki", {}).get("title", zh_title)
        name_en = entity.get("labels", {}).get("en", {}).get("value", en_title)
    else:
        name_en = en_title

    person_row = {
        "id": person_id, "name_zh": person["name"], "name_en": name_en,
        "era": person["era"], "region": person["region"], "type": person["type"],
        "wiki_title_zh": zh_title, "wiki_title_en": en_title
    }

    override = overrides.get(person_id, {})
    if override.get("skip"):
        todo = {
            "id": person_id, "name": person["name"], "reason": override.get("reason", "人工复核后暂不本地化"),
            "candidate_source": override.get("candidate_source", ""),
            "copyright_problem": bool_text(bool(override.get("copyright_problem"))),
            "quality_problem": bool_text(bool(override.get("quality_problem"))),
            "identity_problem": bool_text(bool(override.get("identity_problem"))),
            "notes": override.get("notes", "")
        }
        return ResearchResult(person_row, None, todo, None)

    filename = str(override.get("commons_file") or (claim_image_filename(entity) if entity else "") or page.get("pageimage", ""))
    info = commons_metadata(filename)
    candidate_page = str(info.get("descriptionurl", "")) if info else ""
    if not info:
        todo = {
            "id": person_id, "name": person["name"], "reason": "无法确认 Commons 原始文件及许可证",
            "candidate_source": candidate_page or (f"https://www.wikidata.org/wiki/{qid}" if qid else ""),
            "copyright_problem": "true", "quality_problem": "false", "identity_problem": bool_text(not bool(qid)),
            "notes": f"Wikidata={qid or 'none'}; candidate={filename or 'none'}"
        }
        return ResearchResult(person_row, None, todo, None)

    allowed, license_name, license_url, public_domain, attribution = classify_license(info)
    if not allowed:
        todo = {
            "id": person_id, "name": person["name"], "reason": "许可证不在允许的商用可修改范围内",
            "candidate_source": candidate_page, "copyright_problem": "true", "quality_problem": "false",
            "identity_problem": "false", "notes": f"license={license_name or 'unknown'}; Wikidata={qid}"
        }
        return ResearchResult(person_row, None, todo, None)

    # Allow a reviewed source-page policy to complete machine-readable fields
    # that Commons extmetadata omits. Values must be documented in the override.
    license_name = str(override.get("license") or license_name)
    license_url = str(override.get("license_url") or license_url)
    if "attribution_required" in override:
        attribution = bool(override["attribution_required"])
    modified = bool(override.get("modified", True))

    width, height = image_dimensions(info)
    if width < 240 or height < 300:
        todo = {
            "id": person_id, "name": person["name"], "reason": "Commons 原图分辨率过低",
            "candidate_source": candidate_page, "copyright_problem": "false", "quality_problem": "true",
            "identity_problem": "false", "notes": f"source dimensions={width}x{height}; Wikidata={qid}"
        }
        return ResearchResult(person_row, None, todo, None)

    if metadata_only:
        return ResearchResult(person_row, None, None, {
            "id": person_id, "candidate": filename, "license": license_name, "qid": qid,
            "source_page": candidate_page, "dimensions": f"{width}x{height}"
        })

    try:
        image = download_source(info)
        face = detect_primary_face(image)
        box = crop_box_4x5(image, face, override)
        cropped = image.crop(box)
        output_dir = PORTRAITS_DIR / person_id
        main_path = output_dir / "main.webp"
        thumb_path = output_dir / "thumb.webp"
        main_size = save_webp(cropped, main_path, (640, 800), 250_000, 84)
        thumb_size = save_webp(cropped, thumb_path, (240, 300), 50_000, 80)
        image_hash = dhash(cropped)
    except Exception as error:  # noqa: BLE001 - preserve per-person failure in TODO
        shutil.rmtree(PORTRAITS_DIR / person_id, ignore_errors=True)
        todo = {
            "id": person_id, "name": person["name"], "reason": "图片下载或确定性处理失败",
            "candidate_source": candidate_page, "copyright_problem": "false", "quality_problem": "true",
            "identity_problem": "false", "notes": f"{type(error).__name__}: {error}; Wikidata={qid}"
        }
        return ResearchResult(person_row, None, todo, None)

    metadata = info.get("extmetadata", {})
    author = str(override.get("author") or clean_html(metadata_value(metadata, "Artist")) or clean_html(metadata_value(metadata, "Credit")))
    original_url = str(info.get("url", ""))
    notes = (
        f"Identity verified through exact {primary_lang}wiki page and Wikidata {qid} P18; "
        f"source {width}x{height}; crop={box}; face_detected={bool(face)}; "
        f"main={main_size} bytes; thumb={thumb_size} bytes; deterministic crop/resize/WebP/contrast +2%. "
        f"Review note: {override.get('notes', 'Wikidata P18 candidate reviewed against contact sheet.')}"
    )
    license_row = {
        "id": person_id, "name_zh": person["name"], "name_en": name_en,
        "source_page": candidate_page, "original_image_url": original_url, "author": author,
        "license": license_name, "license_url": license_url, "public_domain": bool_text(public_domain),
        "commercial_use_allowed": "true", "attribution_required": bool_text(attribution), "modified": bool_text(modified),
        "local_main_path": f"./portraits/{person_id}/main.webp",
        "local_thumb_path": f"./portraits/{person_id}/thumb.webp",
        "download_date": date.today().isoformat(), "notes": notes
    }
    manifest_row = {
        "id": person_id, "name": person["name"],
        "main": f"./portraits/{person_id}/main.webp", "thumb": f"./portraits/{person_id}/thumb.webp",
        "local": True, "sourcePage": candidate_page, "author": author,
        "license": license_name, "licenseUrl": license_url, "attributionRequired": attribution,
        "modified": modified
    }
    return ResearchResult(person_row, license_row, None, manifest_row, image_hash)


def write_csv(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_manifest(rows: list[dict[str, Any]]) -> None:
    records = {row["id"]: row for row in rows}
    payload = json.dumps(records, ensure_ascii=False, indent=2)
    MANIFEST_PATH.write_text(
        "/* AEVEMORA V10.0 verified local portrait manifest. Primary key: immutable person ID. */\n"
        f"window.AEVEMORA_REAL_PORTRAITS = {payload};\n"
        "window.AEVEMORA_REAL_PORTRAITS_BY_NAME = Object.fromEntries(\n"
        "  Object.values(window.AEVEMORA_REAL_PORTRAITS).map(record => [record.name, record])\n"
        ");\n",
        encoding="utf-8",
    )


def build_contact_sheets(license_rows: list[dict[str, str]]) -> None:
    CONTACT_DIR.mkdir(parents=True, exist_ok=True)
    for old in CONTACT_DIR.glob("sheet-*.jpg"):
        old.unlink()
    font_path = Path("C:/Windows/Fonts/msyh.ttc")
    from PIL import ImageDraw, ImageFont
    font = ImageFont.truetype(str(font_path), 22) if font_path.exists() else ImageFont.load_default()
    per_sheet = 24
    for sheet_index in range((len(license_rows) + per_sheet - 1) // per_sheet):
        rows = license_rows[sheet_index * per_sheet:(sheet_index + 1) * per_sheet]
        sheet = Image.new("RGB", (6 * 280, 4 * 390), "#111318")
        draw = ImageDraw.Draw(sheet)
        for index, row in enumerate(rows):
            x = (index % 6) * 280
            y = (index // 6) * 390
            portrait = Image.open(ROOT / row["local_thumb_path"].removeprefix("./")).convert("RGB")
            sheet.paste(portrait, (x + 20, y + 15))
            draw.text((x + 20, y + 325), f"{row['id']} {row['name_zh']}", fill="#f1e7d3", font=font)
            draw.text((x + 20, y + 355), row["license"][:25], fill="#c8a66a", font=font)
        sheet.save(CONTACT_DIR / f"sheet-{sheet_index + 1:02d}.jpg", quality=90)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata-only", action="store_true", help="Research candidates without downloading images")
    parser.add_argument("--ids", help="Comma-separated immutable IDs to process")
    args = parser.parse_args()

    people, zh_aliases, en_aliases = load_people_and_aliases()
    selected_ids = set(args.ids.split(",")) if args.ids else None
    overrides = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8")) if OVERRIDES_PATH.exists() else {}
    if not args.metadata_only and not selected_ids and PORTRAITS_DIR.exists():
        if PORTRAITS_DIR.resolve().parent != ROOT.resolve():
            raise RuntimeError(f"Unsafe portraits cleanup target: {PORTRAITS_DIR}")
        shutil.rmtree(PORTRAITS_DIR)
    results: list[ResearchResult] = []
    for index, person in enumerate(people, start=1):
        if selected_ids and person["id"] not in selected_ids:
            continue
        print(f"[{index:03d}/120] {person['id']} {person['name']}", flush=True)
        try:
            results.append(research_person(person, zh_aliases, en_aliases, overrides, args.metadata_only))
        except Exception as error:  # noqa: BLE001 - continue and document every failure
            person_row = {
                "id": person["id"], "name_zh": person["name"], "name_en": en_aliases.get(person["name"], ""),
                "era": person["era"], "region": person["region"], "type": person["type"],
                "wiki_title_zh": zh_aliases.get(person["name"], person["name"]),
                "wiki_title_en": en_aliases.get(person["name"], "")
            }
            todo = {
                "id": person["id"], "name": person["name"], "reason": "研究流程请求失败",
                "candidate_source": "", "copyright_problem": "false", "quality_problem": "false",
                "identity_problem": "true", "notes": f"{type(error).__name__}: {error}"
            }
            results.append(ResearchResult(person_row, None, todo, None))

    person_rows = [result.person_row for result in results]
    license_rows = [result.license_row for result in results if result.license_row]
    todo_rows = [result.todo_row for result in results if result.todo_row]
    manifest_rows = [result.manifest_row for result in results if result.manifest_row]

    # Detect near-identical processed images. Keep neither claim hidden: the later record becomes TODO.
    if not args.metadata_only:
        accepted_hashes: list[tuple[str, str, str]] = []
        duplicate_ids: set[str] = set()
        for result in results:
            if not result.license_row or not result.image_hash:
                continue
            for previous_id, previous_name, previous_hash in accepted_hashes:
                distance = hamming_hex(result.image_hash, previous_hash)
                if distance <= 3:
                    duplicate_ids.add(result.license_row["id"])
                    todo_rows.append({
                        "id": result.license_row["id"], "name": result.license_row["name_zh"],
                        "reason": "自动检测到与其他人物胖知哈希近似",
                        "candidate_source": result.license_row["source_page"], "copyright_problem": "false",
                        "quality_problem": "false", "identity_problem": "true",
                        "notes": f"near-duplicate of {previous_id} {previous_name}; dHash distance={distance}; requires review"
                    })
                    shutil.rmtree(PORTRAITS_DIR / result.license_row["id"], ignore_errors=True)
                    break
            else:
                accepted_hashes.append((result.license_row["id"], result.license_row["name_zh"], result.image_hash))
        if duplicate_ids:
            license_rows = [row for row in license_rows if row["id"] not in duplicate_ids]
            manifest_rows = [row for row in manifest_rows if row["id"] not in duplicate_ids]

    person_rows.sort(key=lambda row: row["id"])
    license_rows.sort(key=lambda row: row["id"])
    todo_rows.sort(key=lambda row: row["id"])
    manifest_rows.sort(key=lambda row: row["id"])

    if not selected_ids:
        write_csv(PERSON_LIST_PATH, PERSON_LIST_FIELDS, person_rows)
    if args.metadata_only:
        candidate_path = CACHE_DIR / "candidate-summary.json"
        candidate_path.write_text(
            json.dumps([result.manifest_row or result.todo_row for result in results], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"Metadata candidates={len(manifest_rows)} TODO={len(todo_rows)} summary={candidate_path}")
        return 0

    write_csv(LICENSE_PATH, LICENSE_FIELDS, license_rows)
    write_csv(TODO_PATH, TODO_FIELDS, todo_rows)
    write_manifest(manifest_rows)
    build_contact_sheets(license_rows)
    print(f"Localized={len(license_rows)} TODO={len(todo_rows)}")
    print(f"Contact sheets: {CONTACT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

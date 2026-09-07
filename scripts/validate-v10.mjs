import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const read = (path) => readFileSync(resolve(root, path));
const text = (path) => read(path).toString("utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const baseline = JSON.parse(text("tools/baselines/v9.9.3-ranking-baseline.json"));
const html = text("index.html");
const results = [];

function check(name, condition, detail = "") {
  const passed = Boolean(condition);
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function extractJsonAssignment(name, nextMarker) {
  const startMarker = `const ${name}=`;
  const start = html.indexOf(startMarker);
  const end = html.indexOf(nextMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to locate ${name}`);
  return JSON.parse(html.slice(start + startMarker.length, end).trim().replace(/;$/, ""));
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Unable to locate function ${name}`);
  const braceStart = html.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = braceStart; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quoted) {
      if (ch === '"' && raw[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [rawHeaders, ...data] = rows;
  const headers = rawHeaders.map((header, i) => i === 0 ? header.replace(/^\uFEFF/, "") : header);
  return data.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
}

function parseWebP(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("Invalid WebP header");
  }
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (kind === "VP8 ") {
      return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff };
    }
    if (kind === "VP8L") {
      const bits = buffer.readUInt32LE(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X") {
      return { width: buffer.readUIntLE(data + 4, 3) + 1, height: buffer.readUIntLE(data + 7, 3) + 1 };
    }
    offset = data + size + (size % 2);
  }
  throw new Error("WebP dimensions not found");
}

function loadManifest() {
  const context = { window: {} };
  vm.createContext(context);
  new vm.Script(text("portrait-manifest.js"), { filename: "portrait-manifest.js" }).runInContext(context);
  return context.window.AEVEMORA_REAL_PORTRAITS || {};
}

function rankPeople(people, user, mode) {
  const keys = ["control", "creative", "resilience", "empathy", "drive", "insight"];
  const pool = mode === "china" ? people.filter((p) => p.region === "中国")
    : mode === "foreign" ? people.filter((p) => p.region === "外国") : people;
  return pool.map((person) => {
    const distance = Math.sqrt(keys.reduce((sum, key, i) => sum + (user[key] - person.v[i]) ** 2, 0) / 6);
    return { name: person.name, sim: Number(Math.max(52, Math.min(97, 100 - distance * 0.72)).toFixed(12)) };
  }).sort((a, b) => b.sim - a.sim);
}

async function checkHttpLoad() {
  const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webp": "image/webp" };
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const path = resolve(root, relative);
    if (!path.startsWith(root + sep) && path !== resolve(root, "index.html")) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = readFileSync(path);
      response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  try {
    const { port } = server.address();
    const statuses = await Promise.all(["/", "/portrait-manifest.js", "/portraits/P001/main.webp", "/portraits/P120/thumb.webp"]
      .map(async (path) => (await fetch(`http://127.0.0.1:${port}${path}`)).status));
    return statuses.every((status) => status === 200);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

const people = extractJsonAssignment("PEOPLE", "const QUESTIONS=");
const questions = extractJsonAssignment("QUESTIONS", "const DIM_KEYS=");
const strippedPeople = people.map(({ id, ...person }) => person);
const personList = parseCsv(text("portrait-person-list.csv"));
const licenses = parseCsv(text("portrait-licenses.csv"));
const todo = parseCsv(text("portrait-todo.csv"));
const manifest = loadManifest();
const attributionRows = licenses.filter((row) => row.attribution_required === "true");
const ids = people.map((person) => person.id);
const expectedIds = Array.from({ length: 120 }, (_, i) => `P${String(i + 1).padStart(3, "0")}`);

check("target branch is active", execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim() === "v10-local-portraits");
check("local main still points to V9 baseline", execFileSync("git", ["rev-parse", "main"], { cwd: root, encoding: "utf8" }).trim() === baseline.sourceCommit);
check("120 PEOPLE records detected", people.length === 120, String(people.length));
check("stable IDs are complete and ordered", JSON.stringify(ids) === JSON.stringify(expectedIds));
check("stable IDs are unique", new Set(ids).size === 120);
check("China/foreign split remains 60/60", people.filter((p) => p.region === "中国").length === 60 && people.filter((p) => p.region === "外国").length === 60);
check("person data other than ID is unchanged", sha256(JSON.stringify(strippedPeople)) === baseline.peopleWithoutIdSha256);
check("36 questions remain unchanged", questions.length === 36 && sha256(JSON.stringify(questions)) === baseline.questionsSha256);

for (const name of ["normalize", "similarity", "rank"]) {
  check(`${name} algorithm source is unchanged`, sha256(extractFunction(name)) === baseline.algorithmSources[name].sha256);
}

const currentRankings = Object.fromEntries(Object.entries(baseline.profiles).map(([profile, user]) => [
  profile,
  Object.fromEntries(["mixed", "china", "foreign"].map((mode) => [mode, rankPeople(people, user, mode)]))
]));
check("all baseline ranking outputs are unchanged", JSON.stringify(currentRankings) === JSON.stringify(baseline.rankings));

const requiredPersonColumns = ["id", "name_zh", "name_en", "era", "region", "type", "wiki_title_zh", "wiki_title_en"];
check("person CSV contains 120 rows", personList.length === 120, String(personList.length));
check("person CSV has no required blank fields", personList.every((row) => requiredPersonColumns.every((column) => (row[column] || "").trim())));
check("person CSV IDs and Chinese names match PEOPLE", personList.every((row, i) => row.id === people[i].id && row.name_zh === people[i].name));

const manifestEntries = Object.entries(manifest);
check("manifest contains 118 localized portraits", manifestEntries.length === 118, String(manifestEntries.length));
check("manifest is keyed by stable person ID", manifestEntries.every(([id, record]) => id === record.id && expectedIds.includes(id) && record.local === true && Object.hasOwn(record, "modified")));
check("license/TODO coverage is exactly 120 people", licenses.length === 118 && todo.length === 2 && new Set([...licenses, ...todo].map((row) => row.id)).size === 120);
check("license and TODO sets are disjoint", licenses.every((row) => !todo.some((item) => item.id === row.id)));
const completeAttributionRows = attributionRows.filter((row) => {
  const record = manifest[row.id];
  return [row.author, row.license, row.license_url, row.source_page, row.modified].every((value) => value?.trim())
    && /^https:\/\//.test(row.license_url)
    && /^https:\/\//.test(row.source_page)
    && record?.attributionRequired === true
    && record.author === row.author
    && record.license === row.license
    && record.licenseUrl === row.license_url
    && record.sourcePage === row.source_page
    && Object.hasOwn(record, "modified");
});
check("attribution metadata is complete and commercial-use flags remain valid",
  licenses.every((row) => row.commercial_use_allowed === "true" && /^(Public Domain|CC0|CC BY(?:-SA)?|Attribution)/.test(row.license))
    && attributionRows.length === 13
    && completeAttributionRows.length === attributionRows.length,
  `${completeAttributionRows.length}/${attributionRows.length} attribution records complete`);
check("all localized portraits have traceable sources", licenses.every((row) => /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(row.source_page) && /^https:\/\//.test(row.original_image_url)));

const expectedFiles = new Set();
const hashes = new Map();
let imageFilesValid = true;
let sizeLimitsValid = true;
let maxMain = 0;
let maxThumb = 0;
for (const [id, record] of manifestEntries) {
  for (const [variant, width, height, maxBytes] of [["main", 640, 800, 250000], ["thumb", 240, 300, 50000]]) {
    const relative = record[variant].replace(/^\.\//, "");
    expectedFiles.add(relative.replaceAll("/", sep));
    try {
      const buffer = read(relative);
      const dimensions = parseWebP(buffer);
      imageFilesValid &&= dimensions.width === width && dimensions.height === height;
      sizeLimitsValid &&= buffer.length <= maxBytes;
      if (variant === "main") maxMain = Math.max(maxMain, buffer.length);
      else maxThumb = Math.max(maxThumb, buffer.length);
      const hash = sha256(buffer);
      hashes.set(hash, [...(hashes.get(hash) || []), relative]);
    } catch {
      imageFilesValid = false;
    }
    imageFilesValid &&= relative === `portraits/${id}/${variant}.webp`;
  }
}
const actualFiles = readdirSync(resolve(root, "portraits"), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile()).map((entry) => resolve(entry.parentPath, entry.name).slice(resolve(root, "portraits").length + 1));
check("portrait paths and exact dimensions are valid", imageFilesValid);
check("portrait size limits are satisfied", sizeLimitsValid, `main max ${maxMain} B; thumb max ${maxThumb} B`);
check("portrait folder contains exactly 236 WebP files", actualFiles.length === 236 && actualFiles.every((path) => path.endsWith(".webp")), String(actualFiles.length));
check("portrait filenames contain no Chinese characters", actualFiles.every((path) => !/[\u3400-\u9fff]/u.test(path)));
check("no exact duplicate portrait binaries", [...hashes.values()].every((paths) => paths.length === 1));

let portraitDataUnchanged = true;
try {
  execFileSync("git", ["diff", "--quiet", baseline.sourceCommit, "--", "portrait-data.js"], { cwd: root, stdio: "pipe" });
} catch {
  portraitDataUnchanged = false;
}
check("portrait-data.js fallback is unchanged", portraitDataUnchanged);

const sw = text("sw.js");
const staticCore = sw.match(/const STATIC_CORE=\[([\s\S]*?)\];/)?.[1] || "";
check("Service Worker uses a separate portrait runtime cache", sw.includes("const PORTRAIT_CACHE=") && sw.includes("caches.open(PORTRAIT_CACHE)") && sw.includes("main|thumb") && sw.includes("url.pathname"));
check("Service Worker install does not preload portrait images", !staticCore.includes("portraits/P"));

const top5Source = extractFunction("hydrateRankPortrait");
const mainSource = extractFunction("setMainPortrait");
const posterSource = extractFunction("loadPosterPortrait");
check("main chain checks local main before network fallback", mainSource.indexOf("local.main") < mainSource.indexOf("fetchWikiPortrait(person)"));
check("Top 5 chain uses local thumb then Cloudflare proxy", top5Source.includes("local.thumb") && top5Source.includes("proxyPortraitRecord(person)") && !top5Source.includes("fetchWikiPortrait"));
check("poster prefers local main", posterSource.includes("realPortraitRecord(last.best)") && posterSource.includes("local.main"));
const attributionUiSource = extractFunction("setPortraitCredit");
check("manifest-backed attribution UI is accessible without title-only metadata",
  html.includes("./portrait-manifest.js?v=10.0.0")
    && /<details\s+id="portraitAttribution"/.test(html)
    && /<summary>/.test(html)
    && html.includes('id="portraitAttributionAuthor"')
    && html.includes('id="portraitAttributionLicenseLink"')
    && html.includes('id="portraitAttributionSourceLink"')
    && html.includes('id="portraitAttributionModified"')
    && html.includes('target="_blank" rel="noopener noreferrer"')
    && attributionUiSource.includes("author.textContent")
    && attributionUiSource.includes("licenseLink.href=record.licenseUrl")
    && attributionUiSource.includes("sourceLink.href=sourceUrl")
    && attributionUiSource.includes("本肖像经过裁切、缩放、WebP 格式转换及轻微对比度调整。")
    && !attributionUiSource.includes(".title"));

let inlineSyntaxValid = true;
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  if (!match[1].trim()) continue;
  try { new vm.Script(match[1]); } catch { inlineSyntaxValid = false; }
}
for (const file of ["sw.js", "portrait-manifest.js"]) {
  try { execFileSync(process.execPath, ["--check", resolve(root, file)], { stdio: "pipe" }); } catch { inlineSyntaxValid = false; }
}
check("production JavaScript syntax is valid", inlineSyntaxValid);
check("key production files load over local HTTP", await checkHttpLoad());

const changedPaths = execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replaceAll("\\", "/"));
const committedPaths = execFileSync("git", ["diff", "--name-only", `${baseline.sourceCommit}..HEAD`], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean);
check("no V9.x history directory is modified", [...changedPaths, ...committedPaths].every((path) => !path.startsWith("AEVEMORA_V9_")));

const passed = results.filter((result) => result.passed).length;
console.log(`\nV10 validation: ${passed}/${results.length} checks passed.`);
if (passed !== results.length) process.exitCode = 1;

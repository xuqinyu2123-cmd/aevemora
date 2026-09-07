import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const indexPath = resolve(root, "index.html");
const outputPath = resolve(root, "tools", "baselines", "v9.9.3-ranking-baseline.json");
const html = readFileSync(indexPath, "utf8");

function extractJsonAssignment(name, nextMarker) {
  const startMarker = `const ${name}=`;
  const start = html.indexOf(startMarker);
  const end = html.indexOf(nextMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Unable to locate ${name}`);
  const raw = html.slice(start + startMarker.length, end).trim().replace(/;$/, "");
  return { raw, value: JSON.parse(raw) };
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
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const peopleBlock = extractJsonAssignment("PEOPLE", "const QUESTIONS=");
const questionsBlock = extractJsonAssignment("QUESTIONS", "const DIM_KEYS=");
const people = peopleBlock.value;
const questions = questionsBlock.value;
const dimKeys = ["control", "creative", "resilience", "empathy", "drive", "insight"];

const profiles = {
  balanced: { control: 60, creative: 60, resilience: 60, empathy: 60, drive: 60, insight: 60 },
  command: { control: 94, creative: 38, resilience: 72, empathy: 36, drive: 91, insight: 70 },
  creator: { control: 41, creative: 96, resilience: 52, empathy: 68, drive: 76, insight: 87 },
  humanist: { control: 48, creative: 73, resilience: 69, empathy: 95, drive: 51, insight: 82 },
  resilient: { control: 66, creative: 43, resilience: 96, empathy: 71, drive: 78, insight: 64 },
  analyst: { control: 79, creative: 81, resilience: 62, empathy: 42, drive: 55, insight: 97 }
};

function similarity(user, person) {
  const values = dimKeys.map((key) => user[key]);
  const distance = Math.sqrt(values.reduce((sum, value, i) => sum + (value - person.v[i]) ** 2, 0) / 6);
  return Math.max(52, Math.min(97, 100 - distance * 0.72));
}

function ranking(user, mode) {
  const pool = mode === "china"
    ? people.filter((person) => person.region === "中国")
    : mode === "foreign"
      ? people.filter((person) => person.region === "外国")
      : people;
  return pool
    .map((person) => ({ name: person.name, sim: Number(similarity(user, person).toFixed(12)) }))
    .sort((a, b) => b.sim - a.sim);
}

const algorithmSources = Object.fromEntries(
  ["normalize", "similarity", "rank"].map((name) => {
    const source = extractFunction(name);
    return [name, { source, sha256: sha256(source) }];
  })
);

const baseline = {
  schema: "aevemora-v10-baseline-v1",
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  peopleCount: people.length,
  questionCount: questions.length,
  people,
  peopleWithoutIdSha256: sha256(JSON.stringify(people)),
  questions,
  questionsSha256: sha256(JSON.stringify(questions)),
  algorithmSources,
  profiles,
  rankings: Object.fromEntries(
    Object.entries(profiles).map(([profileName, user]) => [
      profileName,
      Object.fromEntries(["mixed", "china", "foreign"].map((mode) => [mode, ranking(user, mode)]))
    ])
  )
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
console.log(`PEOPLE=${people.length} QUESTIONS=${questions.length}`);


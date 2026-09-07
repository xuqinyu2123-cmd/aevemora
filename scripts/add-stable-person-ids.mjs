import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const indexPath = resolve(root, "index.html");
const html = readFileSync(indexPath, "utf8");
const startMarker = "const PEOPLE=";
const endMarker = "const QUESTIONS=";
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker, start + startMarker.length);
if (start < 0 || end < 0) throw new Error("Unable to locate PEOPLE array");

const prefix = html.slice(0, start + startMarker.length);
const block = html.slice(start + startMarker.length, end);
const suffix = html.slice(end);
const before = JSON.parse(block.trim().replace(/;$/, ""));

if (before.length !== 120) throw new Error(`Expected 120 people, found ${before.length}`);
if (before.some((person) => Object.hasOwn(person, "id"))) {
  throw new Error("PEOPLE already contains id fields; refusing to reassign permanent IDs");
}

let assigned = 0;
const updatedBlock = block.replace(/\{"name": /g, () => {
  assigned += 1;
  return `{"id": "P${String(assigned).padStart(3, "0")}", "name": `;
});
if (assigned !== 120) throw new Error(`Expected to assign 120 IDs, assigned ${assigned}`);

const after = JSON.parse(updatedBlock.trim().replace(/;$/, ""));
for (let i = 0; i < before.length; i += 1) {
  const { id, ...withoutId } = after[i];
  const expectedId = `P${String(i + 1).padStart(3, "0")}`;
  if (id !== expectedId) throw new Error(`Unexpected ID at position ${i + 1}: ${id}`);
  if (JSON.stringify(withoutId) !== JSON.stringify(before[i])) {
    throw new Error(`Non-ID data changed for ${before[i].name}`);
  }
}

writeFileSync(indexPath, `${prefix}${updatedBlock}${suffix}`, "utf8");
console.log("Assigned immutable IDs P001-P120 without changing existing PEOPLE fields or order.");


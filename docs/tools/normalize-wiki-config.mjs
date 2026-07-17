import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(scriptDir, "..", "wiki", "mkdocs.yml");
const checkOnly = process.argv.includes("--check");
const original = await readFile(configPath, "utf8");
let normalized = `${original.replace(/\r\n?/g, "\n").trimEnd()}\n`;
normalized = normalized.replace(/^plugins:\n  - search[ \t]*$/m, "plugins: []");

const removedGuidePath = /(?:en|zh)\/(?:learn|manual|architecture)\//;
if (removedGuidePath.test(normalized)) {
    throw new Error("mkdocs.yml still references a removed guide, manual, or architecture page.");
}
if (!/^plugins: \[\]$/m.test(normalized)) {
    throw new Error("mkdocs.yml must keep the unused MkDocs search plugin disabled.");
}

const comparableOriginal = original.replace(/\r\n?/g, "\n");
if (normalized === comparableOriginal) {
    console.log("Verified API-only Wiki navigation and custom-search-only plugin policy.");
} else if (checkOnly) {
    console.error("mkdocs.yml is stale; run node docs/tools/normalize-wiki-config.mjs");
    process.exit(1);
} else {
    await writeFile(configPath, normalized, "utf8");
    console.log("Normalized the API-only Wiki configuration.");
}

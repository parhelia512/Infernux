import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const configPath = path.join(docsRoot, "wiki", "mkdocs.yml");
const learningPath = path.join(docsRoot, "learning-paths.json");
const checkOnly = process.argv.includes("--check");

const [original, learningModel] = await Promise.all([
    readFile(configPath, "utf8"),
    readFile(learningPath, "utf8").then(JSON.parse)
]);
const firstFlight = learningModel.paths?.find((entry) => entry.id === "first-flight");
if (!firstFlight?.steps?.length) throw new Error("learning-paths.json is missing the first-flight steps");

function markdownPath(urlValue, language) {
    const url = new URL(urlValue, "https://infernux-engine.com");
    const prefix = `/wiki/site/${language}/`;
    if (!url.pathname.startsWith(prefix) || !url.pathname.endsWith(".html")) {
        throw new Error(`unsafe ${language} learning URL '${url.pathname}'`);
    }
    return `${language}/${url.pathname.slice(prefix.length, -5)}.md`;
}

const lines = original.replace(/\r\n?/g, "\n").split("\n");
for (const [language, modelLanguage] of [["en", "en"], ["zh", "zh-CN"]]) {
    const desired = firstFlight.steps.map((step) => markdownPath(step.documents?.[modelLanguage], language));
    const candidates = lines
        .map((line, index) => (/^    - (?:Learn|learn):\s*$/.test(line) ? index : -1))
        .filter((index) => index >= 0);
    const start = candidates.find((candidate) => {
        const next = lines.findIndex((line, index) => index > candidate && /^    - /.test(line));
        const block = lines.slice(candidate + 1, next < 0 ? lines.length : next);
        return desired.every((target) => block.some((line) => line.endsWith(`: ${target}`)));
    });
    if (!Number.isInteger(start)) throw new Error(`mkdocs.yml is missing the ${language} First Flight navigation block`);
    const nextGroup = lines.findIndex((line, index) => index > start && /^    - /.test(line));
    const end = nextGroup < 0 ? lines.length : nextGroup;
    const block = lines.slice(start + 1, end);
    const ordered = desired.map((target) => {
        const matches = block.filter((line) => line.endsWith(`: ${target}`));
        if (matches.length !== 1) throw new Error(`mkdocs.yml must contain exactly one '${target}' entry`);
        return matches[0];
    });
    const remainder = block.filter((line) => !desired.some((target) => line.endsWith(`: ${target}`)));
    lines.splice(start + 1, block.length, ...ordered, ...remainder);
}

let normalized = `${lines.join("\n").trimEnd()}\n`;
normalized = normalized.replace(/^plugins:\n  - search[ \t]*$/m, "plugins: []");
const comparableOriginal = original.replace(/\r\n?/g, "\n");

if (normalized === comparableOriginal) {
    console.log("Verified deterministic Wiki navigation and custom-search-only plugin policy.");
} else if (checkOnly) {
    console.error("mkdocs.yml is stale; run node docs/tools/normalize-wiki-config.mjs");
    process.exit(1);
} else {
    await writeFile(configPath, normalized, "utf8");
    console.log("Normalized First Flight navigation and disabled the unused MkDocs search plugin.");
}

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(docsRoot, "..");
const writeChanges = process.argv.includes("--write");
const fieldOrder = [
    "title",
    "description",
    "category",
    "tags",
    "status",
    "since",
    "last_verified",
    "audience",
    "related_api",
    "agent_summary",
    "source_paths"
];

function normalize(value) {
    return value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

function synchronizeFrontMatter(source, document) {
    const lines = normalize(source).split("\n");
    if (lines[0]?.trim() !== "---") throw new Error(`${document.source}: missing front matter start`);
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (end < 0) throw new Error(`${document.source}: missing front matter end`);

    const fields = new Map();
    const passthrough = [];
    for (const line of lines.slice(1, end)) {
        const match = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (match) fields.set(match[1], match[2]);
        else if (line.trim()) passthrough.push(line);
    }
    fields.set("title", JSON.stringify(document.title));
    fields.set("description", JSON.stringify(document.description));
    fields.set("related_api", JSON.stringify(document.related_api));

    const frontMatter = [];
    for (const field of fieldOrder) {
        if (fields.has(field)) frontMatter.push(`${field}: ${fields.get(field)}`);
        fields.delete(field);
    }
    for (const [field, value] of fields) frontMatter.push(`${field}: ${value}`);
    frontMatter.push(...passthrough);
    return `---\n${frontMatter.join("\n")}\n---\n${lines.slice(end + 1).join("\n")}`;
}

const docsIndex = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
const stale = [];
for (const document of docsIndex.documents) {
    const file = path.join(repoRoot, document.source);
    const current = normalize(await readFile(file, "utf8"));
    const expected = synchronizeFrontMatter(current, document);
    if (current === expected) continue;
    stale.push(document.source);
    if (writeChanges) await writeFile(file, expected, "utf8");
}

if (stale.length && !writeChanges) {
    console.error(`Curated front matter is stale in ${stale.length} file(s):`);
    for (const file of stale) console.error(`- ${file}`);
    console.error("Run: node docs/tools/sync-curated-frontmatter.mjs --write");
    process.exit(1);
}

console.log(`${writeChanges ? "Synchronized" : "Verified"} curated front matter for ${docsIndex.documents.length} document(s).`);

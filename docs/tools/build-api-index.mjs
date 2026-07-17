import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const docsRoot = path.resolve("docs");
const repoRoot = path.resolve(docsRoot, "..");
const sourceRoot = path.join(docsRoot, "wiki", "docs");
const outputPath = path.join(docsRoot, "api-index.json");
const canonicalOrigin = "https://infernux-engine.com";
const checkOnly = process.argv.includes("--check");

async function markdownFiles(directory) {
    return (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md")
        .map((entry) => path.join(directory, entry.name))
        .sort((left, right) => left.localeCompare(right, "en"));
}

function posix(value) {
    return value.split(path.sep).join("/");
}

function title(body, fallback) {
    return body.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function cleanInline(value) {
    return value
        .replace(/<!--.*?-->/gs, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[`*_~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function firstParagraph(body) {
    const withoutCode = body.replace(/```[\s\S]*?```/g, "");
    for (const block of withoutCode.split(/\n\s*\n/)) {
        const text = block.trim();
        if (!text || text.startsWith("#") || text.startsWith("|") || text.startsWith("<")) continue;
        const summary = cleanInline(text.replace(/^[-*]\s+/gm, ""));
        if (summary) return summary.slice(0, 280);
    }
    return "";
}

function description(body) {
    const section = body.match(/## Description\s+([\s\S]*?)(?=\n##\s|$)/);
    return firstParagraph(section?.[1] || body);
}

function signatures(body) {
    const values = [];
    for (const match of body.matchAll(/\|\s*`([^`]+)`\s*\|/g)) {
        const value = match[1].trim();
        if (value && !values.includes(value)) values.push(value);
    }
    return values;
}

function exampleStatus(body) {
    const section = body.match(/<!-- USER CONTENT START --> example\s*([\s\S]*?)<!-- USER CONTENT END -->/)?.[1] || "";
    if (/```(?:python)?[\s\S]*?```/.test(section) && !section.includes("TODO: Add example")) return "curated";
    if (/Example status|示例状态/.test(section)) return "unavailable";
    return "unknown";
}

async function buildSymbols() {
    const symbols = [];
    const englishAuthority = new Map();
    for (const languageFolder of ["en", "zh"]) {
        const language = languageFolder === "zh" ? "zh-CN" : "en";
        const root = path.join(sourceRoot, languageFolder, "api");
        for (const file of await markdownFiles(root)) {
            const body = await readFile(file, "utf8");
            const fileName = path.basename(file, ".md");
            const parsedSymbol = title(body, fileName);
            const info = body.match(/<div class="class-info">\s*(class|function|enum)\s+in\s+<b>([^<]+)<\/b>/s);
            const parsed = { symbol: parsedSymbol, kind: info?.[1] || "symbol", module: info?.[2]?.trim() || "Infernux" };
            if (languageFolder === "en") englishAuthority.set(fileName, parsed);
            const authority = englishAuthority.get(fileName) || parsed;
            const url = `/wiki/site/${languageFolder}/api/${fileName}.html`;
            symbols.push({
                id: `${languageFolder}:${authority.module}:${authority.symbol}`,
                symbol_key: `${authority.module}.${authority.symbol}`,
                language,
                module: authority.module,
                symbol: authority.symbol,
                kind: authority.kind,
                signatures: signatures(body),
                example_status: exampleStatus(body),
                summary: description(body),
                status: "preview",
                since: null,
                url,
                canonical_url: `${canonicalOrigin}${url}`,
                counterpart_url: `/wiki/site/${languageFolder === "en" ? "zh" : "en"}/api/${fileName}.html`,
                source: posix(path.relative(repoRoot, file)),
                related_documents: [],
            });
        }
    }
    return symbols.sort((left, right) => left.id.localeCompare(right.id, "en"));
}

const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
const symbols = await buildSymbols();
const output = `${JSON.stringify({
    schema_version: 3,
    generated_for_release: manifest.documented_release,
    status_default: manifest.release_status,
    symbol_count: symbols.length,
    curated_example_count: symbols.filter((symbol) => symbol.example_status === "curated").length,
    symbols,
}, null, 2)}\n`;

if (checkOnly) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    if (current.replace(/\r\n/g, "\n") !== output) throw new Error("api-index.json is stale. Run: node docs/tools/build-api-index.mjs");
    console.log(`Verified ${symbols.length} localized API symbols.`);
} else {
    await writeFile(outputPath, output, "utf8");
    console.log(`Generated ${symbols.length} localized API symbols.`);
}

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(docsRoot, "..");
const wikiDocsRoot = path.join(docsRoot, "wiki", "docs");
const canonicalOrigin = "https://infernux-engine.com";
const checkOnly = process.argv.includes("--check");

async function walk(directory, extension = ".md") {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await walk(absolute, extension));
        else if (entry.isFile() && entry.name.endsWith(extension)) result.push(absolute);
    }
    return result.sort((a, b) => a.localeCompare(b, "en"));
}

function posix(value) {
    return value.split(path.sep).join("/");
}

function parseScalar(raw) {
    const value = raw.trim();
    if (value.startsWith("[") && value.endsWith("]")) {
        return value.slice(1, -1)
            .split(",")
            .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
            .filter(Boolean);
    }
    if (value === "true" || value === "false") return value === "true";
    if (value === "null") return null;
    return value.replace(/^['"]|['"]$/g, "");
}

function parseFrontMatter(markdown) {
    const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
    if (lines[0]?.trim() !== "---") return { meta: {}, body: markdown };
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (end < 0) return { meta: {}, body: markdown };
    const meta = {};
    for (const line of lines.slice(1, end)) {
        const match = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (match) meta[match[1]] = parseScalar(match[2]);
    }
    return { meta, body: lines.slice(end + 1).join("\n") };
}

function markdownTitle(body, fallback) {
    return body.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function cleanInline(value) {
    return value
        .replace(/<!--.*?-->/gs, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[`*_~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function firstParagraph(body) {
    const withoutCode = body.replace(/```[\s\S]*?```/g, "");
    for (const block of withoutCode.split(/\n\s*\n/)) {
        const text = block.trim();
        if (!text || text.startsWith("#") || text.startsWith("|") || text.startsWith("<") || text.startsWith("---")) continue;
        const summary = cleanInline(text.replace(/^[-*]\s+/gm, ""));
        if (summary) return summary.slice(0, 280);
    }
    return "";
}

function descriptionSection(body) {
    const match = body.match(/## Description\s+([\s\S]*?)(?=\n##\s|$)/);
    return match ? firstParagraph(match[1]) : firstParagraph(body);
}

function languageCode(lang) {
    return lang === "zh" ? "zh-CN" : "en";
}

function stableSlug(relativePath) {
    return posix(relativePath).replace(/\.md$/i, "").replace(/\//g, ".");
}

async function buildCuratedDocuments() {
    const documents = [];
    for (const lang of ["en", "zh"]) {
        const languageRoot = path.join(wikiDocsRoot, lang);
        for (const file of await walk(languageRoot)) {
            const relativeToLanguage = path.relative(languageRoot, file);
            const parts = relativeToLanguage.split(path.sep);
            const layer = parts[0];
            if (layer === "api" || relativeToLanguage === "index.md") continue;
            const markdown = await readFile(file, "utf8");
            const { meta, body } = parseFrontMatter(markdown);
            const webPath = `/wiki/site/${lang}/${posix(relativeToLanguage).replace(/\.md$/, ".html")}`;
            documents.push({
                id: `${lang}.${stableSlug(relativeToLanguage)}`,
                language: languageCode(lang),
                layer,
                title: markdownTitle(body, path.basename(file, ".md")),
                url: webPath,
                canonical_url: `${canonicalOrigin}${webPath}`,
                source: posix(path.relative(repoRoot, file)),
                status: meta.status || "unversioned",
                since: meta.since || null,
                last_verified: meta.last_verified || null,
                audience: Array.isArray(meta.audience) ? meta.audience : [],
                tags: Array.isArray(meta.tags) ? meta.tags : [],
                summary: meta.agent_summary || firstParagraph(body),
                source_paths: Array.isArray(meta.source_paths) ? meta.source_paths : []
            });
        }
    }
    return documents.sort((a, b) => a.id.localeCompare(b.id, "en"));
}

function extractSignatures(body) {
    const signatures = [];
    for (const match of body.matchAll(/\|\s*`([^`]+)`\s*\|/g)) {
        const value = match[1].trim();
        if (value && !signatures.includes(value)) signatures.push(value);
    }
    const beforeDescription = body.split("## Description", 1)[0];
    const standalone = beforeDescription.match(/```python\s*\n([^\n]+(?:\n[^\n]+)?)\n```/);
    if (standalone) {
        const value = standalone[1].trim();
        if (value && !value.includes("TODO") && !signatures.includes(value)) signatures.unshift(value);
    }
    return signatures;
}

async function buildApiSymbols() {
    const symbols = [];
    const englishAuthority = new Map();
    for (const lang of ["en", "zh"]) {
        const apiRoot = path.join(wikiDocsRoot, lang, "api");
        for (const file of await walk(apiRoot)) {
            if (path.basename(file) === "index.md") continue;
            const body = await readFile(file, "utf8");
            const symbol = markdownTitle(body, path.basename(file, ".md"));
            const info = body.match(/<div class="class-info">\s*(class|function|enum)\s+in\s+<b>([^<]+)<\/b>/s);
            const fileName = path.basename(file, ".md");
            const parsedKind = info?.[1] || "symbol";
            const parsedModule = info?.[2]?.trim() || "Infernux";
            if (lang === "en") englishAuthority.set(fileName, { kind: parsedKind, module: parsedModule, symbol });
            const authority = englishAuthority.get(fileName);
            const kind = authority?.kind || parsedKind;
            const module = authority?.module || parsedModule;
            const stableSymbol = authority?.symbol || symbol;
            const webPath = `/wiki/site/${lang}/api/${fileName}.html`;
            const counterpartLang = lang === "en" ? "zh" : "en";
            symbols.push({
                id: `${lang}:${module}:${stableSymbol}`,
                symbol_key: `${module}.${stableSymbol}`,
                language: languageCode(lang),
                module,
                symbol: stableSymbol,
                kind,
                signatures: extractSignatures(body),
                summary: descriptionSection(body),
                status: "preview",
                since: null,
                url: webPath,
                canonical_url: `${canonicalOrigin}${webPath}`,
                counterpart_url: `/wiki/site/${counterpartLang}/api/${fileName}.html`,
                source: posix(path.relative(repoRoot, file))
            });
        }
    }
    return symbols.sort((a, b) => a.id.localeCompare(b.id, "en"));
}

function json(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

async function emit(relativePath, value) {
    const destination = path.join(docsRoot, relativePath);
    const content = json(value);
    if (checkOnly) {
        const current = await readFile(destination, "utf8").catch(() => "");
        if (current.replace(/\r\n/g, "\n") !== content) {
            throw new Error(`${relativePath} is stale. Run: node docs/tools/build-doc-index.mjs`);
        }
        return;
    }
    await writeFile(destination, content, "utf8");
}

const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
const documents = await buildCuratedDocuments();
const symbols = await buildApiSymbols();

await emit("docs-index.json", {
    schema_version: 2,
    generated_for_release: manifest.documented_release,
    document_count: documents.length,
    documents
});
await emit("api-index.json", {
    schema_version: 1,
    generated_for_release: manifest.documented_release,
    status_default: manifest.release_status,
    symbol_count: symbols.length,
    symbols
});

console.log(`${checkOnly ? "Verified" : "Generated"} ${documents.length} curated documents and ${symbols.length} localized API symbols.`);

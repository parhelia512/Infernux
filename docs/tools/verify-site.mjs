import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(docsRoot, "..");
const wikiDocsRoot = path.join(docsRoot, "wiki", "docs");
const errors = [];

function fail(message) {
    errors.push(message);
}

async function exists(target) {
    return stat(target).then(() => true).catch(() => false);
}

async function walk(directory, extension) {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await walk(absolute, extension));
        else if (entry.isFile() && (!extension || entry.name.endsWith(extension))) result.push(absolute);
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
    return value.replace(/^['"]|['"]$/g, "");
}

function frontMatter(markdown) {
    const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
    if (lines[0]?.trim() !== "---") return {};
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (end < 0) return {};
    const meta = {};
    for (const line of lines.slice(1, end)) {
        const match = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (match) meta[match[1]] = parseScalar(match[2]);
    }
    return meta;
}

function htmlTags(source, tagName) {
    return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map((match) => match[0]);
}

function attribute(tag, name) {
    return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] ?? null;
}

async function verifyCuratedDocs() {
    const required = ["category", "tags", "status", "since", "last_verified", "audience", "agent_summary", "source_paths"];
    const allowedStatus = new Set(["stable", "preview", "experimental", "deprecated"]);

    for (const lang of ["en", "zh"]) {
        for (const layer of ["learn", "manual"]) {
            const root = path.join(wikiDocsRoot, lang, layer);
            for (const file of await walk(root, ".md")) {
                const markdown = await readFile(file, "utf8");
                const meta = frontMatter(markdown);
                const relative = posix(path.relative(repoRoot, file));
                for (const key of required) {
                    if (!(key in meta) || meta[key] === "" || (Array.isArray(meta[key]) && !meta[key].length)) {
                        fail(`${relative}: missing front matter field '${key}'`);
                    }
                }
                if (meta.status && !allowedStatus.has(meta.status)) fail(`${relative}: unsupported status '${meta.status}'`);
                for (const sourcePath of Array.isArray(meta.source_paths) ? meta.source_paths : []) {
                    if (!await exists(path.join(repoRoot, sourcePath))) fail(`${relative}: source_paths target does not exist: ${sourcePath}`);
                }
                if (!/^#\s+\S/m.test(markdown)) fail(`${relative}: missing H1 title`);
            }
        }
    }

    for (const layer of ["learn", "manual"]) {
        const enFiles = (await walk(path.join(wikiDocsRoot, "en", layer), ".md")).map((file) => path.relative(path.join(wikiDocsRoot, "en", layer), file));
        const zhFiles = new Set((await walk(path.join(wikiDocsRoot, "zh", layer), ".md")).map((file) => path.relative(path.join(wikiDocsRoot, "zh", layer), file)));
        for (const relative of enFiles) if (!zhFiles.has(relative)) fail(`Missing zh counterpart: ${layer}/${posix(relative)}`);
        for (const relative of zhFiles) if (!enFiles.includes(relative)) fail(`Missing en counterpart: ${layer}/${posix(relative)}`);
    }
}

async function verifyMarkdownLinks() {
    for (const file of await walk(wikiDocsRoot, ".md")) {
        const markdown = await readFile(file, "utf8");
        const relative = posix(path.relative(repoRoot, file));
        for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
            const raw = match[1].trim().replace(/^<|>$/g, "");
            const target = raw.split("#", 1)[0];
            if (!target || /^(https?:|mailto:)/i.test(target)) continue;
            const absolute = path.resolve(path.dirname(file), decodeURIComponent(target));
            if (!await exists(absolute)) fail(`${relative}: broken Markdown link '${raw}'`);
        }
    }
}

async function verifyRootHtml() {
    const pages = ["index.html", "wiki.html", "roadmap.html", "community.html", "404.html"];
    const i18n = await readFile(path.join(docsRoot, "js", "i18n.js"), "utf8");

    for (const pageName of pages) {
        const file = path.join(docsRoot, pageName);
        const source = await readFile(file, "utf8");
        const ids = [...source.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
        if (duplicateIds.length) fail(`${pageName}: duplicate ids: ${[...new Set(duplicateIds)].join(", ")}`);

        const h1Count = (source.match(/<h1\b/gi) || []).length;
        if (h1Count !== 1) fail(`${pageName}: expected exactly one H1, found ${h1Count}`);
        if (pageName !== "404.html" && !/<link\s+rel=["']canonical["']/i.test(source)) fail(`${pageName}: missing canonical link`);
        if (pageName !== "404.html" && !/<meta\s+property=["']og:title["']/i.test(source)) fail(`${pageName}: missing Open Graph title`);

        for (const tag of htmlTags(source, "img")) {
            if (attribute(tag, "alt") === null) fail(`${pageName}: image missing alt attribute: ${tag.slice(0, 100)}`);
        }
        for (const tag of htmlTags(source, "button")) {
            const label = attribute(tag, "aria-label") || attribute(tag, "title");
            const start = source.indexOf(tag) + tag.length;
            const closing = source.indexOf("</button>", start);
            const inner = closing >= 0 ? source.slice(start, closing).replace(/<[^>]+>/g, "").trim() : "";
            if (!label && !inner) fail(`${pageName}: button has no accessible name: ${tag.slice(0, 100)}`);
        }
        for (const tag of htmlTags(source, "input")) {
            const id = attribute(tag, "id");
            const hasName = attribute(tag, "aria-label") || (id && new RegExp(`<label\\b[^>]*for=["']${id}["']`, "i").test(source));
            if (!hasName) fail(`${pageName}: input has no associated label: ${tag.slice(0, 100)}`);
        }
        for (const tag of htmlTags(source, "a")) {
            if (attribute(tag, "target") === "_blank" && !(attribute(tag, "rel") || "").split(/\s+/).includes("noopener")) {
                fail(`${pageName}: target=_blank link missing rel=noopener: ${tag.slice(0, 120)}`);
            }
        }

        for (const key of [...source.matchAll(/data-i18n=["']([^"']+)["']/g)].map((match) => match[1])) {
            const definitions = [...i18n.matchAll(new RegExp(`^[ \\t]*["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s*:`, "gm"))].length;
            if (definitions < 2) fail(`${pageName}: i18n key '${key}' is not defined for both languages`);
        }

        for (const target of [...source.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((match) => match[1])) {
            const clean = target.split("#", 1)[0].split("?", 1)[0];
            if (!clean || /^(https?:|mailto:|data:)/i.test(clean)) continue;
            let absolute = clean.startsWith("/") ? path.join(docsRoot, clean.slice(1)) : path.resolve(path.dirname(file), clean);
            if (clean.endsWith("/")) absolute = path.join(absolute, "index.html");
            if (!await exists(absolute)) fail(`${pageName}: missing local target '${target}'`);
        }
    }
}

async function verifyIndexes() {
    const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
    const docsIndex = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
    const apiIndex = JSON.parse(await readFile(path.join(docsRoot, "api-index.json"), "utf8"));
    const apiChanges = JSON.parse(await readFile(path.join(docsRoot, "api-changes.json"), "utf8"));
    const apiSnapshot = JSON.parse(await readFile(path.join(docsRoot, "api-snapshots", `${manifest.documented_release}.json`), "utf8"));

    if (docsIndex.document_count !== docsIndex.documents.length) fail("docs-index.json: document_count mismatch");
    if (apiIndex.symbol_count !== apiIndex.symbols.length) fail("api-index.json: symbol_count mismatch");
    if (docsIndex.generated_for_release !== manifest.documented_release) fail("docs-index.json: release mismatch");
    if (apiIndex.generated_for_release !== manifest.documented_release) fail("api-index.json: release mismatch");
    if (apiChanges.current_release !== manifest.documented_release) fail("api-changes.json: current release mismatch");
    if (apiSnapshot.release !== manifest.documented_release) fail("api snapshot: release mismatch");
    if (apiSnapshot.symbol_count !== apiSnapshot.symbols.length) fail("api snapshot: symbol_count mismatch");

    for (const [name, items] of [["docs-index", docsIndex.documents], ["api-index", apiIndex.symbols]]) {
        const ids = new Set();
        const canonicals = new Set();
        for (const item of items) {
            if (ids.has(item.id)) fail(`${name}: duplicate id '${item.id}'`);
            ids.add(item.id);
            if (canonicals.has(item.canonical_url)) fail(`${name}: duplicate canonical_url '${item.canonical_url}'`);
            canonicals.add(item.canonical_url);
            if (!await exists(path.join(repoRoot, item.source))) fail(`${name}: source does not exist '${item.source}'`);
        }
    }

    const enKeys = new Set(apiIndex.symbols.filter((item) => item.language === "en").map((item) => item.symbol_key));
    const zhKeys = new Set(apiIndex.symbols.filter((item) => item.language === "zh-CN").map((item) => item.symbol_key));
    for (const key of enKeys) if (!zhKeys.has(key)) fail(`api-index: missing zh symbol '${key}'`);
    for (const key of zhKeys) if (!enKeys.has(key)) fail(`api-index: missing en symbol '${key}'`);

    if (manifest.indexes.api !== "/api-index.json") fail("docs-manifest.json: indexes.api must point to /api-index.json");
    if (manifest.indexes.api_changes !== "/api-changes.json") fail("docs-manifest.json: indexes.api_changes must point to /api-changes.json");
    const llms = await readFile(path.join(docsRoot, "llms.txt"), "utf8");
    if (!llms.includes("https://infernux-engine.com/api-index.json")) fail("llms.txt: missing API index link");
    if (!llms.includes("https://infernux-engine.com/api-changes.json")) fail("llms.txt: missing API changes link");
}

async function verifyPublishingFiles() {
    const sitemap = await readFile(path.join(docsRoot, "sitemap.xml"), "utf8");
    for (const route of ["/wiki.html", "/roadmap.html", "/community.html", "/wiki/site/en/learn/getting-started.html", "/wiki/site/zh/learn/getting-started.html"]) {
        if (!sitemap.includes(`https://infernux-engine.com${route}`)) fail(`sitemap.xml: missing '${route}'`);
    }
    const robots = await readFile(path.join(docsRoot, "robots.txt"), "utf8");
    if (!robots.includes("https://infernux-engine.com/sitemap.xml")) fail("robots.txt: missing root sitemap declaration");
    const community = await readFile(path.join(docsRoot, "community.html"), "utf8");
    for (const token of ["R_kgDOO_wV3A", "DIC_kwDOO_wV3M4C5oaC", "Infernux Community Wall"]) {
        if (!community.includes(token)) fail(`community.html: missing Giscus configuration token '${token}'`);
    }
    const webManifest = JSON.parse(await readFile(path.join(docsRoot, "site.webmanifest"), "utf8"));
    for (const icon of webManifest.icons || []) {
        if (!await exists(path.join(docsRoot, icon.src.replace(/^\//, "")))) fail(`site.webmanifest: missing icon '${icon.src}'`);
    }
}

await verifyCuratedDocs();
await verifyMarkdownLinks();
await verifyRootHtml();
await verifyIndexes();
await verifyPublishingFiles();

if (errors.length) {
    console.error(`Website verification failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}

console.log("Website verification passed: content schema, language parity, links, accessibility, indexes, and publishing files.");

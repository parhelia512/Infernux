import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const siteRoot = path.join(docsRoot, "wiki", "site");
const runtime = await readFile(path.join(docsRoot, "js", "wiki-generated.js"), "utf8");
const template = await readFile(path.join(docsRoot, "wiki", "theme", "main.html"), "utf8");

async function htmlFiles(directory) {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await htmlFiles(target));
        else if (entry.isFile() && entry.name.endsWith(".html")) files.push(target);
    }
    return files;
}

function sectionShape(html) {
    return [...html.matchAll(/<h([23])\s+id="([^"]+)"/g)]
        .filter((entry) => entry[2] !== "docs-search-title")
        .map((entry) => ({ level: Number(entry[1]), id: entry[2] }));
}

for (const contract of [
    "LANGUAGE_SECTION_PARAMS",
    "buildLanguageSectionUrl",
    "resolveLanguageSectionUrl",
    "restoreTransferredLanguageSection",
    "initializeLanguageSectionLink",
    "window.history.replaceState",
    "scrollIntoView({ block: \"start\" })",
    "total === entries.length",
    "Number(entries[index]?.level) === level"
]) {
    assert.ok(runtime.includes(contract), `language-section runtime is missing '${contract}'`);
}
assert.ok(template.includes('/js/wiki-generated.js?v=14'), "generated template must load language-continuity runtime v14");

const enRoot = path.join(siteRoot, "en");
const zhRoot = path.join(siteRoot, "zh");
const englishPages = await htmlFiles(enRoot);
let compatiblePairs = 0;
let safeFallbackPairs = 0;
for (const englishPage of englishPages) {
    const relative = path.relative(enRoot, englishPage);
    const relativeUrl = relative.split(path.sep).join("/");
    const chinesePage = path.join(zhRoot, relative);
    const [englishHtml, chineseHtml] = await Promise.all([
        readFile(englishPage, "utf8"),
        readFile(chinesePage, "utf8")
    ]);
    assert.ok(englishHtml.includes(`href="/wiki/site/zh/${relativeUrl}"`), `${relativeUrl}: English page is missing its Chinese counterpart`);
    assert.ok(chineseHtml.includes(`href="/wiki/site/en/${relativeUrl}"`), `${relativeUrl}: Chinese page is missing its English counterpart`);
    assert.ok(englishHtml.includes('class="doc-language-link"') || englishHtml.includes('class="lang-sw"'), `${relativeUrl}: English counterpart link is outside a supported language-switch surface`);
    assert.ok(chineseHtml.includes('class="doc-language-link"') || chineseHtml.includes('class="lang-sw"'), `${relativeUrl}: Chinese counterpart link is outside a supported language-switch surface`);
    assert.ok(!/[?&](?:section|sections|level)=/.test(englishHtml + chineseHtml), `${relativeUrl}: generated HTML must not persist transient section transport parameters`);
    const englishShape = sectionShape(englishHtml);
    const chineseShape = sectionShape(chineseHtml);
    const compatible = englishShape.length === chineseShape.length
        && englishShape.every((section, index) => section.level === chineseShape[index]?.level);
    if (compatible) compatiblePairs += 1;
    else safeFallbackPairs += 1;
}

assert.ok(englishPages.length >= 100, "expected the complete bilingual documentation corpus");
assert.ok(compatiblePairs / englishPages.length >= 0.9, "too many bilingual pages have incompatible section structures for continuity");

const generatedPages = await htmlFiles(siteRoot);
assert.equal(generatedPages.length, 202, "expected all generated documentation pages");
for (const page of generatedPages) {
    const html = await readFile(page, "utf8");
    assert.ok(html.includes('/js/wiki-generated.js?v=14'), `${path.relative(docsRoot, page)} is missing language-continuity runtime v14`);
}

console.log(`Bilingual section continuity passed: ${compatiblePairs}/${englishPages.length} page pairs preserve matching H2/H3 positions; ${safeFallbackPairs} pair(s) use verified page-top fallback; ${generatedPages.length} generated pages load runtime v14.`);

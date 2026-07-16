import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const source = await readFile(path.join(docsRoot, "js", "docs-search.js"), "utf8");
const currentApiIndex = JSON.parse(await readFile(path.join(docsRoot, "api-index.json"), "utf8"));
const currentDocsIndex = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
const sandbox = { console, globalThis: null, URLSearchParams, __INFERNUX_DOCS_SEARCH_TEST__: true };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(source, { filename: "docs-search.js" }).runInContext(sandbox);

const { buildSearchModel, buildWikiSearchUrl, copyForLanguage, normalized, resultNavigationIndex, score, search } = sandbox.__infernuxDocsSearch || {};
const titles = (outcome) => Array.from(outcome.matches, (entry) => entry.item.title);
assert.equal(typeof buildSearchModel, "function");
assert.equal(typeof search, "function");
assert.equal(typeof buildWikiSearchUrl, "function");
assert.equal(normalized("  Render   Graph  "), "render graph");
assert.equal(
    buildWikiSearchUrl({ query: "Render Graph", language: "zh-CN", layer: "api", status: "preview" }),
    "/wiki.html?q=Render+Graph&layer=api&status=preview&lang=zh#written-guides"
);
assert.equal(buildWikiSearchUrl({ language: "all", layer: "all", status: "all" }), "/wiki.html#written-guides");
assert.equal(copyForLanguage("zh-CN").trigger, "搜索文档");
assert.equal(copyForLanguage("en").trigger, "Search documentation");
assert.equal(resultNavigationIndex(-1, "ArrowDown", 3), 0);
assert.equal(resultNavigationIndex(2, "ArrowDown", 3), 0);
assert.equal(resultNavigationIndex(0, "ArrowUp", 3), 2);
assert.equal(resultNavigationIndex(1, "Home", 3), 0);
assert.equal(resultNavigationIndex(1, "End", 3), 2);
assert.equal(resultNavigationIndex(0, "ArrowDown", 0), -1);

const currentModel = buildSearchModel(currentApiIndex, currentDocsIndex);
assert.equal(currentModel.release, currentDocsIndex.generated_for_release);
assert.equal(currentModel.items.length, currentApiIndex.symbols.length + currentDocsIndex.documents.length);
assert.ok(search(currentModel, { query: "RenderGraph", language: "en", layer: "api", status: "all" }).total > 0);

const apiIndex = {
    generated_for_release: "0.2.1",
    symbols: [
        { symbol: "Camera", module: "Infernux", kind: "class", summary: "Camera projection", signatures: [], status: "preview", language: "en", url: "/wiki/site/en/api/Camera.html" },
        { symbol: "Camera", module: "Infernux", kind: "class", summary: "相机投影", signatures: [], status: "preview", language: "zh-CN", url: "/wiki/site/zh/api/Camera.html" }
    ]
};
const docsIndex = {
    generated_for_release: "0.2.1",
    documents: [
        { title: "Camera Flight", layer: "learn", summary: "Build a camera scene", status: "preview", since: "0.2.1", tags: ["camera"], audience: ["beginner"], language: "en", url: "/wiki/site/en/learn/camera-flight.html" },
        { title: "Rendering Manual", layer: "manual", summary: "Camera ownership", status: "stable", since: "0.2.0", tags: ["camera"], audience: ["intermediate"], language: "en", url: "/wiki/site/en/manual/rendering.html" },
        { title: "相机入门", layer: "learn", summary: "创建 Camera 场景", status: "preview", since: "0.2.1", tags: ["camera"], audience: ["beginner"], language: "zh-CN", url: "/wiki/site/zh/learn/camera-flight.html" },
        { title: "Engine Rationale", layer: "architecture", summary: "Design notes", status: "experimental", since: "0.1.0", tags: [], audience: [], language: "en", url: "/wiki/site/en/architecture/about.html" }
    ]
};

const model = buildSearchModel(apiIndex, docsIndex);
assert.equal(model.release, "0.2.1");
assert.equal(model.items.length, 6);
assert.deepEqual({ ...model.sources }, { api: true, docs: true });
assert.throws(() => buildSearchModel({ ...apiIndex, generated_for_release: "0.2.0" }, docsIndex), /different releases/);
assert.throws(() => buildSearchModel(null, null), /at least one versioned index/);

const guidesOnlyModel = buildSearchModel(null, docsIndex);
assert.deepEqual({ ...guidesOnlyModel.sources }, { api: false, docs: true });
assert.equal(guidesOnlyModel.items.length, docsIndex.documents.length);
assert.deepEqual(titles(search(guidesOnlyModel, { query: "camera", language: "en", layer: "all", status: "all" })), ["Camera Flight", "Rendering Manual"]);

const apiOnlyModel = buildSearchModel(apiIndex, null);
assert.deepEqual({ ...apiOnlyModel.sources }, { api: true, docs: false });
assert.equal(apiOnlyModel.items.length, apiIndex.symbols.length);
assert.deepEqual(titles(search(apiOnlyModel, { query: "camera", language: "all", layer: "api", status: "all" })), ["Camera", "Camera"]);

const idle = search(model, { language: "en", layer: "all", status: "all" });
assert.equal(idle.total, 0, "an idle search should not flood the dialog with every record");

const ranked = search(model, { query: "camera", language: "en", layer: "all", status: "all" });
assert.equal(ranked.total, 3);
assert.equal(ranked.matches[0].item.title, "Camera", "exact API symbol matches should outrank general guide matches");
assert.ok(score(ranked.matches[0].item, "camera", "en") > score(ranked.matches[1].item, "camera", "en"));

const manualBrowse = search(model, { language: "en", layer: "manual", status: "all" });
assert.deepEqual(titles(manualBrowse), ["Rendering Manual"]);

const stable = search(model, { query: "camera", language: "all", layer: "all", status: "stable" });
assert.deepEqual(titles(stable), ["Rendering Manual"]);

const bilingual = search(model, { query: "camera", language: "all", layer: "learn", status: "preview" });
assert.deepEqual(Array.from(bilingual.matches, (entry) => entry.item.language).sort(), ["en", "zh-CN"]);

const limited = search(model, { query: "camera", language: "all", layer: "all", status: "all", limit: 2 });
assert.equal(limited.total, 5);
assert.equal(limited.matches.length, 2);

for (const page of ["index.html", "wiki.html", "roadmap.html", "community.html", "download.html"]) {
    const html = await readFile(path.join(docsRoot, page), "utf8");
    assert.ok(html.includes('href="css/docs-search.css?v=3"'), `${page} should load the shared search presentation`);
    assert.ok(html.includes('src="js/docs-search.js?v=5"'), `${page} should load the shared search runtime`);
}

const template = await readFile(path.join(docsRoot, "wiki", "theme", "main.html"), "utf8");
assert.ok(template.includes('<dialog class="docs-search-dialog"'), "generated documentation should use a native modal dialog");
assert.ok(template.includes('aria-controls="docs-search-results"'), "the search input should expose its result relationship");
assert.ok(template.includes('/css/docs-search.css?v=3'));
assert.ok(template.includes('/js/docs-search.js?v=5'));
assert.ok(source.includes('document.createElement("dialog")'), "root pages should receive the same native search dialog at runtime");
assert.ok(source.includes('dialog.showModal()'), "native modal behavior should isolate the page background");
assert.ok(source.includes("element.inert = true"), "the non-dialog fallback should make background content inert");
assert.ok(source.includes('CustomEvent("site:docs-search-opened")'), "search should coordinate with the mobile navigation");
assert.ok(source.includes('site:language-changed'), "search copy and language scope should follow root-page language changes");
assert.ok(source.includes("Promise.allSettled"), "guide and API indexes should load independently");
assert.ok(source.includes("AggregateError"), "search should fail only when both indexes are unavailable");
assert.ok(source.includes("retryPartial"), "reopening search should retry a previously missing index");
assert.ok(source.includes('id: "docs-search-wiki-continuation"'), "search should expose one full-page Wiki continuation");
assert.ok(source.includes("buildWikiSearchUrl({"), "the Wiki continuation should preserve the active search state");
assert.ok(source.includes('.docs-search-result[data-doc-search-result]'), "continuation actions must stay outside arrow-key result navigation");
const wikiSource = await readFile(path.join(docsRoot, "js", "wiki.js"), "utf8");
assert.ok(wikiSource.includes('currentSelectedLayer === "api"'), "Wiki should explicitly browse API results when an API layer deep link is active");
assert.ok(wikiSource.includes("wikiUrlStateRestored"), "Wiki should distinguish initial URL restoration from later language changes");
assert.ok(wikiSource.includes("if (!wikiUrlStateRestored) return;"), "initial localization must not erase a shareable Wiki query");
const mainSource = await readFile(path.join(docsRoot, "js", "main.js"), "utf8");
assert.ok(mainSource.includes("site:docs-search-opened"), "opening search should close an active mobile menu");

console.log("Documentation search test passed: release parity, partial-index fallback, bilingual facets, layer/status browsing, ranking, shareable Wiki continuation, API deep links, root-page access, native modal isolation, and arrow-key navigation.");

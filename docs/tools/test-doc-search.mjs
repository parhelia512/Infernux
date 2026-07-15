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
const sandbox = { console, globalThis: null, __INFERNUX_DOCS_SEARCH_TEST__: true };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(source, { filename: "docs-search.js" }).runInContext(sandbox);

const { buildSearchModel, search, score, normalized } = sandbox.__infernuxDocsSearch || {};
const titles = (outcome) => Array.from(outcome.matches, (entry) => entry.item.title);
assert.equal(typeof buildSearchModel, "function");
assert.equal(typeof search, "function");
assert.equal(normalized("  Render   Graph  "), "render graph");

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
assert.throws(() => buildSearchModel({ ...apiIndex, generated_for_release: "0.2.0" }, docsIndex), /different releases/);

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

console.log("Documentation search test passed: release parity, bilingual facets, layer/status browsing, ranking, and result limits.");

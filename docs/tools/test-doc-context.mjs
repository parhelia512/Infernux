import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(scriptDir, "..", "js", "wiki-generated.js"), "utf8");
const learningPaths = JSON.parse(await readFile(path.join(scriptDir, "..", "learning-paths.json"), "utf8"));
const sandbox = {
    URL,
    console,
    fetch: async () => { throw new Error("network is disabled in the context unit test"); },
    globalThis: null,
    navigator: {},
    window: {
        isSecureContext: false,
        location: { pathname: "/wiki/site/en/learn/getting-started.html" },
        setTimeout() {},
        matchMedia() { return { matches: false, addEventListener() {} }; }
    },
    document: {
        title: "Getting Started - Infernux Documentation",
        documentElement: { lang: "en" },
        addEventListener() {},
        querySelector(selector) {
            if (selector === 'link[rel="canonical"]') return null;
            return null;
        },
        querySelectorAll() { return []; }
    },
    __INFERNUX_DOCS_CONTEXT_TEST__: true
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(source, { filename: "wiki-generated.js" }).runInContext(sandbox);

const context = sandbox.__infernuxDocsContext;
assert.ok(context, "test exports should be available");
assert.equal(context.normalizeDocsPath("https://infernux-engine.com/wiki/site/en/api/GameObject.html/"), "/wiki/site/en/api/GameObject.html");

const manifest = {
    canonical_origin: "https://infernux-engine.com",
    documented_release: "0.2.1",
    release_status: "preview",
    last_verified: "2026-07-15",
    build: {
        status: "stamped",
        source_commit: "0123456789abcdef0123456789abcdef01234567",
        source_url: "https://github.com/ChenlizheMe/Infernux/commit/0123456789abcdef0123456789abcdef01234567",
        generated_at: "2026-07-15T08:30:00.000Z"
    },
    indexes: {
        api: "/api-index.json",
        curated_docs: "/docs-index.json",
        docs_health: "/docs-health.json",
        learning_paths: "/learning-paths.json",
        llms_full: "/llms-full.txt"
    },
    trust_rules: ["Use generated API pages as the authority for current signatures."]
};

const curatedEntry = {
    id: "en.learn.getting-started",
    language: "en",
    layer: "learn",
    title: "Getting Started",
    canonical_url: "https://infernux-engine.com/wiki/site/en/learn/getting-started.html",
    status: "preview",
    since: "0.2.1",
    last_verified: "2026-07-15",
    summary: "Install Infernux and run a scene.",
    related_api: ["Infernux.components.InxComponent", "Infernux.GameObject"],
    source_paths: ["README.md", "packaging"]
};
const curated = context.buildAgentContext({
    entry: curatedEntry,
    manifest,
    path: "/wiki/site/en/learn/getting-started.html",
    apiPage: false,
    pageTitle: "Getting Started",
    language: "en"
});
assert.match(curated, /Documented release: 0\.2\.1/);
assert.match(curated, /Canonical URL: https:\/\/infernux-engine\.com\/wiki\/site\/en\/learn\/getting-started\.html/);
assert.match(curated, /## Agent summary\n\nInstall Infernux and run a scene\./);
assert.match(curated, /- README\.md\n- packaging/);
assert.match(curated, /0123456789abcdef0123456789abcdef01234567/);
assert.match(curated, /https:\/\/infernux-engine\.com\/docs-index\.json/);
assert.match(curated, /https:\/\/infernux-engine\.com\/learning-paths\.json/);
assert.match(curated, /https:\/\/infernux-engine\.com\/docs-health\.json/);
assert.match(curated, /## Related API\n\n- Infernux\.components\.InxComponent\n- Infernux\.GameObject/);

const stampedProvenance = context.buildProvenanceFacts(manifest, "en");
assert.equal(stampedProvenance.state, "stamped");
assert.deepEqual(
    JSON.parse(JSON.stringify(stampedProvenance.items)),
    [
        { key: "release", label: "Documented release", value: "0.2.1 · Preview" },
        { key: "source", label: "Build source", value: "0123456789ab", url: "https://github.com/ChenlizheMe/Infernux/commit/0123456789abcdef0123456789abcdef01234567" },
        { key: "generated", label: "Generated", value: "2026-07-15 08:30 UTC" }
    ]
);
const unstampedProvenance = context.buildProvenanceFacts({ ...manifest, build: { status: "unstamped" } }, "zh-CN");
assert.equal(unstampedProvenance.state, "unstamped");
assert.match(unstampedProvenance.items[1].value, /本地预览/);
assert.equal(unstampedProvenance.items[1].url, "");
const invalidProvenance = context.buildProvenanceFacts({
    ...manifest,
    build: { ...manifest.build, source_url: "https://example.com/untrusted" }
}, "en");
assert.equal(invalidProvenance.state, "unavailable");
assert.equal(invalidProvenance.items[1].url, "");

const learningModel = context.findLearningStep(learningPaths, "/wiki/site/en/learn/first-component.html");
assert.equal(learningModel.learningPath.id, "first-flight");
assert.equal(learningModel.step.id, "first-component");
assert.equal(learningModel.index, 1);
assert.equal(context.findLearningStep(learningPaths, "/wiki/site/en/manual/physics.html"), null);

const outlineEntries = context.normalizeOutlineEntries([
    { id: "description", text: "Description ¶", level: 2 },
    { id: "methods", text: "Methods", level: 2 },
    { id: "move", text: "move_position ¶", level: 3 },
    { id: "methods", text: "Duplicate", level: 2 },
    { id: "ignored", text: "Ignored H4", level: 4 },
    { id: "", text: "Missing id", level: 2 }
]);
assert.equal(JSON.stringify(outlineEntries), JSON.stringify([
    { id: "description", text: "Description", level: 2 },
    { id: "methods", text: "Methods", level: 2 },
    { id: "move", text: "move_position", level: 3 }
]));

const navigationIndex = {
    documents: [
        { ...curatedEntry, id: "en.learn.build", title: "Build and Share", url: "/wiki/site/en/learn/build-and-share.html", navigation_order: 2 },
        { ...curatedEntry, id: "en.learn.start", title: "Getting Started", url: "/wiki/site/en/learn/getting-started.html", navigation_order: 0 },
        { ...curatedEntry, id: "en.learn.component", title: "Your First Component", url: "/wiki/site/en/learn/first-component.html", navigation_order: 1 },
        { ...curatedEntry, id: "zh.learn.start", language: "zh-CN", title: "快速开始", url: "/wiki/site/zh/learn/getting-started.html", navigation_order: 7 }
    ]
};
const guideNeighbors = context.findDocumentNeighbors(navigationIndex, navigationIndex.documents[2], false);
assert.equal(guideNeighbors.previous.id, "en.learn.start");
assert.equal(guideNeighbors.next.id, "en.learn.build");

const apiEntry = {
    id: "en:Infernux:GameObject",
    symbol_key: "Infernux.GameObject",
    language: "en",
    module: "Infernux",
    symbol: "GameObject",
    kind: "class",
    signatures: ["class GameObject"],
    example_status: "curated",
    status: "preview",
    related_documents: [{ id: "en.manual.engine-map", title: "Engine Map", url: "/wiki/site/en/manual/engine-map.html" }],
    canonical_url: "https://infernux-engine.com/wiki/site/en/api/GameObject.html",
    source: "docs/wiki/docs/en/api/GameObject.md"
};
const api = context.buildAgentContext({
    entry: apiEntry,
    manifest,
    path: "/wiki/site/en/api/GameObject.html",
    apiPage: true,
    pageTitle: "GameObject",
    language: "en"
});
assert.match(api, /Layer: api/);
assert.match(api, /Symbol key: Infernux\.GameObject/);
assert.match(api, /- class GameObject/);
assert.match(api, /- docs\/wiki\/docs\/en\/api\/GameObject\.md/);
assert.match(api, /https:\/\/infernux-engine\.com\/api-index\.json/);
assert.match(api, /## Related guides\n\n- Engine Map: https:\/\/infernux-engine\.com\/wiki\/site\/en\/manual\/engine-map\.html/);

const apiNavigationIndex = {
    symbols: [
        { ...apiEntry, id: "en:Infernux:Transform", symbol: "Transform", url: "/wiki/site/en/api/Transform.html" },
        { ...apiEntry, id: "en:Infernux:Component", symbol: "Component", url: "/wiki/site/en/api/Component.html" },
        apiEntry,
        { ...apiEntry, id: "en:Infernux.core:Material", module: "Infernux.core", symbol: "Material", url: "/wiki/site/en/api/Material.html" }
    ]
};
const apiNeighbors = context.findDocumentNeighbors(apiNavigationIndex, apiEntry, true);
assert.equal(apiNeighbors.previous.symbol, "Component");
assert.equal(apiNeighbors.next.symbol, "Transform");

const feedbackUrl = new URL(context.buildFeedbackIssueUrl({
    entry: curatedEntry,
    manifest,
    path: "/wiki/site/en/learn/getting-started.html",
    pageTitle: "Getting Started"
}));
assert.equal(feedbackUrl.origin + feedbackUrl.pathname, "https://github.com/ChenlizheMe/Infernux/issues/new");
assert.equal(feedbackUrl.searchParams.get("title"), "Docs: Getting Started");
assert.match(feedbackUrl.searchParams.get("body"), /Page: https:\/\/infernux-engine\.com\/wiki\/site\/en\/learn\/getting-started\.html/);
assert.match(feedbackUrl.searchParams.get("body"), /Documented release: 0\.2\.1/);
assert.match(feedbackUrl.searchParams.get("body"), /Documentation build: 0123456789abcdef0123456789abcdef01234567/);

const index = { symbols: [{ ...apiEntry, url: "/wiki/site/en/api/GameObject.html" }] };
assert.equal(context.findContextEntry(index, "/wiki/site/en/api/GameObject.html", true).symbol, "GameObject");
assert.equal(context.findContextEntry(index, "/wiki/site/en/api/Missing.html", true), null);

const unstamped = context.buildAgentContext({
    entry: null,
    manifest: { ...manifest, build: { status: "unstamped" } },
    path: "/wiki/site/zh/manual/physics.html",
    apiPage: false,
    pageTitle: "物理系统",
    language: "zh-CN"
});
assert.match(unstamped, /本地预览，不可作为发布来源证明/);

console.log("Documentation context test passed: canonical metadata, visible build evidence, ordered navigation, feedback provenance, and safe fallbacks.");

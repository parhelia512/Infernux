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
assert.equal(
    context.buildSectionUrl("https://infernux-engine.com/wiki/site/en/manual/input-and-time.html", "time domains"),
    "https://infernux-engine.com/wiki/site/en/manual/input-and-time.html#time%20domains"
);
assert.equal(
    context.buildSectionUrl("https://infernux-engine.com/wiki/site/zh/manual/input-and-time.html#old", "时间域"),
    "https://infernux-engine.com/wiki/site/zh/manual/input-and-time.html#%E6%97%B6%E9%97%B4%E5%9F%9F"
);
assert.equal(context.buildSectionUrl("javascript:alert(1)", "unsafe"), "");
assert.equal(context.buildSectionUrl("not a URL", "section"), "");
assert.equal(context.buildSectionUrl("https://infernux-engine.com/wiki/site/en/api/GameObject.html", ""), "https://infernux-engine.com/wiki/site/en/api/GameObject.html");
const languageTransfer = context.buildLanguageSectionUrl(
    "https://infernux-engine.com/wiki/site/zh/manual/input-and-time.html#old",
    { index: 2, total: 6, level: 2 }
);
assert.equal(languageTransfer, "https://infernux-engine.com/wiki/site/zh/manual/input-and-time.html?section=3&sections=6&level=2");
const resolvedLanguageTransfer = context.resolveLanguageSectionUrl(languageTransfer, [
    { id: "_2", level: 2 },
    { id: "_3", level: 2 },
    { id: "_4", level: 2 },
    { id: "_5", level: 2 },
    { id: "_6", level: 2 },
    { id: "_7", level: 3 }
]);
assert.equal(resolvedLanguageTransfer.hadTransfer, true);
assert.equal(resolvedLanguageTransfer.targetId, "_4");
assert.equal(resolvedLanguageTransfer.url, "https://infernux-engine.com/wiki/site/zh/manual/input-and-time.html#_4");
const mismatchedLanguageTransfer = context.resolveLanguageSectionUrl(languageTransfer, [
    { id: "_2", level: 2 },
    { id: "_3", level: 2 }
]);
assert.equal(mismatchedLanguageTransfer.targetId, "", "different bilingual structures must safely fall back to the page top");
assert.equal(mismatchedLanguageTransfer.url, "https://infernux-engine.com/wiki/site/zh/manual/input-and-time.html");
assert.equal(context.buildLanguageSectionUrl("javascript:alert(1)", { index: 0, total: 1, level: 2 }), "");
for (const contract of ["Copy section link", "复制章节链接", "Section link copied", "章节链接已复制", "copyText(target.url)", "window.addEventListener(\"hashchange\", syncCopyLabel)", "aria-live"]) {
    assert.ok(source.includes(contract), `section-link runtime is missing '${contract}'`);
}
for (const contract of ["LANGUAGE_SECTION_PARAMS", "restoreTransferredLanguageSection", "initializeLanguageSectionLink", "window.history.replaceState", "scrollIntoView", "total === entries.length", "hashchange"]) {
    assert.ok(source.includes(contract), `language-section continuity runtime is missing '${contract}'`);
}

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
    source: "docs/wiki/docs/en/learn/getting-started.md",
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
assert.equal(context.visibleDocumentSection([], 96), "");
assert.equal(context.visibleDocumentSection([
    { id: "description", top: 160 },
    { id: "methods", top: 420 }
], 96), "", "introductory content before the first H2 should keep page-level copy active");
assert.equal(context.visibleDocumentSection([
    { id: "description", top: -24 },
    { id: "methods", top: 180 }
], 96), "description");
assert.equal(context.visibleDocumentSection([
    { id: "description", top: -240 },
    { id: "methods", top: 80 },
    { id: "move", top: 260 }
], 96), "methods", "the last heading above the sticky-navigation boundary should be current");
assert.equal(context.visibleDocumentSection([
    { id: "description", top: "invalid" },
    { id: "methods", top: 40 }
], 96), "methods", "invalid geometry should not disable later valid headings");
assert.equal(context.resolveDocumentSectionId("", false, "#methods"), "methods", "URL hash should seed section state before tracking starts");
assert.equal(context.resolveDocumentSectionId("description", true, "#methods"), "description", "visible section should supersede a stale URL hash");
assert.equal(context.resolveDocumentSectionId("", true, "#methods"), "", "scrolling above the first H2 should restore page-level copy even when the URL retains an old hash");
for (const contract of ["dataset.currentSection", "dataset.sectionTracking", "sectionTracking === \"ready\"", "visibleDocumentSection", "resolveDocumentSectionId", "site:document-section-changed", "requestAnimationFrame(syncVisibleSection)", "addEventListener(\"scroll\", scheduleVisibleSection, { passive: true })", "addEventListener(\"pageshow\", scheduleVisibleSection)"]) {
    assert.ok(source.includes(contract), `scroll-aware document outline is missing '${contract}'`);
}

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

assert.equal(
    context.buildContributionSourceUrl(curatedEntry, false),
    "https://github.com/ChenlizheMe/Infernux/edit/master/docs/wiki/docs/en/learn/getting-started.md"
);
assert.equal(
    context.buildContributionSourceUrl(apiEntry, true),
    "https://github.com/ChenlizheMe/Infernux/blob/master/docs/wiki/docs/en/api/GameObject.md"
);
for (const invalidEntry of [
    { ...curatedEntry, source: "docs/wiki/docs/en/learn/../manual/physics.md" },
    { ...curatedEntry, source: "https://example.com/unsafe.md" },
    { ...curatedEntry, language: "zh-CN" },
    { ...curatedEntry, layer: "api" },
    { ...curatedEntry, source: "docs/wiki/docs/en/learn/getting-started.txt" }
]) {
    assert.equal(context.buildContributionSourceUrl(invalidEntry, false), "", "unsafe or mismatched contribution paths must be rejected");
}
for (const contract of ["Edit this page", "在 GitHub 编辑本文", "View generated Markdown", "查看生成 Markdown", "/edit/master/", "/blob/master/", "segment === \"..\""]) {
    assert.ok(source.includes(contract), `document contribution runtime is missing '${contract}'`);
}

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

console.log("Documentation context test passed: canonical metadata, scroll-aware section links, bilingual continuity, visible build evidence, ordered navigation, safe contribution links, feedback provenance, and safe fallbacks.");

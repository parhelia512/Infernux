import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const source = await readFile(path.join(docsRoot, "js", "wiki.js"), "utf8");
const html = await readFile(path.join(docsRoot, "wiki.html"), "utf8");
const learningPaths = JSON.parse(await readFile(path.join(docsRoot, "learning-paths.json"), "utf8"));

const sandbox = {
    URL,
    URLSearchParams,
    console,
    fetch: async () => { throw new Error("network is disabled in the learning-progress unit test"); },
    globalThis: null,
    window: {
        addEventListener() {},
        history: { replaceState() {} },
        location: { hash: "", pathname: "/wiki.html", search: "" },
        localStorage: { getItem() { return null; } }
    },
    document: {
        addEventListener() {},
        documentElement: { lang: "en" },
        querySelector() { return null; }
    },
    __INFERNUX_WIKI_PROGRESS_TEST__: true
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(source, { filename: "wiki.js" }).runInContext(sandbox);

const progress = sandbox.__infernuxWikiProgress;
assert.ok(progress, "Wiki learning-progress helpers should be exported in test mode");
assert.equal(progress.WIKI_LEARNING_PROGRESS_KEY, "infernux-learning-progress-v1");
assert.equal(progress.parseWikiLearningProgress("not JSON").size, 0, "corrupt device storage should degrade to no progress");
assert.equal(progress.parseWikiLearningProgress(JSON.stringify(["first-flight:editor-and-scene", 42])).size, 1, "non-string storage entries should be ignored");

const empty = progress.deriveWikiLearningResume(learningPaths, new Set(), "en");
assert.equal(empty.state, "start");
assert.equal(empty.completedCount, 0);
assert.equal(empty.targetStep.id, "editor-and-scene");
assert.equal(empty.url, "/wiki/site/en/learn/getting-started.html");

const partial = progress.deriveWikiLearningResume(learningPaths, new Set(["first-flight:editor-and-scene"]), "zh-CN");
assert.equal(partial.state, "continue");
assert.equal(partial.completedCount, 1);
assert.equal(partial.targetStep.id, "first-component");
assert.equal(partial.stepTitle, "加入玩法逻辑");
assert.equal(partial.url, "/wiki/site/zh/learn/first-component.html");

const gapped = progress.deriveWikiLearningResume(learningPaths, new Set(["first-flight:first-component"]), "en");
assert.equal(gapped.targetStep.id, "editor-and-scene", "the first incomplete ordered step should remain the continuation target");

const everyKey = learningPaths.paths[0].steps.map((step) => `first-flight:${step.id}`);
const complete = progress.deriveWikiLearningResume(learningPaths, new Set(everyKey), "en");
assert.equal(complete.state, "complete");
assert.equal(complete.completedCount, 3);
assert.equal(complete.targetStep.id, "standalone-build");
assert.equal(progress.deriveWikiLearningResume({ paths: [] }, new Set(), "en"), null);

const recentDocuments = [
    { url: "/wiki/site/en/manual/physics.html", language: "en", visited_at: 300 },
    { url: "/wiki/site/zh/manual/physics.html", language: "zh-CN", visited_at: 200 },
    { url: "/wiki/site/en/api/GameObject.html", language: "en", visited_at: 100 },
    { url: "/wiki/site/en/api/Transform.html", language: "en", visited_at: 90 },
    { url: "/wiki/site/en/api/Scene.html", language: "en", visited_at: 80 },
    { url: "/wiki/site/en/api/Time.html", language: "en", visited_at: 70 }
];
assert.deepEqual(Array.from(progress.selectWikiRecentDocuments(recentDocuments, "en"), (item) => item.url), [
    "/wiki/site/en/manual/physics.html",
    "/wiki/site/en/api/GameObject.html",
    "/wiki/site/en/api/Transform.html",
    "/wiki/site/en/api/Scene.html"
]);
assert.equal(progress.selectWikiRecentDocuments(recentDocuments, "zh-CN").length, 1);
const relativeNow = Date.UTC(2026, 6, 16, 12, 0, 0);
assert.equal(progress.formatRecentDocumentVisit(relativeNow - 10_000, relativeNow, "en"), "just now");
assert.match(progress.formatRecentDocumentVisit(relativeNow - 2 * 60 * 60 * 1000, relativeNow, "en"), /2 hours ago/);
assert.match(progress.formatRecentDocumentVisit(relativeNow - 24 * 60 * 60 * 1000, relativeNow, "zh-CN"), /昨天/);

for (const contract of ["data-learning-resume", "id=\"learning-resume-status\"", "aria-live=\"polite\"", "id=\"learning-resume-meter\"", "id=\"learning-resume-link\""]) {
    assert.ok(html.includes(contract), `Wiki learning resume markup is missing '${contract}'`);
}
for (const contract of ["site:language-changed", "window.addEventListener(\"storage\"", "window.addEventListener(\"pageshow\"", "learning-paths.json", "No account sync", "不会同步账号"]) {
    assert.ok(source.includes(contract), `Wiki learning resume runtime is missing '${contract}'`);
}

console.log("Wiki learning continuity checks passed.");

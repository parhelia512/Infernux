import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const source = await readFile(path.join(docsRoot, "js", "docs-recent.js"), "utf8");
const generatedRuntime = await readFile(path.join(docsRoot, "js", "wiki-generated.js"), "utf8");
const wikiRuntime = await readFile(path.join(docsRoot, "js", "wiki.js"), "utf8");
const wikiHtml = await readFile(path.join(docsRoot, "wiki.html"), "utf8");
const now = Date.UTC(2026, 6, 16, 12, 0, 0);
const values = new Map();
const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
};
const sandbox = { URL, Date, JSON, Object, Set, globalThis: null, localStorage: storage };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(source, { filename: "docs-recent.js" }).runInContext(sandbox);

const recent = sandbox.InfernuxRecentDocuments;
assert.ok(recent, "recent-document store should be exported");
assert.equal(recent.KEY, "infernux-recent-documents-v1");
assert.equal(recent.MAX_ITEMS, 8);
assert.deepEqual(JSON.parse(JSON.stringify(recent.parseRoute("/wiki/site/en/manual/physics.html"))), {
    url: "/wiki/site/en/manual/physics.html",
    language: "en",
    layer: "manual"
});
assert.equal(recent.parseRoute("https://evil.example/wiki/site/en/manual/physics.html"), null);
assert.equal(recent.parseRoute("/wiki/site/404.html"), null);
assert.equal(recent.parseRoute("/wiki/site/en/manual/physics.txt"), null);
assert.equal(recent.normalize("corrupt", now).length, 0);

const normalized = recent.normalize([
    { url: "/wiki/site/en/manual/physics.html", title: " Old physics ", status: "preview", visited_at: now - 5000, content: "must not persist" },
    { url: "/wiki/site/en/manual/physics.html", title: "Current physics", status: "preview", visited_at: now - 1000 },
    { url: "/wiki/site/zh/api/GameObject.html", title: " 游戏对象 ", status: "unknown", visited_at: now - 2000 },
    { url: "/wiki/site/en/learn/expired.html", title: "Expired", status: "stable", visited_at: now - (181 * 24 * 60 * 60 * 1000) },
    { url: "/wiki/site/en/learn/future.html", title: "Future", status: "stable", visited_at: now + (6 * 60 * 1000) }
], now);
assert.equal(normalized.length, 2, "duplicates, expired entries, and implausible future entries should be removed");
assert.equal(normalized[0].title, "Current physics");
assert.equal(normalized[1].language, "zh-CN");
assert.equal(normalized[1].layer, "api");
assert.equal(normalized[1].status, "");
assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(normalized[0]))).sort(), ["language", "layer", "status", "title", "url", "visited_at"], "history must not retain page content, searches, or account data");

const overflow = Array.from({ length: 10 }, (_, index) => ({
    url: `/wiki/site/en/api/Symbol${index}.html`,
    title: `Symbol ${index}`,
    status: "stable",
    visited_at: now - index
}));
assert.equal(recent.normalize(overflow, now).length, 8, "history should remain strictly bounded");

recent.record({ url: "/wiki/site/en/manual/physics.html", title: "Physics", status: "preview" }, { storage, now });
recent.record({ url: "/wiki/site/en/api/GameObject.html", title: "GameObject", status: "stable" }, { storage, now: now + 1000 });
recent.record({ url: "/wiki/site/en/manual/physics.html", title: "Physics refreshed", status: "preview" }, { storage, now: now + 2000 });
const stored = recent.read({ storage, now: now + 2000 });
assert.equal(stored.length, 2);
assert.equal(stored[0].title, "Physics refreshed", "revisiting a page should move one deduplicated record to the front");
assert.equal(stored[1].url, "/wiki/site/en/api/GameObject.html");
assert.equal(recent.clear({ storage }), true);
assert.equal(recent.read({ storage, now }).length, 0);

for (const contract of ["recordRecentDocument", "InfernuxRecentDocuments", "window.location.pathname", ".doc-provenance"]) {
    assert.ok(generatedRuntime.includes(contract), `generated documentation runtime is missing '${contract}'`);
}
for (const contract of ["renderWikiRecentDocuments", "clearWikiRecentDocuments", "selectWikiRecentDocuments", "Intl.RelativeTimeFormat", "focusTarget.focus", "site:language-changed", "window.addEventListener(\"storage\"", "window.addEventListener(\"pageshow\""]) {
    assert.ok(wikiRuntime.includes(contract), `Wiki recent-document runtime is missing '${contract}'`);
}
for (const contract of ["id=\"recent-documents\"", "id=\"recent-documents-list\"", "id=\"recent-documents-clear\"", "docs-recent.js?v=1", "wiki.js?v=9"]) {
    assert.ok(wikiHtml.includes(contract), `Wiki recent-document markup is missing '${contract}'`);
}

console.log("Recent-document continuity checks passed: bounded metadata, expiry, deduplication, privacy, language, and Wiki integration.");

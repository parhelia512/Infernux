import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const source = await readFile(path.resolve("docs", "sw.js"), "utf8");
assert.match(source, /const PRECACHE_URLS = \[[\s\S]*"\/start\.html"/, "Start should be available in the offline shell");
assert.match(source, /networkFirst\(request, true\)/, "page navigation should remain network first");
assert.match(source, /url\.searchParams\.has\("v"\)[\s\S]*networkFirst\(request\)/, "versioned scripts and styles should bypass stale shell entries while online");
assert.match(source, /staleWhileRevalidate\(request\)/, "static runtime should refresh in the background");
assert.match(source, /cacheFirst\(request\)/, "fonts and images should use cache first");
for (const removed of ["/docs-index.json", "/docs-health.json", "/learning-paths.json", "/llms.txt", "wiki-docs."]) {
    assert.doesNotMatch(source, new RegExp(removed.replaceAll(".", "\\.")), `${removed} should not remain in the worker`);
}

console.log("Service Worker test passed: the compact Start shell is cached without removed guide artifacts.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(scriptDir, "..", "sw.js"), "utf8");
const handlers = new Map();
const stored = new Map();
const deletedCaches = [];
let openedCacheName = "";
let skipWaitingCalls = 0;
let claimCalls = 0;
let fetchCalls = 0;
let fetchImplementation = async () => { throw new Error("offline"); };

function requestKey(request) {
    const raw = typeof request === "string" ? request : request.url;
    return new URL(raw, "https://infernux-engine.com").pathname;
}

const cache = {
    async addAll(routes) {
        for (const route of routes) stored.set(requestKey(route), new Response(`precached:${route}`, { status: 200 }));
    },
    async match(request) {
        return stored.get(requestKey(request))?.clone();
    },
    async put(request, response) {
        stored.set(requestKey(request), response.clone());
    }
};

const sandbox = {
    URL,
    Response,
    Promise,
    console,
    fetch: async (request) => {
        fetchCalls += 1;
        return fetchImplementation(request);
    },
    caches: {
        async open(name) {
            openedCacheName = name;
            return cache;
        },
        async keys() {
            return [openedCacheName, "infernux-pwa-obsolete", "unrelated-cache"];
        },
        async delete(name) {
            deletedCaches.push(name);
            return true;
        }
    },
    self: {
        location: { origin: "https://infernux-engine.com" },
        clients: { async claim() { claimCalls += 1; } },
        async skipWaiting() { skipWaitingCalls += 1; },
        addEventListener(type, handler) { handlers.set(type, handler); }
    }
};
vm.createContext(sandbox);
new vm.Script(source, { filename: "sw.js" }).runInContext(sandbox);

async function dispatchLifetime(type, data = {}) {
    let pending = Promise.resolve();
    handlers.get(type)({ ...data, waitUntil(value) { pending = Promise.resolve(value); } });
    await pending;
}

async function dispatchFetch(request) {
    let responsePromise = null;
    handlers.get("fetch")({ request, respondWith(value) { responsePromise = Promise.resolve(value); } });
    return responsePromise ? responsePromise : null;
}

assert.match(source, /const CACHE_VERSION = "[a-f0-9]{16}"/);
assert.match(source, /"\/offline\.html"/);
assert.match(source, /"\/docs-index\.json"/);
assert.match(source, /"\/docs-health\.json"/);
assert.match(source, /"\/learning-paths\.json"/);
assert.match(source, /"\/api-index\.json"/);
assert.match(source, /"\/css\/wiki-template\.[a-f0-9]{16}\.css"/);

await dispatchLifetime("install");
assert.match(openedCacheName, /^infernux-pwa-[a-f0-9]{16}$/);
assert.equal(skipWaitingCalls, 1);
assert.ok(stored.has("/offline.html"));

await dispatchLifetime("activate");
assert.deepEqual(deletedCaches, ["infernux-pwa-obsolete"]);
assert.equal(claimCalls, 1);

fetchImplementation = async () => { throw new Error("offline"); };
const offlineNavigation = await dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: "https://infernux-engine.com/wiki/site/en/manual/physics.html"
});
assert.equal(await offlineNavigation.text(), "precached:/offline.html");

stored.set("/docs-index.json", new Response("old", { status: 200 }));
fetchImplementation = async () => new Response("fresh", { status: 200 });
const freshIndex = await dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://infernux-engine.com/docs-index.json"
});
assert.equal(await freshIndex.text(), "fresh");
assert.equal(await stored.get("/docs-index.json").text(), "fresh");

const hashedStyle = source.match(/"(\/css\/wiki-template\.[a-f0-9]{16}\.css)"/)?.[1];
assert.ok(hashedStyle);
fetchCalls = 0;
const cachedStyle = await dispatchFetch({
    method: "GET",
    mode: "cors",
    url: `https://infernux-engine.com${hashedStyle}`
});
assert.match(await cachedStyle.text(), /^precached:/);
assert.equal(fetchCalls, 0, "content-hashed assets should be cache-first");

const crossOrigin = await dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://api.github.com/repos/ChenlizheMe/Infernux/discussions"
});
assert.equal(crossOrigin, null, "cross-origin requests must remain outside the Service Worker");

handlers.get("message")({ data: "SKIP_WAITING" });
await Promise.resolve();
assert.equal(skipWaitingCalls, 2);

console.log("Service Worker test passed: install, cleanup, network-first evidence, offline fallback, and immutable cache-first assets.");

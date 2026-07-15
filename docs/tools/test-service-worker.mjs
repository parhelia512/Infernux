import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const source = await readFile(path.join(docsRoot, "sw.js"), "utf8");
const handlers = new Map();
const runtimeCacheName = "infernux-pwa-runtime-v1";
const cacheStores = new Map([
    [runtimeCacheName, new Map([["/persisted-across-update.html", new Response("persisted", { status: 200 })]])],
    ["infernux-pwa-obsolete", new Map([
        ["/index.html", new Response("old-core-home", { status: 200 })],
        ["/legacy-read.html", new Response("legacy-read", { status: 200 })]
    ])]
]);
const deletedCaches = [];
let openedCacheName = "";
let skipWaitingCalls = 0;
let claimCalls = 0;
let fetchCalls = 0;
let rejectRuntimeWrites = false;
let fetchImplementation = async () => { throw new Error("offline"); };

function requestKey(request) {
    const raw = typeof request === "string" ? request : request.url;
    return new URL(raw, "https://infernux-engine.com").pathname;
}

function cacheFor(name) {
    if (!cacheStores.has(name)) cacheStores.set(name, new Map());
    const stored = cacheStores.get(name);
    return {
        async addAll(routes) {
            for (const route of routes) stored.set(requestKey(route), new Response(`precached:${route}`, { status: 200 }));
        },
        async delete(request) {
            return stored.delete(requestKey(request));
        },
        async keys() {
            return [...stored.keys()].map((route) => ({ url: `https://infernux-engine.com${route}` }));
        },
        async match(request) {
            return stored.get(requestKey(request))?.clone();
        },
        async put(request, response) {
            if (name === runtimeCacheName && rejectRuntimeWrites) throw new Error("QuotaExceededError");
            stored.set(requestKey(request), response.clone());
        }
    };
}

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
            return cacheFor(name);
        },
        async keys() {
            return [...cacheStores.keys(), "unrelated-cache"];
        },
        async delete(name) {
            deletedCaches.push(name);
            cacheStores.delete(name);
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
assert.match(source, /const RUNTIME_CACHE_NAME = CACHE_PREFIX \+ "runtime-v1"/);
assert.match(source, /const RUNTIME_MAX_ENTRIES = 96/);
const precacheMatch = source.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
assert.ok(precacheMatch, "generated worker should expose one deterministic core-shell list");
const precacheRoutes = JSON.parse(precacheMatch[1]);
for (const route of [
    "/offline.html",
    "/index.html",
    "/wiki.html",
    "/roadmap.html",
    "/community.html",
    "/download.html",
    "/site.webmanifest",
    "/assets/logo.png",
    "/css/fonts.css",
    "/css/style.css",
    "/css/mission.css",
    "/css/fontawesome-subset.css",
    "/css/wiki.css",
    "/css/wiki-noscript.css",
    "/css/roadmap.css",
    "/css/community.css",
    "/css/download.css",
    "/js/i18n.js",
    "/js/main.js",
    "/js/wiki.js",
    "/js/docs-health.js",
    "/js/community.js",
    "/js/pwa-install.js",
    "/js/download.js",
]) {
    assert.ok(precacheRoutes.includes(route), `core shell is missing '${route}'`);
}
for (const route of [
    "/docs-index.json",
    "/docs-health.json",
    "/learning-paths.json",
    "/api-index.json",
    "/docs-manifest.json",
    "/release.json",
    "/release-notes.json",
    "/llms.txt",
    "/assets/infernux-icon-192.png",
    "/assets/infernux-icon-512.png",
    "/assets/infernux-icon-maskable-512.png",
    "/assets/infernux-apple-touch-icon.png",
    "/css/wiki-generated.css",
    "/js/wiki-generated.js",
    "/css/docs-search.css",
    "/js/docs-search.js",
]) {
    assert.ok(!precacheRoutes.includes(route), `on-demand resource '${route}' must not consume install bandwidth`);
}
assert.equal(new Set(precacheRoutes).size, precacheRoutes.length, "core-shell routes must be unique");
const precacheBytes = (await Promise.all(precacheRoutes.map(async (route) => (await stat(path.join(docsRoot, route.slice(1)))).size)))
    .reduce((total, bytes) => total + bytes, 0);
assert.ok(precacheBytes <= 768 * 1024, `core shell exceeds 768 KiB: ${(precacheBytes / 1024).toFixed(1)} KiB`);

await dispatchLifetime("install");
assert.match(openedCacheName, /^infernux-pwa-[a-f0-9]{16}$/);
const coreCacheName = openedCacheName;
const coreStored = cacheStores.get(coreCacheName);
const runtimeStored = cacheStores.get(runtimeCacheName);
assert.equal(skipWaitingCalls, 0, "replacement workers must wait for explicit user consent");
assert.ok(coreStored.has("/offline.html"));

await dispatchLifetime("activate");
assert.deepEqual(deletedCaches, ["infernux-pwa-obsolete"]);
assert.ok(cacheStores.has(runtimeCacheName), "runtime cache should survive core-shell version activation");
assert.equal(await runtimeStored.get("/persisted-across-update.html").clone().text(), "persisted");
assert.equal(await runtimeStored.get("/legacy-read.html").clone().text(), "legacy-read", "previously visited content should migrate before an obsolete cache is removed");
assert.equal(runtimeStored.has("/index.html"), false, "versioned core entries should not be copied into persistent runtime storage");
assert.equal(claimCalls, 1);

fetchImplementation = async () => { throw new Error("offline"); };
const offlineNavigation = await dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: "https://infernux-engine.com/wiki/site/en/manual/physics.html"
});
assert.equal(await offlineNavigation.text(), "precached:/offline.html");

const offlineHome = await dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: "https://infernux-engine.com/"
});
assert.equal(await offlineHome.text(), "precached:/index.html", "installed start_url should recover the real home shell");

const offlineCommunity = await dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: "https://infernux-engine.com/community.html"
});
assert.equal(await offlineCommunity.text(), "precached:/community.html");

fetchImplementation = async () => new Response("online-community", { status: 200 });
const onlineCommunity = await dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: "https://infernux-engine.com/community.html"
});
assert.equal(await onlineCommunity.text(), "online-community");
assert.equal(runtimeStored.has("/community.html"), false, "versioned core resources must not be duplicated in persistent runtime storage");

runtimeStored.set("/docs-index.json", new Response("old", { status: 200 }));
fetchImplementation = async () => new Response("fresh", { status: 200 });
const freshIndex = await dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://infernux-engine.com/docs-index.json"
});
assert.equal(await freshIndex.text(), "fresh");
assert.equal(await runtimeStored.get("/docs-index.json").text(), "fresh");

const hashedStyle = "/css/wiki-template.0123456789abcdef.css";
assert.equal(runtimeStored.has(hashedStyle), false, "generated-page assets should start outside the core shell");
fetchImplementation = async () => new Response("runtime-hashed-style", { status: 200 });
const firstHashedStyle = await dispatchFetch({
    method: "GET",
    mode: "cors",
    url: `https://infernux-engine.com${hashedStyle}`
});
assert.equal(await firstHashedStyle.text(), "runtime-hashed-style");
assert.equal(await runtimeStored.get(hashedStyle).clone().text(), "runtime-hashed-style");
fetchImplementation = async () => { throw new Error("offline"); };
fetchCalls = 0;
const cachedStyle = await dispatchFetch({
    method: "GET",
    mode: "cors",
    url: `https://infernux-engine.com${hashedStyle}`
});
assert.equal(await cachedStyle.text(), "runtime-hashed-style");
assert.equal(fetchCalls, 0, "a previously requested content-hashed asset should remain cache-first offline");

fetchImplementation = async (request) => new Response(`runtime:${request.url}`, { status: 200 });
for (let index = 0; index < 100; index += 1) {
    const response = await dispatchFetch({
        method: "GET",
        mode: "cors",
        url: `https://infernux-engine.com/assets/runtime-${String(index).padStart(3, "0")}.png`
    });
    assert.equal(response.status, 200);
}
assert.equal(runtimeStored.size, 96, "runtime cache must be bounded after repeated browsing");
assert.equal(runtimeStored.has("/persisted-across-update.html"), false, "oldest runtime entry should be evicted first under pressure");
assert.equal(runtimeStored.has("/assets/runtime-099.png"), true, "newest runtime entry should remain available");

rejectRuntimeWrites = true;
fetchImplementation = async () => new Response("network-survives-quota", { status: 200 });
const quotaResponse = await dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://infernux-engine.com/quota-evidence.json"
});
assert.equal(await quotaResponse.text(), "network-survives-quota", "cache quota failure must not replace a successful network response");
assert.equal(runtimeStored.has("/quota-evidence.json"), false);
rejectRuntimeWrites = false;

const crossOrigin = await dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://api.github.com/repos/ChenlizheMe/Infernux/discussions"
});
assert.equal(crossOrigin, null, "cross-origin requests must remain outside the Service Worker");

handlers.get("message")({ data: "SKIP_WAITING" });
await Promise.resolve();
assert.equal(skipWaitingCalls, 1);

console.log(`Service Worker test passed: ${precacheRoutes.length} dependency-derived shell resources (${(precacheBytes / 1024).toFixed(1)} KiB), legacy migration, persistent 96-entry runtime cache, quota-safe network responses, and explicit activation.`);

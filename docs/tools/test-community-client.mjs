import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(scriptDir, "..", "js", "community.js"), "utf8");
const storage = new Map();
const documentElement = {
    lang: "en",
    getAttribute() { return null; }
};

const sandbox = {
    AbortController,
    Date,
    Intl,
    JSON,
    Math,
    Number,
    RegExp,
    URL,
    URLSearchParams,
    console,
    fetch: async () => { throw new Error("network is disabled in the client unit test"); },
    history: { replaceState() {} },
    sessionStorage: {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); }
    },
    document: {
        documentElement,
        addEventListener() {},
        getElementById() { return null; },
        querySelector() { return null; }
    },
    window: {
        addEventListener() {},
        clearTimeout,
        location: { href: "https://infernux-engine.com/community.html", search: "" },
        setTimeout
    },
    MutationObserver: class {
        observe() {}
    }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

new vm.Script(`${source}\n;globalThis.__communityTest = {
    api: COMMUNITY_API,
    normalizeCommunityTopic,
    normalizeCommunityTopics,
    categoryDisplayName,
    writeCommunityCache,
    readCommunityCache,
    filter(topics, query, category) {
        cachedCommunityTopics = topics;
        communitySearch = query;
        communityCategory = category;
        return filteredCommunityTopics();
    }
};`, { filename: "community.js" }).runInContext(sandbox);

const client = sandbox.__communityTest;
const topics = [
    {
        html_url: "https://github.com/ChenlizheMe/Infernux/discussions/41",
        title: "  Python package naming  ",
        category: { name: "General", slug: "general" },
        user: { login: "engine-user" },
        updated_at: "2026-07-15T08:00:00Z",
        comments: 3
    },
    {
        html_url: "https://github.com/ChenlizheMe/Infernux/discussions/15",
        title: "Help wanted: macOS testers",
        category: { name: "Q&A", slug: "q-a" },
        user: { login: "maintainer" },
        updated_at: "2026-07-14T08:00:00Z",
        comments: 2
    }
];

assert.match(client.api, /per_page=20/);
const normalized = client.normalizeCommunityTopics(topics);
assert.equal(normalized.length, 2);
assert.equal(normalized[0].title, "Python package naming");
assert.equal(normalized[0].comments, 3);
assert.equal(client.normalizeCommunityTopic({ ...topics[0], html_url: "https://evil.example/discussions/41" }), null);
assert.equal(client.normalizeCommunityTopic({ ...topics[0], updated_at: "not-a-date" }), null);
assert.deepEqual(Array.from(client.filter(normalized, "python engine-user", ""), (topic) => topic.title), ["Python package naming"]);
assert.deepEqual(Array.from(client.filter(normalized, "", "q-a"), (topic) => topic.title), ["Help wanted: macOS testers"]);
assert.equal(client.filter(normalized, "missing", "").length, 0);

documentElement.lang = "zh-CN";
assert.equal(client.categoryDisplayName("General"), "综合讨论");
assert.equal(client.categoryDisplayName("Custom"), "Custom");

client.writeCommunityCache(normalized);
const cached = client.readCommunityCache();
assert.equal(cached.topics.length, 2);
assert.equal(cached.topics[1].category.slug, "q-a");
assert.ok(Date.now() - cached.storedAt < 1000);

storage.set("infernux-community-feed-v1", JSON.stringify({ version: 1, storedAt: Date.now(), topics: [{ title: "unsafe" }] }));
assert.equal(client.readCommunityCache(), null);

console.log("Community client test passed: canonical URLs, filtering, localization, and session cache.");

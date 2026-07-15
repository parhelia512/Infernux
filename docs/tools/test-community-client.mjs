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
const giscusFrameWindow = {};
const giscusFrame = { contentWindow: giscusFrameWindow, src: "https://giscus.app/en/widget?repo=ChenlizheMe%2FInfernux" };
const giscusHost = {
    dataset: {
        repo: "ChenlizheMe/Infernux",
        repoId: "R_kgDOO_wV3A",
        category: "General",
        categoryId: "DIC_kwDOO_wV3M4C5oaC",
        mapping: "specific",
        term: "Infernux Community Wall",
        strict: "1",
        reactionsEnabled: "1",
        emitMetadata: "0",
        inputPosition: "top",
        loading: "lazy"
    },
    replaceChildren() {}
};
let appendedGiscusScript = null;

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
    giscusFrameWindow,
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
        body: {
            appendChild(node) { appendedGiscusScript = node; }
        },
        createElement(tagName) {
            assert.equal(tagName, "script");
            return {
                dataset: {},
                listeners: new Map(),
                addEventListener(type, handler) { this.listeners.set(type, handler); },
                remove() { if (appendedGiscusScript === this) appendedGiscusScript = null; }
            };
        },
        getElementById(id) { return id === "giscus-client" ? appendedGiscusScript : null; },
        querySelector(selector) {
            if (selector === ".giscus") return giscusHost;
            if (selector === "iframe.giscus-frame") return appendedGiscusScript ? giscusFrame : null;
            return null;
        }
    },
    window: {
        addEventListener() {},
        clearTimeout() {},
        location: { href: "https://infernux-engine.com/community.html", search: "" },
        setTimeout() { return 1; }
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
    mergeCommunityTopics,
    categoryDisplayName,
    writeCommunityCache,
    readCommunityCache,
    giscusOrigin: GISCUS_ORIGIN,
    giscusOptInKey: GISCUS_OPT_IN_KEY,
    classifyGiscusError,
    readGiscusOptIn,
    rememberGiscusOptIn,
    giscusConfiguration,
    loadGiscusEmbed,
    handleGiscusMessage,
    giscusState() { return giscusReadinessState; },
    giscusScript() { return document.getElementById(GISCUS_SCRIPT_ID); },
    giscusFrameWindow,
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
        number: 41,
        title: "  Python package naming  ",
        category: { name: "General", slug: "general" },
        user: { login: "engine-user" },
        updated_at: "2026-07-15T08:00:00Z",
        comments: 3,
        answer_chosen_at: "2026-07-15T09:00:00Z",
        locked: false
    },
    {
        html_url: "https://github.com/ChenlizheMe/Infernux/discussions/15",
        number: 15,
        title: "Help wanted: macOS testers",
        category: { name: "Q&A", slug: "q-a" },
        user: { login: "maintainer" },
        updated_at: "2026-07-14T08:00:00Z",
        comments: 2,
        answer_chosen_at: null,
        locked: true
    }
];

assert.match(client.api, /per_page=20/);
assert.match(client.api, /sort=updated/);
const normalized = client.normalizeCommunityTopics(topics);
assert.equal(normalized.length, 2);
assert.equal(normalized[0].title, "Python package naming");
assert.equal(normalized[0].comments, 3);
assert.equal(normalized[0].number, 41);
assert.equal(normalized[0].answer_chosen_at, "2026-07-15T09:00:00Z");
assert.equal(normalized[1].locked, true);
assert.equal(client.normalizeCommunityTopic({ ...topics[0], html_url: "https://evil.example/discussions/41" }), null);
assert.equal(client.normalizeCommunityTopic({ ...topics[0], number: 42 }), null);
assert.equal(client.normalizeCommunityTopic({ ...topics[0], updated_at: "not-a-date" }), null);
assert.deepEqual(Array.from(client.filter(normalized, "python engine-user", ""), (topic) => topic.title), ["Python package naming"]);
assert.deepEqual(Array.from(client.filter(normalized, "", "q-a"), (topic) => topic.title), ["Help wanted: macOS testers"]);
assert.equal(client.filter(normalized, "missing", "").length, 0);

const merged = client.mergeCommunityTopics(normalized, [
    { ...normalized[0], title: "Updated package naming", updated_at: "2026-07-16T08:00:00Z" },
]);
assert.equal(merged.length, 2);
assert.equal(merged[0].title, "Updated package naming");

documentElement.lang = "zh-CN";
assert.equal(client.categoryDisplayName("General"), "综合讨论");
assert.equal(client.categoryDisplayName("Custom"), "Custom");

client.writeCommunityCache(normalized, 2);
const cached = client.readCommunityCache();
assert.equal(cached.topics.length, 2);
assert.equal(cached.topics[1].category.slug, "q-a");
assert.equal(cached.nextPage, 2);
assert.ok(Date.now() - cached.storedAt < 1000);

storage.set("infernux-community-feed-v1", JSON.stringify({ version: 2, storedAt: Date.now(), topics: normalized, nextPage: 1 }));
assert.equal(client.readCommunityCache(), null);

assert.equal(client.classifyGiscusError("Discussion not found"), "ready");
assert.equal(client.classifyGiscusError("giscus is not installed on this repository"), "uninstalled");
assert.equal(client.classifyGiscusError("API rate limit exceeded"), "degraded");
assert.equal(client.classifyGiscusError("Repository unavailable"), "error");
assert.equal(client.giscusState(), "standby");
assert.equal(client.readGiscusOptIn(), false);
assert.equal(client.loadGiscusEmbed(), true);
assert.equal(client.giscusState(), "checking");
assert.equal(client.readGiscusOptIn(), true);
assert.equal(storage.get(client.giscusOptInKey), "1");
assert.equal(client.giscusScript().src, "https://giscus.app/client.js");
assert.equal(client.giscusScript().crossOrigin, "anonymous");
assert.equal(client.giscusScript().dataset.repo, "ChenlizheMe/Infernux");
assert.equal(client.giscusScript().dataset.mapping, "specific");
assert.equal(client.giscusScript().dataset.loading, "lazy");
assert.equal(client.loadGiscusEmbed(), false, "a second load must be ignored while the frame is pending");
client.handleGiscusMessage({ origin: "https://evil.example", source: client.giscusFrameWindow, data: { giscus: { error: "not installed" } } });
assert.equal(client.giscusState(), "checking");
client.handleGiscusMessage({ origin: client.giscusOrigin, source: {}, data: { giscus: { error: "not installed" } } });
assert.equal(client.giscusState(), "checking");
client.handleGiscusMessage({ origin: client.giscusOrigin, source: client.giscusFrameWindow, data: { giscus: { error: "giscus is not installed on this repository" } } });
assert.equal(client.giscusState(), "uninstalled");
client.handleGiscusMessage({ origin: client.giscusOrigin, source: client.giscusFrameWindow, data: { giscus: { resizeHeight: 420 } } });
assert.equal(client.giscusState(), "uninstalled");
client.handleGiscusMessage({ origin: client.giscusOrigin, source: client.giscusFrameWindow, data: { giscus: { error: "Discussion not found" } } });
assert.equal(client.giscusState(), "ready");
const initialScript = client.giscusScript();
assert.equal(client.loadGiscusEmbed(), true);
assert.equal(client.giscusState(), "checking");
assert.equal(client.giscusScript(), initialScript, "retrying an existing frame must not add another Giscus client listener");
client.handleGiscusMessage({ origin: client.giscusOrigin, source: client.giscusFrameWindow, data: { giscus: { resizeHeight: 420 } } });
assert.equal(client.giscusState(), "ready");

console.log("Community client test passed: canonical URLs, pagination, topic metadata, filtering, localization, explicit Giscus loading, and verified frame messages.");

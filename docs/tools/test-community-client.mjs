import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.join(scriptDir, "..");
const source = await readFile(path.join(docsRoot, "js", "community.js"), "utf8");
const apiSource = await readFile(path.join(docsRoot, "js", "community-api.js"), "utf8");
const giscusSource = await readFile(path.join(docsRoot, "js", "community-giscus.js"), "utf8");
const communityHtml = await readFile(path.join(docsRoot, "community.html"), "utf8");
const topicHtml = await readFile(path.join(docsRoot, "community-topic.html"), "utf8");
const topicSource = await readFile(path.join(docsRoot, "js", "community-topic.js"), "utf8");
const communityCss = await readFile(path.join(docsRoot, "css", "community.css"), "utf8");

const deviceStorage = new Map();
const tabStorage = new Map();
let copiedText = null;
let sharedPayload = null;

function storageFor(values) {
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); }
    };
}

const sandbox = {
    AbortController,
    Date,
    Headers,
    Intl,
    JSON,
    Math,
    Number,
    RegExp,
    URL,
    URLSearchParams,
    console,
    fetch: async () => { throw new Error("network is disabled in the client unit test"); },
    history: { lastUrl: "", replaceState(_state, _title, url) { this.lastUrl = url; } },
    localStorage: storageFor(deviceStorage),
    sessionStorage: storageFor(tabStorage),
    navigator: {
        clipboard: { async writeText(value) { copiedText = value; } },
        canShare() { return true; },
        async share(payload) { sharedPayload = payload; }
    },
    document: {
        documentElement: { lang: "en", getAttribute() { return null; } },
        addEventListener() {},
        createElement() { return { className: "", value: "", setAttribute() {}, select() {}, remove() {} }; },
        getElementById() { return null; },
        querySelectorAll() { return []; },
        body: { appendChild() {} }
    },
    window: {
        addEventListener() {},
        clearTimeout() {},
        location: { href: "https://infernux-engine.com/community.html", search: "", hash: "", assign() {} },
        setTimeout() { return 1; }
    },
    InfernuxCommunityApi: {
        async request() { throw new Error("gateway is disabled in unit tests"); },
        async session() { return { authenticated: false, user: null }; },
        signIn() {},
        signOut() {}
    }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

new vm.Script(`${source}\n;globalThis.__communityTest = {
    normalizeCommunityTopic,
    normalizeCommunityTopics,
    mergeCommunityTopics,
    sortCommunityTopics,
    categoryDisplayName,
    copy: communityCopy,
    shareTopic: shareOrCopyCommunityTopic,
    writeCommunityCache,
    readCommunityCache,
    filter(topics, query, category, state = "", sort = "updated") {
        cachedCommunityTopics = topics;
        communitySearch = query;
        communityCategory = category;
        communityState = state;
        communitySort = sort;
        return filteredCommunityTopics();
    },
    readUrl(search) {
        window.location.search = search;
        window.location.href = "https://infernux-engine.com/community.html" + search;
        readCommunityFiltersFromUrl();
        return { search: communitySearch, category: communityCategory, state: communityState, sort: communitySort };
    },
    writeUrl({ search = "", category = "", state = "", sort = "updated" } = {}) {
        communitySearch = search;
        communityCategory = category;
        communityState = state;
        communitySort = sort;
        writeCommunityFiltersToUrl();
        return history.lastUrl;
    }
};`, { filename: "community.js" }).runInContext(sandbox);

const client = sandbox.__communityTest;
const topics = [
    {
        html_url: "https://github.com/ChenlizheMe/Infernux/discussions/41",
        number: 41,
        title: "  Python package naming  ",
        category: { name: "Q&A", slug: "q-a", is_answerable: true },
        user: { login: "engine-user" },
        created_at: "2026-07-10T08:00:00Z",
        updated_at: "2026-07-15T08:00:00Z",
        comments: 3,
        reactions: { total_count: 2 },
        answer_chosen_at: "2026-07-15T09:00:00Z",
        locked: false
    },
    {
        html_url: "https://github.com/ChenlizheMe/Infernux/discussions/15",
        number: 15,
        title: "Help wanted: macOS testers",
        category: { name: "General", slug: "general", is_answerable: false },
        user: { login: "maintainer" },
        created_at: "2026-07-14T08:00:00Z",
        updated_at: "2026-07-14T08:00:00Z",
        comments: 5,
        reactions: { total_count: 1 },
        answer_chosen_at: null,
        locked: true
    },
    {
        html_url: "https://github.com/ChenlizheMe/Infernux/discussions/33",
        number: 33,
        title: "How do I load a scene?",
        category: { name: "Q&A", slug: "q-a", is_answerable: true },
        user: { login: "new-user" },
        created_at: "2026-07-12T08:00:00Z",
        updated_at: "2026-07-13T08:00:00Z",
        comments: 1,
        reactions: { total_count: 0 },
        answer_chosen_at: null,
        locked: false
    }
];

const normalized = client.normalizeCommunityTopics(topics);
assert.equal(normalized.length, 3);
assert.equal(normalized[0].title, "Python package naming");
assert.equal(normalized[0].reactions, 2, "cached reaction totals should survive normalization");
assert.deepEqual([...client.filter(normalized, "scene", "q-a")].map((topic) => topic.number), [33]);
assert.deepEqual([...client.filter(normalized, "", "", "answered")].map((topic) => topic.number), [41]);
assert.deepEqual([...client.filter(normalized, "", "", "unanswered")].map((topic) => topic.number), [33], "only unlocked answerable topics are open questions");
assert.deepEqual([...client.filter(normalized, "", "", "locked")].map((topic) => topic.number), [15]);
assert.deepEqual([...client.filter(normalized, "", "", "", "replies")].map((topic) => topic.number), [15, 41, 33]);

const merged = client.mergeCommunityTopics(normalized.slice(0, 2), [{ ...normalized[0], comments: 9 }, normalized[2]]);
assert.equal(merged.length, 3);
assert.equal(merged.find((topic) => topic.number === 41).comments, 9);

client.writeCommunityCache(normalized, 2);
assert.ok(deviceStorage.has("infernux-community-feed-v2"), "the feed cache must be shared by tabs on one device");
assert.equal(tabStorage.has("infernux-community-feed-v2"), false, "the feed cache must not spend one API request per tab");
assert.equal(client.readCommunityCache().topics.length, 3);

assert.equal(JSON.stringify(client.readUrl("?q=scene&category=q-a&state=unanswered&sort=replies")), JSON.stringify({ search: "scene", category: "q-a", state: "unanswered", sort: "replies" }));
assert.equal(client.writeUrl(), "/community.html", "default forum view should keep a clean canonical URL");

const shareOutcome = await client.shareTopic(normalized[0]);
assert.equal(shareOutcome, "shared");
assert.equal(sharedPayload.url, "https://infernux-engine.com/community-topic.html?topic=41", "topic sharing must use the canonical on-site topic URL");
delete sandbox.navigator.share;
const copyOutcome = await client.shareTopic(normalized[0]);
assert.equal(copyOutcome, "copied");
assert.equal(copiedText, "https://infernux-engine.com/community-topic.html?topic=41");

for (const contract of [
    'id="community-sign-in"',
    'id="community-compose-body"',
    'id="community-compose-images"',
    'id="community-compose-publish"',
    'js/community-api.js?v=1',
    'js/community.js?v=12',
    'https://community-api.infernux-engine.com'
]) assert.ok(communityHtml.includes(contract), `community.html must retain '${contract}'`);
for (const forbidden of ['id="giscus-thread"', 'id="community-compose-open"', 'id="community-body-editor"', 'data-mapping="specific"']) {
    assert.equal(communityHtml.includes(forbidden), false, `the topic composer must not retain Giscus creation contract '${forbidden}'`);
}

for (const contract of [
    "publishCommunityTopic",
    'request("/api/discussions"',
    "title: draft.title.trim(), body: draft.body.trim()",
    "composeMissingBody",
    "community-compose-form",
    'request("/api/uploads"',
    "insertCommunityMarkdown",
    "COMMUNITY_CACHE_TTL_MS = 15 * 60 * 1000",
    "localStorage.setItem(COMMUNITY_CACHE_KEY",
    "anonymous_rate_limited",
    "X-RateLimit-Reset"
]) assert.ok(source.includes(contract), `community.js must retain '${contract}'`);
for (const forbidden of ["openCommunityEditor", "ensureGiscusController", "GISCUS_CONTROLLER_SRC", "COMMUNITY_LOBBY_TERM"]) {
    assert.equal(source.includes(forbidden), false, `community.js must not create topics through '${forbidden}'`);
}

for (const contract of [
    'API_ORIGIN = "https://community-api.infernux-engine.com"',
    "forum_session",
    "sessionStorage.setItem(SESSION_KEY",
    "/api/session/refresh",
    "window.location.assign(`${API_ORIGIN}/oauth/start`)"
]) assert.ok(apiSource.includes(contract), `community-api.js must retain '${contract}'`);
assert.doesNotMatch(apiSource, /client_secret|GITHUB_CLIENT_SECRET|public_repo/, "the browser bundle must not contain OAuth secrets or broad repository scopes");

for (const contract of ['id="community-topic"', 'id="topic-body"', 'id="topic-replies"', 'data-mapping="number"', 'js/community-api.js?v=1', 'js/community-topic.js?v=4']) {
    assert.ok(topicHtml.includes(contract), `community-topic.html must retain '${contract}'`);
}
for (const contract of ["normalizeCommunityTopicDetail", "DOMParser", "appendSafeCommunityNode", "COMMUNITY_TOPIC_TAGS", "requestCommunityTopic", 'mapping: "number"', 'hostname === "community-api.infernux-engine.com"']) {
    assert.ok(topicSource.includes(contract), `community-topic.js must retain '${contract}'`);
}
assert.doesNotMatch(`${source}\n${topicSource}`, /\.innerHTML\s*=|\.style(?:\.|\[|\s*=)/, "forum UI and remote bodies must remain DOM-safe and class-driven");

for (const contract of [
    'GISCUS_ORIGIN = "https://giscus.app"',
    "event.origin !== GISCUS_ORIGIN",
    "event.source !== frame.contentWindow",
    "function open(config)",
    "new MutationObserver(syncConfig)"
]) assert.ok(giscusSource.includes(contract), `community-giscus.js must retain verified reply contract '${contract}'`);

for (const contract of [
    ".forum-account-profile",
    ".forum-compose-body-field",
    ".forum-compose-tools",
    ".forum-upload-list",
    ".forum-compose-actions",
    ".topic-main",
    "min-height: 44px"
]) assert.ok(communityCss.includes(contract), `community.css must retain '${contract}'`);

console.log("Community client test passed: real user-authored topic composition, image uploads, per-device caching, rate-limit diagnostics, dedicated detail routing, and verified Giscus replies.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(scriptDir, "..", "js", "community.js"), "utf8");
const giscusSource = await readFile(path.join(scriptDir, "..", "js", "community-giscus.js"), "utf8");
const communityHtml = await readFile(path.join(scriptDir, "..", "community.html"), "utf8");
const topicHtml = await readFile(path.join(scriptDir, "..", "community-topic.html"), "utf8");
const topicSource = await readFile(path.join(scriptDir, "..", "js", "community-topic.js"), "utf8");
const communityCss = await readFile(path.join(scriptDir, "..", "css", "community.css"), "utf8");
const storage = new Map();
let copiedText = null;
let sharedPayload = null;
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
let giscusMessageListener = null;

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
    history: { lastUrl: "", replaceState(_state, _title, url) { this.lastUrl = url; } },
    navigator: {
        clipboard: { async writeText(value) { copiedText = value; } },
        canShare() { return true; },
        async share(payload) { sharedPayload = payload; }
    },
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
        getElementById(id) { return appendedGiscusScript?.id === id ? appendedGiscusScript : null; },
        querySelector(selector) {
            if (selector === ".giscus") return giscusHost;
            if (selector === "iframe.giscus-frame") return appendedGiscusScript?.id === "giscus-client" ? giscusFrame : null;
            return null;
        }
    },
    window: {
        addEventListener(type, listener) { if (type === "message") giscusMessageListener = listener; },
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
    sortCommunityTopics,
    categoryDisplayName,
    copy: communityCopy,
    copyText: copyCommunityText,
    actionMode: communityTopicActionMode,
    shareTopic: shareOrCopyCommunityTopic,
    writeCommunityCache,
    readCommunityCache,
    giscusOptInKey: GISCUS_OPT_IN_KEY,
    readGiscusOptIn,
    rememberGiscusOptIn,
    ensureGiscusController,
    giscusScript() { return document.getElementById("giscus-client"); },
    giscusFrameWindow,
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
assert.equal(client.readGiscusOptIn(), false);
const lazyControllerPromise = client.ensureGiscusController();
const lazyControllerScript = appendedGiscusScript;
assert.equal(lazyControllerScript.id, "community-giscus-controller");
assert.equal(lazyControllerScript.src, "/js/community-giscus.js?v=3", "the forum may fetch only the same-origin controller before Giscus");
assert.equal(client.giscusScript(), null, "loading the local controller must not contact giscus.app");
new vm.Script(giscusSource, { filename: "community-giscus.js" }).runInContext(sandbox);
lazyControllerScript.listeners.get("load")();
const giscus = await lazyControllerPromise;
assert.equal(giscus, sandbox.InfernuxGiscus);
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

assert.match(client.api, /per_page=20/);
assert.match(client.api, /sort=updated/);
const normalized = client.normalizeCommunityTopics(topics);
assert.equal(normalized.length, 3);
assert.equal(normalized[0].title, "Python package naming");
assert.equal(normalized[0].comments, 3);
assert.equal(normalized[0].reactions, 2);
assert.equal(normalized[0].created_at, "2026-07-10T08:00:00Z");
assert.equal(normalized[0].number, 41);
assert.equal(normalized[0].answer_chosen_at, "2026-07-15T09:00:00Z");
assert.equal(normalized[1].locked, true);
assert.equal(client.normalizeCommunityTopic({ ...topics[0], html_url: "https://evil.example/discussions/41" }), null);
assert.equal(client.normalizeCommunityTopic({ ...topics[0], number: 42 }), null);
assert.equal(client.normalizeCommunityTopic({ ...topics[0], updated_at: "not-a-date" }), null);
assert.equal(await client.copyText(normalized[0].html_url), true);
assert.equal(copiedText, normalized[0].html_url, "topic sharing must copy only the normalized canonical Discussion URL");
assert.equal(client.actionMode(normalized[0]), "share");
assert.equal(await client.shareTopic(normalized[0]), "shared", "supported phones should use the operating system share surface");
assert.deepEqual(JSON.parse(JSON.stringify(sharedPayload)), {
    title: normalized[0].title,
    url: "https://infernux-engine.com/community-topic.html?topic=41"
}, "native sharing must receive only the normalized title and canonical on-site topic URL");
assert.equal(await client.shareTopic({ ...normalized[0], html_url: "https://evil.example/discussions/41" }), "failed", "native sharing must reject non-repository URLs");
sandbox.navigator.share = async () => {
    const error = new Error("visitor cancelled");
    error.name = "AbortError";
    throw error;
};
copiedText = null;
assert.equal(await client.shareTopic(normalized[0]), "cancelled", "cancelling the operating system share surface must remain a neutral action");
assert.equal(copiedText, null, "cancelling native sharing must not unexpectedly write to the clipboard");
sandbox.navigator.canShare = () => false;
assert.equal(client.actionMode(normalized[0]), "copy", "a browser that rejects the payload should advertise the copy fallback immediately");
assert.equal(await client.shareTopic(normalized[0]), "copied", "unsupported native payloads should fall back to canonical link copying");
assert.equal(copiedText, "https://infernux-engine.com/community-topic.html?topic=41");
delete sandbox.navigator.share;
assert.equal(client.actionMode(normalized[0]), "copy");
copiedText = null;
assert.equal(await client.shareTopic(normalized[0]), "copied", "browsers without Web Share should retain the clipboard action");
assert.equal(copiedText, "https://infernux-engine.com/community-topic.html?topic=41");
assert.deepEqual(Array.from(client.filter(normalized, "python engine-user", ""), (topic) => topic.title), ["Python package naming"]);
assert.deepEqual(Array.from(client.filter(normalized, "", "q-a"), (topic) => topic.title), ["Python package naming", "How do I load a scene?"]);
assert.deepEqual(Array.from(client.filter(normalized, "", "", "unanswered"), (topic) => topic.title), ["How do I load a scene?"], "only unlocked answerable topics should be presented as open");
assert.deepEqual(Array.from(client.filter(normalized, "", "", "answered"), (topic) => topic.title), ["Python package naming"]);
assert.deepEqual(Array.from(client.filter(normalized, "", "", "locked"), (topic) => topic.title), ["Help wanted: macOS testers"]);
assert.equal(client.filter(normalized, "missing", "").length, 0);
assert.deepEqual(Array.from(client.filter(normalized, "", "", "", "newest"), (topic) => topic.number), [15, 33, 41]);
assert.deepEqual(Array.from(client.filter(normalized, "", "", "", "replies"), (topic) => topic.number), [15, 41, 33]);
assert.deepEqual(Array.from(client.filter(normalized, "", "", "", "reactions"), (topic) => topic.number), [41, 15, 33]);

assert.deepEqual(JSON.parse(JSON.stringify(client.readUrl("?q=scene&category=q-a&state=unanswered&sort=replies"))), {
    search: "scene",
    category: "q-a",
    state: "unanswered",
    sort: "replies"
});
assert.deepEqual(JSON.parse(JSON.stringify(client.readUrl("?category=../bad&state=unknown&sort=random"))), {
    search: "",
    category: "",
    state: "",
    sort: "updated"
});
const writtenForumUrl = new URL(client.writeUrl({ search: "scene load", category: "q-a", state: "unanswered", sort: "reactions" }), "https://infernux-engine.com");
assert.deepEqual(Object.fromEntries(writtenForumUrl.searchParams), { category: "q-a", state: "unanswered", sort: "reactions", q: "scene load" });
assert.equal(client.writeUrl(), "/community.html", "default forum view should keep a clean canonical URL");

const merged = client.mergeCommunityTopics(normalized, [
    { ...normalized[0], title: "Updated package naming", updated_at: "2026-07-16T08:00:00Z" },
]);
assert.equal(merged.length, 3);
assert.equal(merged[0].title, "Updated package naming");

documentElement.lang = "zh-CN";
assert.equal(client.categoryDisplayName("General"), "综合讨论");
assert.equal(client.categoryDisplayName("Custom"), "Custom");
assert.equal(client.copy("stateUnanswered"), "待回答问题");
assert.equal(client.copy("sortReactions"), "reaction 最多");
assert.equal(client.copy("copyLink"), "复制讨论链接");

client.writeCommunityCache(normalized, 2);
const cached = client.readCommunityCache();
assert.equal(cached.topics.length, 3);
assert.equal(cached.topics[1].category.slug, "general");
assert.equal(cached.topics[0].reactions, 2, "cached reaction totals should survive normalization");
assert.equal(cached.nextPage, 2);
assert.ok(Date.now() - cached.storedAt < 1000);

storage.set("infernux-community-feed-v1", JSON.stringify({ version: 3, storedAt: Date.now(), topics: normalized, nextPage: 1 }));
assert.equal(client.readCommunityCache(), null);

assert.ok(giscus, "the deferred same-origin controller must initialize its public bridge");
assert.equal(typeof giscusMessageListener, "function", "the deferred controller must register one verified frame listener");
assert.equal(giscus.state(), "standby");
assert.equal(client.readGiscusOptIn(), false);
assert.equal(giscus.load(), true);
assert.equal(giscus.state(), "checking");
assert.equal(client.readGiscusOptIn(), false, "controller loading alone must not persist visitor consent");
client.rememberGiscusOptIn();
assert.equal(client.readGiscusOptIn(), true);
assert.equal(storage.get(client.giscusOptInKey), "1");
assert.equal(client.giscusScript().src, "https://giscus.app/client.js");
assert.equal(client.giscusScript().crossOrigin, "anonymous");
assert.equal(client.giscusScript().dataset.repo, "ChenlizheMe/Infernux");
assert.equal(client.giscusScript().dataset.mapping, "specific");
assert.equal(client.giscusScript().dataset.loading, "lazy");
assert.equal(giscus.load(), false, "a second load must be ignored while the frame is pending");
giscusMessageListener({ origin: "https://evil.example", source: client.giscusFrameWindow, data: { giscus: { error: "not installed" } } });
assert.equal(giscus.state(), "checking");
giscusMessageListener({ origin: "https://giscus.app", source: {}, data: { giscus: { error: "not installed" } } });
assert.equal(giscus.state(), "checking");
giscusMessageListener({ origin: "https://giscus.app", source: client.giscusFrameWindow, data: { giscus: { error: "giscus is not installed on this repository" } } });
assert.equal(giscus.state(), "uninstalled");
giscusMessageListener({ origin: "https://giscus.app", source: client.giscusFrameWindow, data: { giscus: { resizeHeight: 420 } } });
assert.equal(giscus.state(), "uninstalled");
giscusMessageListener({ origin: "https://giscus.app", source: client.giscusFrameWindow, data: { giscus: { error: "Discussion not found" } } });
assert.equal(giscus.state(), "ready");

assert.equal(giscus.open({
    term: "Embedded forum topic",
    category: "Ideas",
    categoryId: "DIC_kwDOO_wV3M4C5oaE"
}), true, "a forum topic must open through the embedded editor");
assert.equal(giscusHost.dataset.term, "Embedded forum topic");
assert.equal(giscusHost.dataset.category, "Ideas");
assert.equal(giscusHost.dataset.categoryId, "DIC_kwDOO_wV3M4C5oaE");
assert.equal(client.giscusScript().dataset.term, "Embedded forum topic");
assert.equal(client.giscusScript().dataset.categoryId, "DIC_kwDOO_wV3M4C5oaE");
assert.equal(giscus.open({ term: "x", category: "Ideas", categoryId: "not-a-category-id" }), false, "invalid forum targets must be rejected before loading Giscus");
assert.equal(giscus.open({ mapping: "number", term: "41", category: "Q&A", categoryId: "DIC_kwDOO_wV3M4C5oaD" }), true, "a detail page must bind replies to an existing Discussion number");
assert.equal(giscusHost.dataset.mapping, "number");
assert.equal(giscusHost.dataset.term, "41");
assert.equal(giscus.open({ mapping: "number", term: "bad", category: "Q&A", categoryId: "DIC_kwDOO_wV3M4C5oaD" }), false, "number mappings must reject non-numeric Discussion identifiers");
const initialScript = client.giscusScript();
assert.equal(giscus.load(), true);
assert.equal(giscus.state(), "checking");
assert.equal(client.giscusScript(), initialScript, "retrying an existing frame must not add another Giscus client listener");
giscusMessageListener({ origin: "https://giscus.app", source: client.giscusFrameWindow, data: { giscus: { error: "API rate limit exceeded" } } });
assert.equal(giscus.state(), "degraded");
assert.equal(giscus.load(), true);
giscusMessageListener({ origin: "https://giscus.app", source: client.giscusFrameWindow, data: { giscus: { error: "Repository unavailable" } } });
assert.equal(giscus.state(), "error");
assert.equal(giscus.load(), true);
giscusMessageListener({ origin: "https://giscus.app", source: client.giscusFrameWindow, data: { giscus: { resizeHeight: 420 } } });
assert.equal(giscus.state(), "ready");

assert.equal(communityHtml.includes('id="giscus-sign-in"'), false, "the forum home must not show an unnecessary standalone sign-in explanation");
assert.ok(communityHtml.includes('id="community-share-status"'), "topic share feedback must use one polite live region");
for (const contract of [".topic-main", ".topic-action", "width: 44px", "height: 44px", ".community-copy-fallback"]) {
    assert.ok(communityCss.includes(contract), `community.css must retain topic-link accessibility contract '${contract}'`);
}
for (const contract of ["shareOrCopyCommunityTopic", "navigator?.share", "navigator?.canShare", "navigator?.clipboard?.writeText", "fallbackCommunityCopy", "document.createElement(\"time\")", "updated.dateTime = topic.updated_at", "dataset.state", "dataset.mode", "community-share-status"]) {
    assert.ok(source.includes(contract), `community.js must retain safe topic-sharing contract '${contract}'`);
}
for (const contract of ["GISCUS_CONTROLLER_SRC = \"/js/community-giscus.js?v=3\"", "ensureGiscusController", "openCommunityEditor", "communityTopicUrl", "showModal", "document.createElement(\"script\")"]) {
    assert.ok(source.includes(contract), `community.js must retain modal composition and on-site topic routing contract '${contract}'`);
}
for (const contract of ["globalThis.InfernuxGiscus = controller", "GISCUS_ORIGIN = \"https://giscus.app\"", "event.origin !== GISCUS_ORIGIN", "event.source !== frame.contentWindow", "function open(config)", "script.src = `${GISCUS_ORIGIN}/client.js`", "new MutationObserver(syncConfig)"]) {
    assert.ok(giscusSource.includes(contract), `community-giscus.js must retain verified deferred embed contract '${contract}'`);
}
for (const contract of ['id="community-new-topic"', '<dialog class="forum-compose"', 'id="community-compose-form"', 'id="community-body-editor"', 'data-forum-category', 'id="community-search"']) {
    assert.ok(communityHtml.includes(contract), `community page must expose compact forum control '${contract}'`);
}
for (const contract of ['id="community-topic"', 'id="topic-body"', 'id="topic-replies"', 'data-mapping="number"', 'js/community-topic.js?v=2']) {
    assert.ok(topicHtml.includes(contract), `topic page must expose dedicated discussion contract '${contract}'`);
}
for (const contract of ["normalizeCommunityTopicDetail", "DOMParser", "appendSafeCommunityNode", "COMMUNITY_TOPIC_TAGS", "application/vnd.github.html+json", "mapping: \"number\""]) {
    assert.ok(topicSource.includes(contract), `community-topic.js must retain safe detail rendering contract '${contract}'`);
}
for (const removedLayout of ["community-hero", "community-channel-grid", "subpage-hero"]) {
    assert.equal(communityHtml.includes(removedLayout), false, `community page must not restore the oversized '${removedLayout}' layout`);
}
assert.equal(/href="[^"]*\/discussions\/new/.test(communityHtml), false, "the normal new-topic flow must stay in the embedded forum editor");
assert.doesNotMatch(`${source}\n${topicSource}\n${giscusSource}`, /\.innerHTML\s*=|\.style(?:\.|\[|\s*=)/, "topic and reply controls must not introduce HTML or inline visual injection");

console.log("Community client test passed: modal topic composition, dedicated detail routing, safe rich-body rendering, image support, filtering, sharing, and verified Giscus replies.");

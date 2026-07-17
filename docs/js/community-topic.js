const COMMUNITY_TOPIC_API = "https://api.github.com/repos/ChenlizheMe/Infernux/discussions";
const COMMUNITY_TOPIC_TIMEOUT_MS = 10000;
const COMMUNITY_GISCUS_CONTROLLER_ID = "community-giscus-controller";
const COMMUNITY_GISCUS_CONTROLLER_SRC = "/js/community-giscus.js?v=3";
const COMMUNITY_FEED_CATEGORY_ID = "DIC_kwDOO_wV3M4C5oaC";
const COMMUNITY_TOPIC_TAGS = new Set([
    "a", "blockquote", "br", "code", "del", "details", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "img", "li", "ol", "p", "pre", "strong", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul"
]);

let activeCommunityTopic = null;
let communityTopicGiscusPromise = null;

function communityTopicLanguage() {
    return document.documentElement.lang?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function communityTopicCopy(key) {
    const messages = {
        en: {
            invalid: "This topic address is invalid.",
            unavailable: "This topic could not be loaded. It may have been removed or the public API may be temporarily unavailable.",
            empty: "This topic has no body yet.",
            by: "Started by",
            replies: "replies",
            posted: "Posted",
            loadingReplies: "Loading replies…"
        },
        zh: {
            invalid: "这个话题地址无效。",
            unavailable: "无法加载这个话题。它可能已被移除，或公开 API 暂时不可用。",
            empty: "这个话题还没有正文。",
            by: "发起人",
            replies: "条回复",
            posted: "发布于",
            loadingReplies: "正在加载回复……"
        }
    };
    return messages[communityTopicLanguage()][key];
}

function readCommunityTopicNumber() {
    const value = new URLSearchParams(window.location.search).get("topic") || "";
    if (!/^[1-9]\d{0,9}$/.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
}

function safeCommunityUrl(value, { image = false } = {}) {
    try {
        const url = new URL(String(value || ""), "https://github.com/");
        if (url.protocol !== "https:") return null;
        if (!image) return url;
        const hostname = url.hostname.toLowerCase();
        const sameOriginMedia = url.origin === window.location.origin && url.pathname.startsWith("/community-api/media/");
        if (sameOriginMedia || hostname === "github.com" || hostname.endsWith(".githubusercontent.com") || hostname === "community-api.infernux-engine.com" || hostname === "infernux-community.chenlizheme.workers.dev") return url;
    } catch {}
    return null;
}

function normalizeCommunityTopicDetail(value, expectedNumber) {
    if (!value || typeof value !== "object" || Number(value.number) !== expectedNumber) return null;
    const canonical = `https://github.com/ChenlizheMe/Infernux/discussions/${expectedNumber}`;
    if (value.html_url !== canonical) return null;
    const title = typeof value.title === "string" ? value.title.trim() : "";
    const login = typeof value.user?.login === "string" ? value.user.login.trim() : "";
    const categoryName = typeof value.category?.name === "string" ? value.category.name.trim() : "";
    const categoryId = typeof value.category?.node_id === "string" ? value.category.node_id.trim() : "";
    const createdAt = typeof value.created_at === "string" ? value.created_at : "";
    if (!title || !login || !categoryName || !/^DIC_[A-Za-z0-9_-]+$/.test(categoryId) || Number.isNaN(new Date(createdAt).getTime())) return null;
    const authorUrl = safeCommunityUrl(value.user?.html_url);
    if (!authorUrl || authorUrl.href !== `https://github.com/${login}`) return null;
    const avatarUrl = safeCommunityUrl(value.user?.avatar_url, { image: true });
    return {
        number: expectedNumber,
        title,
        body_html: typeof value.body_html === "string" ? value.body_html : "",
        body: typeof value.body === "string" ? value.body : "",
        html_url: canonical,
        category: { name: categoryName, id: categoryId },
        user: { login, html_url: authorUrl.href, avatar_url: avatarUrl?.href || "" },
        created_at: createdAt,
        comments: Number.isSafeInteger(Number(value.comments)) && Number(value.comments) >= 0 ? Number(value.comments) : 0,
        locked: value.locked === true
    };
}

function copySafeCommunityAttributes(source, target, tag) {
    if (tag === "a") {
        const href = safeCommunityUrl(source.getAttribute("href"));
        if (href) {
            target.href = href.href;
            target.rel = "noopener noreferrer";
        }
        const title = source.getAttribute("title");
        if (title) target.title = title.slice(0, 240);
    }
    if (tag === "img") {
        const src = safeCommunityUrl(source.getAttribute("src"), { image: true });
        if (!src) return false;
        target.src = src.href;
        target.alt = (source.getAttribute("alt") || "").slice(0, 300);
        target.loading = "lazy";
        target.decoding = "async";
        for (const dimension of ["width", "height"]) {
            const value = source.getAttribute(dimension) || "";
            if (/^\d{1,5}$/.test(value)) target.setAttribute(dimension, value);
        }
    }
    return true;
}

function appendSafeCommunityNode(parent, node) {
    if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.textContent || ""));
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (!COMMUNITY_TOPIC_TAGS.has(tag)) {
        for (const child of node.childNodes) appendSafeCommunityNode(parent, child);
        return;
    }
    const element = document.createElement(tag);
    if (!copySafeCommunityAttributes(node, element, tag)) return;
    for (const child of node.childNodes) appendSafeCommunityNode(element, child);
    parent.appendChild(element);
}

function renderCommunityTopicBody(topic) {
    const host = document.getElementById("topic-body");
    if (!host) return;
    host.replaceChildren();
    if (topic.body_html) {
        const parsed = new DOMParser().parseFromString(topic.body_html, "text/html");
        for (const child of parsed.body.childNodes) appendSafeCommunityNode(host, child);
    } else if (topic.body) {
        const paragraph = document.createElement("p");
        paragraph.textContent = topic.body;
        host.appendChild(paragraph);
    }
    if (!host.childNodes.length) {
        const empty = document.createElement("p");
        empty.textContent = communityTopicCopy("empty");
        host.appendChild(empty);
    }
}

function formatCommunityTopicDate(value) {
    return new Intl.DateTimeFormat(communityTopicLanguage() === "zh" ? "zh-CN" : "en", {
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(new Date(value));
}

function renderCommunityTopicMeta(topic) {
    const category = document.getElementById("topic-category");
    const title = document.getElementById("topic-title");
    const meta = document.getElementById("topic-meta");
    const author = document.getElementById("topic-author");
    const authorName = document.getElementById("topic-author-name");
    const avatar = document.getElementById("topic-avatar");
    const created = document.getElementById("topic-created");
    const replies = document.getElementById("topic-reply-count");
    if (category) category.textContent = topic.category.name;
    if (title) title.textContent = topic.title;
    if (author) author.href = topic.user.html_url;
    if (authorName) authorName.textContent = `${communityTopicCopy("by")} @${topic.user.login}`;
    if (avatar && topic.user.avatar_url) {
        avatar.src = topic.user.avatar_url;
        avatar.hidden = false;
    }
    if (created) {
        created.dateTime = topic.created_at;
        created.textContent = `${communityTopicCopy("posted")} ${formatCommunityTopicDate(topic.created_at)}`;
    }
    if (replies) replies.textContent = `${topic.comments} ${communityTopicCopy("replies")}`;
    if (meta) meta.hidden = false;
}

function updateCommunityTopicMetadata(topic) {
    document.title = `${topic.title} · Infernux`;
    const canonical = new URL(`community-topic.html?topic=${topic.number}`, window.location.href).href;
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", topic.title);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonical);
}

function renderCommunityTopicError(key) {
    const article = document.getElementById("community-topic");
    const category = document.getElementById("topic-category");
    const title = document.getElementById("topic-title");
    const body = document.getElementById("topic-body");
    if (category) category.textContent = "";
    if (title) title.textContent = communityTopicCopy(key);
    if (body) {
        const message = document.createElement("p");
        message.className = "topic-error";
        message.textContent = communityTopicCopy(key);
        body.replaceChildren(message);
    }
    article?.setAttribute("aria-busy", "false");
}

function ensureCommunityTopicGiscus() {
    if (globalThis.InfernuxGiscus) return Promise.resolve(globalThis.InfernuxGiscus);
    if (communityTopicGiscusPromise) return communityTopicGiscusPromise;
    communityTopicGiscusPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = COMMUNITY_GISCUS_CONTROLLER_ID;
        script.src = COMMUNITY_GISCUS_CONTROLLER_SRC;
        script.async = true;
        script.addEventListener("load", () => globalThis.InfernuxGiscus ? resolve(globalThis.InfernuxGiscus) : reject(new Error("Giscus controller unavailable")), { once: true });
        script.addEventListener("error", () => reject(new Error("Giscus controller request failed")), { once: true });
        document.body.appendChild(script);
    }).catch((error) => {
        console.warn(error);
        communityTopicGiscusPromise = null;
        return null;
    });
    return communityTopicGiscusPromise;
}

async function loadCommunityTopicReplies(topic) {
    const replies = document.getElementById("topic-replies");
    if (replies) replies.hidden = false;
    const controller = await ensureCommunityTopicGiscus();
    if (!controller) return false;
    return controller.open({
        mapping: "number",
        term: String(topic.number),
        category: topic.category.name,
        categoryId: topic.category.id
    });
}

function atomTopicText(entry, localName) {
    return entry.getElementsByTagNameNS("*", localName)[0]?.textContent?.trim() || "";
}

function parseCommunityAtomTopic(value, expectedNumber) {
    const documentNode = new DOMParser().parseFromString(String(value || ""), "application/xml");
    if (documentNode.getElementsByTagName("parsererror").length) throw new Error("Forum feed is invalid XML");
    const canonical = `https://github.com/ChenlizheMe/Infernux/discussions/${expectedNumber}`;
    for (const entry of documentNode.getElementsByTagNameNS("*", "entry")) {
        const alternate = [...entry.getElementsByTagNameNS("*", "link")]
            .find((link) => !link.getAttribute("rel") || link.getAttribute("rel") === "alternate");
        if (alternate?.getAttribute("href") !== canonical) continue;
        const author = entry.getElementsByTagNameNS("*", "author")[0];
        const thumbnail = entry.getElementsByTagNameNS("*", "thumbnail")[0];
        return {
            number: expectedNumber,
            title: atomTopicText(entry, "title"),
            body_html: atomTopicText(entry, "content"),
            body: "",
            html_url: canonical,
            category: { name: "General", node_id: COMMUNITY_FEED_CATEGORY_ID },
            user: {
                login: author ? atomTopicText(author, "name") : "unknown",
                html_url: author ? atomTopicText(author, "uri") : "",
                avatar_url: thumbnail?.getAttribute("url") || ""
            },
            created_at: atomTopicText(entry, "published") || atomTopicText(entry, "updated"),
            comments: 0,
            locked: false
        };
    }
    return null;
}

async function requestCommunityTopic(number, signal) {
    const gateway = globalThis.InfernuxCommunityApi;
    let gatewayError = null;
    if (gateway) {
        try {
            const payload = await gateway.request(`/api/discussions/${number}`, { signal });
            if (payload?.discussion) return payload.discussion;
            throw new Error("Forum gateway returned an unexpected topic payload");
        } catch (error) {
            gatewayError = error;
        }
        if (typeof gateway.discussionFeed === "function") {
            try {
                const topic = parseCommunityAtomTopic(await gateway.discussionFeed(signal), number);
                if (topic) return topic;
            } catch (error) {
                console.warn("Forum feed unavailable; trying the final GitHub API fallback.", error);
            }
        }
        if (gateway.token?.()) throw gatewayError;
        console.warn("Forum gateway unavailable; trying the public GitHub fallback.", gatewayError);
    }
    const response = await fetch(`${COMMUNITY_TOPIC_API}/${number}`, {
        headers: {
            Accept: "application/vnd.github.html+json",
            "X-GitHub-Api-Version": "2022-11-28"
        },
        cache: "no-store",
        signal
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    return response.json();
}

async function loadCommunityTopic() {
    const number = readCommunityTopicNumber();
    if (!number) {
        renderCommunityTopicError("invalid");
        return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), COMMUNITY_TOPIC_TIMEOUT_MS);
    try {
        const topic = normalizeCommunityTopicDetail(await requestCommunityTopic(number, controller.signal), number);
        if (!topic) throw new Error("Invalid community topic response");
        activeCommunityTopic = topic;
        renderCommunityTopicMeta(topic);
        renderCommunityTopicBody(topic);
        updateCommunityTopicMetadata(topic);
        document.getElementById("community-topic")?.setAttribute("aria-busy", "false");
        await loadCommunityTopicReplies(topic);
    } catch (error) {
        console.warn(error);
        renderCommunityTopicError("unavailable");
    } finally {
        window.clearTimeout(timeout);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    document.getElementById("giscus-load")?.addEventListener("click", () => {
        if (activeCommunityTopic) loadCommunityTopicReplies(activeCommunityTopic);
    });
    loadCommunityTopic();
});

document.addEventListener("site:language-changed", () => {
    if (!activeCommunityTopic) return;
    renderCommunityTopicMeta(activeCommunityTopic);
    globalThis.InfernuxGiscus?.syncCopy();
    globalThis.InfernuxGiscus?.syncConfig();
});

document.addEventListener("site:theme-changed", () => globalThis.InfernuxGiscus?.syncConfig());

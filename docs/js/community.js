const COMMUNITY_API = "https://api.github.com/repos/ChenlizheMe/Infernux/discussions?per_page=20&direction=desc";
const COMMUNITY_CACHE_KEY = "infernux-community-feed-v1";
const COMMUNITY_CACHE_VERSION = 1;
const COMMUNITY_CACHE_TTL_MS = 5 * 60 * 1000;
const COMMUNITY_REQUEST_TIMEOUT_MS = 10000;

let cachedCommunityTopics = [];
let communitySource = "loading";
let hasCommunitySnapshot = false;
let communitySearch = "";
let communityCategory = "";
let activeCommunityRequest = null;

function communityLanguage() {
    return document.documentElement.lang?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function communityCopy(key) {
    const copy = {
        en: {
            error: "The live relay is unavailable or rate-limited.",
            open: "Open Discussions on GitHub",
            empty: "No public discussions yet. Start the first topic.",
            emptyFiltered: "No topics match these filters.",
            comments: "replies",
            by: "by",
            sourceLive: "GitHub live data",
            sourceCache: "5-minute session cache",
            sourceStale: "stale cache · refresh unavailable",
            sourceLoading: "contacting GitHub"
        },
        zh: {
            error: "实时话题暂时不可用，或已达到 GitHub API 频率限制。",
            open: "前往 GitHub Discussions",
            empty: "还没有公开话题，来创建第一个讨论吧。",
            emptyFiltered: "没有符合当前筛选条件的话题。",
            comments: "条回复",
            by: "发起人",
            sourceLive: "GitHub 实时数据",
            sourceCache: "五分钟会话缓存",
            sourceStale: "过期缓存 · 暂时无法刷新",
            sourceLoading: "正在连接 GitHub"
        }
    };
    return copy[communityLanguage()][key];
}

function categoryDisplayName(name) {
    if (communityLanguage() !== "zh") return name;
    const labels = {
        "General": "综合讨论",
        "Q&A": "问答",
        "Ideas": "想法",
        "Show and tell": "作品展示",
        "Announcements": "公告"
    };
    return labels[name] || name;
}

function formatTopicDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(communityLanguage() === "zh" ? "zh-CN" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric"
    }).format(date);
}

function normalizeCommunityTopic(topic) {
    if (!topic || typeof topic !== "object") return null;
    const url = typeof topic.html_url === "string" ? topic.html_url : "";
    if (!/^https:\/\/github\.com\/ChenlizheMe\/Infernux\/discussions\/\d+\/?$/i.test(url)) return null;
    const title = typeof topic.title === "string" ? topic.title.trim() : "";
    if (!title) return null;
    const updatedAt = typeof topic.updated_at === "string" ? topic.updated_at : "";
    if (Number.isNaN(new Date(updatedAt).getTime())) return null;

    return {
        html_url: url,
        title: title.slice(0, 300),
        category: {
            name: typeof topic.category?.name === "string" && topic.category.name.trim()
                ? topic.category.name.trim().slice(0, 80)
                : "Discussion",
            slug: typeof topic.category?.slug === "string" && /^[a-z0-9-]+$/i.test(topic.category.slug)
                ? topic.category.slug.toLowerCase()
                : "discussion"
        },
        user: {
            login: typeof topic.user?.login === "string" && topic.user.login.trim()
                ? topic.user.login.trim().slice(0, 80)
                : "unknown"
        },
        updated_at: updatedAt,
        comments: Number.isFinite(Number(topic.comments)) ? Math.max(0, Number(topic.comments)) : 0
    };
}

function normalizeCommunityTopics(topics) {
    if (!Array.isArray(topics)) return [];
    return topics.map(normalizeCommunityTopic).filter(Boolean);
}

function readCommunityCache() {
    try {
        const record = JSON.parse(sessionStorage.getItem(COMMUNITY_CACHE_KEY) || "null");
        if (record?.version !== COMMUNITY_CACHE_VERSION || !Number.isFinite(record.storedAt)) return null;
        const topics = normalizeCommunityTopics(record.topics);
        if (!Array.isArray(record.topics) || topics.length !== record.topics.length) return null;
        return { storedAt: record.storedAt, topics };
    } catch {
        return null;
    }
}

function writeCommunityCache(topics) {
    try {
        sessionStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify({
            version: COMMUNITY_CACHE_VERSION,
            storedAt: Date.now(),
            topics
        }));
    } catch {
        // Storage can be unavailable in privacy modes; the public feed still works without it.
    }
}

function readCommunityFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    communitySearch = (params.get("q") || "").trim().slice(0, 100);
    const category = (params.get("category") || "").trim().toLowerCase();
    communityCategory = /^[a-z0-9-]+$/.test(category) ? category : "";

    const searchInput = document.getElementById("community-search");
    if (searchInput) searchInput.value = communitySearch;
    const categorySelect = document.getElementById("community-category");
    if (categorySelect) categorySelect.value = communityCategory;
}

function writeCommunityFiltersToUrl() {
    const url = new URL(window.location.href);
    if (communitySearch) url.searchParams.set("q", communitySearch);
    else url.searchParams.delete("q");
    if (communityCategory) url.searchParams.set("category", communityCategory);
    else url.searchParams.delete("category");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function renderCommunityCategories() {
    const select = document.getElementById("community-category");
    if (!select) return;
    while (select.options.length > 1) select.remove(1);

    const categories = new Map();
    for (const topic of cachedCommunityTopics) categories.set(topic.category.slug, topic.category.name);
    const collator = new Intl.Collator(communityLanguage() === "zh" ? "zh-CN" : "en");
    for (const [slug, name] of [...categories].sort((a, b) => collator.compare(categoryDisplayName(a[1]), categoryDisplayName(b[1])))) {
        const option = document.createElement("option");
        option.value = slug;
        option.textContent = categoryDisplayName(name);
        select.appendChild(option);
    }

    if ([...select.options].some((option) => option.value === communityCategory)) {
        select.value = communityCategory;
    } else {
        communityCategory = "";
        select.value = "";
        writeCommunityFiltersToUrl();
    }
}

function filteredCommunityTopics() {
    const terms = communitySearch.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return cachedCommunityTopics.filter((topic) => {
        if (communityCategory && topic.category.slug !== communityCategory) return false;
        if (!terms.length) return true;
        const haystack = [topic.title, topic.user.login, topic.category.name, topic.category.slug]
            .join(" ")
            .toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
    });
}

function communitySourceLabel() {
    const key = {
        live: "sourceLive",
        cache: "sourceCache",
        stale: "sourceStale",
        loading: "sourceLoading"
    }[communitySource] || "sourceLoading";
    return communityCopy(key);
}

function renderCommunityStatus(visibleCount) {
    const status = document.getElementById("community-filter-status");
    if (!status) return;
    if (communitySource === "error") {
        status.textContent = communityCopy("error");
        return;
    }
    if (communitySource === "loading" && !hasCommunitySnapshot) {
        status.textContent = communityCopy("sourceLoading");
        return;
    }
    status.textContent = communityLanguage() === "zh"
        ? `显示 ${visibleCount} / ${cachedCommunityTopics.length} 条话题 · ${communitySourceLabel()}`
        : `Showing ${visibleCount} of ${cachedCommunityTopics.length} topics · ${communitySourceLabel()}`;
}

function renderCommunityTopics() {
    const host = document.getElementById("community-feed");
    if (!host) return;
    host.innerHTML = "";
    host.setAttribute("aria-busy", "false");
    const topics = filteredCommunityTopics();
    renderCommunityStatus(topics.length);

    const reset = document.getElementById("community-reset");
    if (reset) reset.hidden = !(communitySearch || communityCategory);

    if (!topics.length) {
        const empty = document.createElement("div");
        empty.className = "topic-status";
        empty.textContent = cachedCommunityTopics.length ? communityCopy("emptyFiltered") : communityCopy("empty");
        host.appendChild(empty);
        return;
    }

    topics.forEach((topic) => {
        const link = document.createElement("a");
        link.className = "topic-row";
        link.href = topic.html_url;
        link.target = "_blank";
        link.rel = "noopener";

        const category = document.createElement("span");
        category.className = "topic-category";
        category.textContent = categoryDisplayName(topic.category.name);

        const copy = document.createElement("span");
        copy.className = "topic-copy";
        const title = document.createElement("strong");
        title.textContent = topic.title;
        const meta = document.createElement("small");
        const date = formatTopicDate(topic.updated_at);
        meta.textContent = `${communityCopy("by")} @${topic.user.login}${date ? ` · ${date}` : ""}`;
        copy.append(title, meta);

        const metrics = document.createElement("span");
        metrics.className = "topic-metrics";
        metrics.textContent = `${topic.comments} ${communityCopy("comments")}`;

        link.append(category, copy, metrics);
        host.appendChild(link);
    });
}

function renderCommunityError() {
    communitySource = "error";
    renderCommunityStatus(0);
    const host = document.getElementById("community-feed");
    if (!host) return;
    host.innerHTML = "";
    host.setAttribute("aria-busy", "false");
    const status = document.createElement("div");
    status.className = "topic-status";
    status.append(document.createTextNode(`${communityCopy("error")} `));
    const link = document.createElement("a");
    link.href = "https://github.com/ChenlizheMe/Infernux/discussions";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = communityCopy("open");
    status.appendChild(link);
    host.appendChild(status);
}

function setCommunityRefreshBusy(busy) {
    const button = document.getElementById("community-refresh");
    if (!button) return;
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
}

async function loadCommunityTopics({ force = false } = {}) {
    if (activeCommunityRequest) return activeCommunityRequest;

    const cached = readCommunityCache();
    if (!force && cached) {
        cachedCommunityTopics = cached.topics;
        hasCommunitySnapshot = true;
        communitySource = Date.now() - cached.storedAt <= COMMUNITY_CACHE_TTL_MS ? "cache" : "stale";
        renderCommunityCategories();
        renderCommunityTopics();
        if (communitySource === "cache") return;
    }

    const host = document.getElementById("community-feed");
    if (!hasCommunitySnapshot) host?.setAttribute("aria-busy", "true");
    setCommunityRefreshBusy(true);

    activeCommunityRequest = (async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), COMMUNITY_REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(COMMUNITY_API, {
                headers: {
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                cache: "no-store",
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`GitHub API ${response.status}`);
            const payload = await response.json();
            if (!Array.isArray(payload)) throw new Error("GitHub API returned an unexpected payload");
            cachedCommunityTopics = normalizeCommunityTopics(payload);
            hasCommunitySnapshot = true;
            communitySource = "live";
            writeCommunityCache(cachedCommunityTopics);
            renderCommunityCategories();
            renderCommunityTopics();
        } catch (error) {
            console.warn(error);
            if (hasCommunitySnapshot) {
                communitySource = "stale";
                renderCommunityCategories();
                renderCommunityTopics();
            } else {
                renderCommunityError();
            }
        } finally {
            window.clearTimeout(timeout);
            setCommunityRefreshBusy(false);
            activeCommunityRequest = null;
        }
    })();

    return activeCommunityRequest;
}

function syncCommunityFiltersFromControls() {
    const searchInput = document.getElementById("community-search");
    const categorySelect = document.getElementById("community-category");
    communitySearch = (searchInput?.value || "").trim().slice(0, 100);
    communityCategory = categorySelect?.value || "";
    writeCommunityFiltersToUrl();
    renderCommunityTopics();
}

function clearCommunityFilters() {
    communitySearch = "";
    communityCategory = "";
    const searchInput = document.getElementById("community-search");
    const categorySelect = document.getElementById("community-category");
    if (searchInput) searchInput.value = "";
    if (categorySelect) categorySelect.value = "";
    writeCommunityFiltersToUrl();
    renderCommunityTopics();
    searchInput?.focus();
}

function syncGiscusConfig() {
    const frame = document.querySelector("iframe.giscus-frame");
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({
        giscus: {
            setConfig: {
                theme: document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark_dimmed",
                lang: communityLanguage() === "zh" ? "zh-CN" : "en"
            }
        }
    }, "https://giscus.app");
}

document.addEventListener("DOMContentLoaded", () => {
    readCommunityFiltersFromUrl();

    document.getElementById("community-filters")?.addEventListener("submit", (event) => event.preventDefault());
    document.getElementById("community-search")?.addEventListener("input", syncCommunityFiltersFromControls);
    document.getElementById("community-category")?.addEventListener("change", syncCommunityFiltersFromControls);
    document.getElementById("community-reset")?.addEventListener("click", clearCommunityFilters);
    document.getElementById("community-refresh")?.addEventListener("click", () => loadCommunityTopics({ force: true }));

    const giscusHost = document.querySelector(".giscus");
    if (giscusHost) {
        new MutationObserver(syncGiscusConfig).observe(giscusHost, { childList: true, subtree: true });
    }

    loadCommunityTopics();
});

window.addEventListener("popstate", () => {
    readCommunityFiltersFromUrl();
    renderCommunityCategories();
    renderCommunityTopics();
});

document.addEventListener("site:language-changed", () => {
    renderCommunityCategories();
    if (hasCommunitySnapshot) renderCommunityTopics();
    syncGiscusConfig();
});
document.addEventListener("site:theme-changed", syncGiscusConfig);

const COMMUNITY_PAGE_SIZE = 20;
const COMMUNITY_API = `https://api.github.com/repos/ChenlizheMe/Infernux/discussions?per_page=${COMMUNITY_PAGE_SIZE}&sort=updated&direction=desc`;
const COMMUNITY_CACHE_KEY = "infernux-community-feed-v1";
const COMMUNITY_CACHE_VERSION = 2;
const COMMUNITY_CACHE_TTL_MS = 5 * 60 * 1000;
const COMMUNITY_REQUEST_TIMEOUT_MS = 10000;
const GISCUS_ORIGIN = "https://giscus.app";
const GISCUS_OPT_IN_KEY = "infernux-giscus-opt-in-v1";
const GISCUS_SCRIPT_ID = "giscus-client";
const GISCUS_STATUS_TIMEOUT_MS = 12000;

let cachedCommunityTopics = [];
let communitySource = "loading";
let hasCommunitySnapshot = false;
let communitySearch = "";
let communityCategory = "";
let communityNextPage = 1;
let activeCommunityRequest = null;
let giscusReadinessState = "standby";
let giscusStatusTimeout = null;

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
            sourcePartial: "topics retained · older page unavailable",
            sourceLoading: "contacting GitHub",
            loadMore: "Load older topics",
            loadingMore: "Loading older topics…",
            browseAll: "Browse all on GitHub",
            answered: "Answered",
            locked: "Locked",
            feedNav: "Discussion feed navigation",
            giscusStandbyTitle: "Replies load only when you ask.",
            giscusStandbyDetail: "Loading this panel contacts giscus.app and enables GitHub sign-in inside its frame.",
            giscusCheckingTitle: "Checking embedded replies…",
            giscusCheckingDetail: "Waiting for a verified response from the Giscus frame.",
            giscusReadyTitle: "Embedded replies are ready.",
            giscusReadyDetail: "Use GitHub sign-in inside the panel to reply or react.",
            giscusUninstalledTitle: "Embedded replies need administrator setup.",
            giscusUninstalledDetail: "The Giscus App is not installed for this repository. Public Discussions remain available.",
            giscusDegradedTitle: "Embedded replies are temporarily degraded.",
            giscusDegradedDetail: "The frame reported a session or rate-limit problem. Retry later or continue on GitHub.",
            giscusErrorTitle: "Embedded replies are unavailable.",
            giscusErrorDetail: "The verified Giscus frame reported a configuration error. Continue on GitHub while an administrator checks setup.",
            giscusUnknownTitle: "Embedded reply status is unknown.",
            giscusUnknownDetail: "No verified frame response arrived. A network or content blocker may be preventing the embed.",
            giscusOpen: "Open Discussions",
            giscusInstall: "Install Giscus",
            giscusLoad: "Load replies",
            giscusRetry: "Retry replies",
            giscusLoading: "Loading replies…"
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
            sourcePartial: "已保留当前话题 · 更早页面暂不可用",
            sourceLoading: "正在连接 GitHub",
            loadMore: "加载更早话题",
            loadingMore: "正在加载更早话题……",
            browseAll: "在 GitHub 查看全部",
            answered: "已回答",
            locked: "已锁定",
            feedNav: "讨论列表导航",
            giscusStandbyTitle: "回复只会在你主动选择后加载。",
            giscusStandbyDetail: "加载此面板会连接 giscus.app，并在其框架内启用 GitHub 登录。",
            giscusCheckingTitle: "正在检查站内回复……",
            giscusCheckingDetail: "正在等待 Giscus 框架返回可验证状态。",
            giscusReadyTitle: "站内回复已就绪。",
            giscusReadyDetail: "可在面板中使用 GitHub 登录、回复或 reaction。",
            giscusUninstalledTitle: "站内回复需要管理员完成设置。",
            giscusUninstalledDetail: "当前仓库尚未安装 Giscus App；公开 Discussions 仍可正常使用。",
            giscusDegradedTitle: "站内回复暂时降级。",
            giscusDegradedDetail: "框架报告会话或频率限制问题；可稍后重试或前往 GitHub。",
            giscusErrorTitle: "站内回复当前不可用。",
            giscusErrorDetail: "经过来源验证的 Giscus 框架报告配置错误；管理员检查期间请前往 GitHub。",
            giscusUnknownTitle: "无法确认站内回复状态。",
            giscusUnknownDetail: "未收到可验证的框架响应，可能被网络或内容拦截器阻止。",
            giscusOpen: "前往 Discussions",
            giscusInstall: "安装 Giscus",
            giscusLoad: "加载回复",
            giscusRetry: "重试回复",
            giscusLoading: "正在加载回复……"
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
    const urlMatch = url.match(/^https:\/\/github\.com\/ChenlizheMe\/Infernux\/discussions\/(\d+)\/?$/i);
    if (!urlMatch) return null;
    const number = Number(urlMatch[1]);
    if (!Number.isSafeInteger(number) || number < 1) return null;
    if (topic.number !== undefined && Number(topic.number) !== number) return null;
    const title = typeof topic.title === "string" ? topic.title.trim() : "";
    if (!title) return null;
    const updatedAt = typeof topic.updated_at === "string" ? topic.updated_at : "";
    if (Number.isNaN(new Date(updatedAt).getTime())) return null;
    const answerChosenAt = typeof topic.answer_chosen_at === "string" && !Number.isNaN(new Date(topic.answer_chosen_at).getTime())
        ? topic.answer_chosen_at
        : null;

    return {
        html_url: url,
        number,
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
        comments: Number.isFinite(Number(topic.comments)) ? Math.max(0, Number(topic.comments)) : 0,
        answer_chosen_at: answerChosenAt,
        locked: topic.locked === true
    };
}

function normalizeCommunityTopics(topics) {
    if (!Array.isArray(topics)) return [];
    return topics.map(normalizeCommunityTopic).filter(Boolean);
}

function mergeCommunityTopics(current, incoming) {
    const topics = new Map();
    for (const topic of [...current, ...incoming]) topics.set(topic.html_url, topic);
    return [...topics.values()].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function readCommunityCache() {
    try {
        const record = JSON.parse(sessionStorage.getItem(COMMUNITY_CACHE_KEY) || "null");
        if (record?.version !== COMMUNITY_CACHE_VERSION || !Number.isFinite(record.storedAt)) return null;
        const topics = normalizeCommunityTopics(record.topics);
        if (!Array.isArray(record.topics) || topics.length !== record.topics.length) return null;
        const nextPage = record.nextPage;
        if (!(nextPage === null || (Number.isSafeInteger(nextPage) && nextPage >= 2))) return null;
        return { storedAt: record.storedAt, topics, nextPage };
    } catch {
        return null;
    }
}

function writeCommunityCache(topics, nextPage = communityNextPage) {
    try {
        sessionStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify({
            version: COMMUNITY_CACHE_VERSION,
            storedAt: Date.now(),
            topics,
            nextPage
        }));
    } catch {
        // Storage can be unavailable in privacy modes; the public feed still works without it.
    }
}

function classifyGiscusError(value) {
    const message = typeof value === "string" ? value.toLowerCase() : "";
    if (message.includes("discussion not found")) return "ready";
    if (message.includes("not installed")) return "uninstalled";
    if (message.includes("rate limit") || message.includes("bad credentials") || message.includes("invalid state") || message.includes("state has expired")) return "degraded";
    return "error";
}

function readGiscusOptIn() {
    try {
        return sessionStorage.getItem(GISCUS_OPT_IN_KEY) === "1";
    } catch {
        return false;
    }
}

function rememberGiscusOptIn() {
    try {
        sessionStorage.setItem(GISCUS_OPT_IN_KEY, "1");
    } catch {
        // Explicit loading still works when session storage is unavailable.
    }
}

function syncGiscusReadinessCopy() {
    const state = giscusReadinessState;
    const copyKeys = {
        standby: ["giscusStandbyTitle", "giscusStandbyDetail"],
        checking: ["giscusCheckingTitle", "giscusCheckingDetail"],
        ready: ["giscusReadyTitle", "giscusReadyDetail"],
        uninstalled: ["giscusUninstalledTitle", "giscusUninstalledDetail"],
        degraded: ["giscusDegradedTitle", "giscusDegradedDetail"],
        error: ["giscusErrorTitle", "giscusErrorDetail"],
        unknown: ["giscusUnknownTitle", "giscusUnknownDetail"]
    }[state] || ["giscusUnknownTitle", "giscusUnknownDetail"];
    const title = document.getElementById("giscus-readiness-title");
    const detail = document.getElementById("giscus-readiness-detail");
    if (title) title.textContent = communityCopy(copyKeys[0]);
    if (detail) detail.textContent = communityCopy(copyKeys[1]);
    const open = document.querySelector("#giscus-open-discussions span");
    const install = document.querySelector("#giscus-install span");
    const load = document.querySelector("#giscus-load span");
    if (open) open.textContent = communityCopy("giscusOpen");
    if (install) install.textContent = communityCopy("giscusInstall");
    if (load) {
        const key = state === "standby" ? "giscusLoad" : state === "checking" ? "giscusLoading" : "giscusRetry";
        load.textContent = communityCopy(key);
    }
}

function renderGiscusReadiness(state) {
    const supported = ["standby", "checking", "ready", "uninstalled", "degraded", "error", "unknown"];
    giscusReadinessState = supported.includes(state) ? state : "unknown";
    const host = document.getElementById("giscus-readiness");
    if (host) host.dataset.state = giscusReadinessState;
    const code = host?.querySelector(".giscus-readiness-code");
    const codes = {
        standby: "ON-DEMAND",
        checking: "LINKING",
        ready: "ONLINE",
        uninstalled: "APP-MISSING",
        degraded: "DEGRADED",
        error: "OFFLINE",
        unknown: "UNKNOWN"
    };
    if (code) code.textContent = codes[giscusReadinessState];
    syncGiscusReadinessCopy();
    if (giscusReadinessState !== "checking" && giscusStatusTimeout !== null) {
        window.clearTimeout(giscusStatusTimeout);
        giscusStatusTimeout = null;
    }
}

function handleGiscusMessage(event) {
    if (event.origin !== GISCUS_ORIGIN || !event.data || typeof event.data !== "object") return;
    const frame = document.querySelector("iframe.giscus-frame");
    if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
    const payload = event.data.giscus;
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.error === "string") {
        renderGiscusReadiness(classifyGiscusError(payload.error));
        return;
    }
    const height = Number(payload.resizeHeight);
    if (Number.isFinite(height) && height > 0 && giscusReadinessState !== "uninstalled" && giscusReadinessState !== "error") {
        renderGiscusReadiness("ready");
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
        partial: "sourcePartial",
        loading: "sourceLoading"
    }[communitySource] || "sourceLoading";
    return communityCopy(key);
}

function syncCommunityPaginationCopy({ loadingMore = false } = {}) {
    const navigation = document.querySelector(".forum-pagination");
    navigation?.setAttribute("aria-label", communityCopy("feedNav"));
    const loadMoreCopy = document.querySelector("#community-load-more span");
    if (loadMoreCopy) loadMoreCopy.textContent = communityCopy(loadingMore ? "loadingMore" : "loadMore");
    const browseAllCopy = document.querySelector("#community-browse-all span");
    if (browseAllCopy) browseAllCopy.textContent = communityCopy("browseAll");
}

function renderCommunityPagination() {
    const loadMore = document.getElementById("community-load-more");
    if (loadMore) loadMore.hidden = !hasCommunitySnapshot || communityNextPage === null;
    syncCommunityPaginationCopy();
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
    host.replaceChildren();
    host.setAttribute("aria-busy", "false");
    const topics = filteredCommunityTopics();
    renderCommunityStatus(topics.length);

    const reset = document.getElementById("community-reset");
    if (reset) reset.hidden = !(communitySearch || communityCategory);
    renderCommunityPagination();

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
        const signals = document.createElement("span");
        signals.className = "topic-signals";
        const number = document.createElement("span");
        number.className = "topic-number";
        number.textContent = `#${topic.number}`;
        signals.appendChild(number);
        if (topic.answer_chosen_at) {
            const answered = document.createElement("span");
            answered.className = "topic-signal answered";
            answered.textContent = communityCopy("answered");
            signals.appendChild(answered);
        }
        if (topic.locked) {
            const locked = document.createElement("span");
            locked.className = "topic-signal locked";
            locked.textContent = communityCopy("locked");
            signals.appendChild(locked);
        }
        const meta = document.createElement("small");
        const date = formatTopicDate(topic.updated_at);
        meta.textContent = `${communityCopy("by")} @${topic.user.login}${date ? ` · ${date}` : ""}`;
        copy.append(title, signals, meta);

        const metrics = document.createElement("span");
        metrics.className = "topic-metrics";
        metrics.textContent = `${topic.comments} ${communityCopy("comments")}`;

        link.append(category, copy, metrics);
        host.appendChild(link);
    });
}

function renderCommunityError() {
    communitySource = "error";
    communityNextPage = null;
    renderCommunityStatus(0);
    const host = document.getElementById("community-feed");
    if (!host) return;
    host.replaceChildren();
    host.setAttribute("aria-busy", "false");
    renderCommunityPagination();
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

function setCommunityRequestBusy(busy, { loadingMore = false } = {}) {
    const refresh = document.getElementById("community-refresh");
    if (refresh) {
        refresh.disabled = busy;
        refresh.setAttribute("aria-busy", String(busy && !loadingMore));
    }
    const loadMore = document.getElementById("community-load-more");
    if (loadMore) {
        loadMore.disabled = busy;
        loadMore.setAttribute("aria-busy", String(busy && loadingMore));
    }
    syncCommunityPaginationCopy({ loadingMore: busy && loadingMore });
}

async function loadCommunityTopics({ force = false, page = 1 } = {}) {
    if (activeCommunityRequest) return activeCommunityRequest;
    if (!Number.isSafeInteger(page) || page < 1) return;
    const loadingMore = page > 1;

    const cached = page === 1 ? readCommunityCache() : null;
    if (!force && page === 1 && cached) {
        cachedCommunityTopics = cached.topics;
        communityNextPage = cached.nextPage;
        hasCommunitySnapshot = true;
        communitySource = Date.now() - cached.storedAt <= COMMUNITY_CACHE_TTL_MS ? "cache" : "stale";
        renderCommunityCategories();
        renderCommunityTopics();
        if (communitySource === "cache") return;
    }

    const host = document.getElementById("community-feed");
    if (!hasCommunitySnapshot) host?.setAttribute("aria-busy", "true");
    setCommunityRequestBusy(true, { loadingMore });

    activeCommunityRequest = (async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), COMMUNITY_REQUEST_TIMEOUT_MS);
        try {
            const requestUrl = new URL(COMMUNITY_API);
            requestUrl.searchParams.set("page", String(page));
            const response = await fetch(requestUrl, {
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
            const receivedTopics = normalizeCommunityTopics(payload);
            cachedCommunityTopics = loadingMore
                ? mergeCommunityTopics(cachedCommunityTopics, receivedTopics)
                : receivedTopics;
            communityNextPage = payload.length === COMMUNITY_PAGE_SIZE ? page + 1 : null;
            hasCommunitySnapshot = true;
            communitySource = "live";
            writeCommunityCache(cachedCommunityTopics);
            renderCommunityCategories();
            renderCommunityTopics();
        } catch (error) {
            console.warn(error);
            if (hasCommunitySnapshot) {
                communitySource = loadingMore ? "partial" : "stale";
                renderCommunityCategories();
                renderCommunityTopics();
            } else {
                renderCommunityError();
            }
        } finally {
            window.clearTimeout(timeout);
            setCommunityRequestBusy(false);
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

function giscusConfiguration() {
    const host = document.querySelector(".giscus");
    if (!host) return null;
    const keys = [
        "repo",
        "repoId",
        "category",
        "categoryId",
        "mapping",
        "term",
        "strict",
        "reactionsEnabled",
        "emitMetadata",
        "inputPosition",
        "loading"
    ];
    const config = Object.fromEntries(keys.map((key) => [key, host.dataset[key] || ""]));
    if (!config.repo || !config.repoId || !config.categoryId || config.mapping !== "specific" || !config.term) return null;
    return config;
}

function startGiscusStatusTimeout() {
    if (giscusStatusTimeout !== null) window.clearTimeout(giscusStatusTimeout);
    giscusStatusTimeout = window.setTimeout(() => {
        if (giscusReadinessState === "checking") renderGiscusReadiness("unknown");
    }, GISCUS_STATUS_TIMEOUT_MS);
}

function loadGiscusEmbed({ remember = true } = {}) {
    if (giscusReadinessState === "checking") return false;
    const host = document.querySelector(".giscus");
    const config = giscusConfiguration();
    if (!host || !config) {
        renderGiscusReadiness("error");
        return false;
    }

    if (remember) rememberGiscusOptIn();
    const existingFrame = document.querySelector("iframe.giscus-frame");
    if (existingFrame?.src) {
        renderGiscusReadiness("checking");
        existingFrame.src = existingFrame.src;
        startGiscusStatusTimeout();
        return true;
    }
    document.getElementById(GISCUS_SCRIPT_ID)?.remove();
    host.replaceChildren();
    renderGiscusReadiness("checking");

    const script = document.createElement("script");
    script.id = GISCUS_SCRIPT_ID;
    script.src = `${GISCUS_ORIGIN}/client.js`;
    script.async = true;
    script.crossOrigin = "anonymous";
    for (const [key, value] of Object.entries(config)) script.dataset[key] = value;
    script.dataset.theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark_dimmed";
    script.dataset.lang = communityLanguage() === "zh" ? "zh-CN" : "en";
    script.addEventListener("error", () => renderGiscusReadiness("error"), { once: true });
    document.body.appendChild(script);
    startGiscusStatusTimeout();
    return true;
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
    }, GISCUS_ORIGIN);
}

window.addEventListener("message", handleGiscusMessage);

document.addEventListener("DOMContentLoaded", () => {
    readCommunityFiltersFromUrl();
    syncCommunityPaginationCopy();
    renderGiscusReadiness("standby");

    document.getElementById("community-filters")?.addEventListener("submit", (event) => event.preventDefault());
    document.getElementById("community-search")?.addEventListener("input", syncCommunityFiltersFromControls);
    document.getElementById("community-category")?.addEventListener("change", syncCommunityFiltersFromControls);
    document.getElementById("community-reset")?.addEventListener("click", clearCommunityFilters);
    document.getElementById("community-refresh")?.addEventListener("click", () => loadCommunityTopics({ force: true }));
    document.getElementById("community-load-more")?.addEventListener("click", () => {
        if (communityNextPage !== null) loadCommunityTopics({ page: communityNextPage });
    });
    document.getElementById("giscus-load")?.addEventListener("click", () => loadGiscusEmbed());

    const giscusHost = document.querySelector(".giscus");
    if (giscusHost) {
        new MutationObserver(syncGiscusConfig).observe(giscusHost, { childList: true, subtree: true });
    }

    if (readGiscusOptIn()) loadGiscusEmbed({ remember: false });

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
    else syncCommunityPaginationCopy();
    syncGiscusReadinessCopy();
    syncGiscusConfig();
});
document.addEventListener("site:theme-changed", syncGiscusConfig);

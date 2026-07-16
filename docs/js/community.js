const COMMUNITY_PAGE_SIZE = 20;
const COMMUNITY_API = `https://api.github.com/repos/ChenlizheMe/Infernux/discussions?per_page=${COMMUNITY_PAGE_SIZE}&sort=updated&direction=desc`;
const COMMUNITY_CACHE_KEY = "infernux-community-feed-v1";
const COMMUNITY_CACHE_VERSION = 3;
const COMMUNITY_CACHE_TTL_MS = 5 * 60 * 1000;
const COMMUNITY_REQUEST_TIMEOUT_MS = 10000;
const GISCUS_OPT_IN_KEY = "infernux-giscus-opt-in-v1";
const GISCUS_CONTROLLER_ID = "community-giscus-controller";
const GISCUS_CONTROLLER_SRC = "/js/community-giscus.js?v=2";
const COMMUNITY_LOBBY_TERM = "Infernux Community Lobby";
const COMMUNITY_CATEGORIES = Object.freeze({
    announcements: Object.freeze({ name: "Announcements", id: "DIC_kwDOO_wV3M4C5oaB" }),
    general: Object.freeze({ name: "General", id: "DIC_kwDOO_wV3M4C5oaC" }),
    "q-a": Object.freeze({ name: "Q&A", id: "DIC_kwDOO_wV3M4C5oaD" }),
    ideas: Object.freeze({ name: "Ideas", id: "DIC_kwDOO_wV3M4C5oaE" }),
    polls: Object.freeze({ name: "Polls", id: "DIC_kwDOO_wV3M4C5oaG" }),
    "show-and-tell": Object.freeze({ name: "Show and tell", id: "DIC_kwDOO_wV3M4C5oaF" })
});

let cachedCommunityTopics = [];
let communitySource = "loading";
let hasCommunitySnapshot = false;
let communitySearch = "";
let communityCategory = "";
let communityState = "";
let communitySort = "updated";
let communityNextPage = 1;
let activeCommunityRequest = null;
let giscusControllerPromise = null;

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
            reactions: "reactions",
            by: "by",
            updated: "updated",
            copyLink: "Copy discussion link",
            copiedLink: "Copied link to discussion",
            shareLink: "Share discussion",
            sharedLink: "Shared discussion",
            copyFailed: "Could not copy the discussion link. Open it and use your browser's share controls.",
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
            stateLabel: "Topic state",
            stateAll: "All topics",
            stateUnanswered: "Open questions",
            stateAnswered: "Answered Q&A",
            stateLocked: "Locked topics",
            sortLabel: "Sort loaded topics",
            sortUpdated: "Recent activity",
            sortNewest: "Newest topics",
            sortReplies: "Most replies",
            sortReactions: "Most reactions",
            feedNav: "Discussion feed navigation",
            giscusStandbyTitle: "Replies load only when you ask.",
            giscusStandbyDetail: "Loading this panel contacts giscus.app and enables GitHub sign-in inside its frame.",
            giscusControllerErrorTitle: "Reply controls could not be loaded.",
            giscusControllerErrorDetail: "The local Giscus controller is unavailable. Retry or continue on GitHub.",
            giscusOpen: "Open Discussions",
            giscusInstall: "Install Giscus",
            giscusLoad: "Load replies",
            composeMissingTitle: "Enter a topic title before opening the editor.",
            composeOpening: "Opening the embedded editor…",
            composeReady: "Write your post below. GitHub sign-in stays inside the editor.",
            composeFailed: "The embedded editor could not be opened. Try again in a moment.",
            closeEditor: "Close editor",
            refreshTopics: "Refresh topics",
        },
        zh: {
            error: "实时话题暂时不可用，或已达到 GitHub API 频率限制。",
            open: "前往 GitHub Discussions",
            empty: "还没有公开话题，来创建第一个讨论吧。",
            emptyFiltered: "没有符合当前筛选条件的话题。",
            comments: "条回复",
            reactions: "个 reaction",
            by: "发起人",
            updated: "更新于",
            copyLink: "复制讨论链接",
            copiedLink: "已复制讨论链接",
            shareLink: "分享讨论",
            sharedLink: "已分享讨论",
            copyFailed: "无法复制讨论链接，请打开话题并使用浏览器的分享功能。",
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
            stateLabel: "话题状态",
            stateAll: "全部话题",
            stateUnanswered: "待回答问题",
            stateAnswered: "已回答问答",
            stateLocked: "已锁定话题",
            sortLabel: "排序已加载话题",
            sortUpdated: "最近活动",
            sortNewest: "最新发布",
            sortReplies: "回复最多",
            sortReactions: "reaction 最多",
            feedNav: "讨论列表导航",
            giscusStandbyTitle: "回复只会在你主动选择后加载。",
            giscusStandbyDetail: "加载此面板会连接 giscus.app，并在其框架内启用 GitHub 登录。",
            giscusControllerErrorTitle: "无法加载回复控制器。",
            giscusControllerErrorDetail: "本站的 Giscus 控制器暂不可用，请重试或前往 GitHub。",
            giscusOpen: "前往 Discussions",
            giscusInstall: "安装 Giscus",
            giscusLoad: "加载回复",
            composeMissingTitle: "请先输入话题标题，再打开编辑器。",
            composeOpening: "正在打开站内编辑器……",
            composeReady: "在下方编写正文；GitHub 登录会留在编辑器内部完成。",
            composeFailed: "暂时无法打开站内编辑器，请稍后重试。",
            closeEditor: "关闭编辑器",
            refreshTopics: "刷新话题",
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

function syncCommunityFilterCopy() {
    document.querySelectorAll("[data-community-copy]").forEach((element) => {
        element.textContent = communityCopy(element.dataset.communityCopy);
    });
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

function fallbackCommunityCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.className = "community-copy-fallback";
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
        copied = typeof document.execCommand === "function" && document.execCommand("copy") === true;
    } catch {
        copied = false;
    }
    textarea.remove();
    return copied;
}

async function copyCommunityText(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    try {
        if (globalThis.navigator?.clipboard?.writeText) {
            await globalThis.navigator.clipboard.writeText(text);
            return true;
        }
    } catch {}
    return fallbackCommunityCopy(text);
}

function communityTopicActionMode(topic) {
    if (typeof globalThis.navigator?.share !== "function") return "copy";
    if (typeof globalThis.navigator?.canShare !== "function") return "share";
    try {
        return globalThis.navigator.canShare({ title: topic?.title || "", url: topic?.html_url || "" }) === true
            ? "share"
            : "copy";
    } catch {
        return "copy";
    }
}

async function shareOrCopyCommunityTopic(topic) {
    const normalized = normalizeCommunityTopic(topic);
    if (!normalized) return "failed";
    const payload = { title: normalized.title, url: normalized.html_url };
    if (communityTopicActionMode(normalized) === "share") {
        try {
            await globalThis.navigator.share(payload);
            return "shared";
        } catch (error) {
            if (error?.name === "AbortError") return "cancelled";
        }
    }
    return await copyCommunityText(normalized.html_url) ? "copied" : "failed";
}

function communityTopicActionLabel(topic) {
    const key = communityTopicActionMode(topic) === "share" ? "shareLink" : "copyLink";
    return `${communityCopy(key)} #${topic.number}`;
}

async function activateCommunityTopicAction(topic, button) {
    if (!topic?.html_url || !button || button.disabled) return;
    button.disabled = true;
    const outcome = await shareOrCopyCommunityTopic(topic);
    button.disabled = false;
    if (outcome === "cancelled") return;
    const succeeded = outcome === "shared" || outcome === "copied";
    button.dataset.state = succeeded ? "success" : "failure";
    const icon = button.querySelector("i");
    if (icon) icon.className = succeeded ? "fas fa-check" : "fas fa-link";
    const status = document.getElementById("community-share-status");
    const message = outcome === "shared"
        ? `${communityCopy("sharedLink")} #${topic.number}.`
        : outcome === "copied"
            ? `${communityCopy("copiedLink")} #${topic.number}.`
            : communityCopy("copyFailed");
    if (status) status.textContent = message;
    button.setAttribute("aria-label", message);
    button.title = message;
    if (button.communityCopyTimer) window.clearTimeout(button.communityCopyTimer);
    button.communityCopyTimer = window.setTimeout(() => {
        button.dataset.state = "ready";
        const restoredIcon = button.querySelector("i");
        if (restoredIcon) restoredIcon.className = "fas fa-link";
        const label = communityTopicActionLabel(topic);
        button.setAttribute("aria-label", label);
        button.title = label;
        button.communityCopyTimer = null;
    }, 2200);
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
    const createdAt = typeof topic.created_at === "string" && !Number.isNaN(new Date(topic.created_at).getTime())
        ? topic.created_at
        : updatedAt;
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
                : "discussion",
            is_answerable: topic.category?.is_answerable === true
        },
        user: {
            login: typeof topic.user?.login === "string" && topic.user.login.trim()
                ? topic.user.login.trim().slice(0, 80)
                : "unknown"
        },
        created_at: createdAt,
        updated_at: updatedAt,
        comments: Number.isFinite(Number(topic.comments)) ? Math.max(0, Number(topic.comments)) : 0,
        reactions: Number.isFinite(Number(typeof topic.reactions === "number" ? topic.reactions : topic.reactions?.total_count))
            ? Math.max(0, Number(typeof topic.reactions === "number" ? topic.reactions : topic.reactions.total_count))
            : 0,
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

function sortCommunityTopics(topics, sort = communitySort) {
    const compareDate = (field) => (left, right) => new Date(right[field]) - new Date(left[field]);
    const updated = compareDate("updated_at");
    const compare = {
        newest: compareDate("created_at"),
        replies: (left, right) => right.comments - left.comments || updated(left, right),
        reactions: (left, right) => right.reactions - left.reactions || updated(left, right),
        updated
    }[sort] || updated;
    return [...topics].sort(compare);
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

function syncGiscusBootstrapCopy() {
    if (globalThis.InfernuxGiscus) {
        globalThis.InfernuxGiscus.syncCopy();
        return;
    }
    const title = document.getElementById("giscus-readiness-title");
    const detail = document.getElementById("giscus-readiness-detail");
    if (title && detail?.dataset.controllerError === "true") {
        title.textContent = communityCopy("giscusControllerErrorTitle");
        detail.textContent = communityCopy("giscusControllerErrorDetail");
    } else {
        if (title) title.textContent = communityCopy("giscusStandbyTitle");
        if (detail) detail.textContent = communityCopy("giscusStandbyDetail");
    }
    const open = document.querySelector("#giscus-open-discussions span");
    const install = document.querySelector("#giscus-install span");
    const load = document.querySelector("#giscus-load span");
    if (open) open.textContent = communityCopy("giscusOpen");
    if (install) install.textContent = communityCopy("giscusInstall");
    if (load) load.textContent = communityCopy("giscusLoad");
}

function renderGiscusControllerError() {
    const host = document.getElementById("giscus-readiness");
    if (host) host.dataset.state = "error";
    const code = host?.querySelector(".giscus-readiness-code");
    if (code) code.textContent = "OFFLINE";
    const detail = document.getElementById("giscus-readiness-detail");
    if (detail) detail.dataset.controllerError = "true";
    syncGiscusBootstrapCopy();
}

function setGiscusControllerBusy(busy) {
    const load = document.getElementById("giscus-load");
    if (!load) return;
    load.disabled = busy;
    load.setAttribute("aria-busy", String(busy));
}

function ensureGiscusController() {
    if (globalThis.InfernuxGiscus) return Promise.resolve(globalThis.InfernuxGiscus);
    if (giscusControllerPromise) return giscusControllerPromise;
    setGiscusControllerBusy(true);
    giscusControllerPromise = new Promise((resolve, reject) => {
        document.getElementById(GISCUS_CONTROLLER_ID)?.remove();
        const script = document.createElement("script");
        script.id = GISCUS_CONTROLLER_ID;
        script.src = GISCUS_CONTROLLER_SRC;
        script.async = true;
        script.addEventListener("load", () => {
            if (globalThis.InfernuxGiscus) resolve(globalThis.InfernuxGiscus);
            else reject(new Error("Giscus controller did not initialize"));
        }, { once: true });
        script.addEventListener("error", () => reject(new Error("Giscus controller request failed")), { once: true });
        document.body.appendChild(script);
    }).catch((error) => {
        console.warn(error);
        document.getElementById(GISCUS_CONTROLLER_ID)?.remove();
        giscusControllerPromise = null;
        renderGiscusControllerError();
        return null;
    }).finally(() => setGiscusControllerBusy(false));
    return giscusControllerPromise;
}

async function loadDeferredGiscus({ remember = true } = {}) {
    if (remember) rememberGiscusOptIn();
    const controller = await ensureGiscusController();
    if (!controller) return false;
    const detail = document.getElementById("giscus-readiness-detail");
    if (detail) delete detail.dataset.controllerError;
    return controller.load();
}

function syncLoadedGiscus() {
    if (globalThis.InfernuxGiscus) {
        globalThis.InfernuxGiscus.syncCopy();
        globalThis.InfernuxGiscus.syncConfig();
    }
}

function readCommunityFiltersFromUrl() {
    const params = new URLSearchParams(window.location.search);
    communitySearch = (params.get("q") || "").trim().slice(0, 100);
    const category = (params.get("category") || "").trim().toLowerCase();
    communityCategory = /^[a-z0-9-]+$/.test(category) ? category : "";
    const state = (params.get("state") || "").trim().toLowerCase();
    communityState = ["unanswered", "answered", "locked"].includes(state) ? state : "";
    const sort = (params.get("sort") || "").trim().toLowerCase();
    communitySort = ["updated", "newest", "replies", "reactions"].includes(sort) ? sort : "updated";

    const searchInput = document.getElementById("community-search");
    if (searchInput) searchInput.value = communitySearch;
    const categorySelect = document.getElementById("community-category");
    if (categorySelect) categorySelect.value = communityCategory;
    const stateSelect = document.getElementById("community-state");
    if (stateSelect) stateSelect.value = communityState;
    const sortSelect = document.getElementById("community-sort");
    if (sortSelect) sortSelect.value = communitySort;
}

function writeCommunityFiltersToUrl() {
    const url = new URL(window.location.href);
    if (communitySearch) url.searchParams.set("q", communitySearch);
    else url.searchParams.delete("q");
    if (communityCategory) url.searchParams.set("category", communityCategory);
    else url.searchParams.delete("category");
    if (communityState) url.searchParams.set("state", communityState);
    else url.searchParams.delete("state");
    if (communitySort !== "updated") url.searchParams.set("sort", communitySort);
    else url.searchParams.delete("sort");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function renderCommunityCategories() {
    const select = document.getElementById("community-category");
    if (!select) return;
    while (select.options.length > 1) select.remove(1);

    const categories = new Map(Object.entries(COMMUNITY_CATEGORIES).map(([slug, category]) => [slug, category.name]));
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

function syncCommunityCategoryButtons() {
    document.querySelectorAll("[data-forum-category]").forEach((button) => {
        const active = button.dataset.forumCategory === communityCategory;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
    });
}

function selectCommunityCategory(category) {
    communityCategory = Object.hasOwn(COMMUNITY_CATEGORIES, category) ? category : "";
    const select = document.getElementById("community-category");
    if (select) select.value = communityCategory;
    const composeCategory = document.getElementById("community-compose-category");
    if (composeCategory && communityCategory && [...composeCategory.options].some((option) => option.value === communityCategory)) {
        composeCategory.value = communityCategory;
    }
    writeCommunityFiltersToUrl();
    syncCommunityCategoryButtons();
    renderCommunityTopics();
}

function setCommunityComposerVisible(visible, { focusTitle = false } = {}) {
    const composer = document.getElementById("community-compose");
    if (!composer) return;
    composer.hidden = !visible;
    document.getElementById("community-auth")?.setAttribute("aria-expanded", String(visible));
    document.getElementById("community-new-topic")?.setAttribute("aria-expanded", String(visible));
    if (visible && focusTitle) document.getElementById("community-compose-topic")?.focus();
}

function setCommunityComposerStatus(messageKey) {
    const status = document.getElementById("community-compose-status");
    if (status) status.textContent = messageKey ? communityCopy(messageKey) : "";
}

async function openCommunityEditor(term, categorySlug = "general") {
    const title = String(term || "").trim().slice(0, 120);
    const category = COMMUNITY_CATEGORIES[categorySlug] || COMMUNITY_CATEGORIES.general;
    if (!title) return false;

    setCommunityComposerVisible(true);
    setCommunityComposerStatus("composeOpening");
    setGiscusControllerBusy(true);
    try {
        const controller = await ensureGiscusController();
        rememberGiscusOptIn();
        const opened = typeof controller.open === "function"
            ? controller.open({ term: title, category: category.name, categoryId: category.id })
            : controller.load();
        setCommunityComposerStatus(opened ? "composeReady" : "composeFailed");
        return opened;
    } catch (error) {
        console.warn(error);
        renderGiscusControllerError();
        setCommunityComposerStatus("composeFailed");
        return false;
    } finally {
        setGiscusControllerBusy(false);
    }
}

function startCommunityTopic() {
    setCommunityComposerVisible(true, { focusTitle: true });
    setCommunityComposerStatus("");
    const title = document.getElementById("community-compose-topic");
    if (title) title.value = "";
    const category = document.getElementById("community-compose-category");
    if (category && communityCategory && [...category.options].some((option) => option.value === communityCategory)) {
        category.value = communityCategory;
    }
}

function openCommunityTopic(topic) {
    const category = COMMUNITY_CATEGORIES[topic?.category?.slug];
    if (!topic?.title || !category) return false;
    const title = document.getElementById("community-compose-topic");
    const categorySelect = document.getElementById("community-compose-category");
    if (title) title.value = topic.title;
    if (categorySelect && [...categorySelect.options].some((option) => option.value === topic.category.slug)) {
        categorySelect.value = topic.category.slug;
    }
    openCommunityEditor(topic.title, topic.category.slug);
    document.getElementById("community-compose")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
}

function filteredCommunityTopics() {
    const terms = communitySearch.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const filtered = cachedCommunityTopics.filter((topic) => {
        if (communityCategory && topic.category.slug !== communityCategory) return false;
        if (communityState === "unanswered" && !(topic.category.is_answerable && !topic.answer_chosen_at && !topic.locked)) return false;
        if (communityState === "answered" && !topic.answer_chosen_at) return false;
        if (communityState === "locked" && !topic.locked) return false;
        if (!terms.length) return true;
        const haystack = [topic.title, topic.user.login, topic.category.name, topic.category.slug]
            .join(" ")
            .toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
    });
    return sortCommunityTopics(filtered);
}

function communitySortLabel() {
    const key = {
        updated: "sortUpdated",
        newest: "sortNewest",
        replies: "sortReplies",
        reactions: "sortReactions"
    }[communitySort] || "sortUpdated";
    return communityCopy(key);
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
        ? `显示 ${visibleCount} / ${cachedCommunityTopics.length} 条话题 · ${communitySortLabel()} · ${communitySourceLabel()}`
        : `Showing ${visibleCount} of ${cachedCommunityTopics.length} topics · ${communitySortLabel()} · ${communitySourceLabel()}`;
}

function renderCommunityTopics() {
    const host = document.getElementById("community-feed");
    if (!host) return;
    host.replaceChildren();
    host.setAttribute("aria-busy", "false");
    const topics = filteredCommunityTopics();
    renderCommunityStatus(topics.length);

    const reset = document.getElementById("community-reset");
    if (reset) reset.hidden = !(communitySearch || communityCategory || communityState || communitySort !== "updated");
    renderCommunityPagination();

    if (!topics.length) {
        const empty = document.createElement("div");
        empty.className = "topic-status";
        empty.textContent = cachedCommunityTopics.length ? communityCopy("emptyFiltered") : communityCopy("empty");
        host.appendChild(empty);
        return;
    }

    topics.forEach((topic) => {
        const row = document.createElement("article");
        row.className = "topic-row";

        const link = document.createElement("a");
        link.className = "topic-main";
        link.href = topic.html_url;
        link.target = "_blank";
        link.rel = "noopener";
        link.addEventListener("click", (event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (!openCommunityTopic(topic)) return;
            event.preventDefault();
        });

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
        meta.appendChild(document.createTextNode(`${communityCopy("by")} @${topic.user.login}`));
        if (date) {
            const updated = document.createElement("time");
            updated.dateTime = topic.updated_at;
            updated.textContent = `${communityCopy("updated")} ${date}`;
            meta.append(document.createTextNode(" · "), updated);
        }
        copy.append(title, signals, meta);

        const metrics = document.createElement("span");
        metrics.className = "topic-metrics";
        const replies = document.createElement("span");
        replies.textContent = `${topic.comments} ${communityCopy("comments")}`;
        metrics.appendChild(replies);
        if (topic.reactions > 0) {
            const reactions = document.createElement("span");
            reactions.textContent = `${topic.reactions} ${communityCopy("reactions")}`;
            metrics.appendChild(reactions);
        }

        link.append(category, copy, metrics);

        const topicAction = document.createElement("button");
        topicAction.className = "topic-action";
        topicAction.type = "button";
        topicAction.dataset.state = "ready";
        topicAction.dataset.mode = communityTopicActionMode(topic);
        const actionLabel = communityTopicActionLabel(topic);
        topicAction.setAttribute("aria-label", actionLabel);
        topicAction.title = actionLabel;
        const actionIcon = document.createElement("i");
        actionIcon.className = "fas fa-link";
        actionIcon.setAttribute("aria-hidden", "true");
        topicAction.appendChild(actionIcon);
        topicAction.addEventListener("click", () => activateCommunityTopicAction(topic, topicAction));

        row.append(link, topicAction);
        host.appendChild(row);
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
    const stateSelect = document.getElementById("community-state");
    const sortSelect = document.getElementById("community-sort");
    communitySearch = (searchInput?.value || "").trim().slice(0, 100);
    communityCategory = categorySelect?.value || "";
    communityState = stateSelect?.value || "";
    communitySort = sortSelect?.value || "updated";
    writeCommunityFiltersToUrl();
    syncCommunityCategoryButtons();
    renderCommunityTopics();
}

function clearCommunityFilters() {
    communitySearch = "";
    communityCategory = "";
    communityState = "";
    communitySort = "updated";
    const searchInput = document.getElementById("community-search");
    const categorySelect = document.getElementById("community-category");
    const stateSelect = document.getElementById("community-state");
    const sortSelect = document.getElementById("community-sort");
    if (searchInput) searchInput.value = "";
    if (categorySelect) categorySelect.value = "";
    if (stateSelect) stateSelect.value = "";
    if (sortSelect) sortSelect.value = "updated";
    writeCommunityFiltersToUrl();
    syncCommunityCategoryButtons();
    renderCommunityTopics();
    searchInput?.focus();
}

document.addEventListener("DOMContentLoaded", () => {
    readCommunityFiltersFromUrl();
    syncCommunityFilterCopy();
    syncCommunityPaginationCopy();
    syncGiscusBootstrapCopy();

    document.getElementById("community-filters")?.addEventListener("submit", (event) => event.preventDefault());
    document.getElementById("community-search")?.addEventListener("input", syncCommunityFiltersFromControls);
    document.getElementById("community-category")?.addEventListener("change", syncCommunityFiltersFromControls);
    document.getElementById("community-state")?.addEventListener("change", syncCommunityFiltersFromControls);
    document.getElementById("community-sort")?.addEventListener("change", syncCommunityFiltersFromControls);
    document.getElementById("community-reset")?.addEventListener("click", clearCommunityFilters);
    document.getElementById("community-refresh")?.addEventListener("click", () => loadCommunityTopics({ force: true }));
    document.getElementById("community-load-more")?.addEventListener("click", () => {
        if (communityNextPage !== null) loadCommunityTopics({ page: communityNextPage });
    });
    document.querySelectorAll("[data-forum-category]").forEach((button) => {
        button.addEventListener("click", () => selectCommunityCategory(button.dataset.forumCategory || ""));
    });
    document.getElementById("community-new-topic")?.addEventListener("click", startCommunityTopic);
    document.getElementById("community-auth")?.addEventListener("click", () => {
        setCommunityComposerVisible(true);
        openCommunityEditor(COMMUNITY_LOBBY_TERM, "general");
    });
    document.getElementById("community-compose-close")?.addEventListener("click", () => setCommunityComposerVisible(false));
    document.getElementById("community-compose-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = (document.getElementById("community-compose-topic")?.value || "").trim();
        if (title.length < 4) {
            setCommunityComposerStatus("composeMissingTitle");
            document.getElementById("community-compose-topic")?.focus();
            return;
        }
        const category = document.getElementById("community-compose-category")?.value || "general";
        openCommunityEditor(title, category);
    });
    document.getElementById("giscus-load")?.addEventListener("click", () => {
        const title = (document.getElementById("community-compose-topic")?.value || "").trim() || COMMUNITY_LOBBY_TERM;
        const category = document.getElementById("community-compose-category")?.value || "general";
        openCommunityEditor(title, category);
    });
    syncCommunityCategoryButtons();
    const composeClose = document.getElementById("community-compose-close");
    if (composeClose) {
        composeClose.setAttribute("aria-label", communityCopy("closeEditor"));
        composeClose.title = communityCopy("closeEditor");
    }
    const refresh = document.getElementById("community-refresh");
    if (refresh) {
        refresh.setAttribute("aria-label", communityCopy("refreshTopics"));
        refresh.title = communityCopy("refreshTopics");
    }

    loadCommunityTopics();
});

window.addEventListener("popstate", () => {
    readCommunityFiltersFromUrl();
    renderCommunityCategories();
    syncCommunityCategoryButtons();
    renderCommunityTopics();
});

document.addEventListener("site:language-changed", () => {
    syncCommunityFilterCopy();
    renderCommunityCategories();
    syncCommunityCategoryButtons();
    if (hasCommunitySnapshot) renderCommunityTopics();
    else syncCommunityPaginationCopy();
    syncGiscusBootstrapCopy();
    syncLoadedGiscus();
});
document.addEventListener("site:theme-changed", syncLoadedGiscus);

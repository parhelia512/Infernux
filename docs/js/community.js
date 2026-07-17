const COMMUNITY_PAGE_SIZE = 20;
const COMMUNITY_FALLBACK_API = `https://api.github.com/repos/ChenlizheMe/Infernux/discussions?per_page=${COMMUNITY_PAGE_SIZE}&sort=updated&direction=desc`;
const COMMUNITY_CACHE_KEY = "infernux-community-feed-v2";
const COMMUNITY_CACHE_VERSION = 4;
const COMMUNITY_CACHE_TTL_MS = 15 * 60 * 1000;
const COMMUNITY_REQUEST_TIMEOUT_MS = 10000;
const COMMUNITY_DRAFT_KEY = "infernux-community-draft-v1";
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
let communityUser = null;
let communityPublishing = false;
let communityLastError = null;
let communitySessionUnavailable = false;

function communityLanguage() {
    return document.documentElement.lang?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function communityCopy(key) {
    const copy = {
        en: {
            error: "Topics could not be loaded.",
            anonymousRate: "GitHub's anonymous quota for this network is exhausted",
            resetAt: "resets",
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
            sourceLive: "authenticated GitHub data",
            sourcePublic: "forum service",
            sourceDirect: "direct GitHub fallback",
            sourceCache: "15-minute device cache",
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
            composeMissingTitle: "Enter a topic title.",
            composeMissingBody: "Write the topic body before publishing.",
            composeSignIn: "Sign in with GitHub before publishing this topic.",
            composePublishing: "Publishing topic…",
            composeFailed: "The topic could not be published. Your draft is still here.",
            uploadStarted: "Uploading image…",
            uploadDone: "Image added to the topic body.",
            uploadFailed: "The image could not be uploaded.",
            uploadInvalid: "Use a PNG, JPEG, GIF, or WebP image no larger than 5 MiB.",
            signedOut: "Sign in to publish topics with your own GitHub account.",
            sessionUnavailable: "The forum sign-in service is unavailable.",
            authenticatedGatewayUnavailable: "Your sign-in is preserved, but the forum service cannot be reached. No anonymous quota was used.",
            closeEditor: "Close editor",
            refreshTopics: "Refresh topics",
        },
        zh: {
            error: "暂时无法加载话题。",
            anonymousRate: "当前网络的 GitHub 匿名请求额度已用完",
            resetAt: "恢复于",
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
            sourceLive: "登录用户的 GitHub 数据",
            sourcePublic: "论坛服务",
            sourceDirect: "GitHub 直连备用路径",
            sourceCache: "十五分钟设备缓存",
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
            composeMissingTitle: "请输入话题标题。",
            composeMissingBody: "发布前请填写话题正文。",
            composeSignIn: "发布话题前请先登录 GitHub。",
            composePublishing: "正在发布话题……",
            composeFailed: "话题发布失败，草稿仍保留在这里。",
            uploadStarted: "正在上传图片……",
            uploadDone: "图片已插入话题正文。",
            uploadFailed: "图片上传失败。",
            uploadInvalid: "请选择不超过 5 MiB 的 PNG、JPEG、GIF 或 WebP 图片。",
            signedOut: "登录后将以你自己的 GitHub 账号发布话题。",
            sessionUnavailable: "论坛登录服务暂时不可用。",
            authenticatedGatewayUnavailable: "登录状态已保留，但论坛服务暂时无法连接；本次没有使用匿名请求额度。",
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
        return globalThis.navigator.canShare({ title: topic?.title || "", url: communityTopicAbsoluteUrl(topic) }) === true
            ? "share"
            : "copy";
    } catch {
        return "copy";
    }
}

async function shareOrCopyCommunityTopic(topic) {
    const normalized = normalizeCommunityTopic(topic);
    if (!normalized) return "failed";
    const payload = { title: normalized.title, url: communityTopicAbsoluteUrl(normalized) };
    if (communityTopicActionMode(normalized) === "share") {
        try {
            await globalThis.navigator.share(payload);
            return "shared";
        } catch (error) {
            if (error?.name === "AbortError") return "cancelled";
        }
    }
    return await copyCommunityText(payload.url) ? "copied" : "failed";
}

function communityTopicUrl(topic) {
    const number = Number(topic?.number);
    return Number.isSafeInteger(number) && number > 0
        ? `community-topic.html?topic=${number}`
        : "community.html";
}

function communityTopicAbsoluteUrl(topic) {
    return new URL(communityTopicUrl(topic), window.location.href).href;
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

function communityCacheKey() {
    const login = typeof communityUser?.login === "string" ? communityUser.login.trim().toLowerCase() : "";
    if (login) return `${COMMUNITY_CACHE_KEY}:user:${login}`;
    return `${COMMUNITY_CACHE_KEY}:${globalThis.InfernuxCommunityApi?.token?.() ? "session" : "anonymous"}`;
}

function readCommunityCache() {
    try {
        const record = JSON.parse(localStorage.getItem(communityCacheKey()) || "null");
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
        localStorage.setItem(communityCacheKey(), JSON.stringify({
            version: COMMUNITY_CACHE_VERSION,
            storedAt: Date.now(),
            topics,
            nextPage
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
    if (visible && !composer.open) composer.showModal();
    if (!visible && composer.open) composer.close();
    if (visible && focusTitle) document.getElementById("community-compose-topic")?.focus();
}

function setCommunityComposerLocked(locked) {
    communityPublishing = locked;
    for (const id of ["community-compose-topic", "community-compose-category", "community-compose-body", "community-compose-images", "community-compose-publish"]) {
        const control = document.getElementById(id);
        if (control) control.disabled = locked;
    }
}

function setCommunityComposerStatus(messageKey) {
    const status = document.getElementById("community-compose-status");
    if (status) status.textContent = messageKey ? communityCopy(messageKey) : "";
}

function currentCommunityDraft() {
    return {
        title: (document.getElementById("community-compose-topic")?.value || "").slice(0, 120),
        category: document.getElementById("community-compose-category")?.value || "general",
        body: (document.getElementById("community-compose-body")?.value || "").slice(0, 65536)
    };
}

function storeCommunityDraft() {
    try {
        const draft = currentCommunityDraft();
        if (draft.title || draft.body) sessionStorage.setItem(COMMUNITY_DRAFT_KEY, JSON.stringify(draft));
        else sessionStorage.removeItem(COMMUNITY_DRAFT_KEY);
    } catch {}
}

function readCommunityDraft() {
    try {
        const draft = JSON.parse(sessionStorage.getItem(COMMUNITY_DRAFT_KEY) || "null");
        if (!draft || typeof draft !== "object") return null;
        return {
            title: typeof draft.title === "string" ? draft.title.slice(0, 120) : "",
            category: Object.hasOwn(COMMUNITY_CATEGORIES, draft.category) ? draft.category : "general",
            body: typeof draft.body === "string" ? draft.body.slice(0, 65536) : ""
        };
    } catch {
        return null;
    }
}

function clearCommunityDraft() {
    try { sessionStorage.removeItem(COMMUNITY_DRAFT_KEY); } catch {}
}

function syncCommunityAccount() {
    const profile = document.getElementById("community-account-profile");
    const avatar = document.getElementById("community-account-avatar");
    const login = document.getElementById("community-account-login");
    const status = document.getElementById("community-account-status");
    const signIn = document.getElementById("community-sign-in");
    const signOut = document.getElementById("community-sign-out");
    const composeSignIn = document.getElementById("community-compose-sign-in");
    if (profile) profile.hidden = !communityUser;
    if (avatar && communityUser) {
        avatar.src = communityUser.avatarUrl || "assets/logo.png";
        avatar.alt = `@${communityUser.login}`;
    }
    if (login) login.textContent = communityUser ? `@${communityUser.login}` : "";
    if (status) {
        status.hidden = Boolean(communityUser);
        if (!communityUser) status.textContent = communityCopy(communitySessionUnavailable ? "sessionUnavailable" : "signedOut");
    }
    if (signIn) signIn.hidden = Boolean(communityUser);
    if (signOut) signOut.hidden = !communityUser;
    if (composeSignIn) composeSignIn.hidden = Boolean(communityUser);
}

async function loadCommunityAccount() {
    const api = globalThis.InfernuxCommunityApi;
    if (!api) return syncCommunityAccount();
    try {
        const session = await api.session();
        communityUser = session?.authenticated ? session.user : null;
        communitySessionUnavailable = false;
    } catch (error) {
        console.warn("Forum session validation is temporarily unavailable.", error);
        communityUser = null;
        communitySessionUnavailable = Boolean(api.token?.());
    }
    syncCommunityAccount();
}

async function beginCommunitySignIn() {
    storeCommunityDraft();
    try {
        await globalThis.InfernuxCommunityApi?.signIn();
    } catch (error) {
        console.warn("Forum sign-in service is unavailable.", error);
        communitySessionUnavailable = true;
        syncCommunityAccount();
        setCommunityComposerStatus("sessionUnavailable");
    }
}

function startCommunityTopic() {
    setCommunityComposerVisible(true, { focusTitle: true });
    setCommunityComposerStatus("");
    setCommunityComposerLocked(false);
    const draft = readCommunityDraft();
    const title = document.getElementById("community-compose-topic");
    const body = document.getElementById("community-compose-body");
    const category = document.getElementById("community-compose-category");
    if (title) title.value = draft?.title || "";
    if (body) body.value = draft?.body || "";
    if (category) category.value = draft?.category || (communityCategory && Object.hasOwn(COMMUNITY_CATEGORIES, communityCategory) ? communityCategory : "general");
    document.getElementById("community-upload-list")?.replaceChildren();
    syncCommunityAccount();
}

function insertCommunityMarkdown(markdown) {
    const body = document.getElementById("community-compose-body");
    if (!body) return;
    const start = body.selectionStart ?? body.value.length;
    const end = body.selectionEnd ?? start;
    const prefix = start > 0 && !body.value.slice(0, start).endsWith("\n") ? "\n" : "";
    const suffix = end < body.value.length && !body.value.slice(end).startsWith("\n") ? "\n" : "";
    const insertion = `${prefix}${markdown}\n${suffix}`;
    body.setRangeText(insertion, start, end, "end");
    body.focus();
    storeCommunityDraft();
}

function appendCommunityUpload(file, state) {
    const list = document.getElementById("community-upload-list");
    if (!list) return null;
    const item = document.createElement("li");
    item.dataset.state = state;
    const name = document.createElement("span");
    name.textContent = file.name;
    const status = document.createElement("small");
    status.textContent = communityCopy(state === "uploading" ? "uploadStarted" : "uploadFailed");
    item.append(name, status);
    list.appendChild(item);
    return { item, status };
}

async function uploadCommunityImage(file) {
    const validType = ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file?.type);
    if (!validType || !file.size || file.size > 5 * 1024 * 1024) {
        setCommunityComposerStatus("uploadInvalid");
        return false;
    }
    if (!communityUser) {
        setCommunityComposerStatus("composeSignIn");
        return false;
    }
    const upload = appendCommunityUpload(file, "uploading");
    try {
        const payload = await globalThis.InfernuxCommunityApi.request("/api/uploads", {
            method: "POST",
            headers: { "Content-Type": file.type, "X-File-Name": file.name.slice(0, 180) },
            body: file
        });
        if (!payload?.markdown) throw new Error("Upload response did not include Markdown");
        insertCommunityMarkdown(payload.markdown);
        if (upload) {
            upload.item.dataset.state = "complete";
            upload.status.textContent = communityCopy("uploadDone");
        }
        setCommunityComposerStatus("");
        return true;
    } catch (error) {
        console.warn(error);
        if (upload) {
            upload.item.dataset.state = "error";
            upload.status.textContent = communityCopy("uploadFailed");
        }
        setCommunityComposerStatus("uploadFailed");
        return false;
    }
}

async function publishCommunityTopic() {
    if (communityPublishing) return false;
    const draft = currentCommunityDraft();
    if (draft.title.trim().length < 4) {
        setCommunityComposerStatus("composeMissingTitle");
        document.getElementById("community-compose-topic")?.focus();
        return false;
    }
    if (!draft.body.trim()) {
        setCommunityComposerStatus("composeMissingBody");
        document.getElementById("community-compose-body")?.focus();
        return false;
    }
    if (!communityUser) {
        setCommunityComposerStatus("composeSignIn");
        return false;
    }
    const category = COMMUNITY_CATEGORIES[draft.category] || COMMUNITY_CATEGORIES.general;
    storeCommunityDraft();
    setCommunityComposerLocked(true);
    setCommunityComposerStatus("composePublishing");
    try {
        const payload = await globalThis.InfernuxCommunityApi.request("/api/discussions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: draft.title.trim(), body: draft.body.trim(), categoryId: category.id })
        });
        const number = Number(payload?.discussion?.number);
        if (!Number.isSafeInteger(number) || number < 1) throw new Error("Publish response did not include a discussion number");
        clearCommunityDraft();
        window.location.assign(`community-topic.html?topic=${number}`);
        return true;
    } catch (error) {
        console.warn(error);
        setCommunityComposerStatus(error?.code === "authentication_required" ? "composeSignIn" : "composeFailed");
        return false;
    } finally {
        setCommunityComposerLocked(false);
    }
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
        public: "sourcePublic",
        direct: "sourceDirect",
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
        link.href = communityTopicUrl(topic);

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
    let message = communityLastError?.code === "authenticated_gateway_unavailable"
        ? communityCopy("authenticatedGatewayUnavailable")
        : communityCopy("error");
    if (communityLastError?.code === "anonymous_rate_limited" && communityLastError.reset) {
        const reset = new Intl.DateTimeFormat(communityLanguage() === "zh" ? "zh-CN" : "en", {
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(communityLastError.reset * 1000));
        message = `${communityCopy("anonymousRate")} · ${communityCopy("resetAt")} ${reset}.`;
    }
    status.append(document.createTextNode(`${message} `));
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

async function requestCommunityPage(page, signal) {
    const gateway = globalThis.InfernuxCommunityApi;
    if (gateway) {
        try {
            const payload = await gateway.request(`/api/discussions?page=${page}&per_page=${COMMUNITY_PAGE_SIZE}`, { signal });
            if (!Array.isArray(payload?.items)) throw new Error("Forum gateway returned an unexpected payload");
            return { items: payload.items, source: communityUser ? "live" : "public" };
        } catch (error) {
            if (gateway.token?.()) {
                error.code ||= "authenticated_gateway_unavailable";
                throw error;
            }
            console.warn("Forum gateway unavailable; trying the public GitHub fallback.", error);
        }
    }

    const requestUrl = new URL(COMMUNITY_FALLBACK_API);
    requestUrl.searchParams.set("page", String(page));
    const response = await fetch(requestUrl, {
        headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        },
        cache: "no-store",
        signal
    });
    if (!response.ok) {
        const error = new Error(`GitHub API ${response.status}`);
        if (response.status === 403 && response.headers.get("X-RateLimit-Remaining") === "0") {
            error.code = "anonymous_rate_limited";
            error.reset = Number(response.headers.get("X-RateLimit-Reset")) || null;
        }
        throw error;
    }
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("GitHub API returned an unexpected payload");
    return { items, source: "direct" };
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
            const result = await requestCommunityPage(page, controller.signal);
            const receivedTopics = normalizeCommunityTopics(result.items);
            cachedCommunityTopics = loadingMore
                ? mergeCommunityTopics(cachedCommunityTopics, receivedTopics)
                : receivedTopics;
            communityNextPage = result.items.length === COMMUNITY_PAGE_SIZE ? page + 1 : null;
            hasCommunitySnapshot = true;
            communitySource = result.source;
            communityLastError = null;
            writeCommunityCache(cachedCommunityTopics);
            renderCommunityCategories();
            renderCommunityTopics();
        } catch (error) {
            console.warn(error);
            communityLastError = error;
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

document.addEventListener("DOMContentLoaded", async () => {
    readCommunityFiltersFromUrl();
    syncCommunityFilterCopy();
    syncCommunityPaginationCopy();
    await loadCommunityAccount();

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
    document.getElementById("community-sign-in")?.addEventListener("click", beginCommunitySignIn);
    document.getElementById("community-compose-sign-in")?.addEventListener("click", beginCommunitySignIn);
    document.getElementById("community-sign-out")?.addEventListener("click", () => {
        globalThis.InfernuxCommunityApi?.signOut();
        communityUser = null;
        syncCommunityAccount();
        loadCommunityTopics({ force: true });
    });
    document.getElementById("community-compose-close")?.addEventListener("click", () => {
        storeCommunityDraft();
        setCommunityComposerVisible(false);
    });
    document.getElementById("community-compose-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        publishCommunityTopic();
    });
    document.getElementById("community-compose-topic")?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        document.getElementById("community-compose-body")?.focus();
    });
    document.getElementById("community-compose-images")?.addEventListener("change", async (event) => {
        for (const file of [...(event.currentTarget.files || [])]) await uploadCommunityImage(file);
        event.currentTarget.value = "";
    });
    for (const id of ["community-compose-topic", "community-compose-category", "community-compose-body"]) {
        document.getElementById(id)?.addEventListener("input", storeCommunityDraft);
        document.getElementById(id)?.addEventListener("change", storeCommunityDraft);
    }
    syncCommunityCategoryButtons();
    const composeClose = document.getElementById("community-compose-close");
    if (composeClose) {
        composeClose.setAttribute("aria-label", communityCopy("closeEditor"));
        composeClose.title = communityCopy("closeEditor");
    }
    const composer = document.getElementById("community-compose");
    composer?.addEventListener("click", (event) => {
        if (event.target === composer) {
            storeCommunityDraft();
            setCommunityComposerVisible(false);
        }
    });
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
    syncCommunityAccount();
});

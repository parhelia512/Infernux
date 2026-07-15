const COMMUNITY_API = "https://api.github.com/repos/ChenlizheMe/Infernux/discussions?per_page=6&direction=desc";
let cachedCommunityTopics = [];

function communityLanguage() {
    return document.documentElement.lang?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function communityCopy(key) {
    const copy = {
        en: {
            error: "The live relay is unavailable or rate-limited.",
            open: "Open Discussions on GitHub",
            empty: "No public discussions yet. Start the first topic.",
            comments: "replies",
            by: "by"
        },
        zh: {
            error: "实时话题暂时不可用，或已达到 GitHub API 频率限制。",
            open: "前往 GitHub Discussions",
            empty: "还没有公开话题，来创建第一个讨论吧。",
            comments: "条回复",
            by: "发起人"
        }
    };
    return copy[communityLanguage()][key];
}

function formatTopicDate(value) {
    return new Intl.DateTimeFormat(communityLanguage() === "zh" ? "zh-CN" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric"
    }).format(new Date(value));
}

function renderCommunityTopics(topics) {
    const host = document.getElementById("community-feed");
    if (!host) return;
    host.innerHTML = "";
    host.setAttribute("aria-busy", "false");

    if (!topics.length) {
        const empty = document.createElement("div");
        empty.className = "topic-status";
        empty.textContent = communityCopy("empty");
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
        category.textContent = topic.category?.name || "Discussion";

        const copy = document.createElement("span");
        copy.className = "topic-copy";
        const title = document.createElement("strong");
        title.textContent = topic.title;
        const meta = document.createElement("small");
        meta.textContent = `${communityCopy("by")} @${topic.user?.login || "unknown"} · ${formatTopicDate(topic.updated_at)}`;
        copy.append(title, meta);

        const metrics = document.createElement("span");
        metrics.className = "topic-metrics";
        metrics.textContent = `${topic.comments || 0} ${communityCopy("comments")}`;

        link.append(category, copy, metrics);
        host.appendChild(link);
    });
}

function renderCommunityError() {
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
    fetch(COMMUNITY_API, {
        headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
    })
        .then((response) => {
            if (!response.ok) throw new Error(`GitHub API ${response.status}`);
            return response.json();
        })
        .then((topics) => {
            cachedCommunityTopics = Array.isArray(topics) ? topics : [];
            renderCommunityTopics(cachedCommunityTopics);
        })
        .catch((error) => {
            console.warn(error);
            renderCommunityError();
        });

    const giscusHost = document.querySelector(".giscus");
    if (giscusHost) {
        new MutationObserver(syncGiscusConfig).observe(giscusHost, { childList: true, subtree: true });
    }
});

document.addEventListener("site:language-changed", () => {
    if (cachedCommunityTopics.length) renderCommunityTopics(cachedCommunityTopics);
    syncGiscusConfig();
});
document.addEventListener("site:theme-changed", syncGiscusConfig);


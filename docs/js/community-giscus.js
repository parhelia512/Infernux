(() => {
    "use strict";

    if (globalThis.InfernuxGiscus) return;

    const GISCUS_ORIGIN = "https://giscus.app";
    const GISCUS_SCRIPT_ID = "giscus-client";
    const GISCUS_STATUS_TIMEOUT_MS = 12000;
    let readinessState = "standby";
    let statusTimeout = null;

    function language() {
        return document.documentElement.lang?.toLowerCase().startsWith("zh") ? "zh" : "en";
    }

    function copy(key) {
        const messages = {
            en: {
                standbyTitle: "Replies load only when you ask.",
                standbyDetail: "Loading this panel contacts giscus.app and enables GitHub sign-in inside its frame.",
                checkingTitle: "Checking embedded replies…",
                checkingDetail: "Waiting for a verified response from the Giscus frame.",
                readyTitle: "Embedded replies are ready.",
                readyDetail: "Use GitHub sign-in inside the panel to reply or react.",
                uninstalledTitle: "Embedded replies need administrator setup.",
                uninstalledDetail: "The Giscus App is not installed for this repository. Public Discussions remain available.",
                degradedTitle: "Embedded replies are temporarily degraded.",
                degradedDetail: "The frame reported a session or rate-limit problem. Retry later or continue on GitHub.",
                errorTitle: "Embedded replies are unavailable.",
                errorDetail: "The verified Giscus frame reported a configuration error. Continue on GitHub while an administrator checks setup.",
                unknownTitle: "Embedded reply status is unknown.",
                unknownDetail: "No verified frame response arrived. A network or content blocker may be preventing the embed.",
                open: "Open Discussions",
                install: "Install Giscus",
                load: "Load replies",
                retry: "Retry replies",
                loading: "Loading replies…"
            },
            zh: {
                standbyTitle: "回复只会在你主动选择后加载。",
                standbyDetail: "加载此面板会连接 giscus.app，并在其框架内启用 GitHub 登录。",
                checkingTitle: "正在检查站内回复……",
                checkingDetail: "正在等待 Giscus 框架返回可验证状态。",
                readyTitle: "站内回复已就绪。",
                readyDetail: "可在面板中使用 GitHub 登录、回复或 reaction。",
                uninstalledTitle: "站内回复需要管理员完成设置。",
                uninstalledDetail: "当前仓库尚未安装 Giscus App；公开 Discussions 仍可正常使用。",
                degradedTitle: "站内回复暂时降级。",
                degradedDetail: "框架报告会话或频率限制问题；可稍后重试或前往 GitHub。",
                errorTitle: "站内回复当前不可用。",
                errorDetail: "经过来源验证的 Giscus 框架报告配置错误；管理员检查期间请前往 GitHub。",
                unknownTitle: "无法确认站内回复状态。",
                unknownDetail: "未收到可验证的框架响应，可能被网络或内容拦截器阻止。",
                open: "前往 Discussions",
                install: "安装 Giscus",
                load: "加载回复",
                retry: "重试回复",
                loading: "正在加载回复……"
            }
        };
        return messages[language()][key];
    }

    function classifyError(value) {
        const message = typeof value === "string" ? value.toLowerCase() : "";
        if (message.includes("discussion not found")) return "ready";
        if (message.includes("not installed")) return "uninstalled";
        if (message.includes("rate limit") || message.includes("bad credentials") || message.includes("invalid state") || message.includes("state has expired")) return "degraded";
        return "error";
    }

    function syncCopy() {
        const copyKeys = {
            standby: ["standbyTitle", "standbyDetail"],
            checking: ["checkingTitle", "checkingDetail"],
            ready: ["readyTitle", "readyDetail"],
            uninstalled: ["uninstalledTitle", "uninstalledDetail"],
            degraded: ["degradedTitle", "degradedDetail"],
            error: ["errorTitle", "errorDetail"],
            unknown: ["unknownTitle", "unknownDetail"]
        }[readinessState] || ["unknownTitle", "unknownDetail"];
        const title = document.getElementById("giscus-readiness-title");
        const detail = document.getElementById("giscus-readiness-detail");
        if (title) title.textContent = copy(copyKeys[0]);
        if (detail) detail.textContent = copy(copyKeys[1]);
        const open = document.querySelector("#giscus-open-discussions span");
        const install = document.querySelector("#giscus-install span");
        const loadButton = document.querySelector("#giscus-load span");
        if (open) open.textContent = copy("open");
        if (install) install.textContent = copy("install");
        if (loadButton) {
            const key = readinessState === "standby" ? "load" : readinessState === "checking" ? "loading" : "retry";
            loadButton.textContent = copy(key);
        }
    }

    function render(state) {
        const supported = ["standby", "checking", "ready", "uninstalled", "degraded", "error", "unknown"];
        readinessState = supported.includes(state) ? state : "unknown";
        const host = document.getElementById("giscus-readiness");
        if (host) host.dataset.state = readinessState;
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
        if (code) code.textContent = codes[readinessState];
        syncCopy();
        if (readinessState !== "checking" && statusTimeout !== null) {
            window.clearTimeout(statusTimeout);
            statusTimeout = null;
        }
    }

    function handleMessage(event) {
        if (event.origin !== GISCUS_ORIGIN || !event.data || typeof event.data !== "object") return;
        const frame = document.querySelector("iframe.giscus-frame");
        if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
        const payload = event.data.giscus;
        if (!payload || typeof payload !== "object") return;
        if (typeof payload.error === "string") {
            render(classifyError(payload.error));
            return;
        }
        const height = Number(payload.resizeHeight);
        if (Number.isFinite(height) && height > 0 && readinessState !== "uninstalled" && readinessState !== "error") render("ready");
    }

    function configuration() {
        const host = document.querySelector(".giscus");
        if (!host) return null;
        const keys = ["repo", "repoId", "category", "categoryId", "mapping", "term", "strict", "reactionsEnabled", "emitMetadata", "inputPosition", "loading"];
        const config = Object.fromEntries(keys.map((key) => [key, host.dataset[key] || ""]));
        if (!config.repo || !config.repoId || !config.categoryId || config.mapping !== "specific" || !config.term) return null;
        return config;
    }

    function startStatusTimeout() {
        if (statusTimeout !== null) window.clearTimeout(statusTimeout);
        statusTimeout = window.setTimeout(() => {
            if (readinessState === "checking") render("unknown");
        }, GISCUS_STATUS_TIMEOUT_MS);
    }

    function load() {
        if (readinessState === "checking") return false;
        const host = document.querySelector(".giscus");
        const config = configuration();
        if (!host || !config) {
            render("error");
            return false;
        }
        const existingFrame = document.querySelector("iframe.giscus-frame");
        if (existingFrame?.src) {
            render("checking");
            existingFrame.src = existingFrame.src;
            startStatusTimeout();
            return true;
        }
        document.getElementById(GISCUS_SCRIPT_ID)?.remove();
        host.replaceChildren();
        render("checking");
        const script = document.createElement("script");
        script.id = GISCUS_SCRIPT_ID;
        script.src = `${GISCUS_ORIGIN}/client.js`;
        script.async = true;
        script.crossOrigin = "anonymous";
        for (const [key, value] of Object.entries(config)) script.dataset[key] = value;
        script.dataset.theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark_dimmed";
        script.dataset.lang = language() === "zh" ? "zh-CN" : "en";
        script.addEventListener("error", () => render("error"), { once: true });
        document.body.appendChild(script);
        startStatusTimeout();
        return true;
    }

    function open(config) {
        const host = document.querySelector(".giscus");
        const term = String(config?.term || "").trim().slice(0, 120);
        const category = String(config?.category || "").trim().slice(0, 80);
        const categoryId = String(config?.categoryId || "").trim();
        if (!host || term.length < 4 || !category || !/^DIC_[A-Za-z0-9_-]+$/.test(categoryId)) {
            render("error");
            return false;
        }

        host.dataset.term = term;
        host.dataset.category = category;
        host.dataset.categoryId = categoryId;
        document.getElementById(GISCUS_SCRIPT_ID)?.remove();
        host.replaceChildren();
        render("standby");
        return load();
    }

    function syncConfig() {
        const frame = document.querySelector("iframe.giscus-frame");
        if (!frame?.contentWindow) return;
        frame.contentWindow.postMessage({
            giscus: {
                setConfig: {
                    theme: document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark_dimmed",
                    lang: language() === "zh" ? "zh-CN" : "en"
                }
            }
        }, GISCUS_ORIGIN);
    }

    const controller = Object.freeze({ load, open, syncCopy, syncConfig, state: () => readinessState });
    globalThis.InfernuxGiscus = controller;
    window.addEventListener("message", handleMessage);
    const host = document.querySelector(".giscus");
    if (host) new MutationObserver(syncConfig).observe(host, { childList: true, subtree: true });
})();

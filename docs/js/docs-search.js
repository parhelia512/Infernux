(function () {
    const lang = document.documentElement.lang?.toLowerCase().startsWith("zh") ? "zh" : "en";
    const copy = {
        en: {
            title: "Search Infernux documentation",
            placeholder: "API symbol, system, workflow…",
            close: "Close documentation search",
            trigger: "Search documentation",
            loading: "Loading documentation indexes…",
            ready: "Search API, Learn, Manual, and Architecture documentation.",
            empty: "No documentation matches this query.",
            failed: "Documentation search is temporarily unavailable.",
            results: (count) => `${count} result${count === 1 ? "" : "s"}`
        },
        zh: {
            title: "搜索 Infernux 文档",
            placeholder: "API 符号、系统、工作流…",
            close: "关闭文档搜索",
            trigger: "搜索文档",
            loading: "正在加载文档索引…",
            ready: "搜索 API、学习、手册与架构文档。",
            empty: "没有匹配此查询的文档。",
            failed: "文档搜索暂时不可用。",
            results: (count) => `${count} 条结果`
        }
    }[lang];

    const trigger = document.querySelector("[data-docs-search-trigger]");
    const dialog = document.getElementById("docs-search-dialog");
    const input = document.getElementById("docs-search-input");
    const status = document.getElementById("docs-search-status");
    const results = document.getElementById("docs-search-results");
    if (!trigger || !dialog || !input || !status || !results) return;

    trigger.setAttribute("aria-label", copy.trigger);
    dialog.querySelector("h2").textContent = copy.title;
    input.placeholder = copy.placeholder;
    dialog.querySelector("[data-docs-search-close]").setAttribute("aria-label", copy.close);

    let searchItemsPromise;
    let previousFocus;

    function normalized(value) {
        return String(value || "").toLocaleLowerCase(lang === "zh" ? "zh-CN" : "en").replace(/\s+/g, " ").trim();
    }

    function loadSearchItems() {
        if (!searchItemsPromise) {
            searchItemsPromise = Promise.all([
                fetch("/api-index.json").then((response) => {
                    if (!response.ok) throw new Error(`API index HTTP ${response.status}`);
                    return response.json();
                }),
                fetch("/docs-index.json").then((response) => {
                    if (!response.ok) throw new Error(`Docs index HTTP ${response.status}`);
                    return response.json();
                })
            ]).then(([apiIndex, docsIndex]) => {
                const language = lang === "zh" ? "zh-CN" : "en";
                const api = (apiIndex.symbols || []).filter((item) => item.language === language).map((item) => ({
                    title: item.symbol,
                    eyebrow: `${item.kind} · ${item.module}`,
                    summary: item.summary || (item.signatures || []).join(" · "),
                    searchable: [item.symbol, item.module, item.kind, item.summary, ...(item.signatures || [])].join(" "),
                    status: item.status,
                    url: item.url,
                    priority: 20
                }));
                const docs = (docsIndex.documents || []).filter((item) => item.language === language).map((item) => ({
                    title: item.title,
                    eyebrow: item.layer,
                    summary: item.summary,
                    searchable: [item.title, item.layer, item.summary, item.status, item.since, ...(item.tags || []), ...(item.audience || [])].join(" "),
                    status: item.status,
                    url: item.url,
                    priority: item.layer === "learn" ? 40 : item.layer === "manual" ? 35 : 25
                }));
                return [...docs, ...api];
            });
        }
        return searchItemsPromise;
    }

    function score(item, rawQuery) {
        const query = normalized(rawQuery);
        const title = normalized(item.title);
        const haystack = normalized(item.searchable);
        const tokens = [...new Set(query.split(" ").filter(Boolean))];
        if (!tokens.every((token) => title.includes(token) || haystack.includes(token))) return -1;
        let value = item.priority;
        if (title === query) value += 300;
        else if (title.startsWith(query)) value += 190;
        else if (title.includes(query)) value += 120;
        for (const token of tokens) {
            if (title.startsWith(token)) value += 70;
            else if (title.includes(token)) value += 45;
            if (haystack.includes(token)) value += 10;
        }
        return value;
    }

    function render(items) {
        results.innerHTML = "";
        const query = input.value.trim();
        if (!query) {
            status.textContent = copy.ready;
            return;
        }
        const matches = items.map((item) => ({ item, score: score(item, query) }))
            .filter((entry) => entry.score >= 0)
            .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, lang === "zh" ? "zh-CN" : "en"))
            .slice(0, 16);
        status.textContent = matches.length ? copy.results(matches.length) : copy.empty;
        for (const { item } of matches) {
            const link = document.createElement("a");
            link.className = "docs-search-result";
            link.href = item.url;
            link.setAttribute("role", "listitem");
            const top = document.createElement("span");
            top.className = "docs-search-result-top";
            const title = document.createElement("strong");
            title.textContent = item.title;
            const badge = document.createElement("span");
            badge.className = "docs-search-result-status";
            badge.textContent = item.status || "";
            top.append(title, badge);
            const eyebrow = document.createElement("small");
            eyebrow.textContent = item.eyebrow;
            const summary = document.createElement("p");
            summary.textContent = item.summary || item.title;
            link.append(top, eyebrow, summary);
            results.appendChild(link);
        }
    }

    function openSearch() {
        if (!dialog.hidden) return;
        previousFocus = document.activeElement;
        dialog.hidden = false;
        document.body.classList.add("docs-search-open");
        trigger.setAttribute("aria-expanded", "true");
        status.textContent = copy.loading;
        input.focus();
        loadSearchItems().then(render).catch((error) => {
            console.warn(error);
            status.textContent = copy.failed;
        });
    }

    function closeSearch() {
        if (dialog.hidden) return;
        dialog.hidden = true;
        document.body.classList.remove("docs-search-open");
        trigger.setAttribute("aria-expanded", "false");
        if (previousFocus instanceof HTMLElement) previousFocus.focus();
    }

    trigger.addEventListener("click", openSearch);
    dialog.querySelectorAll("[data-docs-search-close]").forEach((button) => button.addEventListener("click", closeSearch));
    input.addEventListener("input", () => loadSearchItems().then(render).catch(() => {}));
    dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeSearch();
        }
        if (event.key === "Tab") {
            const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')].filter((element) => element.offsetParent !== null);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    document.addEventListener("keydown", (event) => {
        const target = event.target;
        const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
        if ((event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
            event.preventDefault();
            openSearch();
        }
    });
})();

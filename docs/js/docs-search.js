(function () {
    function normalized(value, locale = "en") {
        return String(value || "")
            .toLocaleLowerCase(locale === "zh-CN" ? "zh-CN" : "en")
            .replace(/\s+/g, " ")
            .trim();
    }

    function buildSearchModel(apiIndex, docsIndex) {
        const release = docsIndex?.generated_for_release;
        if (!release || apiIndex?.generated_for_release !== release) {
            throw new Error("Documentation search indexes describe different releases.");
        }

        const api = (apiIndex.symbols || []).map((item) => ({
            title: item.symbol,
            kind: item.kind,
            module: item.module,
            summary: item.summary || (item.signatures || []).join(" · "),
            searchable: [item.symbol, item.module, item.kind, item.summary, ...(item.signatures || [])].join(" "),
            status: item.status,
            language: item.language,
            layer: "api",
            url: item.url,
            priority: 20
        }));
        const docs = (docsIndex.documents || []).map((item) => ({
            title: item.title,
            summary: item.summary,
            searchable: [item.title, item.layer, item.summary, item.status, item.since, ...(item.tags || []), ...(item.audience || [])].join(" "),
            status: item.status,
            language: item.language,
            layer: item.layer,
            url: item.url,
            priority: item.layer === "learn" ? 40 : item.layer === "manual" ? 35 : 25
        }));
        return { release, items: [...docs, ...api] };
    }

    function score(item, rawQuery, locale) {
        const query = normalized(rawQuery, locale);
        if (!query) return item.priority;
        const title = normalized(item.title, locale);
        const haystack = normalized(item.searchable, locale);
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

    function search(model, options = {}) {
        const query = String(options.query || "").trim();
        const language = options.language || "all";
        const layer = options.layer || "all";
        const status = options.status || "all";
        const locale = options.locale || "en";
        const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 16;
        const facetActive = layer !== "all" || status !== "all";
        if (!query && !facetActive) return { total: 0, matches: [] };

        const ranked = model.items
            .filter((item) => language === "all" || item.language === language)
            .filter((item) => layer === "all" || item.layer === layer)
            .filter((item) => status === "all" || item.status === status)
            .map((item) => ({ item, score: score(item, query, locale) }))
            .filter((entry) => entry.score >= 0)
            .sort((left, right) => right.score - left.score
                || left.item.title.localeCompare(right.item.title, locale === "zh-CN" ? "zh-CN" : "en"));
        return { total: ranked.length, matches: ranked.slice(0, limit) };
    }

    const testApi = { buildSearchModel, search, score, normalized };
    if (typeof globalThis !== "undefined" && globalThis.__INFERNUX_DOCS_SEARCH_TEST__) {
        globalThis.__infernuxDocsSearch = testApi;
    }
    if (typeof document === "undefined") return;

    const lang = document.documentElement.lang?.toLowerCase().startsWith("zh") ? "zh" : "en";
    const locale = lang === "zh" ? "zh-CN" : "en";
    const copy = {
        en: {
            title: "Search Infernux documentation",
            placeholder: "API symbol, system, workflow…",
            close: "Close documentation search",
            trigger: "Search documentation",
            loading: "Loading documentation indexes…",
            ready: "Search the selected language, or narrow the layer and status to browse.",
            empty: "No documentation matches this query and filter set.",
            failed: "Documentation search is temporarily unavailable.",
            release: (version) => `Documented release ${version}`,
            results: (count, shown) => shown < count ? `Showing ${shown} of ${count} results` : `${count} result${count === 1 ? "" : "s"}`,
            language: { en: "English", "zh-CN": "中文" },
            filters: {
                language: "Language",
                layer: "Content layer",
                state: "Stability",
                allLanguages: "All languages",
                allLayers: "All layers",
                allStates: "All states",
                release: "Search release scope"
            }
        },
        zh: {
            title: "搜索 Infernux 文档",
            placeholder: "API 符号、系统、工作流…",
            close: "关闭文档搜索",
            trigger: "搜索文档",
            loading: "正在加载文档索引…",
            ready: "搜索所选语言，或按层级和状态直接浏览。",
            empty: "没有匹配当前查询与筛选条件的文档。",
            failed: "文档搜索暂时不可用。",
            release: (version) => `文档版本 ${version}`,
            results: (count, shown) => shown < count ? `显示 ${shown} / ${count} 条结果` : `${count} 条结果`,
            language: { en: "English", "zh-CN": "中文" },
            filters: {
                language: "语言",
                layer: "内容层级",
                state: "稳定性",
                allLanguages: "全部语言",
                allLayers: "全部层级",
                allStates: "全部状态",
                release: "检索版本范围"
            }
        }
    }[lang];

    const trigger = document.querySelector("[data-docs-search-trigger]");
    const dialog = document.getElementById("docs-search-dialog");
    const input = document.getElementById("docs-search-input");
    const filterHost = document.getElementById("docs-search-filters");
    const status = document.getElementById("docs-search-status");
    const results = document.getElementById("docs-search-results");
    if (!trigger || !dialog || !input || !filterHost || !status || !results) return;

    function createFilter(id, labelText, options, selectedValue = "all") {
        const label = document.createElement("label");
        label.className = "docs-search-filter";
        label.htmlFor = id;
        const caption = document.createElement("span");
        caption.textContent = labelText;
        const select = document.createElement("select");
        select.id = id;
        for (const [value, text] of options) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            option.selected = value === selectedValue;
            select.appendChild(option);
        }
        label.append(caption, select);
        filterHost.appendChild(label);
        return select;
    }

    const languageFilter = createFilter("docs-search-language", copy.filters.language, [
        ["en", "English"], ["zh-CN", "中文"], ["all", copy.filters.allLanguages]
    ], locale);
    const layerFilter = createFilter("docs-search-layer", copy.filters.layer, [
        ["all", copy.filters.allLayers], ["learn", "Learn"], ["manual", "Manual"], ["architecture", "Architecture"], ["api", "API"]
    ]);
    const statusFilter = createFilter("docs-search-state", copy.filters.state, [
        ["all", copy.filters.allStates], ["stable", "Stable"], ["preview", "Preview"], ["experimental", "Experimental"], ["deprecated", "Deprecated"]
    ]);
    const releaseScope = document.createElement("p");
    releaseScope.className = "docs-search-release";
    releaseScope.id = "docs-search-release";
    releaseScope.setAttribute("aria-label", copy.filters.release);
    filterHost.appendChild(releaseScope);

    trigger.setAttribute("aria-label", copy.trigger);
    dialog.querySelector("h2").textContent = copy.title;
    input.placeholder = copy.placeholder;
    dialog.querySelector("[data-docs-search-close]").setAttribute("aria-label", copy.close);

    let searchModelPromise;
    let previousFocus;

    function loadSearchModel() {
        if (!searchModelPromise) {
            searchModelPromise = Promise.all([
                fetch("/api-index.json").then((response) => {
                    if (!response.ok) throw new Error(`API index HTTP ${response.status}`);
                    return response.json();
                }),
                fetch("/docs-index.json").then((response) => {
                    if (!response.ok) throw new Error(`Docs index HTTP ${response.status}`);
                    return response.json();
                })
            ]).then(([apiIndex, docsIndex]) => buildSearchModel(apiIndex, docsIndex));
        }
        return searchModelPromise;
    }

    function resultEyebrow(item) {
        const language = copy.language[item.language] || item.language;
        if (item.layer === "api") return `API · ${item.kind} · ${item.module} · ${language}`;
        return `${item.layer} · ${language}`;
    }

    function render(model) {
        results.replaceChildren();
        releaseScope.textContent = copy.release(model.release);
        const outcome = search(model, {
            query: input.value,
            language: languageFilter.value,
            layer: layerFilter.value,
            status: statusFilter.value,
            locale
        });
        const facetActive = layerFilter.value !== "all" || statusFilter.value !== "all";
        if (!input.value.trim() && !facetActive) {
            status.textContent = copy.ready;
            return;
        }
        status.textContent = outcome.total ? copy.results(outcome.total, outcome.matches.length) : copy.empty;
        for (const { item } of outcome.matches) {
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
            eyebrow.textContent = resultEyebrow(item);
            const summary = document.createElement("p");
            summary.textContent = item.summary || item.title;
            link.append(top, eyebrow, summary);
            results.appendChild(link);
        }
    }

    function renderFromCurrentState() {
        loadSearchModel().then(render).catch(() => {});
    }

    function openSearch() {
        if (!dialog.hidden) return;
        previousFocus = document.activeElement;
        dialog.hidden = false;
        document.body.classList.add("docs-search-open");
        trigger.setAttribute("aria-expanded", "true");
        status.textContent = copy.loading;
        input.focus();
        loadSearchModel().then(render).catch((error) => {
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
    input.addEventListener("input", renderFromCurrentState);
    for (const filter of [languageFilter, layerFilter, statusFilter]) filter.addEventListener("change", renderFromCurrentState);
    dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeSearch();
        }
        if (event.key === "Tab") {
            const focusable = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]')].filter((element) => element.offsetParent !== null);
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
        const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
        if ((event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
            event.preventDefault();
            openSearch();
        }
    });
})();

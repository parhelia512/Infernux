const wikiUiText = {
    en: {
        loading: "Loading Markdown guides...",
        empty: "No hand-written Markdown guides were found yet.",
        noResults: "No guides match your search or filter.",
        fetchError: "Failed to load the documentation indexes.",
        documents: "documents",
        allFilters: "All documents",
        allLayers: "All layers",
        allStatuses: "All statuses",
        allCategories: "All Categories",
        since: "Since",
        verified: "Verified",
        showing: "Showing",
        of: "of",
        ranked: "ranked by relevance",
        shortcut: "Press / to focus search; Escape clears it."
    },
    zh: {
        loading: "正在加载 Markdown 指南...",
        empty: "还没有找到手写的 Markdown 指南。",
        noResults: "没有匹配搜索或过滤条件的指南。",
        fetchError: "加载文档索引失败。",
        documents: "篇文档",
        allFilters: "全部文档",
        allLayers: "全部层级",
        allStatuses: "全部状态",
        allCategories: "全部分类",
        since: "始于",
        verified: "验证于",
        showing: "显示",
        of: "共",
        ranked: "按相关性排序",
        shortcut: "按 / 聚焦搜索，按 Escape 清空。"
    },
};

let wikiDocsManifestPromise = null;
let allDocs = [];
let apiDocs = [];
let currentSearchQuery = "";
let currentSelectedLayer = null;
let currentSelectedStatus = null;
let currentSelectedCategory = null;
let currentSelectedTag = null;

function getWikiLang() {
    return document.documentElement.lang && document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function getWikiText(key) {
    return wikiUiText[getWikiLang()][key];
}

function getWikiGroupTitle(groupKey, fallback) {
    const titles = {
        en: { learn: "Learn", manual: "Manual", architecture: "Architecture", api: "API Reference" },
        zh: { learn: "学习", manual: "手册", architecture: "架构", api: "API 参考" }
    };
    return titles[getWikiLang()][groupKey] || fallback;
}

function getWikiStatusLabel(status) {
    const labels = {
        en: { stable: "Stable", preview: "Preview", experimental: "Experimental", deprecated: "Deprecated" },
        zh: { stable: "稳定", preview: "预览", experimental: "实验性", deprecated: "已弃用" }
    };
    return labels[getWikiLang()][status] || status;
}

function loadWikiDocsManifest() {
    if (!wikiDocsManifestPromise) {
        const catalogUrl = document.querySelector('meta[name="infernux-wiki-catalog"]')?.content || "assets/wiki-docs.json";
        wikiDocsManifestPromise = Promise.all([
            fetch(catalogUrl).then((response) => {
                if (!response.ok) throw new Error(`Wiki catalog HTTP ${response.status}`);
                return response.json();
            }),
            fetch("api-index.json").then((response) => {
                if (!response.ok) throw new Error(`API index HTTP ${response.status}`);
                return response.json();
            })
        ]).then(([catalog, apiIndex]) => ({ catalog, apiIndex }));
    }
    return wikiDocsManifestPromise;
}

function createDocsCard(doc) {
    const card = document.createElement("a");
    card.className = "hub-card docs-library-card";
    card.href = doc.url;

    const mark = document.createElement("div");
    mark.className = "card-mark";
    const markIcon = document.createElement("i");
    markIcon.className = "fas fa-file-lines";
    markIcon.setAttribute("aria-hidden", "true");
    mark.appendChild(markIcon);

    const title = document.createElement("h3");
    title.textContent = doc.title;

    const summary = document.createElement("p");
    summary.textContent = doc.summary || doc.title;

    const path = document.createElement("small");
    path.className = "docs-library-path";
    path.textContent = doc.source;

    card.append(mark, title, summary);

    if (doc.meta) {
        const metadata = document.createElement("div");
        metadata.className = "wiki-card-metadata";

        if (doc.meta.status) {
            const status = document.createElement("span");
            status.className = `wiki-doc-status wiki-doc-status-${doc.meta.status}`;
            status.textContent = getWikiStatusLabel(doc.meta.status);
            metadata.appendChild(status);
        }
        if (doc.meta.since) {
            const since = document.createElement("span");
            since.textContent = `${getWikiText("since")} ${doc.meta.since}`;
            metadata.appendChild(since);
        }
        if (doc.meta.last_verified) {
            const verified = document.createElement("span");
            verified.textContent = `${getWikiText("verified")} ${doc.meta.last_verified}`;
            metadata.appendChild(verified);
        }
        if (metadata.childElementCount > 0) card.appendChild(metadata);
    }
    
    if (doc.meta && doc.meta.tags && doc.meta.tags.length > 0) {
        const tagsContainer = document.createElement("div");
        tagsContainer.className = "card-tags";
        doc.meta.tags.forEach(tag => {
            const t = document.createElement("span");
            t.className = "wiki-tag";
            t.textContent = tag;
            tagsContainer.appendChild(t);
        });
        card.appendChild(tagsContainer);
    }
    
    card.appendChild(path);
    return card;
}

function renderTagsFilter() {
    const filterContainer = document.getElementById("wiki-tags-filter");
    if (!filterContainer) return;
    
    filterContainer.replaceChildren();
    if (allDocs.length === 0) return;
    
    const layers = new Set();
    const statuses = new Set();
    const categories = new Set();
    const tags = new Set();
    
    allDocs.forEach(doc => {
        if (doc.groupKey) layers.add(doc.groupKey);
        if (doc.meta) {
            if (doc.meta.status) statuses.add(doc.meta.status);
            if (doc.meta.category) categories.add(doc.meta.category);
            if (doc.meta.tags) {
                doc.meta.tags.forEach(t => tags.add(t));
            }
        }
    });

    if (layers.size === 0 && statuses.size === 0 && categories.size === 0 && tags.size === 0) return;

    const layerRow = document.createElement("div");
    layerRow.className = "wiki-filter-row wiki-layers";
    layerRow.setAttribute("aria-label", getWikiText("allLayers"));

    const allBtn = document.createElement("button");
    const hasActiveFilter = currentSelectedLayer || currentSelectedStatus || currentSelectedCategory || currentSelectedTag;
    allBtn.type = "button";
    allBtn.className = "wiki-category-btn" + (!hasActiveFilter ? " active" : "");
    allBtn.setAttribute("aria-pressed", String(!hasActiveFilter));
    allBtn.textContent = getWikiText("allFilters");
    allBtn.onclick = () => {
        currentSelectedLayer = null;
        currentSelectedStatus = null;
        currentSelectedCategory = null;
        currentSelectedTag = null;
        syncWikiUrlState();
        renderWikiDocsCatalog();
    };
    layerRow.appendChild(allBtn);

    Array.from(layers).sort().forEach(layer => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wiki-category-btn wiki-layer-btn" + (currentSelectedLayer === layer ? " active" : "");
        btn.setAttribute("aria-pressed", String(currentSelectedLayer === layer));
        btn.textContent = getWikiGroupTitle(layer, layer);
        btn.onclick = () => {
            currentSelectedLayer = (currentSelectedLayer === layer) ? null : layer;
            syncWikiUrlState();
            renderWikiDocsCatalog();
        };
        layerRow.appendChild(btn);
    });
    filterContainer.appendChild(layerRow);

    if (statuses.size > 0) {
        const statusRow = document.createElement("div");
        statusRow.className = "wiki-filter-row wiki-statuses";
        statusRow.setAttribute("aria-label", getWikiText("allStatuses"));
        Array.from(statuses).sort().forEach(status => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `wiki-status-btn wiki-status-btn-${status}` + (currentSelectedStatus === status ? " active" : "");
            btn.setAttribute("aria-pressed", String(currentSelectedStatus === status));
            btn.textContent = getWikiStatusLabel(status);
            btn.onclick = () => {
                currentSelectedStatus = (currentSelectedStatus === status) ? null : status;
                syncWikiUrlState();
                renderWikiDocsCatalog();
            };
            statusRow.appendChild(btn);
        });
        filterContainer.appendChild(statusRow);
    }
    
    if (categories.size > 0) {
        const catRow = document.createElement("div");
        catRow.className = "wiki-filter-row wiki-categories";

        Array.from(categories).sort().forEach(cat => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "wiki-category-btn" + (currentSelectedCategory === cat ? " active" : "");
            btn.setAttribute("aria-pressed", String(currentSelectedCategory === cat));
            btn.textContent = cat;
            btn.onclick = () => {
                currentSelectedCategory = (currentSelectedCategory === cat) ? null : cat;
                syncWikiUrlState();
                renderWikiDocsCatalog();
            };
            catRow.appendChild(btn);
        });
        filterContainer.appendChild(catRow);
    }
    
    if (tags.size > 0) {
        const tagRow = document.createElement("div");
        tagRow.className = "wiki-filter-row wiki-tags";

        Array.from(tags).sort().forEach(tag => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "wiki-tag" + (currentSelectedTag === tag ? " active" : "");
            btn.setAttribute("aria-pressed", String(currentSelectedTag === tag));
            btn.textContent = "#" + tag;
            btn.onclick = () => {
                currentSelectedTag = (currentSelectedTag === tag) ? null : tag;
                syncWikiUrlState();
                renderWikiDocsCatalog();
            };
            tagRow.appendChild(btn);
        });
        filterContainer.appendChild(tagRow);
    }
}

function normalized(value) {
    return String(value || "").toLocaleLowerCase(getWikiLang() === "zh" ? "zh-CN" : "en");
}

function searchScore(doc, rawQuery) {
    const query = normalized(rawQuery).replace(/\s+/g, " ").trim();
    if (!query) return 0;

    const title = normalized(doc.title);
    const summary = normalized(doc.summary);
    const content = normalized(doc.content);
    const source = normalized(doc.source);
    const layer = normalized(doc.groupKey);
    const category = normalized(doc.meta?.category);
    const status = normalized(doc.meta?.status);
    const since = normalized(doc.meta?.since);
    const verified = normalized(doc.meta?.last_verified);
    const audience = normalized(doc.meta?.audience);
    const tags = (doc.meta?.tags || []).map(normalized);
    const searchable = [title, summary, content, source, layer, category, status, since, verified, audience, ...tags].join(" ");
    const tokens = [...new Set(query.split(" ").filter(Boolean))];
    if (!tokens.every((token) => searchable.includes(token))) return -1;

    let score = 0;
    if (title === query) score += 240;
    else if (title.startsWith(query)) score += 160;
    else if (title.includes(query)) score += 110;
    if (summary.includes(query)) score += 45;
    if (source.includes(query)) score += 30;
    if (category.includes(query)) score += 40;
    if (layer === query) score += 90;
    if (status === query) score += 80;
    if (tags.some((tag) => tag === query)) score += 100;

    tokens.forEach((token) => {
        if (title.startsWith(token)) score += 65;
        else if (title.includes(token)) score += 45;
        if (tags.some((tag) => tag === token)) score += 35;
        else if (tags.some((tag) => tag.includes(token))) score += 20;
        if (category.includes(token)) score += 15;
        if (layer.includes(token)) score += 20;
        if (status.includes(token)) score += 20;
        if (since.includes(token) || verified.includes(token)) score += 10;
        if (audience.includes(token)) score += 8;
        if (summary.includes(token)) score += 12;
        if (source.includes(token)) score += 8;
        if (content.includes(token)) score += 2;
    });
    return score;
}

function applyFilters() {
    const candidates = currentSearchQuery ? [...allDocs, ...apiDocs] : allDocs;
    return candidates.map((doc) => ({ doc, score: searchScore(doc, currentSearchQuery) })).filter(({ doc, score }) => {
        if (currentSearchQuery && score < 0) return false;
        if (currentSelectedLayer && doc.groupKey !== currentSelectedLayer) return false;
        if (currentSelectedStatus && doc.meta?.status !== currentSelectedStatus) return false;
        if (currentSelectedCategory) {
            if (!doc.meta || doc.meta.category !== currentSelectedCategory) return false;
        }
        
        if (currentSelectedTag) {
            if (!doc.meta || !doc.meta.tags || !doc.meta.tags.includes(currentSelectedTag)) return false;
        }
        
        return true;
    }).sort((left, right) => {
        if (currentSearchQuery && right.score !== left.score) return right.score - left.score;
        return left.doc.title.localeCompare(right.doc.title, getWikiLang() === "zh" ? "zh-CN" : "en");
    }).map(({ doc }) => doc);
}

function syncWikiUrlState() {
    const params = new URLSearchParams(window.location.search);
    const entries = {
        q: currentSearchQuery,
        layer: currentSelectedLayer,
        status: currentSelectedStatus,
        category: currentSelectedCategory,
        tag: currentSelectedTag
    };
    Object.entries(entries).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
    });
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
}

function restoreWikiUrlState() {
    const params = new URLSearchParams(window.location.search);
    currentSearchQuery = (params.get("q") || "").trim();
    currentSelectedLayer = params.get("layer") || null;
    currentSelectedStatus = params.get("status") || null;
    currentSelectedCategory = params.get("category") || null;
    currentSelectedTag = params.get("tag") || null;
}

function catalogStatus(filteredCount) {
    const status = document.createElement("div");
    status.className = "docs-library-status docs-library-results-status";
    const ranking = currentSearchQuery ? ` · ${getWikiText("ranked")}` : "";
    const candidateCount = currentSearchQuery ? allDocs.length + apiDocs.length : allDocs.length;
    status.textContent = `${getWikiText("showing")} ${filteredCount} ${getWikiText("of")} ${candidateCount} ${getWikiText("documents")}${ranking}`;
    return status;
}

function renderWikiDocsCatalog() {
    const host = document.getElementById("docs-library-groups");
    const status = document.getElementById("docs-library-status");
    if (!host) return;

    if (allDocs.length === 0 && status) {
        status.textContent = getWikiText("loading");
    }

    loadWikiDocsManifest()
        .then(({ catalog, apiIndex }) => {
            allDocs = Array.isArray(catalog[getWikiLang()]) ? catalog[getWikiLang()] : [];
            const language = getWikiLang() === "zh" ? "zh-CN" : "en";
            apiDocs = (apiIndex.symbols || []).filter((item) => item.language === language).map((item) => ({
                groupKey: "api",
                groupTitle: getWikiGroupTitle("api", "API"),
                title: item.symbol,
                summary: item.summary || item.signatures?.[0] || item.symbol,
                content: [item.module, item.kind, ...(item.signatures || [])].join(" "),
                source: item.signatures?.[0] || item.module,
                url: item.url,
                meta: {
                    status: item.status,
                    since: item.since,
                    category: item.module,
                    tags: [item.kind].filter(Boolean),
                    audience: ["api"]
                }
            }));
            host.replaceChildren();

            const validCategories = new Set(allDocs.map((doc) => doc.meta?.category).filter(Boolean));
            const validTags = new Set(allDocs.flatMap((doc) => doc.meta?.tags || []));
            const validLayers = new Set(allDocs.map((doc) => doc.groupKey).filter(Boolean));
            const validStatuses = new Set(allDocs.map((doc) => doc.meta?.status).filter(Boolean));
            if (currentSelectedLayer && !validLayers.has(currentSelectedLayer)) currentSelectedLayer = null;
            if (currentSelectedStatus && !validStatuses.has(currentSelectedStatus)) currentSelectedStatus = null;
            if (currentSelectedCategory && !validCategories.has(currentSelectedCategory)) currentSelectedCategory = null;
            if (currentSelectedTag && !validTags.has(currentSelectedTag)) currentSelectedTag = null;
            renderTagsFilter();

            if (!allDocs.length) {
                const empty = document.createElement("div");
                empty.className = "docs-library-empty";
                empty.textContent = getWikiText("empty");
                host.appendChild(empty);
                return;
            }

            const filteredDocs = applyFilters();
            host.appendChild(catalogStatus(filteredDocs.length));
            
            if (!filteredDocs.length) {
                const nores = document.createElement("div");
                nores.className = "docs-library-empty";
                nores.textContent = getWikiText("noResults");
                host.appendChild(nores);
                return;
            }

            const groups = new Map();
            filteredDocs.forEach((doc) => {
                const groupKey = currentSelectedCategory || doc.groupKey;
                const groupTitle = currentSelectedCategory || getWikiGroupTitle(doc.groupKey, doc.groupTitle);
                
                if (!groups.has(groupKey)) {
                    groups.set(groupKey, { title: groupTitle, items: [] });
                }
                groups.get(groupKey).items.push(doc);
            });

            groups.forEach((group) => {
                const section = document.createElement("section");
                section.className = "docs-library-group";

                const head = document.createElement("div");
                head.className = "docs-library-group-head";

                const heading = document.createElement("h3");
                heading.textContent = group.title;

                const meta = document.createElement("div");
                meta.className = "docs-library-group-meta";
                meta.textContent = `${group.items.length} ${getWikiText("documents")}`;

                head.append(heading, meta);

                const grid = document.createElement("div");
                grid.className = "docs-library-grid";
                group.items.forEach((doc) => {
                    grid.appendChild(createDocsCard(doc));
                });

                section.append(head, grid);
                host.appendChild(section);
            });
        })
        .catch((err) => {
            console.error(err);
            host.querySelectorAll(".docs-library-runtime-error").forEach((item) => item.remove());
            const error = document.createElement("div");
            error.className = "docs-library-empty docs-library-runtime-error";
            error.setAttribute("role", "status");
            error.textContent = getWikiText("fetchError");
            host.prepend(error);
        });
}

document.addEventListener("DOMContentLoaded", () => {
    restoreWikiUrlState();
    const searchInput = document.getElementById("wiki-search-input");
    if (searchInput) {
        searchInput.value = currentSearchQuery;
        searchInput.title = getWikiText("shortcut");
        searchInput.addEventListener("input", (e) => {
            currentSearchQuery = e.target.value.trim();
            syncWikiUrlState();
            renderWikiDocsCatalog();
        });
        searchInput.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && searchInput.value) {
                searchInput.value = "";
                currentSearchQuery = "";
                syncWikiUrlState();
                renderWikiDocsCatalog();
            }
        });
    }
    document.addEventListener("keydown", (event) => {
        const target = event.target;
        const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
        if (event.key === "/" && !isTyping && !event.ctrlKey && !event.metaKey && !event.altKey && searchInput) {
            event.preventDefault();
            searchInput.focus();
        }
    });
    const filters = document.getElementById("wiki-tags-filter");
    if (filters) filters.setAttribute("aria-label", getWikiLang() === "zh" ? "文档筛选" : "Documentation filters");
    renderWikiDocsCatalog();
});
document.addEventListener("site:language-changed", () => {
    currentSearchQuery = "";
    currentSelectedLayer = null;
    currentSelectedStatus = null;
    currentSelectedCategory = null;
    currentSelectedTag = null;
    const searchInput = document.getElementById("wiki-search-input");
    if (searchInput) {
        searchInput.value = "";
        searchInput.title = getWikiText("shortcut");
    }
    syncWikiUrlState();
    const filters = document.getElementById("wiki-tags-filter");
    if (filters) filters.setAttribute("aria-label", getWikiLang() === "zh" ? "文档筛选" : "Documentation filters");
    renderWikiDocsCatalog();
});


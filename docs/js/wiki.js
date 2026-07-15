const wikiUiText = {
    en: {
        loading: "Loading Markdown guides...",
        empty: "No hand-written Markdown guides were found yet.",
        noResults: "No guides match your search or filter.",
        fetchError: "Failed to load the Markdown guide catalog.",
        documents: "documents",
        allCategories: "All Categories"
    },
    zh: {
        loading: "正在加载 Markdown 指南...",
        empty: "还没有找到手写的 Markdown 指南。",
        noResults: "没有匹配搜索或过滤条件的指南。",
        fetchError: "加载 Markdown 指南目录失败。",
        documents: "篇文档",
        allCategories: "全部分类"
    },
};

let wikiDocsManifestPromise = null;
let allDocs = [];
let currentSearchQuery = "";
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
        en: { learn: "Learn", manual: "Manual", architecture: "Architecture" },
        zh: { learn: "学习", manual: "手册", architecture: "架构" }
    };
    return titles[getWikiLang()][groupKey] || fallback;
}

function loadWikiDocsManifest() {
    if (!wikiDocsManifestPromise) {
        wikiDocsManifestPromise = fetch("assets/wiki-docs.json?v=7").then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        });
    }
    return wikiDocsManifestPromise;
}

function createDocsCard(doc) {
    const card = document.createElement("a");
    card.className = "hub-card docs-library-card";
    card.href = doc.url;

    const mark = document.createElement("div");
    mark.className = "card-mark";
    mark.innerHTML = "<i class=\"fas fa-file-lines\"></i>";

    const title = document.createElement("h3");
    title.textContent = doc.title;

    const summary = document.createElement("p");
    summary.textContent = doc.summary || doc.title;

    const path = document.createElement("small");
    path.className = "docs-library-path";
    path.textContent = doc.source;

    card.append(mark, title, summary);
    
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
    
    filterContainer.innerHTML = "";
    if (allDocs.length === 0) return;
    
    const categories = new Set();
    const tags = new Set();
    
    allDocs.forEach(doc => {
        if (doc.meta) {
            if (doc.meta.category) categories.add(doc.meta.category);
            if (doc.meta.tags) {
                doc.meta.tags.forEach(t => tags.add(t));
            }
        }
    });

    if (categories.size === 0 && tags.size === 0) return;
    
    if (categories.size > 0) {
        const catRow = document.createElement("div");
        catRow.className = "wiki-filter-row wiki-categories";

        const allBtn = document.createElement("button");
        allBtn.type = "button";
        allBtn.className = "wiki-category-btn" + (!currentSelectedCategory && !currentSelectedTag ? " active" : "");
        allBtn.setAttribute("aria-pressed", String(!currentSelectedCategory && !currentSelectedTag));
        allBtn.textContent = getWikiText("allCategories");
        allBtn.onclick = () => {
            currentSelectedCategory = null;
            currentSelectedTag = null;
            renderWikiDocsCatalog();
        };
        catRow.appendChild(allBtn);
        
        Array.from(categories).sort().forEach(cat => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "wiki-category-btn" + (currentSelectedCategory === cat ? " active" : "");
            btn.setAttribute("aria-pressed", String(currentSelectedCategory === cat));
            btn.textContent = cat;
            btn.onclick = () => {
                currentSelectedCategory = (currentSelectedCategory === cat) ? null : cat;
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
                renderWikiDocsCatalog();
            };
            tagRow.appendChild(btn);
        });
        filterContainer.appendChild(tagRow);
    }
}

function applyFilters() {
    return allDocs.filter(doc => {
        if (currentSearchQuery) {
            const query = currentSearchQuery.toLowerCase();
            const titleMatch = doc.title && doc.title.toLowerCase().includes(query);
            const summaryMatch = doc.summary && doc.summary.toLowerCase().includes(query);
            const contentMatch = doc.content && doc.content.toLowerCase().includes(query);
            if (!titleMatch && !summaryMatch && !contentMatch) return false;
        }
        
        if (currentSelectedCategory) {
            if (!doc.meta || doc.meta.category !== currentSelectedCategory) return false;
        }
        
        if (currentSelectedTag) {
            if (!doc.meta || !doc.meta.tags || !doc.meta.tags.includes(currentSelectedTag)) return false;
        }
        
        return true;
    });
}

function renderWikiDocsCatalog() {
    const host = document.getElementById("docs-library-groups");
    const status = document.getElementById("docs-library-status");
    if (!host) return;

    if (allDocs.length === 0 && status) {
        status.textContent = getWikiText("loading");
    }

    loadWikiDocsManifest()
        .then((manifest) => {
            allDocs = Array.isArray(manifest[getWikiLang()]) ? manifest[getWikiLang()] : [];
            host.innerHTML = "";
            renderTagsFilter();

            if (!allDocs.length) {
                const empty = document.createElement("div");
                empty.className = "docs-library-empty";
                empty.textContent = getWikiText("empty");
                host.appendChild(empty);
                return;
            }

            const filteredDocs = applyFilters();
            
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
            host.innerHTML = "";
            const error = document.createElement("div");
            error.className = "docs-library-empty";
            error.textContent = getWikiText("fetchError");
            host.appendChild(error);
        });
}

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("wiki-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            currentSearchQuery = e.target.value.trim();
            renderWikiDocsCatalog();
        });
    }
    const filters = document.getElementById("wiki-tags-filter");
    if (filters) filters.setAttribute("aria-label", getWikiLang() === "zh" ? "文档筛选" : "Documentation filters");
    renderWikiDocsCatalog();
});
document.addEventListener("site:language-changed", () => {
    currentSearchQuery = "";
    currentSelectedCategory = null;
    currentSelectedTag = null;
    const searchInput = document.getElementById("wiki-search-input");
    if (searchInput) searchInput.value = "";
    const filters = document.getElementById("wiki-tags-filter");
    if (filters) filters.setAttribute("aria-label", getWikiLang() === "zh" ? "文档筛选" : "Documentation filters");
    renderWikiDocsCatalog();
});


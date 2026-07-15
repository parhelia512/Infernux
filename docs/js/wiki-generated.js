(function () {
    "use strict";

    let documentModelPromise = null;

    function isChinesePage() {
        return document.documentElement.lang?.toLowerCase().startsWith("zh") || false;
    }

    function compactText(value) {
        return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    }

    function buildProvenanceFacts(manifest, language) {
        const zh = compactText(language).toLowerCase().startsWith("zh");
        const release = compactText(manifest?.documented_release) || (zh ? "未记录" : "not recorded");
        const rawStatus = compactText(manifest?.release_status).toLowerCase();
        const statusLabels = zh
            ? { stable: "稳定", preview: "预览", experimental: "实验性", deprecated: "已弃用" }
            : { stable: "Stable", preview: "Preview", experimental: "Experimental", deprecated: "Deprecated" };
        const releaseStatus = statusLabels[rawStatus] || rawStatus || (zh ? "状态未记录" : "status not recorded");
        const build = manifest?.build || {};
        const commit = compactText(build.source_commit).toLowerCase();
        const sourceUrl = compactText(build.source_url);
        const expectedSourceUrl = /^[a-f0-9]{40}$/.test(commit)
            ? `https://github.com/ChenlizheMe/Infernux/commit/${commit}`
            : "";
        const stamped = build.status === "stamped" && expectedSourceUrl && sourceUrl === expectedSourceUrl;
        const unstamped = build.status === "unstamped";
        const generatedDate = new Date(compactText(build.generated_at));
        const generatedAt = !Number.isNaN(generatedDate.getTime())
            ? `${generatedDate.toISOString().slice(0, 16).replace("T", " ")} UTC`
            : "";
        const state = stamped && generatedAt ? "stamped" : (unstamped ? "unstamped" : "unavailable");
        const sourceValue = stamped
            ? commit.slice(0, 12)
            : (unstamped
                ? (zh ? "本地预览 · 未签名" : "Local preview · unstamped")
                : (zh ? "发布来源不可用" : "Release provenance unavailable"));
        const generatedValue = generatedAt || (unstamped
            ? (zh ? "未从发布 commit 生成" : "Not generated from a release commit")
            : (zh ? "生成时间不可用" : "Generation time unavailable"));

        return {
            state,
            items: [
                { key: "release", label: zh ? "文档版本" : "Documented release", value: `${release} · ${releaseStatus}` },
                { key: "source", label: zh ? "构建来源" : "Build source", value: sourceValue, url: stamped ? sourceUrl : "" },
                { key: "generated", label: zh ? "生成时间" : "Generated", value: generatedValue }
            ]
        };
    }

    function normalizeDocsPath(value) {
        try {
            const path = new URL(value, "https://infernux-engine.com").pathname.replace(/\/+$/, "");
            return path || "/";
        } catch {
            return "";
        }
    }

    function decodeHash(value) {
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    function canonicalPageUrl(path, manifest) {
        const declared = document.querySelector('link[rel="canonical"]')?.href;
        if (declared) return declared;
        const origin = compactText(manifest?.canonical_origin) || "https://infernux-engine.com";
        return `${origin}${path}`;
    }

    async function fetchJson(url) {
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
        return response.json();
    }

    function findContextEntry(index, path, apiPage) {
        const entries = apiPage ? index?.symbols : index?.documents;
        if (!Array.isArray(entries)) return null;
        return entries.find((entry) => normalizeDocsPath(entry.url) === path) || null;
    }

    function normalizeOutlineEntries(items) {
        const seen = new Set();
        const entries = [];
        for (const item of Array.isArray(items) ? items : []) {
            const id = compactText(item?.id);
            const text = compactText(item?.text).replace(/\s*¶\s*$/, "");
            const level = Number(item?.level);
            if (!id || !text || ![2, 3].includes(level) || seen.has(id)) continue;
            seen.add(id);
            entries.push({ id, text, level });
        }
        return entries;
    }

    function findDocumentNeighbors(index, entry, apiPage) {
        if (!entry) return { previous: null, next: null };
        const entries = apiPage ? index?.symbols : index?.documents;
        if (!Array.isArray(entries)) return { previous: null, next: null };
        const group = entries.filter((candidate) => candidate.language === entry.language && (apiPage
            ? candidate.module === entry.module
            : candidate.layer === entry.layer));
        group.sort((left, right) => {
            if (!apiPage) {
                const leftOrder = Number.isInteger(left.navigation_order) ? left.navigation_order : Number.MAX_SAFE_INTEGER;
                const rightOrder = Number.isInteger(right.navigation_order) ? right.navigation_order : Number.MAX_SAFE_INTEGER;
                if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            }
            const leftLabel = compactText(apiPage ? left.symbol : left.title);
            const rightLabel = compactText(apiPage ? right.symbol : right.title);
            return leftLabel.localeCompare(rightLabel, entry.language?.startsWith("zh") ? "zh-CN" : "en");
        });
        const currentIndex = group.findIndex((candidate) => candidate.id === entry.id);
        return {
            previous: currentIndex > 0 ? group[currentIndex - 1] : null,
            next: currentIndex >= 0 && currentIndex < group.length - 1 ? group[currentIndex + 1] : null
        };
    }

    function buildFeedbackIssueUrl({ entry, manifest, path, pageTitle }) {
        const zh = compactText(entry?.language).toLowerCase().startsWith("zh");
        const origin = compactText(manifest?.canonical_origin) || "https://infernux-engine.com";
        const canonical = compactText(entry?.canonical_url) || `${origin}${normalizeDocsPath(path)}`;
        const title = compactText(entry?.title || entry?.symbol || pageTitle) || "Infernux documentation";
        const release = compactText(manifest?.documented_release) || "not recorded";
        const status = compactText(entry?.status) || compactText(manifest?.release_status) || "not recorded";
        const verified = compactText(entry?.last_verified) || compactText(manifest?.last_verified) || "not recorded";
        const build = manifest?.build || {};
        const buildEvidence = build.status === "stamped" && compactText(build.source_commit)
            ? compactText(build.source_commit)
            : "unstamped local preview";
        const prompt = zh
            ? "<!-- 请在这里说明错误、缺失信息或难以理解之处。 -->"
            : "<!-- Explain what is incorrect, missing, or difficult to understand. -->";
        const body = [
            "## Documentation feedback",
            "",
            prompt,
            "",
            "## Page evidence",
            "",
            `- Page: ${canonical}`,
            `- Documented release: ${release}`,
            `- Status: ${status}`,
            `- Last verified: ${verified}`,
            `- Documentation build: ${buildEvidence}`
        ].join("\n");
        const issue = new URL("https://github.com/ChenlizheMe/Infernux/issues/new");
        issue.searchParams.set("title", `Docs: ${title}`);
        issue.searchParams.set("body", body);
        return issue.href;
    }

    function contextIndexUrl(manifest, apiPage) {
        const route = apiPage ? manifest?.indexes?.api : manifest?.indexes?.curated_docs;
        return route || (apiPage ? "/api-index.json" : "/docs-index.json");
    }

    function markdownList(values, fallback) {
        const items = (Array.isArray(values) ? values : []).map(compactText).filter(Boolean);
        return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
    }

    function buildAgentContext({ entry, manifest, path, apiPage, pageTitle, language }) {
        const zh = language.toLowerCase().startsWith("zh");
        const missing = zh ? "未记录" : "not recorded";
        const origin = compactText(manifest?.canonical_origin) || "https://infernux-engine.com";
        const release = compactText(manifest?.documented_release) || missing;
        const title = compactText(entry?.title || entry?.symbol || pageTitle) || "Infernux documentation";
        const canonical = compactText(entry?.canonical_url) || canonicalPageUrl(path, manifest);
        const status = compactText(entry?.status) || compactText(manifest?.release_status) || missing;
        const since = compactText(entry?.since) || missing;
        const verified = compactText(entry?.last_verified) || compactText(manifest?.last_verified) || missing;
        const layer = apiPage ? "api" : compactText(entry?.layer) || "documentation";
        const summary = compactText(entry?.summary) || (zh
            ? "请阅读权威页面正文，并以机器索引和当前发布版本核对细节。"
            : "Read the canonical page body and verify details against the machine index and documented release.");
        const build = manifest?.build || {};
        const buildEvidence = build.status === "stamped" && compactText(build.source_commit)
            ? `${build.source_commit}${compactText(build.source_url) ? ` (${build.source_url})` : ""}`
            : (zh ? "unstamped（本地预览，不可作为发布来源证明）" : "unstamped (local preview; not release provenance)");
        const sources = Array.isArray(entry?.source_paths) && entry.source_paths.length
            ? entry.source_paths
            : [entry?.source].filter(Boolean);
        const signatures = Array.isArray(entry?.signatures) ? entry.signatures : [];
        const trustRules = Array.isArray(manifest?.trust_rules) ? manifest.trust_rules : [];
        const indexRoute = contextIndexUrl(manifest, apiPage);
    const llmsFullRoute = manifest?.indexes?.llms_full || "/llms-full.txt";
        const learningPathsRoute = manifest?.indexes?.learning_paths || "/learning-paths.json";
        const docsHealthRoute = manifest?.indexes?.docs_health || "/docs-health.json";

        const lines = [
            "# Infernux documentation context",
            "",
            `- Title: ${title}`,
            `- Canonical URL: ${canonical}`,
            `- Language: ${compactText(entry?.language) || language}`,
            `- Layer: ${layer}`,
            `- Documented release: ${release}`,
            `- Status: ${status}`,
            `- Since: ${since}`,
            `- Last verified: ${verified}`,
            `- Build source: ${buildEvidence}`,
            "",
            "## Agent summary",
            "",
            summary
        ];

        if (apiPage) {
            const relatedDocuments = Array.isArray(entry?.related_documents)
                ? entry.related_documents.map((document) => `${compactText(document.title) || compactText(document.id)}: ${origin}${document.url}`).filter(Boolean)
                : [];
            lines.push(
                "",
                "## API identity",
                "",
                `- Symbol key: ${compactText(entry?.symbol_key) || missing}`,
                `- Kind: ${compactText(entry?.kind) || missing}`,
                `- Module: ${compactText(entry?.module) || missing}`,
                `- Example status: ${compactText(entry?.example_status) || missing}`,
                "",
                "## Recorded signatures",
                "",
                markdownList(signatures, zh ? "机器索引中未提取签名；请查阅权威页面。" : "No signature was extracted; consult the canonical page."),
                "",
                "## Related guides",
                "",
                markdownList(relatedDocuments, zh ? "没有策划文档直接引用此符号。" : "No curated document directly references this symbol.")
            );
        } else {
            lines.push(
                "",
                "## Related API",
                "",
                markdownList(entry?.related_api, zh ? "本文档没有记录直接关联的 API 符号。" : "No directly related API symbol is recorded for this document.")
            );
        }

        lines.push(
            "",
            "## Source evidence",
            "",
            markdownList(sources, zh ? "没有记录额外源码路径。" : "No additional source path is recorded."),
            "",
            "## Trust rules",
            "",
            markdownList(trustRules, zh ? "以权威页面、机器索引和当前发布版本为准。" : "Use the canonical page, machine index, and documented release as authority."),
            "",
            "## Machine-readable sources",
            "",
            `- ${origin}${indexRoute}`,
            `- ${origin}${docsHealthRoute}`,
            `- ${origin}${learningPathsRoute}`,
            `- ${origin}${llmsFullRoute}`,
            `- ${origin}/docs-manifest.json`
        );

        return `${lines.join("\n")}\n`;
    }

    function loadDocumentModel() {
        if (documentModelPromise) return documentModelPromise;
        const path = normalizeDocsPath(window.location.pathname);
        const apiPage = path.includes("/api/");
        documentModelPromise = Promise.allSettled([
            fetchJson("/docs-manifest.json"),
            fetchJson(apiPage ? "/api-index.json" : "/docs-index.json")
        ]).then(([manifestResult, indexResult]) => {
            const manifest = manifestResult.status === "fulfilled" ? manifestResult.value : {};
            const index = indexResult.status === "fulfilled" ? indexResult.value : {};
            const entry = findContextEntry(index, path, apiPage);
            const heading = document.querySelector(".api-main h1")?.textContent || document.title.replace(/\s+-\s+Infernux Documentation$/, "");
            return { entry, index, manifest, path, apiPage, pageTitle: heading, language: document.documentElement.lang || "en" };
        });
        return documentModelPromise;
    }

    function loadContextData() {
        return loadDocumentModel().then((model) => buildAgentContext(model));
    }

    function createBuildFact(item) {
        const fact = document.createElement("span");
        fact.className = "doc-build-fact";
        fact.dataset.fact = item.key;
        const label = document.createElement("small");
        label.textContent = item.label;
        const value = document.createElement(item.url ? "a" : "strong");
        value.textContent = item.value;
        if (item.url) {
            value.href = item.url;
            value.target = "_blank";
            value.rel = "noopener";
        }
        fact.append(label, value);
        return fact;
    }

    async function initializeBuildProvenance() {
        const hosts = [...document.querySelectorAll("[data-doc-build-provenance]")];
        if (!hosts.length) return;
        try {
            const model = await loadDocumentModel();
            const facts = buildProvenanceFacts(model.manifest, model.language);
            for (const host of hosts) {
                const factHost = host.querySelector("[data-doc-build-facts]");
                if (!factHost) continue;
                host.dataset.state = facts.state;
                factHost.replaceChildren(...facts.items.map(createBuildFact));
            }
        } catch (error) {
            console.warn("Infernux documentation build provenance could not be loaded.", error);
            for (const host of hosts) host.dataset.state = "unavailable";
        }
    }

    function fallbackCopy(text) {
        const field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.className = "clipboard-fallback";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("copy command was rejected");
    }

    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
        else fallbackCopy(text);
    }

    function setCopyButtonState(button, state, labels) {
        const label = button.querySelector("span");
        const icon = button.querySelector("i");
        label.textContent = labels[state];
        button.setAttribute("aria-label", labels[state]);
        button.dataset.state = state;
        icon.className = state === "success" ? "fas fa-check" : "fas fa-copy";
    }

    function initializeAgentContextCopy() {
        const button = document.querySelector("[data-doc-context-trigger]");
        if (!button) return;
        const zh = isChinesePage();
        const labels = zh
            ? { idle: "复制给 Agent", loading: "正在整理上下文", success: "Agent 上下文已复制", failure: "复制失败" }
            : { idle: "Copy for Agent", loading: "Preparing context", success: "Agent context copied", failure: "Copy failed" };
        setCopyButtonState(button, "idle", labels);
        button.addEventListener("click", async function () {
            if (button.disabled) return;
            button.disabled = true;
            setCopyButtonState(button, "loading", labels);
            try {
                await copyText(await loadContextData());
                setCopyButtonState(button, "success", labels);
            } catch (error) {
                console.warn(error);
                setCopyButtonState(button, "failure", labels);
            } finally {
                window.setTimeout(function () {
                    button.disabled = false;
                    setCopyButtonState(button, "idle", labels);
                }, 1800);
            }
        });
    }

    function trailEntryTitle(entry) {
        return compactText(entry?.title || entry?.symbol) || (isChinesePage() ? "未命名文档" : "Untitled document");
    }

    function buildTrailLink(entry, direction, labels) {
        const link = document.createElement("a");
        link.className = `doc-trail-link ${direction}`;
        link.href = entry.url;
        link.setAttribute("aria-label", `${labels[direction]}: ${trailEntryTitle(entry)}`);
        const relation = document.createElement("small");
        relation.textContent = direction === "previous" ? `← ${labels.previous}` : `${labels.next} →`;
        const title = document.createElement("strong");
        title.textContent = trailEntryTitle(entry);
        link.append(relation, title);
        return link;
    }

    async function initializeDocumentTrail() {
        const trail = document.querySelector("[data-doc-trail]");
        if (!trail) return;
        try {
            const model = await loadDocumentModel();
            if (!model.entry) return;
            const zh = isChinesePage();
            const labels = zh
                ? { previous: "上一篇", next: "下一篇", copy: "复制页面链接", copied: "页面链接已复制", copyFailed: "复制失败", report: "反馈文档问题" }
                : { previous: "Previous", next: "Next", copy: "Copy page link", copied: "Page link copied", copyFailed: "Copy failed", report: "Report docs issue" };
            const neighbors = findDocumentNeighbors(model.index, model.entry, model.apiPage);
            const actions = document.createElement("div");
            actions.className = "doc-trail-actions";

            const copy = document.createElement("button");
            copy.type = "button";
            copy.className = "doc-trail-action";
            const copyIcon = document.createElement("i");
            copyIcon.className = "fas fa-link";
            copyIcon.setAttribute("aria-hidden", "true");
            const copyLabel = document.createElement("span");
            copyLabel.textContent = labels.copy;
            copy.append(copyIcon, copyLabel);
            copy.addEventListener("click", async function () {
                try {
                    await copyText(compactText(model.entry.canonical_url) || canonicalPageUrl(model.path, model.manifest));
                    copyIcon.className = "fas fa-check";
                    copyLabel.textContent = labels.copied;
                } catch {
                    copyLabel.textContent = labels.copyFailed;
                }
                window.setTimeout(function () {
                    copyIcon.className = "fas fa-link";
                    copyLabel.textContent = labels.copy;
                }, 1800);
            });

            const report = document.createElement("a");
            report.className = "doc-trail-action";
            report.href = buildFeedbackIssueUrl(model);
            report.target = "_blank";
            report.rel = "noopener";
            const reportIcon = document.createElement("i");
            reportIcon.className = "fas fa-bug";
            reportIcon.setAttribute("aria-hidden", "true");
            const reportLabel = document.createElement("span");
            reportLabel.textContent = labels.report;
            report.append(reportIcon, reportLabel);
            actions.append(copy, report);

            trail.replaceChildren();
            if (neighbors.previous) trail.appendChild(buildTrailLink(neighbors.previous, "previous", labels));
            trail.appendChild(actions);
            if (neighbors.next) trail.appendChild(buildTrailLink(neighbors.next, "next", labels));
        } catch (error) {
            console.warn("Infernux document navigation could not be loaded.", error);
        }
    }

    function initializeNamespaceTree() {
        document.querySelectorAll(".ns-hd").forEach(function (heading) {
            heading.addEventListener("click", function () {
                this.classList.toggle("open");
                this.setAttribute("aria-expanded", String(this.classList.contains("open")));
            });
        });
    }

    function initializeDocumentOutline() {
        const outline = document.querySelector("[data-doc-outline]");
        const linkHost = outline?.querySelector(".doc-outline-links");
        const toggle = outline?.querySelector(".doc-outline-toggle");
        if (!outline || !linkHost || !toggle) return;
        const headings = [...document.querySelectorAll(".api-main h2[id], .api-main h3[id]")].map((heading) => {
            const copy = heading.cloneNode(true);
            copy.querySelectorAll(".headerlink").forEach((link) => link.remove());
            return { id: heading.id, text: copy.textContent, level: Number(heading.tagName.slice(1)) };
        });
        const entries = normalizeOutlineEntries(headings);
        if (entries.length < 2) return;

        const list = document.createElement("ol");
        list.className = "doc-outline-list";
        const links = [];
        for (const entry of entries) {
            const item = document.createElement("li");
            item.className = `doc-outline-item level-${entry.level}`;
            const link = document.createElement("a");
            link.className = "doc-outline-link";
            link.href = `#${encodeURIComponent(entry.id)}`;
            link.textContent = entry.text;
            item.appendChild(link);
            list.appendChild(item);
            links.push(link);
        }
        linkHost.replaceChildren(list);
        outline.hidden = false;

        const zh = isChinesePage();
        const label = toggle.querySelector("span");
        const mobile = window.matchMedia("(max-width: 768px)");
        let userToggled = false;
        function setExpanded(expanded) {
            outline.dataset.collapsed = String(!expanded);
            toggle.setAttribute("aria-expanded", String(expanded));
            if (label) label.textContent = expanded
                ? (zh ? "收起章节" : "Hide sections")
                : (zh ? "展开章节" : "Show sections");
        }
        function syncBreakpoint() {
            if (!userToggled) setExpanded(!mobile.matches);
        }
        function syncHash() {
            const current = decodeHash(window.location.hash.replace(/^#/, ""));
            for (const link of links) {
                if (decodeHash(link.hash.replace(/^#/, "")) === current && current) link.setAttribute("aria-current", "location");
                else link.removeAttribute("aria-current");
            }
        }
        toggle.addEventListener("click", function () {
            userToggled = true;
            setExpanded(toggle.getAttribute("aria-expanded") !== "true");
        });
        if (typeof mobile.addEventListener === "function") mobile.addEventListener("change", syncBreakpoint);
        else if (typeof mobile.addListener === "function") mobile.addListener(syncBreakpoint);
        window.addEventListener("hashchange", syncHash);
        syncBreakpoint();
        syncHash();
    }

    function initializeCodeCopy() {
        const zh = isChinesePage();
        const labels = zh
            ? { idle: "复制代码", success: "已复制", failure: "复制失败" }
            : { idle: "Copy code", success: "Copied", failure: "Copy failed" };

        document.querySelectorAll(".api-main pre").forEach(function (pre) {
            if (pre.closest(".doc-code-shell")) return;
            const shell = document.createElement("div");
            shell.className = "doc-code-shell";
            pre.parentNode.insertBefore(shell, pre);
            shell.appendChild(pre);
            pre.classList.add("doc-code-pre");

            const button = document.createElement("button");
            const icon = document.createElement("i");
            const label = document.createElement("span");
            button.type = "button";
            button.className = "doc-code-copy";
            icon.className = "fas fa-copy";
            icon.setAttribute("aria-hidden", "true");
            label.textContent = labels.idle;
            button.setAttribute("aria-label", labels.idle);
            button.append(icon, label);
            button.addEventListener("click", async function () {
                const code = pre.querySelector("code");
                try {
                    await copyText((code || pre).textContent || "");
                    icon.className = "fas fa-check";
                    label.textContent = labels.success;
                    button.setAttribute("aria-label", labels.success);
                } catch (error) {
                    label.textContent = labels.failure;
                    button.setAttribute("aria-label", labels.failure);
                }
                window.setTimeout(function () {
                    icon.className = "fas fa-copy";
                    label.textContent = labels.idle;
                    button.setAttribute("aria-label", labels.idle);
                }, 1800);
            });
            shell.appendChild(button);
        });
    }

    const LEARNING_PROGRESS_KEY = "infernux-learning-progress-v1";

    function findLearningStep(data, pathname) {
        const current = normalizeDocsPath(pathname);
        for (const learningPath of Array.isArray(data?.paths) ? data.paths : []) {
            const steps = Array.isArray(learningPath.steps) ? learningPath.steps : [];
            const index = steps.findIndex((step) => Object.values(step.documents || {}).some((url) => normalizeDocsPath(url) === current));
            if (index >= 0) return { learningPath, step: steps[index], index };
        }
        return null;
    }

    function readLearningProgress() {
        try {
            const value = JSON.parse(localStorage.getItem(LEARNING_PROGRESS_KEY) || "[]");
            return new Set(Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
        } catch {
            return new Set();
        }
    }

    function writeLearningProgress(progress) {
        try {
            localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify([...progress].sort()));
        } catch {
            // Progress is an optional device-local enhancement.
        }
    }

    function localizedLearningValue(value, language) {
        if (!value || typeof value !== "object") return "";
        return compactText(value[language] || value.en || Object.values(value)[0]);
    }

    function learningElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function buildLearningTrack(model, progress) {
        const { learningPath, step: currentStep, index: currentIndex } = model;
        const language = isChinesePage() ? "zh-CN" : "en";
        const zh = language === "zh-CN";
        const steps = learningPath.steps;
        const progressKey = (step) => `${learningPath.id}:${step.id}`;
        const completedCount = steps.filter((step) => progress.has(progressKey(step))).length;
        const currentComplete = progress.has(progressKey(currentStep));

        const track = learningElement("nav", "learning-track");
        track.dataset.learningPath = learningPath.id;
        track.setAttribute("aria-label", zh ? "学习路径进度" : "Learning path progress");

        const head = learningElement("div", "learning-track-head");
        const copy = learningElement("div", "learning-track-copy");
        copy.append(
            learningElement("span", "learning-track-kicker", `${zh ? "学习路径" : "Learning path"} · ${currentIndex + 1}/${steps.length}`),
            learningElement("h2", "learning-track-title", localizedLearningValue(learningPath.title, language)),
            learningElement("p", "learning-track-description", localizedLearningValue(learningPath.description, language))
        );
        const telemetry = learningElement("div", "learning-track-telemetry");
        telemetry.append(
            learningElement("span", "learning-track-time", `${learningPath.estimated_minutes} ${zh ? "分钟" : "min"}`),
            learningElement("span", "learning-track-count", zh ? `已完成 ${completedCount}/${steps.length}` : `${completedCount}/${steps.length} complete`)
        );
        const meter = document.createElement("progress");
        meter.max = steps.length;
        meter.value = completedCount;
        meter.setAttribute("aria-label", zh ? "学习路径完成进度" : "Learning path completion");
        telemetry.appendChild(meter);
        head.append(copy, telemetry);

        const list = learningElement("ol", "learning-track-steps");
        steps.forEach((step, index) => {
            const complete = progress.has(progressKey(step));
            const item = learningElement("li", `learning-track-step${complete ? " is-complete" : ""}${index === currentIndex ? " is-current" : ""}`);
            const link = learningElement("a", "learning-track-link");
            link.href = step.documents[language] || step.documents.en;
            if (index === currentIndex) link.setAttribute("aria-current", "step");
            const marker = learningElement("span", "learning-track-marker", complete ? "✓" : String(index + 1));
            marker.setAttribute("aria-hidden", "true");
            const detail = learningElement("span", "learning-track-step-copy");
            detail.append(
                learningElement("strong", "", localizedLearningValue(step.title, language)),
                learningElement("small", "", `${step.estimated_minutes} ${zh ? "分钟" : "min"} · ${localizedLearningValue(step.completion, language)}`)
            );
            if (learningPath.first_playable_after_step === index + 1) {
                detail.appendChild(learningElement("em", "learning-track-milestone", zh ? "首个可玩行为" : "First playable behavior"));
            }
            link.append(marker, detail);
            item.appendChild(link);
            list.appendChild(item);
        });

        const footer = learningElement("div", "learning-track-footer");
        footer.appendChild(learningElement("p", "", localizedLearningValue(learningPath.completion_summary, language)));
        const toggle = learningElement("button", "learning-complete-toggle", currentComplete
            ? (zh ? "撤销本步骤完成状态" : "Mark this step incomplete")
            : (zh ? "标记本步骤为已完成" : "Mark this step complete"));
        toggle.type = "button";
        toggle.setAttribute("aria-pressed", String(currentComplete));
        toggle.addEventListener("click", function () {
            const key = progressKey(currentStep);
            if (progress.has(key)) progress.delete(key);
            else progress.add(key);
            writeLearningProgress(progress);
            const replacement = buildLearningTrack(model, progress);
            track.replaceWith(replacement);
            replacement.querySelector(".learning-complete-toggle")?.focus();
        });
        footer.appendChild(toggle);
        track.append(head, list, footer);
        return track;
    }

    async function initializeLearningTrack() {
        if (!normalizeDocsPath(window.location.pathname).includes("/learn/")) return;
        try {
            const response = await fetch("/learning-paths.json", { headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(`learning paths returned HTTP ${response.status}`);
            const data = await response.json();
            const model = findLearningStep(data, window.location.pathname);
            if (!model) return;
            const main = document.querySelector(".guide-page .api-main");
            const heading = main?.querySelector("h1");
            if (!main || !heading) return;
            main.insertBefore(buildLearningTrack(model, readLearningProgress()), heading);
        } catch (error) {
            console.warn("Infernux learning path could not be loaded.", error);
        }
    }

    function initializeApiSidebar() {
        const apiSidebar = document.querySelector(".api-sidebar");
        const apiSidebarToggle = document.querySelector(".api-sidebar-toggle");
        if (!apiSidebar || !apiSidebarToggle) return;

        const mobileApiSidebar = window.matchMedia("(max-width: 768px)");
        apiSidebarToggle.hidden = false;

        function setApiSidebarCollapsed(collapsed) {
            apiSidebar.dataset.collapsed = String(collapsed);
            apiSidebarToggle.setAttribute("aria-expanded", String(!collapsed));
        }

        function syncApiSidebarBreakpoint() {
            setApiSidebarCollapsed(mobileApiSidebar.matches);
        }

        apiSidebarToggle.addEventListener("click", function () {
            setApiSidebarCollapsed(apiSidebar.dataset.collapsed !== "true");
        });
        if (typeof mobileApiSidebar.addEventListener === "function") {
            mobileApiSidebar.addEventListener("change", syncApiSidebarBreakpoint);
        } else if (typeof mobileApiSidebar.addListener === "function") {
            mobileApiSidebar.addListener(syncApiSidebarBreakpoint);
        }
        syncApiSidebarBreakpoint();
    }

    if (globalThis.__INFERNUX_DOCS_CONTEXT_TEST__) {
        globalThis.__infernuxDocsContext = {
            buildAgentContext,
            buildProvenanceFacts,
            buildFeedbackIssueUrl,
            findDocumentNeighbors,
            findLearningStep,
            findContextEntry,
            normalizeDocsPath,
            normalizeOutlineEntries
        };
    }

    document.addEventListener("DOMContentLoaded", function () {
        initializeNamespaceTree();
        initializeDocumentOutline();
        initializeCodeCopy();
        initializeAgentContextCopy();
        initializeDocumentTrail();
        initializeBuildProvenance();
        initializeApiSidebar();
        initializeLearningTrack();
    });
})();

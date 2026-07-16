(function () {
    "use strict";

    function nonNegativeInteger(value, name) {
        if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
        return value;
    }

    function normalizeDocsHealth(data, now = new Date()) {
        if (data?.schema_version !== 1) throw new Error("Unsupported documentation health schema");
        const coverage = data.coverage || {};
        const verification = data.verification || {};
        const apiSymbols = nonNegativeInteger(coverage.api_symbols, "api_symbols");
        const curatedExamples = nonNegativeInteger(coverage.api_examples?.curated, "curated examples");
        const verifiedAt = verification.manifest_last_verified ? new Date(`${verification.manifest_last_verified}T00:00:00Z`) : null;
        const ageDays = verifiedAt && !Number.isNaN(verifiedAt.valueOf())
            ? Math.max(0, Math.floor((now.valueOf() - verifiedAt.valueOf()) / 86_400_000))
            : null;
        const freshnessPolicyDays = nonNegativeInteger(verification.freshness_policy_days, "freshness policy");
        return {
            release: String(data.documented_release || "unknown"),
            releaseStatus: String(data.release_status || "unknown"),
            curatedDocuments: nonNegativeInteger(coverage.curated_documents, "curated documents"),
            apiSymbols,
            localizedPages: nonNegativeInteger(coverage.localized_pages, "localized pages"),
            stable: nonNegativeInteger(coverage.statuses?.stable, "stable status"),
            preview: nonNegativeInteger(coverage.statuses?.preview, "preview status"),
            experimental: nonNegativeInteger(coverage.statuses?.experimental, "experimental status"),
            curatedExamples,
            examplePercent: apiSymbols ? Math.round((curatedExamples / apiSymbols) * 100) : 0,
            relationshipEdges: nonNegativeInteger(coverage.localized_relationship_edges, "relationship edges"),
            verifiedDate: verification.manifest_last_verified || null,
            missingDates: nonNegativeInteger(verification.curated_missing_dates, "missing verification dates"),
            freshnessPolicyDays,
            ageDays,
            needsReview: ageDays === null || ageDays > freshnessPolicyDays || verification.curated_missing_dates > 0,
            buildStatus: data.build?.status === "stamped" ? "stamped" : "unstamped",
            buildCommit: data.build?.source_commit || null,
            buildUrl: data.build?.source_url || null,
            sources: data.sources || {}
        };
    }

    function isChinese() {
        return document.documentElement.lang?.toLowerCase().startsWith("zh") || false;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function healthCard(label, value, detail) {
        const card = element("article", "docs-health-card");
        card.append(
            element("span", "docs-health-card-label", label),
            element("strong", "docs-health-card-value", value),
            element("p", "docs-health-card-detail", detail)
        );
        return card;
    }

    function renderDocsHealth(panel, model) {
        const zh = isChinese();
        const command = element("div", "docs-health-command");
        const signal = element("span", `docs-health-signal${model.needsReview ? " is-attention" : ""}${model.buildStatus !== "stamped" ? " is-local" : ""}`,
            model.needsReview
                ? (zh ? "证据需要复核" : "Evidence review due")
                : (zh ? "证据处于核验周期内" : "Evidence within review window"));
        const release = element("span", "docs-health-release", `${model.releaseStatus} · ${model.release}`);
        let build;
        if (model.buildStatus === "stamped" && model.buildUrl && model.buildCommit) {
            build = element("a", "docs-health-build", `${zh ? "构建" : "Build"} ${model.buildCommit.slice(0, 12)}`);
            build.href = model.buildUrl;
            build.target = "_blank";
            build.rel = "noopener";
        } else {
            build = element("span", "docs-health-build", zh ? "本地预览 · 未盖章" : "Local preview · unstamped");
        }
        command.append(signal, release, build);

        const grid = element("div", "docs-health-grid");
        grid.append(
            healthCard(
                zh ? "覆盖范围" : "Coverage",
                model.localizedPages,
                zh ? `${model.curatedDocuments} 篇策划文档 · ${model.apiSymbols} 个 API 符号` : `${model.curatedDocuments} curated guides · ${model.apiSymbols} API symbols`
            ),
            healthCard(
                zh ? "成熟度" : "Maturity",
                model.preview,
                zh ? `${model.stable} Stable · ${model.preview} Preview · ${model.experimental} Experimental` : `${model.stable} Stable · ${model.preview} Preview · ${model.experimental} Experimental`
            ),
            healthCard(
                zh ? "证据连接" : "Evidence links",
                model.relationshipEdges,
                zh ? `${model.curatedExamples}/${model.apiSymbols} API 页面含已验证示例（${model.examplePercent}%）` : `${model.curatedExamples}/${model.apiSymbols} API pages have curated examples (${model.examplePercent}%)`
            ),
            healthCard(
                zh ? "新鲜度" : "Freshness",
                model.verifiedDate || "—",
                zh ? `${model.ageDays ?? "?"} 天前核验 · ${model.missingDates} 篇缺日期 · ${model.freshnessPolicyDays} 天复核周期` : `Verified ${model.ageDays ?? "?"} days ago · ${model.missingDates} missing dates · ${model.freshnessPolicyDays}-day policy`
            )
        );

        const sources = element("nav", "docs-health-sources");
        sources.setAttribute("aria-label", zh ? "文档健康证据源" : "Documentation health evidence sources");
        const sourceDefinitions = [
            [model.sources.manifest, zh ? "文档清单" : "Manifest"],
            [model.sources.curated_docs, zh ? "文档索引" : "Docs index"],
            [model.sources.api, "API index"],
            [model.sources.agent_corpus, zh ? "Agent 全量语料" : "Agent corpus"],
            ["/docs-health.json", zh ? "机器健康报告" : "Machine health report"]
        ];
        for (const [href, label] of sourceDefinitions) {
            if (!href) continue;
            const link = element("a", "", `${label} ↗`);
            link.href = href;
            sources.appendChild(link);
        }

        panel.replaceChildren(command, grid, sources);
        panel.setAttribute("aria-busy", "false");
    }

    let healthModel = null;

    async function initializeDocsHealth() {
        const panel = document.getElementById("docs-health-panel");
        if (!panel) return;
        try {
            const response = await fetch("/docs-health.json", { headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(`documentation health returned HTTP ${response.status}`);
            healthModel = normalizeDocsHealth(await response.json());
            renderDocsHealth(panel, healthModel);
        } catch (error) {
            console.warn(error);
            const message = element("p", "docs-health-error");
            message.append(document.createTextNode(isChinese() ? "文档健康报告暂时不可用。" : "Documentation health is temporarily unavailable. "));
            const fallback = element("a", "", isChinese() ? "打开原始报告" : "Open the raw report");
            fallback.href = "/docs-health.json";
            message.appendChild(fallback);
            panel.replaceChildren(message);
            panel.setAttribute("aria-busy", "false");
        }
    }

    if (globalThis.__INFERNUX_DOCS_HEALTH_TEST__) {
        globalThis.__infernuxDocsHealth = { normalizeDocsHealth };
    } else {
        document.addEventListener("DOMContentLoaded", initializeDocsHealth);
        document.addEventListener("site:language-changed", function () {
            const panel = document.getElementById("docs-health-panel");
            if (panel && healthModel) renderDocsHealth(panel, healthModel);
        });
    }
})();

const shaPattern = /^[a-f0-9]{40}$/;
const statuses = new Set(["passed", "failed", "skipped"]);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function nullableString(value) {
    return typeof value === "string" && value ? value : null;
}

function safeMarkdown(value) {
    return String(value ?? "")
        .replace(/\|/g, "\\|")
        .replace(/[\r\n]+/g, " ")
        .trim();
}

function commitMarkdown(repository, commit) {
    if (!repository || !shaPattern.test(commit || "")) return "Unavailable";
    return `[\`${commit.slice(0, 12)}\`](https://github.com/${repository}/commit/${commit})`;
}

export function validateWebsiteHealthReport(report) {
    assert(report?.schema_version === 1, "Website health report schema_version must be 1.");
    assert(statuses.has(report.status) && report.status !== "skipped", "Website health report status must be passed or failed.");
    assert(!Number.isNaN(Date.parse(report.checked_at || "")), "Website health report checked_at must be an ISO timestamp.");
    assert(/^https?:\/\//.test(report.base_url || ""), "Website health report base_url must be HTTP(S).");
    assert(Number.isInteger(report.duration_ms) && report.duration_ms >= 0, "Website health report duration_ms is invalid.");
    assert(Array.isArray(report.checks) && report.checks.length > 0, "Website health report must contain checks.");
    const ids = new Set();
    for (const check of report.checks) {
        assert(typeof check.id === "string" && check.id.length > 0, "Website health check id is required.");
        assert(!ids.has(check.id), `Duplicate website health check id '${check.id}'.`);
        ids.add(check.id);
        assert(statuses.has(check.status), `Unsupported website health check status '${check.status}'.`);
        assert(Number.isInteger(check.duration_ms) && check.duration_ms >= 0, `Website health check '${check.id}' has an invalid duration.`);
    }
    const passed = report.checks.filter((check) => check.status === "passed").length;
    const failed = report.checks.filter((check) => check.status === "failed").length;
    const skipped = report.checks.filter((check) => check.status === "skipped").length;
    assert(report.summary?.checks_total === report.checks.length, "Website health summary total differs from checks.");
    assert(report.summary?.checks_passed === passed, "Website health summary passed count differs from checks.");
    assert(report.summary?.checks_failed === failed, "Website health summary failed count differs from checks.");
    assert(report.summary?.checks_skipped === skipped, "Website health summary skipped count differs from checks.");
    assert(report.status === (failed ? "failed" : "passed"), "Website health report status differs from check results.");
    if (report.deployment?.pages_build?.commit != null) {
        assert(shaPattern.test(report.deployment.pages_build.commit || ""), "Pages build commit must be a full SHA.");
        assert(report.deployment.pages_build.status === "built", "Pages build evidence must report built status.");
        assert(!Number.isNaN(Date.parse(report.deployment.pages_build.updated_at || "")), "Pages build updated_at is invalid.");
    }
    const documentation = report.deployment?.documentation;
    if (documentation?.build_status === "stamped") {
        assert(shaPattern.test(documentation.source_commit || ""), "Stamped documentation source commit must be a full SHA.");
        assert(!Number.isNaN(Date.parse(documentation.generated_at || "")), "Stamped documentation generated_at is invalid.");
    } else if (documentation?.build_status === "unstamped") {
        assert(documentation.source_commit === null && documentation.generated_at === null, "Unstamped documentation must not claim source provenance.");
    }
    if (report.runner?.checkout_commit != null) assert(shaPattern.test(report.runner.checkout_commit), "Runner checkout commit must be a full SHA.");
    return report;
}

export function buildWebsiteHealthReport({ checkedAt, baseUrl, startedAt, finishedAt, checks, manifest, pagesBuild, environment = {} }) {
    const normalizedChecks = checks.map((check) => ({
        id: check.id,
        kind: check.kind,
        target: check.target,
        status: check.status,
        duration_ms: Math.max(0, Math.round(check.duration_ms || 0)),
        detail: nullableString(check.detail)
    }));
    const failed = normalizedChecks.filter((check) => check.status === "failed").length;
    const report = {
        schema_version: 1,
        status: failed ? "failed" : "passed",
        checked_at: new Date(checkedAt).toISOString(),
        base_url: new URL(baseUrl).toString(),
        duration_ms: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
        runner: {
            repository: nullableString(environment.repository),
            checkout_commit: nullableString(environment.checkoutCommit),
            workflow: nullableString(environment.workflow),
            run_id: nullableString(environment.runId),
            run_attempt: nullableString(environment.runAttempt),
            run_url: nullableString(environment.runUrl)
        },
        deployment: {
            pages_build: pagesBuild ? {
                status: nullableString(pagesBuild.status),
                commit: nullableString(pagesBuild.commit),
                created_at: nullableString(pagesBuild.created_at),
                updated_at: nullableString(pagesBuild.updated_at),
                duration_ms: Number.isFinite(pagesBuild.duration) ? Math.round(pagesBuild.duration) : null
            } : null,
            documentation: manifest ? {
                documented_release: nullableString(manifest.documented_release),
                release_status: nullableString(manifest.release_status),
                build_status: nullableString(manifest.build?.status),
                source_commit: nullableString(manifest.build?.source_commit),
                generated_at: nullableString(manifest.build?.generated_at)
            } : null
        },
        summary: {
            checks_total: normalizedChecks.length,
            checks_passed: normalizedChecks.filter((check) => check.status === "passed").length,
            checks_failed: failed,
            checks_skipped: normalizedChecks.filter((check) => check.status === "skipped").length,
            route_checks: normalizedChecks.filter((check) => check.kind === "route").length
        },
        checks: normalizedChecks
    };
    return validateWebsiteHealthReport(report);
}

export function renderWebsiteHealthSummary(report) {
    validateWebsiteHealthReport(report);
    const icon = report.status === "passed" ? "✅" : "❌";
    const repository = report.runner.repository;
    const lines = [
        `## ${icon} Infernux website health · ${report.status}`,
        "",
        `- Checked: \`${report.checked_at}\``,
        `- Origin: \`${report.base_url}\``,
        `- Pages build: ${commitMarkdown(repository, report.deployment.pages_build?.commit)}`,
        `- Documentation source: ${commitMarkdown(repository, report.deployment.documentation?.source_commit)}`,
        `- Documented release: \`${report.deployment.documentation?.documented_release || "unknown"}\``,
        `- Checks: **${report.summary.checks_passed} passed**, **${report.summary.checks_failed} failed**, ${report.summary.checks_skipped} skipped`,
        ""
    ];
    if (report.runner.run_url) lines.push(`Workflow run: [${safeMarkdown(report.runner.workflow || "Website Health")}](${report.runner.run_url})`, "");
    const failures = report.checks.filter((check) => check.status === "failed");
    if (failures.length) {
        lines.push("### Failures", "", "| Check | Target | Detail |", "|---|---|---|");
        for (const failure of failures) {
            lines.push(`| ${safeMarkdown(failure.id)} | ${safeMarkdown(failure.target)} | ${safeMarkdown(failure.detail || "No detail")} |`);
        }
        lines.push("");
    }
    return `${lines.join("\n").trim()}\n`;
}

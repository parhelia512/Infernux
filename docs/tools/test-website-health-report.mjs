import assert from "node:assert/strict";
import {
    buildWebsiteHealthReport,
    renderWebsiteHealthSummary,
    validateWebsiteHealthReport
} from "./website-health-report.mjs";

const pagesCommit = "1".repeat(40);
const docsCommit = "2".repeat(40);
const report = buildWebsiteHealthReport({
    checkedAt: "2026-07-16T08:00:00.000Z",
    baseUrl: "https://infernux-engine.com/",
    startedAt: "2026-07-16T07:59:58.000Z",
    finishedAt: "2026-07-16T08:00:00.000Z",
    checks: [
        { id: "route:/", kind: "route", target: "https://infernux-engine.com/", status: "passed", duration_ms: 42, detail: "HTTP 200" },
        { id: "pages-build", kind: "deployment", target: "GitHub Pages API", status: "passed", duration_ms: 18, detail: `Build ${pagesCommit}` },
        { id: "optional-local", kind: "deployment", target: "local preview", status: "skipped", duration_ms: 0, detail: "Not production" }
    ],
    manifest: {
        documented_release: "0.2.1",
        release_status: "preview",
        build: { status: "stamped", source_commit: docsCommit, generated_at: "2026-07-16T07:55:00.000Z" }
    },
    pagesBuild: {
        status: "built",
        commit: pagesCommit,
        duration: 2104,
        created_at: "2026-07-16T07:56:00.000Z",
        updated_at: "2026-07-16T07:56:03.000Z"
    },
    environment: {
        repository: "ChenlizheMe/Infernux",
        checkoutCommit: "3".repeat(40),
        workflow: "Website Health",
        runId: "1234",
        runAttempt: "1",
        runUrl: "https://github.com/ChenlizheMe/Infernux/actions/runs/1234"
    }
});

assert.equal(report.status, "passed");
assert.equal(report.duration_ms, 2000);
assert.equal(report.summary.checks_total, 3);
assert.equal(report.summary.checks_passed, 2);
assert.equal(report.summary.checks_failed, 0);
assert.equal(report.summary.checks_skipped, 1);
assert.equal(report.summary.route_checks, 1);
assert.equal(report.deployment.pages_build.commit, pagesCommit);
assert.equal(report.deployment.documentation.source_commit, docsCommit);
assert.equal(validateWebsiteHealthReport(report), report);

const summary = renderWebsiteHealthSummary(report);
assert.match(summary, /Infernux website health · passed/);
assert.match(summary, /Pages build: \[`111111111111`\]/);
assert.match(summary, /Documentation source: \[`222222222222`\]/);
assert.match(summary, /2 passed.*0 failed.*1 skipped/);
assert.match(summary, /actions\/runs\/1234/);

const failed = buildWebsiteHealthReport({
    checkedAt: "2026-07-16T08:00:00.000Z",
    baseUrl: "https://infernux-engine.com/",
    startedAt: "2026-07-16T08:00:00.000Z",
    finishedAt: "2026-07-16T08:00:01.000Z",
    checks: [{ id: "route:/", kind: "route", target: "https://infernux-engine.com/", status: "failed", duration_ms: 12, detail: "HTTP 503 | maintenance" }],
    manifest: null,
    pagesBuild: null
});
assert.equal(failed.status, "failed");
assert.match(renderWebsiteHealthSummary(failed), /HTTP 503 \\| maintenance/);

assert.throws(() => validateWebsiteHealthReport({
    ...report,
    checks: [report.checks[0], report.checks[0]],
    summary: { ...report.summary, checks_total: 2, checks_passed: 2, checks_skipped: 0 }
}), /Duplicate/);
assert.throws(() => validateWebsiteHealthReport({ ...report, checked_at: "not-a-date" }), /checked_at/);
assert.throws(() => validateWebsiteHealthReport({ ...report, runner: { ...report.runner, checkout_commit: "short" } }), /checkout commit/);

console.log("Website health report test passed: schema, counts, deployment commits, failure summary, and invalid-report rejection.");

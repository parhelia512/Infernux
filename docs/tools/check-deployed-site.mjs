import process from "node:process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildWebsiteHealthReport, renderWebsiteHealthSummary } from "./website-health-report.mjs";

const baseArg = process.argv.indexOf("--base-url");
const base = new URL(baseArg >= 0 ? process.argv[baseArg + 1] : "https://infernux-engine.com/");
const reportArg = process.argv.indexOf("--report");
const reportPath = reportArg >= 0 ? path.resolve(process.argv[reportArg + 1]) : null;
const allowUnstamped = process.argv.includes("--allow-unstamped");
const failures = [];
const healthResults = [];
const startedAt = new Date();
let deployedManifest = null;

const checks = [
    { route: "/", tokens: ["<h1", "start.html", "community.html"] },
    { route: "/start.html", tokens: ["data-page-language=\"en\"", "data-page-language=\"zh\"", "id=\"first-script\""], forbid: ["始于", "验证于", "nav.manual"] },
    { route: "/download.html", tokens: ["InfernuxHub", "data-version-select", "0.2.9", "0.2.1"], forbid: ["SHA-256", "checksum", "校验码", "pwa-install.js"] },
    { route: "/community.html", tokens: ["community-state", "forum-compose", "community-api.js"] },
    { route: "/community-topic.html?topic=11", tokens: ["community-topic", "topic-replies", "community-topic.js"] },
    { route: "/roadmap.html", tokens: ["<h1", "start.html"] },
    { route: "/wiki/site/en/api/index.html", tokens: ["API", "/start.html", "/start.html#first-script"], forbid: [">Manual</a>", "/learn/", "/manual/"] },
    { route: "/wiki/site/zh/api/index.html", tokens: ["API", "/start.html", "/start.html#first-script"], forbid: [">手册</a>", "/learn/", "/manual/"] },
    { route: "/api-index.json", jsonKey: "symbols" },
    { route: "/docs-manifest.json", jsonKey: "build" },
    { route: "/site.webmanifest", tokens: ["\"short_name\": \"Start\"", "\"short_name\": \"API\"", "/start.html"] },
    { route: "/sw.js", tokens: ["networkFirst(request, true)"] },
    { route: "/sitemap.xml", tokens: ["/start.html", "/wiki/site/en/api/index.html"] },
];

function record(id, target, status, started, detail = null) {
    healthResults.push({
        id,
        kind: "route",
        target,
        status,
        duration_ms: Math.max(0, Math.round(performance.now() - started)),
        detail,
    });
}

for (const check of checks) {
    const target = new URL(check.route, base);
    const started = performance.now();
    try {
        const response = await fetch(target, {
            headers: { "user-agent": "Infernux-website-health/1.0" },
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.text();
        for (const token of check.tokens || []) {
            if (!body.includes(token)) throw new Error(`missing '${token}'`);
        }
        for (const token of check.forbid || []) {
            if (body.includes(token)) throw new Error(`contains obsolete '${token}'`);
        }
        if (check.jsonKey) {
            const data = JSON.parse(body);
            if (!(check.jsonKey in data)) throw new Error(`JSON is missing '${check.jsonKey}'`);
            if (check.route === "/docs-manifest.json") deployedManifest = data;
        }
        console.log(`PASS ${check.route}`);
        record(check.route, target.toString(), "passed", started, `HTTP ${response.status}`);
    } catch (error) {
        failures.push(`${check.route}: ${error.message}`);
        console.error(`FAIL ${check.route}: ${error.message}`);
        record(check.route, target.toString(), "failed", started, error.message);
    }
}

if (deployedManifest && !allowUnstamped && deployedManifest.build?.status !== "stamped") {
    failures.push("docs-manifest.json: production documentation build is not stamped");
}

const finishedAt = new Date();
const repository = process.env.GITHUB_REPOSITORY || "ChenlizheMe/Infernux";
const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
const runUrl = process.env.GITHUB_RUN_ID ? `${serverUrl}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
const report = buildWebsiteHealthReport({
    checkedAt: process.env.WEBSITE_HEALTH_CHECKED_AT || finishedAt.toISOString(),
    baseUrl: base,
    startedAt,
    finishedAt,
    checks: healthResults,
    manifest: deployedManifest,
    pagesBuild: null,
    environment: {
        repository,
        checkoutCommit: process.env.GITHUB_SHA,
        workflow: process.env.GITHUB_WORKFLOW,
        runId: process.env.GITHUB_RUN_ID,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        runUrl,
    },
});

if (reportPath) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, renderWebsiteHealthSummary(report), "utf8");
}
if (failures.length) {
    console.error(`Deployed website health failed with ${failures.length} issue(s).`);
    process.exit(1);
}

console.log(`Deployed website health passed for ${base.origin}.`);

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
    parseCommunityReadinessConfig,
    validateCommunityGateway,
    validateCommunityRepository,
    validateGiscusInstallation
} from "./community-readiness-core.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const communityPath = path.resolve(scriptDir, "..", "community.html");
const topicPath = path.resolve(scriptDir, "..", "community-topic.html");
const apiPath = path.resolve(scriptDir, "..", "js", "community-api.js");
const communityHtml = await readFile(communityPath, "utf8");
const topicHtml = await readFile(topicPath, "utf8");
const apiSource = await readFile(apiPath, "utf8");
const config = parseCommunityReadinessConfig(communityHtml, topicHtml, apiSource);

const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "Infernux-website-health/1.0",
    "x-github-api-version": "2022-11-28",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
};
const repoResponse = await fetch(`https://api.github.com/repos/${config.repo}`, {
    headers,
    signal: AbortSignal.timeout(15_000)
});
if (!repoResponse.ok) throw new Error(`GitHub repository API returned HTTP ${repoResponse.status}`);
const repository = await repoResponse.json();
validateCommunityRepository(repository, config);
console.log(`PASS ${config.repo}: public repository with Discussions and Issues enabled`);
console.log(`PASS community administrator declaration: ${config.administrators[0]} only`);

const categoriesUrl = new URL("https://giscus.app/api/discussions/categories");
categoriesUrl.searchParams.set("repo", config.repo);
const giscusResponse = await fetch(categoriesUrl, {
    headers: { "user-agent": "Infernux-website-health/1.0" },
    signal: AbortSignal.timeout(15_000)
});
const giscusPayload = await giscusResponse.json().catch(() => ({}));
const category = validateGiscusInstallation(giscusResponse.status, giscusPayload, config);
console.log(`PASS Giscus installation and category ${category.name} (${category.id})`);

const gatewayResponse = await fetch(`${config.gatewayOrigin}/health`, { signal: AbortSignal.timeout(15_000) });
const gatewayBody = await gatewayResponse.text();
validateCommunityGateway(gatewayResponse.status, gatewayBody);
console.log(`PASS community gateway at ${config.gatewayOrigin}`);

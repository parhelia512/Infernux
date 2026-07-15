import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const communityPath = path.resolve(scriptDir, "..", "community.html");
const allowUninstalled = process.argv.includes("--allow-uninstalled");
const html = await readFile(communityPath, "utf8");

function attribute(name) {
    const value = html.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];
    if (!value) throw new Error(`community.html is missing ${name}`);
    return value;
}

const config = {
    repo: attribute("data-repo"),
    repoId: attribute("data-repo-id"),
    category: attribute("data-category"),
    categoryId: attribute("data-category-id"),
    mapping: attribute("data-mapping"),
    term: attribute("data-term")
};

if (config.mapping !== "specific" || !config.term) {
    throw new Error("Giscus must use a non-empty, specific Discussion mapping");
}

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
if (repository.node_id !== config.repoId) throw new Error(`repository ID changed from ${config.repoId} to ${repository.node_id}`);
if (repository.visibility !== "public" || repository.archived) throw new Error("community repository must remain public and active");
if (!repository.has_discussions || !repository.has_issues) throw new Error("GitHub Discussions and Issues must both remain enabled");
console.log(`PASS ${config.repo}: public repository with Discussions and Issues enabled`);

const categoriesUrl = new URL("https://giscus.app/api/discussions/categories");
categoriesUrl.searchParams.set("repo", config.repo);
const giscusResponse = await fetch(categoriesUrl, {
    headers: { "user-agent": "Infernux-website-health/1.0" },
    signal: AbortSignal.timeout(15_000)
});
const giscusPayload = await giscusResponse.json().catch(() => ({}));

if (giscusResponse.status === 403 && /not installed/i.test(giscusPayload.error || "")) {
    const message = `Giscus is not installed on ${config.repo}; embedded sign-in and replies are unavailable`;
    if (allowUninstalled) {
        console.warn(`WARN ${message}`);
        process.exit(0);
    }
    throw new Error(message);
}
if (!giscusResponse.ok) throw new Error(`Giscus category API returned HTTP ${giscusResponse.status}`);
if (giscusPayload.repositoryId !== config.repoId) throw new Error("Giscus repository ID does not match community.html");
const category = (giscusPayload.categories || []).find((item) => item.id === config.categoryId);
if (!category) throw new Error(`Giscus category ID ${config.categoryId} is unavailable`);
if (category.name !== config.category) throw new Error(`Giscus category name changed from ${config.category} to ${category.name}`);
console.log(`PASS Giscus installation and category ${category.name} (${category.id})`);

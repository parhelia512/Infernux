import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const manifestPath = path.join(repoRoot, "docs", "docs-manifest.json");
const checkOnly = process.argv.includes("--check");
const shaPattern = /^[a-f0-9]{40}$/;

function validateBuild(build) {
    if (!build || typeof build !== "object" || Array.isArray(build)) {
        throw new Error("docs-manifest.json: build provenance object is required");
    }
    if (build.status === "unstamped") {
        if (build.source_commit !== null || build.generated_at !== null) {
            throw new Error("docs-manifest.json: unstamped provenance must use null source_commit and generated_at");
        }
        return;
    }
    if (build.status !== "stamped") throw new Error("docs-manifest.json: build.status must be stamped or unstamped");
    if (!shaPattern.test(build.source_commit || "")) throw new Error("docs-manifest.json: invalid build.source_commit");
    if (!/^https:\/\/github\.com\/ChenlizheMe\/Infernux\/commit\/[a-f0-9]{40}$/.test(build.source_url || "")) {
        throw new Error("docs-manifest.json: invalid build.source_url");
    }
    if (!build.generated_at || Number.isNaN(Date.parse(build.generated_at))) {
        throw new Error("docs-manifest.json: invalid build.generated_at");
    }
    if (build.timestamp_source !== "source-commit") {
        throw new Error("docs-manifest.json: timestamp_source must be source-commit");
    }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (checkOnly) {
    validateBuild(manifest.build);
    console.log(`Verified documentation build provenance (${manifest.build.status}).`);
    process.exit(0);
}

const sourceCommit = (process.env.DOCS_SOURCE_COMMIT || "").trim().toLowerCase();
if (!shaPattern.test(sourceCommit)) {
    throw new Error("DOCS_SOURCE_COMMIT must be the full 40-character commit SHA used to generate the site");
}

const commitTimestamp = (process.env.DOCS_GENERATED_AT || execFileSync(
    "git",
    ["show", "-s", "--format=%cI", sourceCommit],
    { cwd: repoRoot, encoding: "utf8" }
)).trim();
if (!commitTimestamp || Number.isNaN(Date.parse(commitTimestamp))) {
    throw new Error("Could not resolve a valid timestamp for DOCS_SOURCE_COMMIT");
}

manifest.build = {
    status: "stamped",
    source_commit: sourceCommit,
    source_url: `https://github.com/ChenlizheMe/Infernux/commit/${sourceCommit}`,
    generated_at: new Date(commitTimestamp).toISOString(),
    timestamp_source: "source-commit"
};
validateBuild(manifest.build);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Stamped documentation manifest for ${sourceCommit.slice(0, 12)} at ${manifest.build.generated_at}.`);

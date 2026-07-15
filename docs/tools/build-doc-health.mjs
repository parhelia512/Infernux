import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const outputPath = path.join(docsRoot, "docs-health.json");
const checkOnly = process.argv.includes("--check");

const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
const docsIndex = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
const apiIndex = JSON.parse(await readFile(path.join(docsRoot, "api-index.json"), "utf8"));
const statusOrder = ["stable", "preview", "experimental", "deprecated"];
const statusCounts = Object.fromEntries(statusOrder.map((status) => [status, 0]));
for (const item of [...docsIndex.documents, ...apiIndex.symbols]) {
    const status = item.status || "unversioned";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
}

const languageCounts = {};
for (const item of [...docsIndex.documents, ...apiIndex.symbols]) {
    languageCounts[item.language] = (languageCounts[item.language] || 0) + 1;
}
const verificationDates = docsIndex.documents.map((document) => document.last_verified).filter(Boolean).sort();
const curatedExamples = apiIndex.symbols.filter((symbol) => symbol.example_status === "curated").length;
const unavailableExamples = apiIndex.symbols.filter((symbol) => symbol.example_status === "unavailable").length;
const unknownExamples = apiIndex.symbols.length - curatedExamples - unavailableExamples;

const health = {
    schema_version: 1,
    documented_release: manifest.documented_release,
    release_status: manifest.release_status,
    canonical_origin: manifest.canonical_origin,
    coverage: {
        curated_documents: docsIndex.document_count,
        api_symbols: apiIndex.symbol_count,
        localized_pages: docsIndex.document_count + apiIndex.symbol_count,
        languages: languageCounts,
        statuses: statusCounts,
        api_examples: {
            curated: curatedExamples,
            unavailable: unavailableExamples,
            unknown: unknownExamples
        },
        localized_relationship_edges: docsIndex.documents.reduce((count, document) => count + document.related_api.length, 0)
    },
    verification: {
        manifest_last_verified: manifest.last_verified,
        curated_oldest: verificationDates[0] || null,
        curated_latest: verificationDates.at(-1) || null,
        curated_missing_dates: docsIndex.documents.length - verificationDates.length,
        freshness_policy_days: 120
    },
    build: manifest.build,
    sources: {
        manifest: "/docs-manifest.json",
        curated_docs: "/docs-index.json",
        api: "/api-index.json",
        learning_paths: manifest.indexes.learning_paths,
        agent_corpus: manifest.indexes.llms_full
    }
};

const output = `${JSON.stringify(health, null, 2)}\n`;
if (checkOnly) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    if (current.replace(/\r\n/g, "\n") !== output) {
        throw new Error("docs-health.json is stale. Run: node docs/tools/build-doc-health.mjs");
    }
    console.log(`Verified documentation health for ${health.coverage.localized_pages} localized pages.`);
} else {
    await writeFile(outputPath, output, "utf8");
    console.log(`Generated documentation health for ${health.coverage.localized_pages} localized pages.`);
}

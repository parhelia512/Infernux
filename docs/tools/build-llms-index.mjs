import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const docsRoot = path.resolve("docs");
const outputFile = path.join(docsRoot, "llms.txt");
const checkOnly = process.argv.includes("--check");

function inline(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .replace(/([\\[\]])/g, "\\$1")
        .trim();
}

function absolute(origin, value) {
    return new URL(value, `${origin}/`).toString();
}

function sha256(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function documentOrder(left, right) {
    const leftOrder = Number.isInteger(left.navigation_order) ? left.navigation_order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isInteger(right.navigation_order) ? right.navigation_order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.title.localeCompare(right.title, left.language);
}

const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
const docsIndex = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
const apiIndex = JSON.parse(await readFile(path.join(docsRoot, "api-index.json"), "utf8"));
const learningPaths = JSON.parse(await readFile(path.join(docsRoot, "learning-paths.json"), "utf8"));
const docsHealth = JSON.parse(await readFile(path.join(docsRoot, "docs-health.json"), "utf8"));
const release = JSON.parse(await readFile(path.join(docsRoot, "release.json"), "utf8"));
const origin = manifest.canonical_origin;

const body = [];
body.push("## Start here", "");
body.push(`- [Documentation home](${origin}/wiki/site/index.html): human and Agent entry point for Learn, Manual, Architecture, and API content.`);
for (const learningPath of learningPaths.paths) {
    body.push(`- Learning path \`${inline(learningPath.id)}\`: ${inline(learningPath.title.en)} / ${inline(learningPath.title["zh-CN"])} · ${inline(learningPath.estimated_minutes)} minutes.`);
    for (const step of [...learningPath.steps].sort((left, right) => left.position - right.position)) {
        body.push(`  - ${step.position}. [${inline(step.title.en)}](${absolute(origin, step.documents.en)}) / [${inline(step.title["zh-CN"])}](${absolute(origin, step.documents["zh-CN"])}): ${inline(step.completion.en)}`);
    }
}

body.push("", "## Canonical curated documentation", "");
body.push("Every Learn, Manual, and Architecture entry below comes from docs-index.json. Status and verification dates are evidence, not decoration.");
for (const layer of ["learn", "manual", "architecture"]) {
    body.push("", `### ${layer[0].toUpperCase()}${layer.slice(1)}`);
    for (const language of ["en", "zh-CN"]) {
        const documents = docsIndex.documents
            .filter((document) => document.layer === layer && document.language === language)
            .sort(documentOrder);
        body.push("", `#### ${language}`);
        for (const document of documents) {
            body.push(`- [${inline(document.title)}](${document.canonical_url}) — ${inline(document.description)} · status=${document.status}; since=${document.since || "unknown"}; last_verified=${document.last_verified || "unknown"}`);
        }
    }
}

body.push("", "## Guidance-linked API", "");
body.push(`Use [api-index.json](${origin}${manifest.indexes.api}) for exhaustive symbol lookup and exact signatures. The links below are symbols with curated examples or explicit Learn/Manual/Architecture relationships.`);
const chineseSymbols = new Map(apiIndex.symbols
    .filter((symbol) => symbol.language === "zh-CN")
    .map((symbol) => [symbol.symbol_key, symbol]));
const guidanceSymbols = apiIndex.symbols
    .filter((symbol) => symbol.language === "en" && (symbol.example_status === "curated" || symbol.related_documents?.length))
    .sort((left, right) => left.symbol_key.localeCompare(right.symbol_key, "en"));
for (const symbol of guidanceSymbols) {
    const counterpart = chineseSymbols.get(symbol.symbol_key);
    const counterpartLink = counterpart ? ` / [中文](${counterpart.canonical_url})` : "";
    body.push(`- [${inline(symbol.symbol_key)}](${symbol.canonical_url})${counterpartLink} — kind=${symbol.kind}; status=${symbol.status}; example=${symbol.example_status}; related_documents=${symbol.related_documents?.length || 0}`);
}

body.push("", "## Community and support", "");
body.push(`- [Community hub](${origin}/community.html): anonymous public topic reading, GitHub-native sign-in/write paths, and an opt-in Giscus reply wall.`);
body.push("- [GitHub Discussions](https://github.com/ChenlizheMe/Infernux/discussions): questions, ideas, conversation, and showcases.");
body.push("- [GitHub Issues](https://github.com/ChenlizheMe/Infernux/issues): reproducible defects and actionable engineering work.");

const indexDescriptions = {
    llms: "this compact deterministic Agent discovery index",
    llms_full: "complete bilingual curated bodies plus a compact localized API catalog",
    curated_docs: "curated document metadata, order, status, freshness, relationships, and canonical URLs",
    learning_paths: "ordered onboarding steps, completion criteria, timing, and bilingual routes",
    docs_health: "coverage, maturity, example, relationship, freshness, and provenance telemetry",
    api: "localized API symbols, kinds, signatures, examples, relationships, and canonical URLs",
    api_changes: "recorded release-to-release API additions, removals, and structural changes",
    release: "current release identity, verification boundary, artifacts, sizes, digests, and URLs",
    release_notes: "structured release summary, comparison, change groups, and upgrade notes",
    wiki_catalog: "searchable curated documentation catalog",
    sitemap: "canonical public URL inventory",
    community: "human-facing GitHub-backed community surface"
};
body.push("", "## Declared discovery surfaces", "");
for (const [key, route] of Object.entries(manifest.indexes)) {
    body.push(`- [${key}](${absolute(origin, route)}): ${indexDescriptions[key] || "declared by docs-manifest.json"}.`);
}

body.push("", "## Current evidence snapshot", "");
body.push(`- Documentation health: localized_pages=${docsHealth.coverage.localized_pages}; curated_documents=${docsHealth.coverage.curated_documents}; localized_api_symbols=${docsHealth.coverage.api_symbols}; relationship_edges=${docsHealth.coverage.localized_relationship_edges}.`);
body.push(`- Release: ${release.tag}; channel=${release.channel}; published_at=${release.published_at}; checksum=${release.verification.checksum_algorithm}; publisher_signature=${release.verification.publisher_signature}; authority=${release.verification.authority}.`);
body.push(`- Build provenance: status=${manifest.build.status}; source_commit=${manifest.build.source_commit || "unstamped"}; generated_at=${manifest.build.generated_at || "unstamped"}.`);

body.push("", "## Agent trust rules", "");
manifest.trust_rules.forEach((rule, index) => body.push(`${index + 1}. ${inline(rule)}`));
body.push(`${manifest.trust_rules.length + 1}. Prefer an entry matching the user's language and installed engine version; do not silently substitute another version or a similarly named API from another engine.`);
body.push(`${manifest.trust_rules.length + 2}. Use this file for discovery only. Exact current signatures remain governed by api-index.json and generated API pages.`);

const indexBody = `${body.join("\n").trim()}\n`;
const output = [
    "# Infernux Agent Documentation Index",
    "",
    "Index-Schema: 1",
    `Documented-Release: ${manifest.documented_release}`,
    `Release-Status: ${manifest.release_status}`,
    `Last-Verified: ${manifest.last_verified}`,
    `Curated-Document-Count: ${docsIndex.document_count}`,
    `Localized-API-Symbol-Count: ${apiIndex.symbol_count}`,
    `Guidance-Linked-API-Count: ${guidanceSymbols.length}`,
    `Learning-Path-Count: ${learningPaths.paths.length}`,
    `Index-Content-SHA256: ${sha256(indexBody)}`,
    `Canonical-Site: ${origin}`,
    `Repository: ${manifest.repository}`,
    "License: MIT",
    "",
    "This compact file is generated from the documentation manifest and machine indexes. Use llms-full.txt only when complete curated bodies are needed.",
    "",
    "--- BEGIN INDEX ---",
    "",
    indexBody
].join("\n");

const current = await readFile(outputFile, "utf8").catch(() => "");
if (checkOnly) {
    if (current.replace(/\r\n/g, "\n") !== output) throw new Error("llms.txt is stale. Run: node docs/tools/build-llms-index.mjs");
    console.log(`Verified compact Agent index with ${docsIndex.document_count} curated documents and ${guidanceSymbols.length} guidance-linked API symbols.`);
} else {
    await writeFile(outputFile, output, "utf8");
    console.log(`Generated compact Agent index with ${docsIndex.document_count} curated documents and ${guidanceSymbols.length} guidance-linked API symbols.`);
}

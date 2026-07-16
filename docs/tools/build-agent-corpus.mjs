import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "docs");
const outputFile = path.join(docsRoot, "llms-full.txt");
const checkOnly = process.argv.includes("--check");

function normalized(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function stripFrontMatter(markdown) {
  const source = normalized(markdown).replace(/^\uFEFF/, "");
  if (!source.startsWith("---\n")) return source;
  const end = source.indexOf("\n---\n", 4);
  return end < 0 ? source : source.slice(end + 5).trim();
}

function normalizeDiagramMarkers(markdown) {
  return markdown.replace(
    /^\[INX-DIAGRAM:([a-z][a-z0-9-]*):([^\]]+)\]$/gm,
    (_marker, kind, label) => `Diagram (${kind}): ${label}`,
  );
}

function list(values, fallback = "none") {
  return Array.isArray(values) && values.length ? values.join(", ") : fallback;
}

function safeInline(value) {
  return normalized(value).replace(/\s+/g, " ");
}

function corpusHash(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
const docsIndex = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
const apiIndex = JSON.parse(await readFile(path.join(docsRoot, "api-index.json"), "utf8"));
const releaseNotes = JSON.parse(await readFile(path.join(docsRoot, "release-notes.json"), "utf8"));
const learningPaths = JSON.parse(await readFile(path.join(docsRoot, "learning-paths.json"), "utf8"));
const docsHealth = JSON.parse(await readFile(path.join(docsRoot, "docs-health.json"), "utf8"));

const corpusSections = [];
corpusSections.push("## Documentation health");
corpusSections.push("");
corpusSections.push(`Health-Schema: ${docsHealth.schema_version}`);
corpusSections.push(`Localized-Pages: ${docsHealth.coverage.localized_pages}`);
corpusSections.push(`Curated-Documents: ${docsHealth.coverage.curated_documents}`);
corpusSections.push(`Localized-API-Symbols: ${docsHealth.coverage.api_symbols}`);
corpusSections.push(`Status-Counts: ${Object.entries(docsHealth.coverage.statuses).map(([status, count]) => `${status}=${count}`).join(", ")}`);
corpusSections.push(`Curated-API-Examples: ${docsHealth.coverage.api_examples.curated}`);
corpusSections.push(`Localized-Relationship-Edges: ${docsHealth.coverage.localized_relationship_edges}`);
corpusSections.push(`Verification-Window: ${docsHealth.verification.curated_oldest}..${docsHealth.verification.curated_latest}`);
corpusSections.push(`Freshness-Policy-Days: ${docsHealth.verification.freshness_policy_days}`);
corpusSections.push(`Build-Provenance: ${docsHealth.build.status}${docsHealth.build.source_commit ? ` ${docsHealth.build.source_commit}` : ""}`);
corpusSections.push(`Canonical-Health-Report: ${manifest.canonical_origin}/docs-health.json`);
corpusSections.push("");
corpusSections.push("## Current release notes");
corpusSections.push("");
corpusSections.push(`<!-- RELEASE ${releaseNotes.version} START -->`);
corpusSections.push(`Release: ${releaseNotes.tag}`);
corpusSections.push(`Published-At: ${releaseNotes.published_at}`);
corpusSections.push(`Source: ${releaseNotes.source}`);
corpusSections.push(`Comparison: ${releaseNotes.comparison.from}...${releaseNotes.comparison.to}`);
corpusSections.push(`Comparison-URL: ${releaseNotes.comparison.url}`);
corpusSections.push(`Summary: ${safeInline(releaseNotes.summary)}`);
for (const section of releaseNotes.sections) {
  corpusSections.push("");
  corpusSections.push(`### ${safeInline(section.title)}`);
  for (const item of section.items) corpusSections.push(`- ${safeInline(item.text)}`);
}
corpusSections.push(`<!-- RELEASE ${releaseNotes.version} END -->`);
corpusSections.push("");
corpusSections.push("## Learning paths");
corpusSections.push("");
corpusSections.push("These paths define ordered, completion-oriented routes through canonical Learn documents. Progress stored by the website is device-local and is not evidence that an engine behavior passed verification.");
for (const learningPath of learningPaths.paths) {
  corpusSections.push("");
  corpusSections.push(`<!-- LEARNING-PATH ${learningPath.id} START -->`);
  corpusSections.push(`### ${safeInline(learningPath.title.en)} / ${safeInline(learningPath.title["zh-CN"])}`);
  corpusSections.push("");
  corpusSections.push(`Path-ID: ${learningPath.id}`);
  corpusSections.push(`Estimated-Minutes: ${learningPath.estimated_minutes}`);
  corpusSections.push(`First-Playable-After-Step: ${learningPath.first_playable_after_step}`);
  corpusSections.push(`English-Summary: ${safeInline(learningPath.description.en)}`);
  corpusSections.push(`Chinese-Summary: ${safeInline(learningPath.description["zh-CN"])}`);
  corpusSections.push(`Completion-English: ${safeInline(learningPath.completion_summary.en)}`);
  corpusSections.push(`Completion-Chinese: ${safeInline(learningPath.completion_summary["zh-CN"])}`);
  corpusSections.push("Steps:");
  for (const step of learningPath.steps) {
    corpusSections.push(`- ${step.position}. ${step.id} (${step.estimated_minutes} min)`);
    corpusSections.push(`  - English: ${safeInline(step.title.en)} — ${safeInline(step.completion.en)}`);
    corpusSections.push(`  - URL: ${manifest.canonical_origin}${step.documents.en}`);
    corpusSections.push(`  - Chinese: ${safeInline(step.title["zh-CN"])} — ${safeInline(step.completion["zh-CN"])}`);
    corpusSections.push(`  - URL: ${manifest.canonical_origin}${step.documents["zh-CN"]}`);
  }
  corpusSections.push(`<!-- LEARNING-PATH ${learningPath.id} END -->`);
}
corpusSections.push("");
corpusSections.push("## Curated documentation");
corpusSections.push("");
corpusSections.push("The following sections contain the complete Markdown body of each curated Learn, Manual, and Architecture document. Metadata and source paths identify authority and freshness.");

for (const document of docsIndex.documents) {
  const sourceFile = path.join(repoRoot, document.source);
  const body = normalizeDiagramMarkers(stripFrontMatter(await readFile(sourceFile, "utf8")));
  corpusSections.push("");
  corpusSections.push(`<!-- DOC ${document.id} START -->`);
  corpusSections.push(`### [${document.language}] ${safeInline(document.title)}`);
  corpusSections.push("");
  corpusSections.push(`Document-ID: ${document.id}`);
  corpusSections.push(`Layer: ${document.layer}`);
  corpusSections.push(`Status: ${document.status}`);
  corpusSections.push(`Since: ${document.since || "unknown"}`);
  corpusSections.push(`Last-Verified: ${document.last_verified || "unknown"}`);
  corpusSections.push(`Audience: ${list(document.audience)}`);
  corpusSections.push(`Tags: ${list(document.tags)}`);
  corpusSections.push(`Related-API: ${list(document.related_api)}`);
  corpusSections.push(`Canonical-URL: ${document.canonical_url}`);
  corpusSections.push(`Repository-Source: ${document.source}`);
  corpusSections.push(`Evidence-Sources: ${list(document.source_paths)}`);
  corpusSections.push(`Agent-Summary: ${safeInline(document.summary)}`);
  corpusSections.push("");
  corpusSections.push(body);
  corpusSections.push("");
  corpusSections.push(`<!-- DOC ${document.id} END -->`);
}

corpusSections.push("");
corpusSections.push("## Compact API catalog");
corpusSections.push("");
corpusSections.push("This catalog contains exact signatures extracted for the documented release. Open Canonical-URL for full properties, methods, examples, and related guidance. An unavailable example status is explicit evidence that no curated example has been verified; it is not permission to invent one.");

for (const symbol of apiIndex.symbols) {
  corpusSections.push("");
  corpusSections.push(`<!-- API ${symbol.id} START -->`);
  corpusSections.push(`### [${symbol.language}] ${safeInline(symbol.symbol)}`);
  corpusSections.push("");
  corpusSections.push(`API-ID: ${symbol.id}`);
  corpusSections.push(`Symbol-Key: ${symbol.symbol_key}`);
  corpusSections.push(`Module: ${symbol.module}`);
  corpusSections.push(`Kind: ${symbol.kind}`);
  corpusSections.push(`Status: ${symbol.status}`);
  corpusSections.push(`Since: ${symbol.since || "unknown"}`);
  corpusSections.push(`Example-Status: ${symbol.example_status}`);
  corpusSections.push(`Canonical-URL: ${symbol.canonical_url}`);
  corpusSections.push(`Counterpart-URL: ${symbol.counterpart_url}`);
  corpusSections.push(`Repository-Source: ${symbol.source}`);
  corpusSections.push(`Related-Documents: ${list(symbol.related_documents?.map((document) => `${document.id} (${manifest.canonical_origin}${document.url})`))}`);
  corpusSections.push(`Summary: ${safeInline(symbol.summary) || "No localized summary is available."}`);
  corpusSections.push("Signatures:");
  if (symbol.signatures.length) {
    for (const signature of symbol.signatures) corpusSections.push(`- ${safeInline(signature)}`);
  } else {
    corpusSections.push("- No signature was extracted; consult the canonical API page.");
  }
  corpusSections.push(`<!-- API ${symbol.id} END -->`);
}

const corpus = `${corpusSections.join("\n").trim()}\n`;
const header = [
  "# Infernux Full Documentation Corpus",
  "",
  "Corpus-Schema: 1",
  `Documented-Release: ${manifest.documented_release}`,
  `Release-Status: ${manifest.release_status}`,
  `Last-Verified: ${manifest.last_verified}`,
  `Curated-Document-Count: ${docsIndex.document_count}`,
  `Learning-Path-Count: ${learningPaths.paths.length}`,
  `Localized-API-Symbol-Count: ${apiIndex.symbol_count}`,
  `Documentation-Health-Schema: ${docsHealth.schema_version}`,
  `Corpus-Content-SHA256: ${corpusHash(corpus)}`,
  `Canonical-Site: ${manifest.canonical_origin}`,
  `Repository: ${manifest.repository}`,
  "",
  "## Agent usage rules",
  "",
  ...manifest.trust_rules.map((rule, index) => `${index + 1}. ${rule}`),
  `${manifest.trust_rules.length + 1}. Prefer the matching language entry; use counterpart URLs only when a localized entry is incomplete.`,
  `${manifest.trust_rules.length + 2}. This corpus is a retrieval surface, not an independent API authority. Exact current signatures remain governed by api-index.json and generated API pages.`,
  "",
  "--- BEGIN CORPUS ---",
  "",
  "",
].join("\n");

const output = `${header}${corpus}`;
const current = await readFile(outputFile, "utf8").catch(() => "");
if (checkOnly) {
  if (current.replace(/\r\n/g, "\n") !== output) {
    throw new Error("llms-full.txt is stale. Run: node docs/tools/build-agent-corpus.mjs");
  }
  console.log(`Verified Agent corpus with ${docsIndex.document_count} documents and ${apiIndex.symbol_count} localized API symbols.`);
} else {
  await writeFile(outputFile, output, "utf8");
  console.log(`Generated Agent corpus with ${docsIndex.document_count} documents and ${apiIndex.symbol_count} localized API symbols.`);
}

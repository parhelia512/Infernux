import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const docsRoot = path.resolve("docs");
const text = (await readFile(path.join(docsRoot, "llms.txt"), "utf8")).replace(/\r\n/g, "\n");
const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
const docsIndex = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
const apiIndex = JSON.parse(await readFile(path.join(docsRoot, "api-index.json"), "utf8"));
const learningPaths = JSON.parse(await readFile(path.join(docsRoot, "learning-paths.json"), "utf8"));
const release = JSON.parse(await readFile(path.join(docsRoot, "release.json"), "utf8"));

const body = text.split("--- BEGIN INDEX ---\n\n", 2)[1];
assert.ok(body, "compact Agent index must expose a fingerprinted body boundary");
const declaredHash = text.match(/^Index-Content-SHA256:\s*([a-f0-9]{64})$/m)?.[1];
const actualHash = createHash("sha256").update(body, "utf8").digest("hex");
assert.equal(declaredHash, actualHash, "compact Agent index fingerprint must cover its complete generated body");
assert.ok(text.includes(`Documented-Release: ${manifest.documented_release}`), "compact index release must match the documentation manifest");
assert.ok(text.includes(`Curated-Document-Count: ${docsIndex.document_count}`), "compact index must declare its curated coverage");
assert.ok(text.includes(`Localized-API-Symbol-Count: ${apiIndex.symbol_count}`), "compact index must declare its API coverage boundary");

for (const document of docsIndex.documents) {
    assert.ok(text.includes(`](${document.canonical_url})`), `compact index is missing curated document '${document.id}'`);
    assert.ok(text.includes(`last_verified=${document.last_verified || "unknown"}`), `compact index is missing freshness evidence for '${document.id}'`);
}
for (const learningPath of learningPaths.paths) {
    for (const step of learningPath.steps) {
        for (const language of ["en", "zh-CN"]) {
            const canonical = new URL(step.documents[language], `${manifest.canonical_origin}/`).toString();
            assert.ok(text.includes(`](${canonical})`), `compact index is missing '${learningPath.id}' step '${step.id}' in ${language}`);
        }
    }
}
for (const route of Object.values(manifest.indexes)) {
    assert.ok(text.includes(`](${new URL(route, `${manifest.canonical_origin}/`).toString()})`), `compact index is missing manifest discovery route '${route}'`);
}
for (const rule of manifest.trust_rules) assert.ok(text.includes(rule), `compact index is missing trust rule '${rule}'`);

const guidanceSymbols = apiIndex.symbols.filter((symbol) => symbol.language === "en" && (symbol.example_status === "curated" || symbol.related_documents?.length));
for (const symbol of guidanceSymbols) {
    assert.ok(text.includes(`](${symbol.canonical_url})`), `compact index is missing guidance-linked API '${symbol.symbol_key}'`);
}
assert.ok(text.includes(`publisher_signature=${release.verification.publisher_signature}`), "compact index must preserve the release signature boundary");
assert.doesNotMatch(text, /[A-Za-z]:\\(?:Users|project)\\/i, "compact index must not leak a local absolute path");
assert.ok(Buffer.byteLength(text, "utf8") < 64 * 1024, "compact Agent index must remain below 64 KiB");

console.log(`Compact Agent index test passed: fingerprint, ${docsIndex.document_count} curated pages, ${guidanceSymbols.length} guidance-linked API symbols, learning routes, discovery surfaces, and trust evidence.`);

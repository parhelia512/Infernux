import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const source = await readFile(path.join(docsRoot, "js", "docs-health.js"), "utf8");
const health = JSON.parse(await readFile(path.join(docsRoot, "docs-health.json"), "utf8"));
const sandbox = { console, Date, globalThis: null, __INFERNUX_DOCS_HEALTH_TEST__: true };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(source, { filename: "docs-health.js" }).runInContext(sandbox);

const normalize = sandbox.__infernuxDocsHealth?.normalizeDocsHealth;
assert.equal(typeof normalize, "function");
const model = normalize(health, new Date("2026-07-15T12:00:00Z"));
assert.equal(model.release, "0.2.1");
assert.equal(model.curatedDocuments, 40);
assert.equal(model.apiSymbols, 158);
assert.equal(model.localizedPages, 198);
assert.equal(model.curatedExamples, 28);
assert.equal(model.examplePercent, 18);
assert.equal(model.relationshipEdges, 112);
assert.equal(model.ageDays, 0);
assert.equal(model.needsReview, false);
assert.equal(model.buildStatus, health.build.status);

const unstampedHealth = {
    ...health,
    build: {
        status: "unstamped",
        source_commit: null,
        source_url: null,
        generated_at: null,
        timestamp_source: "source-commit"
    }
};
assert.equal(normalize(unstampedHealth, new Date("2026-07-15T12:00:00Z")).buildStatus, "unstamped");

const stale = normalize(health, new Date("2027-01-01T00:00:00Z"));
assert.equal(stale.needsReview, true);
assert.throws(() => normalize({ schema_version: 2 }, new Date()), /Unsupported/);

console.log("Documentation health client test passed: coverage, freshness, provenance, and stale-state policy.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const docsRoot = path.resolve("docs");
const source = await readFile(path.join(docsRoot, "js", "download.js"), "utf8");
const manifest = JSON.parse(await readFile(path.join(docsRoot, "release.json"), "utf8"));
const html = await readFile(path.join(docsRoot, "download.html"), "utf8");
const listeners = new Map();
const sandbox = {
    CSS: { escape(value) { return value; } },
    Date,
    Intl,
    URL,
    console,
    document: {
        addEventListener(type, handler) { listeners.set(type, handler); },
        documentElement: { lang: "en" }
    },
    globalThis: null,
    __INFERNUX_DOWNLOAD_TEST__: true
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(source, { filename: "download.js" }).runInContext(sandbox);

const { normalizeReleaseManifest } = sandbox.InfernuxDownloadTest;
const accepted = normalizeReleaseManifest(manifest);
assert.equal(accepted.version, manifest.version, "the reviewed release manifest should be accepted");
assert.equal(accepted.assets.length, 2, "the client should accept the installer and wheel only");
assert.equal(accepted.verification.publisher_signature, "not-declared", "the signature boundary must remain explicit");

function changed(mutator) {
    const candidate = structuredClone(manifest);
    mutator(candidate);
    return candidate;
}

for (const [label, candidate] of [
    ["old schema", changed((value) => { value.schema_version = 1; })],
    ["mismatched tag", changed((value) => { value.tag = "v9.9.9"; })],
    ["another repository", changed((value) => { value.release_url = "https://github.com/example/Infernux/releases/tag/v0.2.1"; })],
    ["undeclared publisher signature", changed((value) => { delete value.verification.publisher_signature; })],
    ["weaker checksum algorithm", changed((value) => { value.verification.checksum_algorithm = "MD5"; })],
    ["duplicate artifact kind", changed((value) => { value.assets[1].kind = value.assets[0].kind; })],
    ["unsafe artifact name", changed((value) => { value.assets[0].name = "../installer.exe"; })],
    ["wrong release asset URL", changed((value) => { value.assets[0].url = "https://example.com/installer.exe"; })],
    ["invalid checksum", changed((value) => { value.assets[0].sha256 = "unknown"; })],
    ["invalid size", changed((value) => { value.assets[0].size_bytes = -1; })]
]) {
    assert.throws(() => normalizeReleaseManifest(candidate), /Invalid release manifest/, `${label} must fall back instead of reaching the download UI`);
}

assert.ok(html.includes('data-i18n="downloadPage.signature.none"'), "download page must disclose that no publisher signature is declared");
assert.ok(html.includes('data-i18n="downloadPage.verify.boundary"'), "download page must distinguish checksum integrity from publisher identity");
assert.ok(html.includes('href="https://github.com/ChenlizheMe/Infernux/releases"'), "download page must expose the canonical older-release archive");
assert.ok(html.includes('js/i18n-download.js?v=2'), "download page must load the current trust-boundary translations");
assert.ok(html.includes('js/download.js?v=2'), "download page must load the current validated manifest client");
assert.doesNotMatch(source, /\.innerHTML\s*=/, "download client must construct release notes without HTML injection");
assert.equal(typeof listeners.get("DOMContentLoaded"), "function", "download client must initialize after document parsing");

console.log("Download trust-boundary test passed: canonical manifest validation, explicit signature limits, safe release-note rendering, and older-release discovery.");

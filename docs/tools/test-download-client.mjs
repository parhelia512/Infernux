import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const docsRoot = path.resolve("docs");
const source = await readFile(path.join(docsRoot, "js", "download.js"), "utf8");
const html = await readFile(path.join(docsRoot, "download.html"), "utf8");
const listeners = new Map();
const link = { href: "" };
const select = {
    value: "https://github.com/ChenlizheMe/Infernux/releases/tag/v0.2.1",
    closest() { return { querySelector() { return link; } }; },
    addEventListener(type, handler) { listeners.set(type, handler); }
};
const sandbox = {
    document: {
        addEventListener(type, handler) { listeners.set(type, handler); },
        querySelectorAll() { return [select]; }
    }
};
vm.createContext(sandbox);
new vm.Script(source, { filename: "download.js" }).runInContext(sandbox);
listeners.get("DOMContentLoaded")();

assert.equal(link.href, select.value, "the version button should follow the selected release");
select.value = "https://github.com/ChenlizheMe/Infernux/releases/tag/v0.1.6";
listeners.get("change")();
assert.equal(link.href, select.value, "changing versions should update the release link");
assert.match(html, /InfernuxHub/, "the primary download must be presented as InfernuxHub");
assert.match(html, /0\.2\.9[\s\S]*0\.2\.1[\s\S]*0\.2\.0/, "the page should offer multiple engine versions");
assert.doesNotMatch(html, /SHA-?256|checksum|校验码|publisher signature/i, "ordinary downloads should not expose verification clutter");
assert.doesNotMatch(html, /pwa-install\.js/, "the download page should not load the documentation-app installer");

console.log("Download page test passed: InfernuxHub is primary and engine versions are selectable without verification clutter.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(scriptDir, "..", "js", "pwa-install.js"), "utf8");
const i18nSource = await readFile(path.join(scriptDir, "i18n-source.json"), "utf8");

function scenario({ userAgent = "Mozilla/5.0 Chrome/148 Safari/537.36", platform = "Win32", maxTouchPoints = 0, standalone = false } = {}) {
    const windowListeners = new Map();
    const documentListeners = new Map();
    const timers = [];
    const mediaListeners = new Map();
    const media = {
        matches: standalone,
        addEventListener(type, handler) { mediaListeners.set(type, handler); }
    };
    const root = { dataset: {} };
    const status = { dataset: {}, textContent: "" };
    const button = {
        disabled: false,
        hidden: true,
        listeners: new Map(),
        addEventListener(type, handler) { this.listeners.set(type, handler); }
    };
    const document = {
        documentElement: { lang: "en" },
        addEventListener(type, handler) { documentListeners.set(type, handler); },
        getElementById(id) {
            if (id === "pwa-install-status") return status;
            if (id === "pwa-install-button") return button;
            return null;
        },
        querySelector(selector) { return selector === "[data-pwa-install]" ? root : null; }
    };
    const window = {
        addEventListener(type, handler) { windowListeners.set(type, handler); },
        matchMedia() { return media; }
    };
    const sandbox = {
        __INFERNUX_PWA_INSTALL_TEST__: true,
        clearTimeout(timer) { timer.cancelled = true; },
        console,
        document,
        globalThis: null,
        navigator: { maxTouchPoints, platform, standalone, userAgent },
        setTimeout(handler, milliseconds) {
            const timer = { cancelled: false, handler, milliseconds };
            timers.push(timer);
            return timer;
        },
        translateSiteKey(key) { return `copy:${document.documentElement.lang}:${key}`; },
        window
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    new vm.Script(source, { filename: "pwa-install.js" }).runInContext(sandbox);
    documentListeners.get("DOMContentLoaded")();
    return { button, document, documentListeners, media, mediaListeners, root, sandbox, status, timers, windowListeners };
}

const chromium = scenario();
assert.equal(chromium.sandbox.__infernuxPwaInstall.getState(), "checking");
assert.equal(chromium.button.hidden, true);
assert.equal(chromium.timers[0].milliseconds, 2500);

let prevented = 0;
let promptCalls = 0;
const promptEvent = {
    preventDefault() { prevented += 1; },
    async prompt() { promptCalls += 1; return { outcome: "dismissed" }; }
};
chromium.windowListeners.get("beforeinstallprompt")(promptEvent);
assert.equal(prevented, 1);
assert.equal(promptCalls, 0, "the site must never prompt before an explicit user action");
assert.equal(chromium.sandbox.__infernuxPwaInstall.getState(), "ready");
assert.equal(chromium.button.hidden, false);
await chromium.button.listeners.get("click")();
assert.equal(promptCalls, 1);
assert.equal(chromium.sandbox.__infernuxPwaInstall.getState(), "dismissed");
assert.equal(chromium.button.hidden, true);

chromium.windowListeners.get("appinstalled")();
assert.equal(chromium.sandbox.__infernuxPwaInstall.getState(), "installed");
chromium.document.documentElement.lang = "zh-CN";
chromium.documentListeners.get("site:language-changed")();
assert.match(chromium.status.textContent, /^copy:zh-CN:/);

const installed = scenario({ standalone: true });
assert.equal(installed.sandbox.__infernuxPwaInstall.getState(), "installed");
assert.equal(installed.button.hidden, true);

const iosSafari = scenario({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 });
assert.equal(iosSafari.sandbox.__infernuxPwaInstall.getState(), "iosSafari");

const iosChrome = scenario({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/148.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 });
assert.equal(iosChrome.sandbox.__infernuxPwaInstall.getState(), "iosOther");

const unsupported = scenario({ userAgent: "Mozilla/5.0 Firefox/147" });
unsupported.timers[0].handler();
assert.equal(unsupported.sandbox.__infernuxPwaInstall.getState(), "unavailable");
assert.equal(unsupported.button.hidden, true);

const statusKeys = [...source.matchAll(/downloadPage\.webApp\.status\.[A-Za-z]+/g)].map((match) => match[0]);
for (const key of new Set(statusKeys)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.equal((i18nSource.match(new RegExp(`^[ \\t]*["']${escaped}["']\\s*:`, "gm")) || []).length, 2, `${key} must have English and Chinese copy`);
}

assert.doesNotMatch(source, /localStorage|sessionStorage|innerHTML/);
console.log("PWA install interaction test passed: explicit Chromium prompt, single-use dismissal, installed state, iOS guidance, unsupported fallback, and live localization.");

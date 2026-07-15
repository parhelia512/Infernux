(function () {
    "use strict";

    const STATUS_KEYS = {
        checking: "downloadPage.webApp.status.checking",
        ready: "downloadPage.webApp.status.ready",
        prompting: "downloadPage.webApp.status.prompting",
        accepted: "downloadPage.webApp.status.accepted",
        dismissed: "downloadPage.webApp.status.dismissed",
        installed: "downloadPage.webApp.status.installed",
        iosSafari: "downloadPage.webApp.status.iosSafari",
        iosOther: "downloadPage.webApp.status.iosOther",
        unavailable: "downloadPage.webApp.status.unavailable",
        failed: "downloadPage.webApp.status.failed"
    };

    let deferredPrompt = null;
    let installState = "checking";
    let elements = null;
    let fallbackTimer = null;

    function translation(key) {
        if (typeof globalThis.translateSiteKey === "function") {
            return globalThis.translateSiteKey(key) || key;
        }
        return key;
    }

    function isStandalone() {
        return window.matchMedia?.("(display-mode: standalone)").matches === true
            || navigator.standalone === true;
    }

    function isIos() {
        return /iPad|iPhone|iPod/i.test(navigator.userAgent || "")
            || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }

    function isSafari() {
        const agent = navigator.userAgent || "";
        return /Safari/i.test(agent) && !/(CriOS|FxiOS|EdgiOS|OPiOS|Android)/i.test(agent);
    }

    function renderState() {
        if (!elements) return;
        const { root, status, button } = elements;
        root.dataset.installState = installState;
        status.dataset.installState = installState;
        status.dataset.i18n = STATUS_KEYS[installState];
        status.textContent = translation(STATUS_KEYS[installState]);
        button.hidden = installState !== "ready";
        button.disabled = installState === "prompting";
    }

    function setInstallState(nextState) {
        if (!STATUS_KEYS[nextState]) return;
        installState = nextState;
        renderState();
    }

    function cancelFallbackTimer() {
        if (fallbackTimer !== null) clearTimeout(fallbackTimer);
        fallbackTimer = null;
    }

    function detectFallback() {
        cancelFallbackTimer();
        if (isStandalone()) {
            setInstallState("installed");
            return;
        }
        if (deferredPrompt) {
            setInstallState("ready");
            return;
        }
        if (isIos()) {
            setInstallState(isSafari() ? "iosSafari" : "iosOther");
            return;
        }
        setInstallState("checking");
        fallbackTimer = setTimeout(() => {
            if (!deferredPrompt && !isStandalone()) setInstallState("unavailable");
        }, 2500);
    }

    function handleBeforeInstallPrompt(event) {
        if (isStandalone()) return;
        event.preventDefault();
        deferredPrompt = event;
        cancelFallbackTimer();
        setInstallState("ready");
    }

    async function requestInstall() {
        const promptEvent = deferredPrompt;
        if (!promptEvent || installState !== "ready") return;
        deferredPrompt = null;
        setInstallState("prompting");
        try {
            const promptResult = await promptEvent.prompt();
            const choice = promptResult?.outcome
                ? promptResult
                : await promptEvent.userChoice;
            if (installState !== "installed") {
                setInstallState(choice?.outcome === "accepted" ? "accepted" : "dismissed");
            }
        } catch (error) {
            console.warn("Infernux web app installation could not be opened.", error);
            if (installState !== "installed") setInstallState("failed");
        }
    }

    function handleInstalled() {
        deferredPrompt = null;
        cancelFallbackTimer();
        setInstallState("installed");
    }

    function initialize() {
        const root = document.querySelector("[data-pwa-install]");
        const status = document.getElementById("pwa-install-status");
        const button = document.getElementById("pwa-install-button");
        if (!root || !status || !button) return;
        elements = { root, status, button };
        button.addEventListener("click", requestInstall);
        window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", detectFallback);
        detectFallback();
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    document.addEventListener("DOMContentLoaded", initialize);
    document.addEventListener("site:language-changed", renderState);

    if (globalThis.__INFERNUX_PWA_INSTALL_TEST__) {
        globalThis.__infernuxPwaInstall = {
            detectFallback,
            getState: () => installState,
            handleBeforeInstallPrompt,
            handleInstalled,
            isIos,
            isSafari,
            isStandalone,
            requestInstall
        };
    }
})();

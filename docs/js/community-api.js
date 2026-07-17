(() => {
    "use strict";

    const API_ORIGIN = "https://infernux-community.chenlizheme.workers.dev";
    const SESSION_KEY = "infernux-community-session-v1";
    const SESSION_PATTERN = /^v1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{32,}$/;
    let currentSession = null;

    function readStoredSession() {
        try {
            const persistent = localStorage.getItem(SESSION_KEY) || "";
            if (SESSION_PATTERN.test(persistent)) return persistent;
            const legacy = sessionStorage.getItem(SESSION_KEY) || "";
            if (SESSION_PATTERN.test(legacy)) {
                localStorage.setItem(SESSION_KEY, legacy);
                sessionStorage.removeItem(SESSION_KEY);
                return legacy;
            }
            return "";
        } catch {
            return "";
        }
    }

    function storeSession(value) {
        currentSession = SESSION_PATTERN.test(value || "") ? value : "";
        try {
            if (currentSession) localStorage.setItem(SESSION_KEY, currentSession);
            else localStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(SESSION_KEY);
        } catch {}
    }

    function consumeOAuthResult() {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const value = hash.get("forum_session") || "";
        if (SESSION_PATTERN.test(value)) storeSession(value);
        if (!value && !new URLSearchParams(window.location.search).has("forum_auth")) return;
        const clean = new URL(window.location.href);
        clean.hash = "";
        clean.searchParams.delete("forum_auth");
        history.replaceState(null, "", `${clean.pathname}${clean.search}`);
    }

    async function responseJson(response) {
        const payload = await response.json().catch(() => null);
        if (response.ok) return payload;
        const error = new Error(payload?.error?.message || `Community API ${response.status}`);
        error.code = payload?.error?.code || "community_api_error";
        error.status = response.status;
        error.details = payload?.error?.details;
        throw error;
    }

    async function refresh() {
        if (!currentSession) return false;
        try {
            const response = await fetch(`${API_ORIGIN}/api/session/refresh`, {
                method: "POST",
                headers: { Authorization: `Bearer ${currentSession}` },
                mode: "cors",
                cache: "no-store"
            });
            const payload = await responseJson(response);
            storeSession(payload?.session || "");
            return Boolean(currentSession);
        } catch {
            storeSession("");
            return false;
        }
    }

    async function request(path, options = {}, retry = true) {
        const headers = new Headers(options.headers || {});
        if (currentSession) headers.set("Authorization", `Bearer ${currentSession}`);
        const response = await fetch(`${API_ORIGIN}${path}`, {
            ...options,
            headers,
            mode: "cors",
            cache: "no-store"
        });
        try {
            return await responseJson(response);
        } catch (error) {
            if (retry && error.code === "github_auth_expired" && await refresh()) return request(path, options, false);
            throw error;
        }
    }

    async function session() {
        if (!currentSession) return { authenticated: false, user: null };
        try {
            return await request("/api/session");
        } catch (error) {
            if (error?.status === 401) {
                storeSession("");
                return { authenticated: false, user: null };
            }
            throw error;
        }
    }

    async function signIn() {
        const health = await fetch(`${API_ORIGIN}/health`, {
            mode: "cors",
            cache: "no-store",
            signal: AbortSignal.timeout(4000)
        });
        if (!health.ok) throw new Error(`Community sign-in service ${health.status}`);
        window.location.assign(`${API_ORIGIN}/oauth/start`);
    }

    function signOut() {
        storeSession("");
    }

    consumeOAuthResult();
    currentSession ||= readStoredSession();

    globalThis.InfernuxCommunityApi = Object.freeze({
        apiOrigin: API_ORIGIN,
        request,
        session,
        signIn,
        signOut,
        token: () => currentSession
    });
})();

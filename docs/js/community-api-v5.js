(() => {
    "use strict";

    const FALLBACK_API_ORIGIN = "https://community-api.infernux-engine.com";
    const WORKERS_API_ORIGIN = "https://infernux-community.chenlizheme.workers.dev";
    const SAME_ORIGIN_PREFIX = "/community-api";
    const PRODUCTION_HOSTS = new Set(["infernux-engine.com", "www.infernux-engine.com"]);
    const sameOriginApi = PRODUCTION_HOSTS.has(window.location.hostname) ? `${window.location.origin}${SAME_ORIGIN_PREFIX}` : "";
    const apiOrigins = [...new Set([sameOriginApi, FALLBACK_API_ORIGIN, WORKERS_API_ORIGIN].filter(Boolean))];
    const SESSION_KEY = "infernux-community-session-v1";
    const GATEWAY_KEY = "infernux-community-gateway-v1";
    const SESSION_PATTERN = /^v1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{32,}$/;
    let currentSession = null;
    let activeApiOrigin = readPreferredGateway();

    function readPreferredGateway() {
        try {
            const preferred = localStorage.getItem(GATEWAY_KEY) || "";
            if (apiOrigins.includes(preferred)) return preferred;
            const existingSession = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || "";
            if (SESSION_PATTERN.test(existingSession) && apiOrigins.includes(FALLBACK_API_ORIGIN)) return FALLBACK_API_ORIGIN;
        } catch {}
        return apiOrigins[0];
    }

    function rememberGateway(origin) {
        activeApiOrigin = origin;
        try { localStorage.setItem(GATEWAY_KEY, origin); } catch {}
    }

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

    function gatewayRequestUrl(origin, path) {
        if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
            throw new TypeError("Community API paths must be root-relative");
        }
        return new URL(`${origin.replace(/\/+$/, "")}${path}`).href;
    }

    async function gatewayFetch(path, options = {}, allowFallback = false, preferredOrigin = activeApiOrigin) {
        const candidates = [preferredOrigin, ...apiOrigins.filter((origin) => origin !== preferredOrigin)];
        let lastError = null;
        let lastResponse = null;
        for (const origin of candidates) {
            try {
                const response = await fetch(gatewayRequestUrl(origin, path), options);
                if (allowFallback && response.status === 404 && origin !== candidates.at(-1)) {
                    lastResponse = response;
                    continue;
                }
                rememberGateway(origin);
                return response;
            } catch (error) {
                lastError = error;
                if (!allowFallback) throw error;
            }
        }
        if (lastResponse) return lastResponse;
        throw lastError || new Error("Community gateway is unavailable");
    }

    async function refresh() {
        if (!currentSession) return false;
        try {
            const response = await gatewayFetch("/api/session/refresh", {
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
        const method = String(options.method || "GET").toUpperCase();
        const response = await gatewayFetch(path, {
            ...options,
            headers,
            mode: "cors",
            cache: "no-store"
        }, method === "GET" || method === "HEAD");
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

    async function discussionFeed(signal) {
        const response = await gatewayFetch("/api/discussions-feed", {
            mode: "cors",
            cache: "default",
            signal
        }, true);
        if (!response.ok) throw new Error(`Community feed ${response.status}`);
        const contentType = response.headers.get("Content-Type") || "";
        if (!contentType.toLowerCase().includes("application/atom+xml")) throw new Error("Community feed has an invalid content type");
        return response.text();
    }

    async function signIn() {
        const health = await gatewayFetch("/health", {
            mode: "cors",
            cache: "no-store",
            signal: AbortSignal.timeout(4000)
        }, true, WORKERS_API_ORIGIN);
        if (!health.ok) throw new Error(`Community sign-in service ${health.status}`);
        window.location.assign(gatewayRequestUrl(activeApiOrigin, "/oauth/start"));
    }

    function signOut() {
        storeSession("");
    }

    consumeOAuthResult();
    currentSession ||= readStoredSession();

    globalThis.InfernuxCommunityApi = Object.freeze({
        get apiOrigin() { return activeApiOrigin; },
        apiOrigins: Object.freeze([...apiOrigins]),
        request,
        session,
        discussionFeed,
        signIn,
        signOut,
        token: () => currentSession
    });
})();

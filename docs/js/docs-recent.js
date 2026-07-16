(function initializeRecentDocumentsStore(root) {
    "use strict";

    const KEY = "infernux-recent-documents-v1";
    const MAX_ITEMS = 8;
    const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
    const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
    const CANONICAL_ORIGIN = "https://infernux-engine.com";
    const ROUTE_PATTERN = /^\/wiki\/site\/(en|zh)\/(learn|manual|architecture|api)\/[A-Za-z0-9._/-]+\.html$/;
    const VALID_STATUSES = new Set(["stable", "preview", "experimental", "deprecated"]);

    function compactText(value, limit = 160) {
        return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
    }

    function parseRoute(value) {
        try {
            const url = new URL(String(value || ""), CANONICAL_ORIGIN);
            if (url.origin !== CANONICAL_ORIGIN) return null;
            const match = url.pathname.match(ROUTE_PATTERN);
            if (!match || url.pathname.includes("/404.html")) return null;
            return {
                url: url.pathname,
                language: match[1] === "zh" ? "zh-CN" : "en",
                layer: match[2]
            };
        } catch {
            return null;
        }
    }

    function normalizeItem(item, now) {
        if (!item || typeof item !== "object") return null;
        const route = parseRoute(item.url);
        const title = compactText(item.title);
        const visitedAt = Number(item.visited_at);
        if (!route || !title || !Number.isFinite(visitedAt) || visitedAt <= 0) return null;
        if (visitedAt < now - MAX_AGE_MS || visitedAt > now + FUTURE_TOLERANCE_MS) return null;
        const status = VALID_STATUSES.has(item.status) ? item.status : "";
        return { ...route, title, status, visited_at: Math.round(visitedAt) };
    }

    function normalize(value, now = Date.now()) {
        try {
            const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
            if (!Array.isArray(parsed)) return [];
            const documents = new Map();
            for (const item of parsed) {
                const normalized = normalizeItem(item, now);
                if (!normalized) continue;
                const existing = documents.get(normalized.url);
                if (!existing || normalized.visited_at > existing.visited_at) documents.set(normalized.url, normalized);
            }
            return [...documents.values()]
                .sort((left, right) => right.visited_at - left.visited_at)
                .slice(0, MAX_ITEMS);
        } catch {
            return [];
        }
    }

    function resolveStorage(storage) {
        return storage || root.localStorage || null;
    }

    function read({ storage, now = Date.now() } = {}) {
        try {
            return normalize(resolveStorage(storage)?.getItem(KEY), now);
        } catch {
            return [];
        }
    }

    function write(documents, { storage, now = Date.now() } = {}) {
        try {
            const normalized = normalize(documents, now);
            resolveStorage(storage)?.setItem(KEY, JSON.stringify(normalized));
            return normalized;
        } catch {
            return [];
        }
    }

    function record(item, { storage, now = Date.now() } = {}) {
        const normalized = normalizeItem({ ...item, visited_at: now }, now);
        if (!normalized) return read({ storage, now });
        return write([normalized, ...read({ storage, now })], { storage, now });
    }

    function clear({ storage } = {}) {
        try {
            resolveStorage(storage)?.removeItem(KEY);
            return true;
        } catch {
            return false;
        }
    }

    root.InfernuxRecentDocuments = Object.freeze({
        KEY,
        MAX_ITEMS,
        clear,
        normalize,
        parseRoute,
        read,
        record,
        write
    });
})(globalThis);

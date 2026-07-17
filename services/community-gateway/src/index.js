const GITHUB_API = "https://api.github.com";
const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const GITHUB_OAUTH = "https://github.com/login/oauth";
const SESSION_VERSION = "v1";
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 65536;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ANONYMOUS_FEED_CACHE_SECONDS = 5 * 60;
const OAUTH_STATE_COOKIE = "infernux_forum_state";
const ALLOWED_IMAGES = Object.freeze({
    "image/png": Object.freeze({ extension: "png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }),
    "image/jpeg": Object.freeze({ extension: "jpg", signature: [0xff, 0xd8, 0xff] }),
    "image/gif": Object.freeze({ extension: "gif", signature: [0x47, 0x49, 0x46, 0x38] }),
    "image/webp": Object.freeze({ extension: "webp", signature: [0x52, 0x49, 0x46, 0x46] })
});

function base64Url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64(value) {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(normalized + padding);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function utf8(value) {
    return new TextEncoder().encode(value);
}

function decodeUtf8(value) {
    return new TextDecoder().decode(value);
}

async function sessionKey(env) {
    const raw = fromBase64(env.SESSION_ENCRYPTION_KEY);
    if (raw.byteLength !== 32) throw new Error("SESSION_ENCRYPTION_KEY must contain 32 bytes");
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function sealSession(payload, env) {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, await sessionKey(env), utf8(JSON.stringify(payload)));
    return `${SESSION_VERSION}.${base64Url(nonce)}.${base64Url(new Uint8Array(encrypted))}`;
}

async function openSession(value, env) {
    try {
        const [version, nonceValue, encryptedValue, extra] = String(value || "").split(".");
        if (version !== SESSION_VERSION || !nonceValue || !encryptedValue || extra) return null;
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fromBase64(nonceValue) },
            await sessionKey(env),
            fromBase64(encryptedValue)
        );
        const payload = JSON.parse(decodeUtf8(decrypted));
        if (payload?.type !== "forum-session" || !payload.accessToken || !payload.user?.login) return null;
        return payload;
    } catch {
        return null;
    }
}

function corsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "Vary": "Origin",
        "X-Content-Type-Options": "nosniff"
    };
}

function jsonResponse(data, status, origin) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" }
    });
}

function errorResponse(code, message, status, origin, details = undefined) {
    return jsonResponse({ error: { code, message, ...(details ? { details } : {}) } }, status, origin);
}

function requestOrigin(request, env) {
    const origin = request.headers.get("Origin");
    return origin === env.SITE_ORIGIN ? origin : null;
}

function readCookie(request, name) {
    const cookie = request.headers.get("Cookie") || "";
    for (const part of cookie.split(";")) {
        const [key, ...value] = part.trim().split("=");
        if (key === name) return decodeURIComponent(value.join("="));
    }
    return "";
}

function randomToken(bytes = 24) {
    return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function bearerToken(request) {
    const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+([^\s]+)$/i);
    return match?.[1] || "";
}

async function requestSession(request, env) {
    const opaque = bearerToken(request);
    return opaque ? openSession(opaque, env) : null;
}

function githubHeaders(token, mediaType = "application/vnd.github+json") {
    return {
        Accept: mediaType,
        Authorization: `Bearer ${token}`,
        "User-Agent": "Infernux-Community/1.0",
        "X-GitHub-Api-Version": "2022-11-28"
    };
}

async function githubJson(url, options, token) {
    const response = await fetch(url, {
        ...options,
        headers: { ...githubHeaders(token), ...(options?.headers || {}) }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(data?.message || `GitHub API ${response.status}`);
        error.status = response.status;
        error.github = data;
        error.rateRemaining = response.headers.get("X-RateLimit-Remaining");
        error.rateReset = response.headers.get("X-RateLimit-Reset");
        throw error;
    }
    return { data, response };
}

function publicReadToken(session, env) {
    return session?.accessToken || env.GITHUB_READ_TOKEN || "";
}

function discussionCacheRequest(page, perPage) {
    const url = new URL("https://community-cache.infernux.invalid/discussions");
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    return new Request(url, { method: "GET" });
}

async function listDiscussions(request, env, origin, session, context) {
    const source = new URL(request.url);
    const page = Math.max(1, Math.min(100, Number(source.searchParams.get("page")) || 1));
    const perPage = Math.max(1, Math.min(50, Number(source.searchParams.get("per_page")) || 20));
    const edgeCache = !session ? globalThis.caches?.default : null;
    const cacheRequest = edgeCache ? discussionCacheRequest(page, perPage) : null;
    if (edgeCache) {
        const cached = await edgeCache.match(cacheRequest);
        if (cached) return jsonResponse(await cached.json(), 200, origin);
    }
    const token = publicReadToken(session, env);
    if (!token) return errorResponse("gateway_not_configured", "The forum read token is not configured.", 503, origin);
    const url = new URL(`${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/discussions`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("sort", "updated");
    url.searchParams.set("direction", "desc");
    try {
        const { data, response } = await githubJson(url, { method: "GET" }, token);
        const payload = {
            items: data,
            rate: {
                remaining: Number(response.headers.get("X-RateLimit-Remaining")),
                reset: Number(response.headers.get("X-RateLimit-Reset"))
            }
        };
        if (edgeCache) {
            const cacheWrite = edgeCache.put(cacheRequest, new Response(JSON.stringify(payload), {
                headers: {
                    "Cache-Control": `public, max-age=${ANONYMOUS_FEED_CACHE_SECONDS}`,
                    "Content-Type": "application/json; charset=utf-8"
                }
            }));
            if (context?.waitUntil) context.waitUntil(cacheWrite);
            else await cacheWrite;
        }
        return jsonResponse(payload, 200, origin);
    } catch (error) {
        return githubFailure(error, origin);
    }
}

async function getDiscussion(number, env, origin, session) {
    const token = publicReadToken(session, env);
    if (!token) return errorResponse("gateway_not_configured", "The forum read token is not configured.", 503, origin);
    try {
        const { data, response } = await githubJson(
            `${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/discussions/${number}`,
            { method: "GET", headers: { Accept: "application/vnd.github.html+json" } },
            token
        );
        return jsonResponse({
            discussion: data,
            rate: {
                remaining: Number(response.headers.get("X-RateLimit-Remaining")),
                reset: Number(response.headers.get("X-RateLimit-Reset"))
            }
        }, 200, origin);
    } catch (error) {
        return githubFailure(error, origin);
    }
}

async function readJsonBody(request, maxBytes = 70 * 1024) {
    const contentLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("request_too_large");
    const text = await request.text();
    if (utf8(text).byteLength > maxBytes) throw new Error("request_too_large");
    return JSON.parse(text);
}

function normalizeDiscussionInput(value) {
    const title = typeof value?.title === "string" ? value.title.trim() : "";
    const body = typeof value?.body === "string" ? value.body.trim() : "";
    const categoryId = typeof value?.categoryId === "string" ? value.categoryId.trim() : "";
    if (title.length < 4 || title.length > MAX_TITLE_LENGTH) return null;
    if (!body || body.length > MAX_BODY_LENGTH) return null;
    if (!/^DIC_[A-Za-z0-9_-]+$/.test(categoryId)) return null;
    return { title, body, categoryId };
}

async function createDiscussion(request, env, origin, session) {
    if (!session) return errorResponse("authentication_required", "Sign in with GitHub before publishing.", 401, origin);
    let input;
    try {
        input = normalizeDiscussionInput(await readJsonBody(request));
    } catch (error) {
        const tooLarge = error?.message === "request_too_large";
        return errorResponse(tooLarge ? "request_too_large" : "invalid_json", tooLarge ? "The post is too large." : "The request body is invalid.", tooLarge ? 413 : 400, origin);
    }
    if (!input) return errorResponse("invalid_discussion", "Provide a valid title, body, and category.", 422, origin);
    const query = `mutation CreateDiscussion($input: CreateDiscussionInput!) {
        createDiscussion(input: $input) {
            discussion { id number title url body createdAt updatedAt author { login avatarUrl url } category { id name slug isAnswerable } }
        }
    }`;
    try {
        const { data } = await githubJson(GITHUB_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                variables: {
                    input: {
                        repositoryId: env.GITHUB_REPOSITORY_ID,
                        categoryId: input.categoryId,
                        title: input.title,
                        body: input.body,
                        clientMutationId: crypto.randomUUID()
                    }
                }
            })
        }, session.accessToken);
        if (data.errors?.length || !data.data?.createDiscussion?.discussion) {
            return errorResponse("github_graphql_error", "GitHub rejected the new topic.", 502, origin, data.errors || []);
        }
        return jsonResponse({ discussion: data.data.createDiscussion.discussion }, 201, origin);
    } catch (error) {
        return githubFailure(error, origin);
    }
}

function imageType(bytes, declaredType) {
    const definition = ALLOWED_IMAGES[declaredType];
    if (!definition) return null;
    if (declaredType === "image/webp") {
        const riff = definition.signature.every((value, index) => bytes[index] === value);
        const webp = [0x57, 0x45, 0x42, 0x50].every((value, index) => bytes[index + 8] === value);
        return riff && webp ? definition : null;
    }
    return definition.signature.every((value, index) => bytes[index] === value) ? definition : null;
}

async function uploadImage(request, env, origin, session) {
    if (!session) return errorResponse("authentication_required", "Sign in with GitHub before uploading images.", 401, origin);
    if (!env.COMMUNITY_UPLOADS) return errorResponse("uploads_not_configured", "Image storage is not configured.", 503, origin);
    const length = Number(request.headers.get("Content-Length"));
    if (!Number.isFinite(length) || length < 1 || length > MAX_IMAGE_BYTES) {
        return errorResponse("invalid_image_size", "Images must be between 1 byte and 5 MiB.", 413, origin);
    }
    const declaredType = (request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength !== length || bytes.byteLength > MAX_IMAGE_BYTES) return errorResponse("invalid_image_size", "The image size is invalid.", 413, origin);
    const definition = imageType(bytes, declaredType);
    if (!definition) return errorResponse("invalid_image_type", "Use a PNG, JPEG, GIF, or WebP image.", 415, origin);
    const date = new Date();
    const key = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${definition.extension}`;
    await env.COMMUNITY_UPLOADS.put(key, bytes, {
        httpMetadata: { contentType: declaredType, cacheControl: "public, max-age=31536000, immutable" },
        customMetadata: { uploadedBy: session.user.login }
    });
    const mediaUrl = new URL(`/media/${key}`, request.url).href;
    return jsonResponse({ url: mediaUrl, markdown: `![image](${mediaUrl})` }, 201, origin);
}

async function serveImage(request, env, key) {
    if (!env.COMMUNITY_UPLOADS || !/^[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.(?:png|jpg|gif|webp)$/.test(key)) return new Response("Not found", { status: 404 });
    const object = await env.COMMUNITY_UPLOADS.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Content-Security-Policy", "default-src 'none'");
    headers.set("X-Content-Type-Options", "nosniff");
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
}

function githubFailure(error, origin) {
    const status = error?.status === 401 ? 401 : error?.status === 403 ? 429 : error?.status === 404 ? 404 : 502;
    const code = status === 401 ? "github_auth_expired" : status === 429 ? "github_rate_limited" : status === 404 ? "not_found" : "github_unavailable";
    return errorResponse(code, error?.message || "GitHub is unavailable.", status, origin, {
        remaining: error?.rateRemaining ?? null,
        reset: error?.rateReset ? Number(error.rateReset) : null
    });
}

async function oauthStart(request, env) {
    const state = randomToken();
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    authorize.searchParams.set("state", state);
    return new Response(null, {
        status: 302,
        headers: {
            Location: authorize.href,
            "Set-Cookie": `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/oauth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer"
        }
    });
}

async function oauthCallback(request, env) {
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    if (!state || !code || state !== readCookie(request, OAUTH_STATE_COOKIE)) return new Response("Invalid OAuth state", { status: 400 });
    const response = await fetch(`${GITHUB_OAUTH}/access_token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Infernux-Community/1.0" },
        body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code })
    });
    const token = await response.json().catch(() => null);
    if (!response.ok || !token?.access_token) return new Response("GitHub sign-in failed", { status: 502 });
    const { data: user } = await githubJson(`${GITHUB_API}/user`, { method: "GET" }, token.access_token);
    const now = Math.floor(Date.now() / 1000);
    const session = await sealSession({
        type: "forum-session",
        accessToken: token.access_token,
        refreshToken: token.refresh_token || "",
        expiresAt: now + Math.max(300, Number(token.expires_in) || 8 * 60 * 60),
        refreshExpiresAt: now + Math.max(3600, Number(token.refresh_token_expires_in) || 180 * 24 * 60 * 60),
        user: { login: user.login, avatarUrl: user.avatar_url, url: user.html_url }
    }, env);
    const destination = new URL("/community.html", env.SITE_ORIGIN);
    destination.searchParams.set("forum_auth", "complete");
    destination.hash = `forum_session=${encodeURIComponent(session)}`;
    return new Response(null, {
        status: 302,
        headers: {
            Location: destination.href,
            "Set-Cookie": `${OAUTH_STATE_COOKIE}=; Path=/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer"
        }
    });
}

async function refreshSession(request, env, origin) {
    const session = await requestSession(request, env);
    if (!session?.refreshToken || session.refreshExpiresAt <= Math.floor(Date.now() / 1000)) {
        return errorResponse("session_expired", "Sign in with GitHub again.", 401, origin);
    }
    const response = await fetch(`${GITHUB_OAUTH}/access_token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Infernux-Community/1.0" },
        body: new URLSearchParams({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: session.refreshToken
        })
    });
    const token = await response.json().catch(() => null);
    if (!response.ok || !token?.access_token) return errorResponse("session_expired", "Sign in with GitHub again.", 401, origin);
    const now = Math.floor(Date.now() / 1000);
    const renewed = await sealSession({
        ...session,
        accessToken: token.access_token,
        refreshToken: token.refresh_token || session.refreshToken,
        expiresAt: now + Math.max(300, Number(token.expires_in) || 8 * 60 * 60),
        refreshExpiresAt: now + Math.max(3600, Number(token.refresh_token_expires_in) || 180 * 24 * 60 * 60)
    }, env);
    return jsonResponse({ session: renewed, user: session.user }, 200, origin);
}

async function apiRequest(request, env, context) {
    const origin = requestOrigin(request, env);
    if (!origin) return new Response("Forbidden", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);
    const session = await requestSession(request, env);

    if (url.pathname === "/api/session" && request.method === "GET") {
        return jsonResponse({ authenticated: Boolean(session), user: session?.user || null }, 200, origin);
    }
    if (url.pathname === "/api/session/refresh" && request.method === "POST") return refreshSession(request, env, origin);
    if (url.pathname === "/api/discussions" && request.method === "GET") return listDiscussions(request, env, origin, session, context);
    if (url.pathname === "/api/discussions" && request.method === "POST") return createDiscussion(request, env, origin, session);
    if (url.pathname === "/api/uploads" && request.method === "POST") return uploadImage(request, env, origin, session);
    const detail = url.pathname.match(/^\/api\/discussions\/([1-9]\d{0,9})$/);
    if (detail && request.method === "GET") return getDiscussion(Number(detail[1]), env, origin, session);
    return errorResponse("not_found", "API route not found.", 404, origin);
}

export const internals = Object.freeze({ discussionCacheRequest, imageType, normalizeDiscussionInput, openSession, sealSession });

export default {
    async fetch(request, env, context) {
        const url = new URL(request.url);
        if (url.pathname === "/health") {
            const origin = requestOrigin(request, env);
            const headers = origin
                ? { ...corsHeaders(origin), "Content-Type": "text/plain; charset=utf-8" }
                : { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" };
            return new Response("ok", { headers });
        }
        if (url.pathname === "/oauth/start" && request.method === "GET") return oauthStart(request, env);
        if (url.pathname === "/oauth/callback" && request.method === "GET") return oauthCallback(request, env);
        if (url.pathname.startsWith("/api/")) return apiRequest(request, env, context);
        if (url.pathname.startsWith("/media/") && request.method === "GET") return serveImage(request, env, url.pathname.slice(7));
        return new Response("Not found", { status: 404 });
    }
};

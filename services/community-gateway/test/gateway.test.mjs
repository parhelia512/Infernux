import assert from "node:assert/strict";
import test from "node:test";

import worker, { internals } from "../src/index.js";

const SITE_ORIGIN = "https://infernux-engine.com";
const SITE_ORIGINS = `${SITE_ORIGIN},https://www.infernux-engine.com`;

function memoryCache() {
    const entries = new Map();
    return {
        async match(request) {
            return entries.get(request.url)?.clone();
        },
        async put(request, response) {
            entries.set(request.url, response.clone());
        }
    };
}

function workerContext() {
    const pending = [];
    return {
        pending,
        waitUntil(promise) { pending.push(promise); }
    };
}

function gatewayRequest(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Origin", SITE_ORIGIN);
    return new Request(`https://infernux-community.chenlizheme.workers.dev${path}`, { ...options, headers });
}

test("discussion input keeps title and body as one real topic", () => {
    assert.deepEqual(internals.normalizeDiscussionInput({
        title: "测试话题",
        body: "测试",
        categoryId: "DIC_kwDOO_wV3M4C5oaC"
    }), {
        title: "测试话题",
        body: "测试",
        categoryId: "DIC_kwDOO_wV3M4C5oaC"
    });
    assert.equal(internals.normalizeDiscussionInput({ title: "only title", body: "", categoryId: "DIC_kwDOO_wV3M4C5oaC" }), null);
});

test("health endpoint is readable by the static forum before OAuth navigation", async () => {
    const response = await worker.fetch(gatewayRequest("/health"), { SITE_ORIGIN, SITE_ORIGINS }, workerContext());
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), SITE_ORIGIN);
});

test("production apex and www origins receive CORS without opening the gateway to arbitrary sites", async () => {
    for (const origin of [SITE_ORIGIN, "https://www.infernux-engine.com"]) {
        const response = await worker.fetch(new Request("https://gateway.test/health", {
            headers: { Origin: origin }
        }), { SITE_ORIGIN, SITE_ORIGINS }, workerContext());
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    }

    const rejected = await worker.fetch(new Request("https://gateway.test/api/session", {
        headers: { Origin: "https://example.com" }
    }), { SITE_ORIGIN, SITE_ORIGINS }, workerContext());
    assert.equal(rejected.status, 403);
});

test("anonymous feed cache is shared only by page shape", () => {
    assert.equal(internals.discussionCacheRequest(1, 20).url, "https://community-cache.infernux.invalid/discussions?page=1&per_page=20");
    assert.notEqual(internals.discussionCacheRequest(1, 20).url, internals.discussionCacheRequest(2, 20).url);
});

test("image validation checks file signatures instead of trusting MIME alone", () => {
    assert.equal(internals.imageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")?.extension, "png");
    assert.equal(internals.imageType(Uint8Array.from([0x00, 0x50, 0x4e, 0x47]), "image/png"), null);
    assert.equal(internals.imageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), "text/plain"), null);
});

test("forum sessions are opaque and authenticated", async () => {
    const env = { SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
    const payload = {
        type: "forum-session",
        accessToken: "github-user-token",
        refreshToken: "refresh-token",
        expiresAt: 9999999999,
        refreshExpiresAt: 9999999999,
        user: { login: "forum-user", avatarUrl: "https://avatars.githubusercontent.com/u/1", url: "https://github.com/forum-user" }
    };
    const sealed = await internals.sealSession(payload, env);
    assert.doesNotMatch(sealed, /github-user-token|forum-user/);
    assert.deepEqual(await internals.openSession(sealed, env), payload);
    assert.equal(await internals.openSession(`${sealed}x`, env), null);
});

test("gateway uses cached anonymous reads and the signed-in author token for one complete topic", async () => {
    const originalFetch = globalThis.fetch;
    const originalCaches = globalThis.caches;
    const env = {
        SITE_ORIGIN,
        GITHUB_OWNER: "ChenlizheMe",
        GITHUB_REPO: "Infernux",
        GITHUB_REPOSITORY_ID: "R_kgDOO_wV3A",
        GITHUB_READ_TOKEN: "anonymous-read-token",
        SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64")
    };
    const userSession = await internals.sealSession({
        type: "forum-session",
        accessToken: "signed-in-user-token",
        refreshToken: "refresh-token",
        expiresAt: 9999999999,
        refreshExpiresAt: 9999999999,
        user: { login: "real-author", avatarUrl: "https://avatars.githubusercontent.com/u/2", url: "https://github.com/real-author" }
    }, env);
    let anonymousReads = 0;
    let signedInReads = 0;
    let mutation = null;
    try {
        globalThis.caches = { default: memoryCache() };
        globalThis.fetch = async (url, options = {}) => {
            const authorization = new Headers(options.headers).get("Authorization");
            if (String(url).includes("/repos/ChenlizheMe/Infernux/discussions")) {
                if (authorization === "Bearer anonymous-read-token") anonymousReads += 1;
                if (authorization === "Bearer signed-in-user-token") signedInReads += 1;
                return new Response(JSON.stringify([{
                    number: 41,
                    title: "Cached topic",
                    html_url: "https://github.com/ChenlizheMe/Infernux/discussions/41"
                }]), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "X-RateLimit-Remaining": "4999",
                        "X-RateLimit-Reset": "9999999999"
                    }
                });
            }
            if (String(url) === "https://api.github.com/graphql") {
                mutation = { authorization, payload: JSON.parse(options.body) };
                return new Response(JSON.stringify({
                    data: {
                        createDiscussion: {
                            discussion: {
                                id: "D_kwDOO_wV3M4Test",
                                number: 42,
                                title: "测试话题",
                                url: "https://github.com/ChenlizheMe/Infernux/discussions/42",
                                body: "测试",
                                author: { login: "real-author" }
                            }
                        }
                    }
                }), { status: 200, headers: { "Content-Type": "application/json" } });
            }
            throw new Error(`Unexpected GitHub request: ${url}`);
        };

        const firstContext = workerContext();
        const first = await worker.fetch(gatewayRequest("/api/discussions?page=1&per_page=20"), env, firstContext);
        assert.equal(first.status, 200);
        assert.equal(first.headers.get("Access-Control-Allow-Origin"), SITE_ORIGIN);
        assert.equal((await first.json()).items[0].title, "Cached topic");
        await Promise.all(firstContext.pending);

        const cached = await worker.fetch(gatewayRequest("/api/discussions?page=1&per_page=20"), env, workerContext());
        assert.equal(cached.status, 200);
        assert.equal(anonymousReads, 1, "the second anonymous visit must use the edge cache");

        const signedIn = await worker.fetch(gatewayRequest("/api/discussions?page=1&per_page=20", {
            headers: { Authorization: `Bearer ${userSession}` }
        }), env, workerContext());
        assert.equal(signedIn.status, 200);
        assert.equal(signedInReads, 1, "signed-in reads must use the user's GitHub quota instead of the anonymous cache token");

        const created = await worker.fetch(gatewayRequest("/api/discussions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${userSession}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ title: "测试话题", body: "测试", categoryId: "DIC_kwDOO_wV3M4C5oaC" })
        }), env, workerContext());
        assert.equal(created.status, 201);
        const createdTopic = (await created.json()).discussion;
        assert.equal(createdTopic.number, 42);
        assert.equal(createdTopic.body, "测试", "the written body must remain the discussion body, not a reply");
        assert.equal(createdTopic.author.login, "real-author", "the GitHub user token must remain the discussion author");
        assert.equal(mutation.authorization, "Bearer signed-in-user-token");
        assert.deepEqual(mutation.payload.variables.input, {
            repositoryId: "R_kgDOO_wV3A",
            categoryId: "DIC_kwDOO_wV3M4C5oaC",
            title: "测试话题",
            body: "测试",
            clientMutationId: mutation.payload.variables.input.clientMutationId
        });
        assert.match(mutation.payload.query, /createDiscussion/);
        assert.doesNotMatch(JSON.stringify(mutation.payload), /Join the Infernux community forum/);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalCaches === undefined) delete globalThis.caches;
        else globalThis.caches = originalCaches;
    }
});

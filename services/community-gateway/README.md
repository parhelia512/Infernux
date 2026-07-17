# Infernux Community Gateway

The website remains static. This Worker is the narrow authenticated boundary for the forum:

- GitHub App OAuth sign-in
- authenticated Discussion reads and creation
- image uploads to R2
- opaque, encrypted browser sessions

Giscus remains responsible only for replies on an existing Discussion. It must not be used to create topics because Giscus-owned threads have generated boilerplate bodies and the wrong author.

## GitHub App

Create a GitHub App owned by `ChenlizheMe` with:

- Homepage URL: `https://infernux-engine.com/community.html`
- Callback URL: `https://infernux-community.chenlizheme.workers.dev/oauth/callback`
- Repository permission `Discussions`: read and write
- Repository permission `Metadata`: read-only
- Installation scope: only `ChenlizheMe/Infernux`
- Expiring user authorization tokens enabled

Install the app on the Infernux repository. No webhook is required.

## Worker

From this directory:

```powershell
npm install
npx wrangler r2 bucket create infernux-community-uploads
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_READ_TOKEN
npx wrangler secret put SESSION_ENCRYPTION_KEY
npx wrangler deploy
```

`GITHUB_READ_TOKEN` should be a fine-grained token limited to read-only Discussions access for this repository. It serves anonymous readers through a five-minute Worker edge cache; the browser adds a fifteen-minute per-device cache. Signed-in users use their own GitHub App user token and therefore their own API quota.

Generate `SESSION_ENCRYPTION_KEY` as 32 random bytes encoded with base64. Never commit secrets or `.dev.vars`.

The website client uses the Worker's stable `workers.dev` route. The Worker only accepts API requests whose `Origin` exactly matches `SITE_ORIGIN`.

## Verification

```powershell
npm run check
```

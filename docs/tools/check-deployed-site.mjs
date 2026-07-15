import process from "node:process";
import { createHash } from "node:crypto";

const baseArg = process.argv.indexOf("--base-url");
const base = new URL(baseArg >= 0 ? process.argv[baseArg + 1] : "https://infernux-engine.com/");
const allowUnstamped = process.argv.includes("--allow-unstamped");
const failures = [];

const checks = [
  { route: "/", type: "text/html", tokens: ["<h1", "data-i18n=\"nav.start\"", "wiki.html?layer=manual#written-guides", "data-i18n=\"home.hero.start\"", "id=\"hero-platform-note\"", "id=\"runtime-capture\"", "https://arxiv.org/abs/2604.10263"], forbid: ["fonts.googleapis.com", "cdnjs.cloudflare.com", "performance is competitive with Unity", "不比Unity差"] },
  { route: "/wiki.html", type: "text/html", tokens: ["DOCUMENTATION DECK", "data-static-doc-directory", "wiki/site/en/learn/getting-started.html", "wiki/site/zh/manual/engine-map.html", "aria-current=\"page\" data-i18n=\"nav.learn\""] },
  { route: "/community.html", type: "text/html", token: "Infernux Community Wall" },
  { route: "/download.html", type: "text/html", token: "InfernuxHubInstaller.exe" },
  { route: "/offline.html", type: "text/html", token: "Connection interrupted." },
  { route: "/site.webmanifest", type: "application/manifest+json", alternateTypes: ["application/json"], token: "\"display_override\"" },
  { route: "/sw.js", type: "text/javascript", alternateTypes: ["application/javascript"], token: "networkFirst(request, true)" },
  { route: "/sitemap.xml", type: "application/xml", alternateTypes: ["text/xml"], token: "xmlns:xhtml=\"http://www.w3.org/1999/xhtml\"", minTextBytes: 50_000 },
  { route: "/wiki/site/index.html", type: "text/html", token: "Infernux Documentation" },
  { route: "/wiki/site/en/learn/getting-started.html", type: "text/html", tokens: ["data-doc-trail", "data-doc-build-provenance", '"@type": "LearningResource"', "nav-priority active", "aria-current=\"page\">Start"] },
  { route: "/wiki/site/en/api/GameObject.html", type: "text/html", tokens: ["data-doc-outline", "data-doc-build-provenance", '"@type": "TechArticle"', "href=\"/wiki/site/en/api/index.html\" class=\"active\" aria-current=\"page\""] },
  { route: "/wiki/site/en/manual/input-and-time.html", type: "text/html", tokens: ["doc-diagram--decision", "Input intent across render and fixed timelines", "Choose the time domain"] },
  { route: "/wiki/site/en/manual/assets-and-meta.html", type: "text/html", tokens: ["doc-diagram--pipeline", "Asset identity from source file to runtime object", "Choose a reference path"] },
  { route: "/wiki/site/zh/manual/physics.html", type: "text/html", tokens: ["Physics", "doc-diagram--timeline", "固定步物理命令与回调流程"] },
  { route: "/wiki/site/zh/manual/ui.html", type: "text/html", tokens: ["doc-diagram--pipeline", "指针事件在屏幕空间 UI 中的传播", "何时使用屏幕空间 UI"] },
  { route: "/docs-index.json", type: "application/json", jsonKey: "documents" },
  { route: "/docs-health.json", type: "application/json", token: "localized_relationship_edges" },
  { route: "/learning-paths.json", type: "application/json", jsonKey: "paths" },
  { route: "/api-index.json", type: "application/json", jsonKey: "symbols" },
  { route: "/api-changes.json", type: "application/json", token: "current_release" },
  { route: "/release.json", type: "application/json", jsonKey: "assets" },
  { route: "/release-notes.json", type: "application/json", jsonKey: "sections" },
  { route: "/docs-manifest.json", type: "application/json", token: "\"build\"" },
  { route: "/llms-full.txt", type: "text/plain", alternateTypes: ["application/octet-stream"], token: "Corpus-Content-SHA256", minTextBytes: 100_000 },
  { route: "/css/fonts.css", type: "text/css", token: "font-family: \"Inter\"" },
  { route: "/css/style.css", type: "text/css", tokens: ["@media (forced-colors: active)", ".nav-links a.nav-priority", ".nav-links.mobile-open a.nav-priority", ".hero-platform-note", ".hero-text-links"] },
  { route: "/css/fontawesome-subset.css", type: "text/css", token: "Font Awesome Free 6.4.0" },
  { route: "/css/docs-search.css", type: "text/css", token: ".docs-search-dialog" },
  { route: "/css/wiki-generated.css", type: "text/css", tokens: [".doc-build-provenance", ".doc-diagram", "overscroll-behavior-inline: contain"] },
  { route: "/css/community.css", type: "text/css", token: ".forum-controls" },
  { route: "/js/docs-search.js", type: "text/javascript", alternateTypes: ["application/javascript"], token: "/api-index.json" },
  { route: "/js/main.js", type: "text/javascript", alternateTypes: ["application/javascript"], tokens: ["mobileMenuFocusables", "handleMobileMenuKeydown", "handleMobileMenuPointerDown", "mobile-menu-open"] },
  { route: "/js/docs-health.js", type: "text/javascript", alternateTypes: ["application/javascript"], token: "normalizeDocsHealth" },
  { route: "/js/wiki-generated.js", type: "text/javascript", alternateTypes: ["application/javascript"], token: "initializeBuildProvenance" },
  { route: "/js/community.js", type: "text/javascript", alternateTypes: ["application/javascript"], token: "COMMUNITY_CACHE_TTL_MS" },
  { route: "/assets/fonts/inter-latin.woff2", type: "font/woff2", alternateTypes: ["application/octet-stream"], minBytes: 40_000, magicHex: "774f4632" },
  { route: "/assets/fonts/fa-solid-900.woff2", type: "font/woff2", alternateTypes: ["application/octet-stream"], minBytes: 140_000, magicHex: "774f4632" },
];

async function request(check) {
  const url = new URL(check.route, base);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Infernux-website-health/1.0", accept: check.type },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const elapsed = Math.round(performance.now() - started);
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    const allowedTypes = [check.type, ...(check.alternateTypes || [])];
    if (!allowedTypes.some((type) => contentType.includes(type))) throw new Error(`unexpected content-type '${contentType}'`);
    if (check.minBytes) {
      const body = await response.arrayBuffer();
      if (body.byteLength < check.minBytes) throw new Error(`response is only ${body.byteLength} bytes`);
      if (check.magicHex) {
        const actualMagic = Buffer.from(body).subarray(0, check.magicHex.length / 2).toString("hex");
        if (actualMagic !== check.magicHex) throw new Error(`unexpected file signature '${actualMagic}'`);
      }
      console.log(`PASS ${check.route} (${elapsed} ms)`);
      return;
    }
    const body = await response.text();
    if (check.minTextBytes && Buffer.byteLength(body, "utf8") < check.minTextBytes) {
      throw new Error(`response is only ${Buffer.byteLength(body, "utf8")} bytes`);
    }
    for (const token of [check.token, ...(check.tokens || [])].filter(Boolean)) {
      if (!body.includes(token)) throw new Error(`missing content token '${token}'`);
    }
    for (const forbidden of check.forbid || []) {
      if (body.includes(forbidden)) throw new Error(`contains forbidden runtime dependency '${forbidden}'`);
    }
    if (check.jsonKey) {
      const value = JSON.parse(body);
      if (!Array.isArray(value[check.jsonKey]) || value[check.jsonKey].length === 0) {
        throw new Error(`JSON key '${check.jsonKey}' is missing or empty`);
      }
    }
    console.log(`PASS ${check.route} (${elapsed} ms)`);
  } catch (error) {
    failures.push(`${check.route}: ${error.message}`);
    console.error(`FAIL ${check.route}: ${error.message}`);
  }
}

for (const check of checks) await request(check);

try {
  const [sitemapResponse, docsResponse, apiResponse] = await Promise.all([
    fetch(new URL("/sitemap.xml", base), { signal: AbortSignal.timeout(15_000) }),
    fetch(new URL("/docs-index.json", base), { signal: AbortSignal.timeout(15_000) }),
    fetch(new URL("/api-index.json", base), { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!sitemapResponse.ok) throw new Error(`sitemap HTTP ${sitemapResponse.status}`);
  if (!docsResponse.ok) throw new Error(`docs index HTTP ${docsResponse.status}`);
  if (!apiResponse.ok) throw new Error(`API index HTTP ${apiResponse.status}`);
  const sitemap = await sitemapResponse.text();
  const docsIndex = await docsResponse.json();
  const apiIndex = await apiResponse.json();
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expected = new Set([
    "https://infernux-engine.com/",
    "https://infernux-engine.com/wiki.html",
    "https://infernux-engine.com/roadmap.html",
    "https://infernux-engine.com/community.html",
    "https://infernux-engine.com/download.html",
    "https://infernux-engine.com/wiki/site/index.html",
    "https://infernux-engine.com/wiki/site/en/api/index.html",
    "https://infernux-engine.com/wiki/site/zh/api/index.html",
    ...docsIndex.documents.map((document) => document.canonical_url),
    ...apiIndex.symbols.map((symbol) => symbol.canonical_url),
  ]);
  if (locations.length !== expected.size || new Set(locations).size !== locations.length) {
    throw new Error(`expected ${expected.size} unique URLs, found ${locations.length}`);
  }
  for (const url of expected) if (!locations.includes(url)) throw new Error(`missing '${url}'`);
  const localizedEntries = docsIndex.documents.length + apiIndex.symbols.length + 2;
  if ((sitemap.match(/<xhtml:link\b/g) || []).length !== localizedEntries * 3) throw new Error("localized alternate count is inconsistent with indexes");
  console.log(`PASS unified sitemap covers ${locations.length} canonical URLs`);
} catch (error) {
  failures.push(`unified sitemap: ${error.message}`);
  console.error(`FAIL unified sitemap: ${error.message}`);
}

try {
  const pageResponse = await fetch(new URL("/wiki/site/en/api/GameObject.html", base), { signal: AbortSignal.timeout(15_000) });
  if (!pageResponse.ok) throw new Error(`API page HTTP ${pageResponse.status}`);
  const page = await pageResponse.text();
  const reference = page.match(/<link\s+rel=["']stylesheet["']\s+href=["'](\/css\/wiki-template\.([a-f0-9]{16})\.css)["']/i);
  if (!reference) throw new Error("API page does not reference a content-hashed shared template style");
  if (/<style\b[^>]*>[\s\S]*?\.api-layout\s*\{/i.test(page)) throw new Error("API page still embeds the shared template style inline");
  const cssResponse = await fetch(new URL(reference[1], base), { signal: AbortSignal.timeout(15_000) });
  if (!cssResponse.ok) throw new Error(`shared style HTTP ${cssResponse.status}`);
  if (!(cssResponse.headers.get("content-type") || "").includes("text/css")) throw new Error("shared style has an unexpected content type");
  const css = await cssResponse.text();
  if (!css.includes(".api-layout") || !css.includes(".doc-provenance")) throw new Error("shared style is missing generated-page layout contracts");
  const actualHash = createHash("sha256").update(css).digest("hex").slice(0, 16);
  if (reference[2] !== actualHash) throw new Error(`shared style filename hash '${reference[2]}' differs from content hash '${actualHash}'`);
  console.log(`PASS content-hashed shared Wiki style ${reference[1]}`);
} catch (error) {
  failures.push(`shared Wiki style: ${error.message}`);
  console.error(`FAIL shared Wiki style: ${error.message}`);
}

try {
  const response = await fetch(new URL("/docs-manifest.json", base), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const manifest = await response.json();
  if (allowUnstamped && manifest.build?.status === "unstamped") {
    console.warn("WARN documentation provenance is unstamped in local preview");
  } else {
    if (manifest.build?.status !== "stamped") throw new Error("build provenance is not stamped");
    if (!/^[a-f0-9]{40}$/.test(manifest.build.source_commit || "")) throw new Error("invalid source commit");
    if (manifest.build.source_url !== `https://github.com/ChenlizheMe/Infernux/commit/${manifest.build.source_commit}`) throw new Error("source URL does not match source commit");
    if (!manifest.build.generated_at || Number.isNaN(Date.parse(manifest.build.generated_at))) throw new Error("invalid generation time");
    console.log(`PASS documentation provenance ${manifest.build.source_commit.slice(0, 12)}`);
  }
} catch (error) {
  failures.push(`documentation provenance: ${error.message}`);
  console.error(`FAIL documentation provenance: ${error.message}`);
}

try {
  const [wikiResponse, canonicalResponse] = await Promise.all([
    fetch(new URL("/wiki.html", base), { signal: AbortSignal.timeout(15_000) }),
    fetch(new URL("/assets/wiki-docs.json", base), { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!wikiResponse.ok) throw new Error(`wiki page HTTP ${wikiResponse.status}`);
  if (!canonicalResponse.ok) throw new Error(`canonical catalog HTTP ${canonicalResponse.status}`);
  const wikiHtml = await wikiResponse.text();
  const reference = wikiHtml.match(/<meta\s+name=["']infernux-wiki-catalog["']\s+content=["']([^"']+)["']/i)?.[1];
  const match = reference?.match(/^assets\/wiki-docs\.([a-f0-9]{16})\.json$/);
  if (!match) throw new Error("wiki page does not expose a content-hashed catalog reference");
  const hashedResponse = await fetch(new URL(reference, new URL("/wiki.html", base)), { signal: AbortSignal.timeout(15_000) });
  if (!hashedResponse.ok) throw new Error(`hashed catalog HTTP ${hashedResponse.status}`);
  const canonical = Buffer.from(await canonicalResponse.arrayBuffer());
  const hashed = Buffer.from(await hashedResponse.arrayBuffer());
  const actualHash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  if (match[1] !== actualHash) throw new Error(`catalog filename hash '${match[1]}' differs from content hash '${actualHash}'`);
  if (!hashed.equals(canonical)) throw new Error("hashed catalog differs from canonical catalog");
  console.log(`PASS content-hashed Wiki catalog ${reference}`);
} catch (error) {
  failures.push(`Wiki catalog: ${error.message}`);
  console.error(`FAIL content-hashed Wiki catalog: ${error.message}`);
}

try {
  const [siteResponse, githubResponse] = await Promise.all([
    fetch(new URL("/release.json", base), { signal: AbortSignal.timeout(15_000) }),
    fetch("https://api.github.com/repos/ChenlizheMe/Infernux/releases/latest", {
      headers: {
        "user-agent": "Infernux-website-health/1.0",
        accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    }),
  ]);
  if (!siteResponse.ok) throw new Error(`site release manifest HTTP ${siteResponse.status}`);
  if (!githubResponse.ok) throw new Error(`GitHub latest release HTTP ${githubResponse.status}`);
  const siteRelease = await siteResponse.json();
  const githubRelease = await githubResponse.json();
  if (siteRelease.tag !== githubRelease.tag_name) throw new Error(`site tag ${siteRelease.tag} differs from GitHub ${githubRelease.tag_name}`);
  const upstreamAssets = new Map(githubRelease.assets.map((asset) => [asset.name, asset]));
  for (const asset of siteRelease.assets) {
    const upstream = upstreamAssets.get(asset.name);
    if (!upstream) throw new Error(`GitHub release is missing '${asset.name}'`);
    if (asset.size_bytes !== upstream.size) throw new Error(`size mismatch for '${asset.name}'`);
    if (`sha256:${asset.sha256}` !== upstream.digest) throw new Error(`SHA-256 mismatch for '${asset.name}'`);
    if (asset.url !== upstream.browser_download_url) throw new Error(`download URL mismatch for '${asset.name}'`);
  }
  console.log("PASS release manifest matches GitHub Releases");
} catch (error) {
  failures.push(`release manifest: ${error.message}`);
  console.error(`FAIL release manifest: ${error.message}`);
}

const missing = new URL(`/health-check-missing-${Date.now()}`, base);
try {
  const response = await fetch(missing, {
    headers: { "user-agent": "Infernux-website-health/1.0" },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 404) throw new Error(`expected HTTP 404, received ${response.status}`);
  console.log("PASS custom 404 status");
} catch (error) {
  failures.push(`404 route: ${error.message}`);
  console.error(`FAIL custom 404 status: ${error.message}`);
}

if (failures.length) {
  console.error(`Deployed website health failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`Deployed website health passed for ${base.origin}.`);

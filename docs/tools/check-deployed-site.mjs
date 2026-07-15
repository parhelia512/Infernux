import process from "node:process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildWebsiteHealthReport, renderWebsiteHealthSummary } from "./website-health-report.mjs";

const baseArg = process.argv.indexOf("--base-url");
const base = new URL(baseArg >= 0 ? process.argv[baseArg + 1] : "https://infernux-engine.com/");
const reportArg = process.argv.indexOf("--report");
const reportPath = reportArg >= 0 ? path.resolve(process.argv[reportArg + 1]) : null;
const allowUnstamped = process.argv.includes("--allow-unstamped");
const localPreview = base.hostname === "127.0.0.1" || base.hostname === "localhost" || base.hostname === "::1";
const failures = [];
const healthResults = [];
const healthStartedAt = new Date();
let deployedManifest = null;
let pagesBuild = null;
const socialImageRoute = "/assets/infernux-social-card-0.2.1.jpg";
const socialImageUrl = `https://infernux-engine.com${socialImageRoute}`;
const socialImageSha256 = "8c3a0500bf39b50c53e0ab97c1937c6a3bb61657b328bef18f420b962fae7594";
const socialMetaTokens = [
  `property="og:image" content="${socialImageUrl}"`,
  "property=\"og:image:type\" content=\"image/jpeg\"",
  "property=\"og:image:width\" content=\"1200\"",
  "property=\"og:image:height\" content=\"630\"",
  `name="twitter:image" content="${socialImageUrl}"`,
];

function recordHealth(id, kind, target, status, started, detail = null) {
  healthResults.push({
    id,
    kind,
    target,
    status,
    duration_ms: Math.max(0, Math.round(performance.now() - started)),
    detail,
  });
}

const checks = [
  { route: "/", type: "text/html", tokens: ["<h1", "data-i18n=\"nav.start\"", "wiki.html?layer=manual#written-guides", "data-i18n=\"home.hero.start\"", "id=\"hero-platform-note\"", "id=\"runtime-capture\"", "https://arxiv.org/abs/2604.10263", "http-equiv=\"Content-Security-Policy\"", "script-src-attr 'none'", "style-src 'self'; style-src-attr 'none'", "data-site-action=\"theme\"", "css/style.css?v=14", "js/main.js?v=10", "<source srcset=\"assets/demo-0.2.1.avif\" type=\"image/avif\">", "<source srcset=\"assets/demo-0.2.1.webp\" type=\"image/webp\">", "<img src=\"assets/demo.png\" width=\"1245\" height=\"653\"", ...socialMetaTokens], forbid: ["fonts.googleapis.com", "cdnjs.cloudflare.com", "performance is competitive with Unity", "不比Unity差", "onclick=", "<style", " style="] },
  { route: "/wiki.html", type: "text/html", tokens: ["DOCUMENTATION DECK", "data-static-doc-directory", "wiki/site/en/learn/getting-started.html", "wiki/site/zh/manual/engine-map.html", "aria-current=\"page\" data-i18n=\"nav.learn\"", "script-src-attr 'none'", "style-src 'self'; style-src-attr 'none'", "css/wiki-noscript.css?v=1", "css/style.css?v=14", "js/main.js?v=10", ...socialMetaTokens], forbid: ["<style", " style="] },
  { route: "/community.html", type: "text/html", tokens: ["Infernux Community Wall", "community-load-more", "community-browse-all", "giscus-readiness", "giscus-load", "giscus-thread", "data-loading=\"lazy\"", "js/community.js?v=5", "css/community.css?v=7", "js/i18n.js?v=13", "script-src 'self' https://giscus.app", "style-src 'self' https://giscus.app; style-src-attr 'unsafe-inline'", "connect-src 'self' https://api.github.com", "frame-src https://giscus.app", "css/style.css?v=14", "js/main.js?v=10", ...socialMetaTokens], forbid: ["<script src=\"https://giscus.app/client.js\"", "<style"] },
  { route: "/download.html", type: "text/html", tokens: ["InfernuxHubInstaller.exe", "css/style.css?v=14", ...socialMetaTokens] },
  { route: "/roadmap.html", type: "text/html", tokens: ["<h1", "css/style.css?v=14", ...socialMetaTokens] },
  { route: "/offline.html", type: "text/html", tokens: ["Connection interrupted.", "script-src-attr 'none'", "style-src 'self' 'unsafe-inline'; style-src-attr 'none'", "class=\"retry\" href=\"\"", "--offline-soft: #858d9e", "--offline-border: #687181", "color: var(--offline-on-accent)"] },
  { route: "/site.webmanifest", type: "application/manifest+json", alternateTypes: ["application/json"], token: "\"display_override\"" },
  { route: "/sw.js", type: "text/javascript", alternateTypes: ["application/javascript"], token: "networkFirst(request, true)" },
  { route: "/sitemap.xml", type: "application/xml", alternateTypes: ["text/xml"], token: "xmlns:xhtml=\"http://www.w3.org/1999/xhtml\"", minTextBytes: 50_000 },
  { route: "/wiki/site/index.html", type: "text/html", tokens: ["Infernux Documentation", ...socialMetaTokens] },
  { route: "/wiki/site/en/learn/getting-started.html", type: "text/html", tokens: ["data-doc-trail", "data-doc-build-provenance", '"@type": "LearningResource"', "nav-priority active", "aria-current=\"page\">Start", "script-src-attr 'none'", "style-src 'self'; style-src-attr 'none'", "id=\"docs-search-filters\"", "/css/docs-search.css?v=2", "/js/docs-search.js?v=2", "data-site-action=\"theme\"", "/css/style.css?v=14", "/js/main.js?v=10", ...socialMetaTokens], forbid: ["<style", " style="] },
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
  { route: "/css/style.css", type: "text/css", tokens: ["@media (forced-colors: active)", ".nav-links a.nav-priority", ".nav-links.mobile-open a.nav-priority", ".hero-platform-note", ".hero-text-links", "--accent-fill: #a52b36", "--on-accent: #ffffff", "--text-soft: #858d9e", "--code-hl-comment: #8c94a4"] },
  { route: "/css/fontawesome-subset.css", type: "text/css", token: "Font Awesome Free 6.4.0" },
  { route: "/css/docs-search.css", type: "text/css", tokens: [".docs-search-dialog", ".docs-search-filters", "overscroll-behavior-inline: contain"] },
  { route: "/css/wiki-noscript.css", type: "text/css", token: ".docs-static-language" },
  { route: "/css/wiki-generated.css", type: "text/css", tokens: [".doc-build-provenance", ".doc-diagram", "overscroll-behavior-inline: contain"] },
  { route: "/css/community.css", type: "text/css", tokens: [".forum-controls", ".forum-pagination", ".topic-signals", ".giscus-readiness", ".giscus-install-action"] },
  { route: "/js/docs-search.js", type: "text/javascript", alternateTypes: ["application/javascript"], tokens: ["/api-index.json", "function buildSearchModel", "languageFilter.value", "statusFilter.value"] },
  { route: "/js/main.js", type: "text/javascript", alternateTypes: ["application/javascript"], tokens: ["mobileMenuFocusables", "handleMobileMenuKeydown", "handleMobileMenuPointerDown", "mobile-menu-open", "bindSiteActions", "data-site-action"] },
  { route: "/js/docs-health.js", type: "text/javascript", alternateTypes: ["application/javascript"], token: "normalizeDocsHealth" },
  { route: "/js/wiki-generated.js", type: "text/javascript", alternateTypes: ["application/javascript"], token: "initializeBuildProvenance" },
  { route: "/js/community.js", type: "text/javascript", alternateTypes: ["application/javascript"], tokens: ["COMMUNITY_CACHE_TTL_MS", "sort=updated", "communityNextPage", "mergeCommunityTopics", "GISCUS_ORIGIN", "GISCUS_OPT_IN_KEY", "loadGiscusEmbed", "document.createElement(\"script\")", "event.source !== frame.contentWindow", "classifyGiscusError", "renderGiscusReadiness"] },
  { route: "/assets/fonts/inter-latin.woff2", type: "font/woff2", alternateTypes: ["application/octet-stream"], minBytes: 40_000, magicHex: "774f4632" },
  { route: "/assets/fonts/fa-solid-subset-900.woff2", type: "font/woff2", alternateTypes: ["application/octet-stream"], minBytes: 3_000, maxBytes: 16_384, magicHex: "774f4632" },
  { route: "/assets/fonts/fa-brands-subset-400.woff2", type: "font/woff2", alternateTypes: ["application/octet-stream"], minBytes: 800, maxBytes: 16_384, magicHex: "774f4632" },
  { route: "/assets/demo.png", type: "image/png", minBytes: 300_000, maxBytes: 400_000, magicHex: "89504e470d0a1a0a", sha256: "e987d0ac1477896c97dae00b642df2ace4b6de06c59268528650252e831155bf" },
  { route: "/assets/demo-0.2.1.webp", type: "image/webp", localAlternateTypes: ["application/octet-stream"], minBytes: 180_000, maxBytes: 220_000, magicHex: "52494646", sha256: "bf5cdbc260331e75ccf1519b1cc582cb4764ae101ccdbda27feb3082d71b66df" },
  { route: "/assets/demo-0.2.1.avif", type: "image/avif", minBytes: 50_000, maxBytes: 80_000, magicHex: "66747970", magicOffset: 4, sha256: "cf88c7f49c3da599003066d6059249de02a6c92cf288cd7bee2f07316a63e82d" },
  { route: socialImageRoute, type: "image/jpeg", minBytes: 100_000, maxBytes: 512_000, magicHex: "ffd8ff", sha256: socialImageSha256, jpegDimensions: [1200, 630] },
];

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (frames.has(marker) && length >= 7) return [buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3)];
    offset += length;
  }
  return null;
}

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
    const allowedTypes = [check.type, ...(check.alternateTypes || []), ...(localPreview ? check.localAlternateTypes || [] : [])];
    if (!allowedTypes.some((type) => contentType.includes(type))) throw new Error(`unexpected content-type '${contentType}'`);
    if (check.minBytes || check.maxBytes || check.magicHex || check.sha256 || check.jpegDimensions) {
      const body = Buffer.from(await response.arrayBuffer());
      if (check.minBytes && body.byteLength < check.minBytes) throw new Error(`response is only ${body.byteLength} bytes`);
      if (check.maxBytes && body.byteLength > check.maxBytes) throw new Error(`response is ${body.byteLength} bytes; expected no more than ${check.maxBytes} bytes`);
      if (check.magicHex) {
        const magicOffset = check.magicOffset || 0;
        const actualMagic = body.subarray(magicOffset, magicOffset + check.magicHex.length / 2).toString("hex");
        if (actualMagic !== check.magicHex) throw new Error(`unexpected file signature '${actualMagic}'`);
      }
      if (check.sha256 && createHash("sha256").update(body).digest("hex") !== check.sha256) throw new Error("content hash differs from the reviewed artifact");
      if (check.jpegDimensions) {
        const dimensions = jpegDimensions(body);
        if (!dimensions || dimensions[0] !== check.jpegDimensions[0] || dimensions[1] !== check.jpegDimensions[1]) {
          throw new Error(`unexpected JPEG dimensions '${dimensions?.join("x") || "unreadable"}'`);
        }
      }
      console.log(`PASS ${check.route} (${elapsed} ms)`);
      recordHealth(`route:${check.route}`, "route", url.toString(), "passed", started, `HTTP 200 · ${contentType.split(";")[0]}`);
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
    recordHealth(`route:${check.route}`, "route", url.toString(), "passed", started, `HTTP 200 · ${contentType.split(";")[0]}`);
  } catch (error) {
    failures.push(`${check.route}: ${error.message}`);
    console.error(`FAIL ${check.route}: ${error.message}`);
    recordHealth(`route:${check.route}`, "route", url.toString(), "failed", started, error.message);
  }
}

for (const check of checks) await request(check);

let groupedStarted = performance.now();
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
  recordHealth("sitemap-coverage", "integrity", new URL("/sitemap.xml", base).toString(), "passed", groupedStarted, `${locations.length} canonical URLs`);
} catch (error) {
  failures.push(`unified sitemap: ${error.message}`);
  console.error(`FAIL unified sitemap: ${error.message}`);
  recordHealth("sitemap-coverage", "integrity", new URL("/sitemap.xml", base).toString(), "failed", groupedStarted, error.message);
}

groupedStarted = performance.now();
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
  recordHealth("shared-wiki-style", "integrity", new URL(reference[1], base).toString(), "passed", groupedStarted, `SHA-256 prefix ${actualHash}`);
} catch (error) {
  failures.push(`shared Wiki style: ${error.message}`);
  console.error(`FAIL shared Wiki style: ${error.message}`);
  recordHealth("shared-wiki-style", "integrity", new URL("/wiki/site/en/api/GameObject.html", base).toString(), "failed", groupedStarted, error.message);
}

groupedStarted = performance.now();
try {
  const response = await fetch(new URL("/docs-manifest.json", base), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const manifest = await response.json();
  deployedManifest = manifest;
  if (allowUnstamped && manifest.build?.status === "unstamped") {
    console.warn("WARN documentation provenance is unstamped in local preview");
    recordHealth("documentation-provenance", "deployment", new URL("/docs-manifest.json", base).toString(), "passed", groupedStarted, "Local preview · unstamped");
  } else {
    if (manifest.build?.status !== "stamped") throw new Error("build provenance is not stamped");
    if (!/^[a-f0-9]{40}$/.test(manifest.build.source_commit || "")) throw new Error("invalid source commit");
    if (manifest.build.source_url !== `https://github.com/ChenlizheMe/Infernux/commit/${manifest.build.source_commit}`) throw new Error("source URL does not match source commit");
    if (!manifest.build.generated_at || Number.isNaN(Date.parse(manifest.build.generated_at))) throw new Error("invalid generation time");
    console.log(`PASS documentation provenance ${manifest.build.source_commit.slice(0, 12)}`);
    recordHealth("documentation-provenance", "deployment", new URL("/docs-manifest.json", base).toString(), "passed", groupedStarted, `Source ${manifest.build.source_commit}`);
  }
} catch (error) {
  failures.push(`documentation provenance: ${error.message}`);
  console.error(`FAIL documentation provenance: ${error.message}`);
  recordHealth("documentation-provenance", "deployment", new URL("/docs-manifest.json", base).toString(), "failed", groupedStarted, error.message);
}

groupedStarted = performance.now();
if (localPreview) {
  console.warn("SKIP latest GitHub Pages build evidence in local preview");
  recordHealth("pages-build", "deployment", "https://api.github.com/repos/ChenlizheMe/Infernux/pages/builds/latest", "skipped", groupedStarted, "Local preview does not claim production Pages evidence");
} else {
  try {
    const response = await fetch("https://api.github.com/repos/ChenlizheMe/Infernux/pages/builds/latest", {
      headers: {
        "user-agent": "Infernux-website-health/1.0",
        accept: "application/vnd.github+json",
        "x-github-api-version": "2026-03-10",
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub Pages build HTTP ${response.status}`);
    pagesBuild = await response.json();
    if (pagesBuild.status !== "built") throw new Error(`latest Pages build status is '${pagesBuild.status || "unknown"}'`);
    if (!/^[a-f0-9]{40}$/.test(pagesBuild.commit || "")) throw new Error("latest Pages build has an invalid commit");
    if (!pagesBuild.updated_at || Number.isNaN(Date.parse(pagesBuild.updated_at))) throw new Error("latest Pages build has an invalid update time");
    if (pagesBuild.error?.message) throw new Error(`latest Pages build reports '${pagesBuild.error.message}'`);
    console.log(`PASS latest GitHub Pages build ${pagesBuild.commit.slice(0, 12)}`);
    recordHealth("pages-build", "deployment", "https://api.github.com/repos/ChenlizheMe/Infernux/pages/builds/latest", "passed", groupedStarted, `Build ${pagesBuild.commit}`);
  } catch (error) {
    failures.push(`Pages build: ${error.message}`);
    console.error(`FAIL latest GitHub Pages build: ${error.message}`);
    recordHealth("pages-build", "deployment", "https://api.github.com/repos/ChenlizheMe/Infernux/pages/builds/latest", "failed", groupedStarted, error.message);
  }
}

groupedStarted = performance.now();
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
  recordHealth("wiki-catalog", "integrity", new URL(reference, new URL("/wiki.html", base)).toString(), "passed", groupedStarted, `SHA-256 prefix ${actualHash}`);
} catch (error) {
  failures.push(`Wiki catalog: ${error.message}`);
  console.error(`FAIL content-hashed Wiki catalog: ${error.message}`);
  recordHealth("wiki-catalog", "integrity", new URL("/wiki.html", base).toString(), "failed", groupedStarted, error.message);
}

groupedStarted = performance.now();
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
  recordHealth("release-manifest", "integrity", new URL("/release.json", base).toString(), "passed", groupedStarted, `Release ${siteRelease.tag}`);
} catch (error) {
  failures.push(`release manifest: ${error.message}`);
  console.error(`FAIL release manifest: ${error.message}`);
  recordHealth("release-manifest", "integrity", new URL("/release.json", base).toString(), "failed", groupedStarted, error.message);
}

const missing = new URL(`/health-check-missing-${Date.now()}`, base);
groupedStarted = performance.now();
try {
  const response = await fetch(missing, {
    headers: { "user-agent": "Infernux-website-health/1.0" },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 404) throw new Error(`expected HTTP 404, received ${response.status}`);
  console.log("PASS custom 404 status");
  recordHealth("custom-404", "route", missing.toString(), "passed", groupedStarted, "HTTP 404");
} catch (error) {
  failures.push(`404 route: ${error.message}`);
  console.error(`FAIL custom 404 status: ${error.message}`);
  recordHealth("custom-404", "route", missing.toString(), "failed", groupedStarted, error.message);
}

const healthFinishedAt = new Date();
const repository = process.env.GITHUB_REPOSITORY || "ChenlizheMe/Infernux";
const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
const runUrl = process.env.GITHUB_RUN_ID && repository
  ? `${serverUrl}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;
const healthReport = buildWebsiteHealthReport({
  checkedAt: process.env.WEBSITE_HEALTH_CHECKED_AT || healthFinishedAt.toISOString(),
  baseUrl: base,
  startedAt: healthStartedAt,
  finishedAt: healthFinishedAt,
  checks: healthResults,
  manifest: deployedManifest,
  pagesBuild,
  environment: {
    repository,
    checkoutCommit: process.env.GITHUB_SHA,
    workflow: process.env.GITHUB_WORKFLOW,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    runUrl,
  },
});
if (reportPath) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(healthReport, null, 2)}\n`, "utf8");
  console.log(`WROTE website health report ${path.relative(process.cwd(), reportPath)}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, renderWebsiteHealthSummary(healthReport), "utf8");
}

if (failures.length) {
  console.error(`Deployed website health failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`Deployed website health passed for ${base.origin}.`);

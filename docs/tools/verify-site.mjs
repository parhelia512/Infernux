import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(docsRoot, "..");
const wikiDocsRoot = path.join(docsRoot, "wiki", "docs");
const errors = [];
const commonStaticCsp = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; worker-src 'self'; manifest-src 'self'; form-action 'self'; upgrade-insecure-requests";
const communityStaticCsp = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://giscus.app; script-src-attr 'none'; style-src 'self' https://giscus.app; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.github.com; frame-src https://giscus.app; worker-src 'self'; manifest-src 'self'; form-action 'self'; upgrade-insecure-requests";
const offlineStaticCsp = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; worker-src 'self'; manifest-src 'self'; form-action 'self'; upgrade-insecure-requests";
const socialImageName = "infernux-social-card-0.2.1.jpg";
const socialImageUrl = `https://infernux-engine.com/assets/${socialImageName}`;
const socialImageWidth = 1200;
const socialImageHeight = 630;
const socialImageSha256 = "8c3a0500bf39b50c53e0ab97c1937c6a3bb61657b328bef18f420b962fae7594";

function fail(message) {
    errors.push(message);
}

async function exists(target) {
    return stat(target).then(() => true).catch(() => false);
}

async function sha256(target) {
    return createHash("sha256").update(await readFile(target)).digest("hex");
}

async function walk(directory, extension) {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await walk(absolute, extension));
        else if (entry.isFile() && (!extension || entry.name.endsWith(extension))) result.push(absolute);
    }
    return result.sort((a, b) => a.localeCompare(b, "en"));
}

function posix(value) {
    return value.split(path.sep).join("/");
}

function parseScalar(raw) {
    const value = raw.trim();
    if (value.startsWith("[") && value.endsWith("]")) {
        return value.slice(1, -1)
            .split(",")
            .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
            .filter(Boolean);
    }
    return value.replace(/^['"]|['"]$/g, "");
}

function frontMatter(markdown) {
    const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
    if (lines[0]?.trim() !== "---") return {};
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    if (end < 0) return {};
    const meta = {};
    for (const line of lines.slice(1, end)) {
        const match = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (match) meta[match[1]] = parseScalar(match[2]);
    }
    return meta;
}

function htmlTags(source, tagName) {
    return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map((match) => match[0]);
}

function attribute(tag, name) {
    return tag.match(new RegExp(`\\b${name}=(["'])([\\s\\S]*?)\\1`, "i"))?.[2] ?? null;
}

function metaContent(source, selectorName, selectorValue) {
    const tag = htmlTags(source, "meta").find((candidate) => attribute(candidate, selectorName) === selectorValue);
    return tag ? attribute(tag, "content") : null;
}

function canonicalHref(source) {
    const tag = htmlTags(source, "link").find((candidate) => (attribute(candidate, "rel") || "").split(/\s+/).includes("canonical"));
    return tag ? attribute(tag, "href") : null;
}

function jpegDimensions(buffer) {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
    const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 3 < buffer.length) {
        while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
        if (offset >= buffer.length) break;
        const marker = buffer[offset];
        offset += 1;
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > buffer.length) break;
        const segmentLength = buffer.readUInt16BE(offset);
        if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
        if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
            return {
                width: buffer.readUInt16BE(offset + 5),
                height: buffer.readUInt16BE(offset + 3),
            };
        }
        offset += segmentLength;
    }
    return null;
}

function classNames(tag) {
    return new Set((attribute(tag, "class") || "").split(/\s+/).filter(Boolean));
}

function primaryNavigation(source, label) {
    const region = source.match(/<div\s+class=["']nav-links["']\s+id=["']primary-navigation["']>([\s\S]*?)<\/div>/i)?.[1];
    if (!region) {
        fail(`${label}: missing primary navigation region`);
        return [];
    }
    return htmlTags(region, "a");
}

function verifyTaskNavigation(source, label, expectedHrefs, expectedActiveHref = null) {
    const links = primaryNavigation(source, label);
    if (links.length !== expectedHrefs.length) {
        fail(`${label}: expected ${expectedHrefs.length} task-navigation links, found ${links.length}`);
        return;
    }
    const hrefs = links.map((tag) => attribute(tag, "href"));
    if (JSON.stringify(hrefs) !== JSON.stringify(expectedHrefs)) {
        fail(`${label}: task-navigation order or route differs from the shared information architecture`);
    }
    for (const index of [0, 5]) {
        if (!classNames(links[index]).has("nav-priority")) fail(`${label}: '${expectedHrefs[index]}' must remain a priority navigation entry`);
    }
    for (const [index, tag] of links.entries()) {
        const active = classNames(tag).has("active");
        const current = attribute(tag, "aria-current") === "page";
        const shouldBeActive = expectedHrefs[index] === expectedActiveHref;
        if (active !== shouldBeActive || current !== shouldBeActive) {
            fail(`${label}: '${expectedHrefs[index]}' has inconsistent active-page semantics`);
        }
    }
}

async function verifyCuratedDocs() {
    const required = ["title", "description", "category", "tags", "status", "since", "last_verified", "audience", "related_api", "agent_summary", "source_paths"];
    const allowedStatus = new Set(["stable", "preview", "experimental", "deprecated"]);

    for (const lang of ["en", "zh"]) {
        for (const layer of ["learn", "manual", "architecture"]) {
            const root = path.join(wikiDocsRoot, lang, layer);
            for (const file of await walk(root, ".md")) {
                const markdown = await readFile(file, "utf8");
                const meta = frontMatter(markdown);
                const relative = posix(path.relative(repoRoot, file));
                for (const key of required) {
                    if (!(key in meta) || meta[key] === "" || (key !== "related_api" && Array.isArray(meta[key]) && !meta[key].length)) {
                        fail(`${relative}: missing front matter field '${key}'`);
                    }
                }
                if (!Array.isArray(meta.related_api)) fail(`${relative}: related_api must be an array`);
                const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
                if (heading && meta.title !== heading) fail(`${relative}: front matter title differs from H1`);
                if (typeof meta.description !== "string" || meta.description.length < 20 || meta.description.length > 300) fail(`${relative}: description must contain 20-300 characters`);
                if (meta.status && !allowedStatus.has(meta.status)) fail(`${relative}: unsupported status '${meta.status}'`);
                for (const sourcePath of Array.isArray(meta.source_paths) ? meta.source_paths : []) {
                    if (!await exists(path.join(repoRoot, sourcePath))) fail(`${relative}: source_paths target does not exist: ${sourcePath}`);
                }
                if (!/^#\s+\S/m.test(markdown)) fail(`${relative}: missing H1 title`);
            }
        }
    }

    for (const layer of ["learn", "manual", "architecture"]) {
        const enFiles = (await walk(path.join(wikiDocsRoot, "en", layer), ".md")).map((file) => path.relative(path.join(wikiDocsRoot, "en", layer), file));
        const zhFiles = new Set((await walk(path.join(wikiDocsRoot, "zh", layer), ".md")).map((file) => path.relative(path.join(wikiDocsRoot, "zh", layer), file)));
        for (const relative of enFiles) if (!zhFiles.has(relative)) fail(`Missing zh counterpart: ${layer}/${posix(relative)}`);
        for (const relative of zhFiles) if (!enFiles.includes(relative)) fail(`Missing en counterpart: ${layer}/${posix(relative)}`);
    }
}

async function verifyMarkdownLinks() {
    for (const file of await walk(wikiDocsRoot, ".md")) {
        const markdown = await readFile(file, "utf8");
        const relative = posix(path.relative(repoRoot, file));
        for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
            const raw = match[1].trim().replace(/^<|>$/g, "");
            const target = raw.split("#", 1)[0];
            if (!target || /^(https?:|mailto:)/i.test(target)) continue;
            const absolute = path.resolve(path.dirname(file), decodeURIComponent(target));
            if (!await exists(absolute)) fail(`${relative}: broken Markdown link '${raw}'`);
        }
    }
}

async function verifyRootHtml() {
    const pages = ["index.html", "wiki.html", "roadmap.html", "community.html", "download.html", "404.html", "offline.html"];
    const i18n = await readFile(path.join(docsRoot, "js", "i18n.js"), "utf8");
    const sharedStyle = await readFile(path.join(docsRoot, "css", "style.css"), "utf8");
    const noScriptWikiStyle = await readFile(path.join(docsRoot, "css", "wiki-noscript.css"), "utf8");
    if (noScriptWikiStyle.trim() !== ".docs-static-language {\n    display: grid !important;\n}") {
        fail("wiki-noscript.css: no-script fallback must only reveal both static language directories");
    }
    for (const contract of ["text-size-adjust: 100%", "@media (prefers-contrast: more)", "@media (forced-colors: active)", "outline: 3px solid Highlight", "overflow-wrap: anywhere", "background: CanvasText"]) {
        if (!sharedStyle.includes(contract)) fail(`style.css: missing system accessibility contract '${contract}'`);
    }

    for (const pageName of pages) {
        const file = path.join(docsRoot, pageName);
        const source = await readFile(file, "utf8");
        const indexable = pageName !== "404.html" && pageName !== "offline.html";
        const ids = [...source.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
        if (duplicateIds.length) fail(`${pageName}: duplicate ids: ${[...new Set(duplicateIds)].join(", ")}`);
        const expectedCsp = pageName === "community.html"
            ? communityStaticCsp
            : pageName === "offline.html" ? offlineStaticCsp : commonStaticCsp;
        if (metaContent(source, "http-equiv", "Content-Security-Policy") !== expectedCsp) fail(`${pageName}: static Content Security Policy differs from its least-privilege contract`);
        if (metaContent(source, "name", "referrer") !== "strict-origin-when-cross-origin") fail(`${pageName}: missing strict cross-origin referrer policy`);
        if (/\son[a-z]+\s*=/i.test(source)) fail(`${pageName}: inline event handler bypasses script-src-attr 'none'`);
        if (/\sstyle\s*=/i.test(source)) fail(`${pageName}: inline style attribute bypasses the page-level style-src-attr contract`);
        if (pageName !== "offline.html" && /<style\b/i.test(source)) fail(`${pageName}: inline style element weakens the static style-src contract`);

        const h1Count = (source.match(/<h1\b/gi) || []).length;
        if (h1Count !== 1) fail(`${pageName}: expected exactly one H1, found ${h1Count}`);
        if (indexable && !/<link\s+rel=["']canonical["']/i.test(source)) fail(`${pageName}: missing canonical link`);
        if (indexable && !/<meta\s+property=["']og:title["']/i.test(source)) fail(`${pageName}: missing Open Graph title`);
        if (indexable) {
            for (const property of ["og:image", "og:image:type", "og:image:width", "og:image:height", "og:image:alt"]) {
                if (!new RegExp(`<meta\\s+property=["']${property.replace(":", "\\:")}["']`, "i").test(source)) fail(`${pageName}: missing ${property}`);
            }
            for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"]) {
                if (!new RegExp(`<meta\\s+name=["']${name.replace(":", "\\:")}["']`, "i").test(source)) fail(`${pageName}: missing ${name}`);
            }
            if (metaContent(source, "property", "og:image") !== socialImageUrl) fail(`${pageName}: social image must use the versioned NASA Punk card`);
            if (metaContent(source, "property", "og:image:type") !== "image/jpeg") fail(`${pageName}: social image MIME type is incorrect`);
            if (metaContent(source, "property", "og:image:width") !== String(socialImageWidth)) fail(`${pageName}: social image width does not match source asset`);
            if (metaContent(source, "property", "og:image:height") !== String(socialImageHeight)) fail(`${pageName}: social image height does not match source asset`);
            if (metaContent(source, "name", "twitter:image") !== socialImageUrl) fail(`${pageName}: X card image differs from Open Graph image`);
            const structuredBlocks = [...source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
            if (!structuredBlocks.length) fail(`${pageName}: missing JSON-LD structured data`);
            for (const block of structuredBlocks) {
                try {
                    const value = JSON.parse(block[1]);
                    if (value["@context"] !== "https://schema.org") fail(`${pageName}: JSON-LD must use the Schema.org context`);
                } catch (error) {
                    fail(`${pageName}: invalid JSON-LD (${error.message})`);
                }
            }
        }
        if (/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)/i.test(source)) {
            fail(`${pageName}: runtime font/icon CDN dependency must be self-hosted`);
        }
        if (pageName === "offline.html") {
            for (const contract of ["text-size-adjust: 100%", "@media (forced-colors: active)", "outline: 3px solid Highlight"]) {
                if (!source.includes(contract)) fail(`offline.html: missing standalone accessibility contract '${contract}'`);
            }
        } else if (!source.includes("css/style.css?v=14")) {
            fail(`${pageName}: shared accessibility style cache version is stale`);
        }

        if (pageName === "wiki.html" && !source.includes('<noscript><link rel="stylesheet" href="css/wiki-noscript.css?v=1"></noscript>')) {
            fail("wiki.html: no-script bilingual directory fallback must remain external under the strict style policy");
        }

        if (["index.html", "wiki.html", "roadmap.html", "community.html", "download.html"].includes(pageName)) {
            if (!source.includes("js/i18n.js?v=13")) fail(`${pageName}: shared localization cache version is stale`);
            if (!source.includes("js/main.js?v=10")) fail(`${pageName}: shared interaction cache version is stale`);
            for (const action of ["theme", "language", "menu"]) {
                if (!source.includes(`data-site-action="${action}"`)) fail(`${pageName}: missing external '${action}' action binding`);
            }
            const expectedHrefs = [
                "wiki/site/en/learn/getting-started.html",
                "wiki.html#start-here",
                "wiki.html?layer=manual#written-guides",
                "wiki/site/en/api/index.html",
                "roadmap.html",
                "community.html",
                "download.html",
                "https://github.com/ChenlizheMe/Infernux"
            ];
            const activeByPage = {
                "wiki.html": expectedHrefs[1],
                "roadmap.html": expectedHrefs[4],
                "community.html": expectedHrefs[5],
                "download.html": expectedHrefs[6]
            };
            verifyTaskNavigation(source, pageName, expectedHrefs, activeByPage[pageName] || null);
            const navigation = primaryNavigation(source, pageName);
            const expectedKeys = ["nav.start", "nav.learn", "nav.manual", "nav.api", "nav.roadmap", "nav.community", "nav.download"];
            const keys = navigation.map((tag) => attribute(tag, "data-i18n")).filter(Boolean);
            if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) fail(`${pageName}: localized task-navigation keys are missing or out of order`);
            for (const [index, languageRoutes] of [[0, ["wiki/site/en/learn/getting-started.html", "wiki/site/zh/learn/getting-started.html"]], [3, ["wiki/site/en/api/index.html", "wiki/site/zh/api/index.html"]]]) {
                if (attribute(navigation[index] || "", "data-href-en") !== languageRoutes[0] || attribute(navigation[index] || "", "data-href-zh") !== languageRoutes[1]) {
                    fail(`${pageName}: task-navigation language routes are incomplete for '${expectedHrefs[index]}'`);
                }
            }
            if (["nav.home", "nav.features", "nav.showcase"].some((key) => keys.includes(key))) fail(`${pageName}: presentation-era navigation leaked into the task navigation`);
            const logo = htmlTags(source, "a").find((tag) => classNames(tag).has("nav-logo"));
            if (pageName === "index.html" && attribute(logo || "", "aria-current") !== "page") fail("index.html: the home logo must identify the current page");
            if (pageName !== "index.html" && attribute(logo || "", "aria-current") === "page") fail(`${pageName}: the home logo must not claim the current page`);
        }

        for (const tag of htmlTags(source, "img")) {
            if (attribute(tag, "alt") === null) fail(`${pageName}: image missing alt attribute: ${tag.slice(0, 100)}`);
            if (attribute(tag, "width") === null || attribute(tag, "height") === null) fail(`${pageName}: image missing intrinsic width/height: ${tag.slice(0, 100)}`);
        }
        for (const tag of htmlTags(source, "button")) {
            const label = attribute(tag, "aria-label") || attribute(tag, "title");
            const start = source.indexOf(tag) + tag.length;
            const closing = source.indexOf("</button>", start);
            const inner = closing >= 0 ? source.slice(start, closing).replace(/<[^>]+>/g, "").trim() : "";
            if (!label && !inner) fail(`${pageName}: button has no accessible name: ${tag.slice(0, 100)}`);
        }
        for (const tag of htmlTags(source, "input")) {
            const id = attribute(tag, "id");
            const hasName = attribute(tag, "aria-label") || (id && new RegExp(`<label\\b[^>]*for=["']${id}["']`, "i").test(source));
            if (!hasName) fail(`${pageName}: input has no associated label: ${tag.slice(0, 100)}`);
        }
        for (const tag of htmlTags(source, "a")) {
            if (attribute(tag, "target") === "_blank" && !(attribute(tag, "rel") || "").split(/\s+/).includes("noopener")) {
                fail(`${pageName}: target=_blank link missing rel=noopener: ${tag.slice(0, 120)}`);
            }
        }

        const translationKeys = [
            ...source.matchAll(/data-i18n=["']([^"']+)["']/g),
            ...source.matchAll(/data-i18n-aria-label=["']([^"']+)["']/g)
        ].map((match) => match[1]);
        for (const key of translationKeys) {
            const definitions = [...i18n.matchAll(new RegExp(`^[ \\t]*["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s*:`, "gm"))].length;
            if (definitions < 2) fail(`${pageName}: i18n key '${key}' is not defined for both languages`);
        }

        if (pageName === "index.html") {
            const hero = source.match(/<div class=["']hero-actions["']>([\s\S]*?)<\/div>/i)?.[1] || "";
            const heroActions = htmlTags(hero, "a");
            if (heroActions.length !== 2) fail(`index.html: expected two primary hero actions, found ${heroActions.length}`);
            const start = heroActions[0] || "";
            const download = heroActions[1] || "";
            if (attribute(start, "href") !== "wiki/site/en/learn/getting-started.html" || attribute(start, "data-href-zh") !== "wiki/site/zh/learn/getting-started.html" || !classNames(start).has("btn-primary")) {
                fail("index.html: first hero action must start the localized first-project path");
            }
            if (attribute(download, "href") !== "download.html" || !classNames(download).has("btn-secondary") || attribute(download, "aria-describedby") !== "hero-platform-note") {
                fail("index.html: second hero action must expose the download and its platform note");
            }
            for (const contract of ["id=\"hero-platform-note\"", "data-i18n=\"home.hero.platform\"", "class=\"hero-text-links\"", "href=\"#runtime-capture\"", "id=\"runtime-capture\"", "loading=\"lazy\"", "https://arxiv.org/abs/2604.10263"]) {
                if (!source.includes(contract)) fail(`index.html: missing evidence-first hero contract '${contract}'`);
            }
            for (const unsupportedClaim of ["performance is competitive with Unity", "不比Unity差", "7× Unity", "Unity效率的7倍"]) {
                if (i18n.includes(unsupportedClaim)) fail(`i18n.js: homepage still contains context-free comparison '${unsupportedClaim}'`);
            }
            for (const evidence of ["1920 × 1080", "60-frame warm-up", "300 frames", "shading complexity, batching and editor maturity differ", "预热 60 帧", "随后 300 帧", "着色复杂度、批处理和编辑器成熟度并不相同"]) {
                if (!i18n.includes(evidence)) fail(`i18n.js: homepage benchmark is missing evidence '${evidence}'`);
            }
        }

        for (const target of [...source.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((match) => match[1])) {
            const clean = target.split("#", 1)[0].split("?", 1)[0];
            if (!clean || /^(https?:|mailto:|data:)/i.test(clean)) continue;
            let absolute = clean.startsWith("/") ? path.join(docsRoot, clean.slice(1)) : path.resolve(path.dirname(file), clean);
            if (clean.endsWith("/")) absolute = path.join(absolute, "index.html");
            if (!await exists(absolute)) fail(`${pageName}: missing local target '${target}'`);
        }
        if (pageName === "wiki.html") {
            for (const contract of ["id=\"documentation-health\"", "id=\"docs-health-panel\"", "aria-busy=\"true\"", "docs-health.json", "js/docs-health.js?v=1", "css/wiki.css?v=4", "js/wiki.js?v=6", "<!-- BEGIN GENERATED WIKI DIRECTORY -->", "<!-- END GENERATED WIKI DIRECTORY -->", "data-static-doc-directory", "data-directory-lang=\"en\"", "data-directory-lang=\"zh\"", "docs-index.json", "api-index.json", "llms.txt"]) {
                if (!source.includes(contract)) fail(`wiki.html: missing documentation health contract '${contract}'`);
            }
            const staticRegion = source.match(/<!-- BEGIN GENERATED WIKI DIRECTORY -->([\s\S]*?)<!-- END GENERATED WIKI DIRECTORY -->/)?.[1] || "";
            const catalog = JSON.parse(await readFile(path.join(docsRoot, "assets", "wiki-docs.json"), "utf8"));
            const expectedDocuments = ["en", "zh"].flatMap((language) => Array.isArray(catalog[language]) ? catalog[language] : []);
            const staticLinks = htmlTags(staticRegion, "a").filter((tag) => (attribute(tag, "class") || "").split(/\s+/).includes("docs-static-card"));
            if (staticLinks.length !== expectedDocuments.length) fail(`wiki.html: expected ${expectedDocuments.length} static document links, found ${staticLinks.length}`);
            const staticHrefs = staticLinks.map((tag) => attribute(tag, "href"));
            if (new Set(staticHrefs).size !== staticHrefs.length) fail("wiki.html: static document directory contains duplicate URLs");
            for (const document of expectedDocuments) {
                if (!staticHrefs.includes(document.url)) fail(`wiki.html: static document directory is missing '${document.url}'`);
            }
            const wikiRuntime = await readFile(path.join(docsRoot, "js", "wiki.js"), "utf8");
            for (const contract of ["host.replaceChildren()", "docs-library-runtime-error", "host.prepend(error)", "site:language-changed"]) {
                if (!wikiRuntime.includes(contract)) fail(`wiki.js: missing progressive directory contract '${contract}'`);
            }
            if (/innerHTML\s*=/.test(wikiRuntime)) fail("wiki.js: documentation catalog UI must not be constructed with innerHTML");
            const catalogBuilder = await readFile(path.join(docsRoot, "tools", "build-wiki-catalog.mjs"), "utf8");
            for (const contract of ["BEGIN GENERATED WIKI DIRECTORY", "renderStaticDirectory", "renderStaticLanguage", "escapeHtml", "unsafe or unexpected static URL", "static directory is stale"]) {
                if (!catalogBuilder.includes(contract)) fail(`build-wiki-catalog.mjs: missing static directory contract '${contract}'`);
            }
            const healthRuntime = await readFile(path.join(docsRoot, "js", "docs-health.js"), "utf8");
            for (const contract of ["normalizeDocsHealth", "freshness_policy_days", "site:language-changed", "aria-busy", "replaceChildren", "Local preview · unstamped", "/docs-health.json"]) {
                if (!healthRuntime.includes(contract)) fail(`docs-health.js: missing health-panel contract '${contract}'`);
            }
            if (/innerHTML\s*=/.test(healthRuntime)) fail("docs-health.js: health UI must not be constructed with innerHTML");
            const wikiCss = await readFile(path.join(docsRoot, "css", "wiki.css"), "utf8");
            for (const contract of [".docs-health-panel", ".docs-health-grid", ".docs-health-signal", ".docs-static-directory", ".docs-static-language", ".docs-static-machine-links", ".docs-library-runtime-error", "min-height: 44px", "grid-template-columns: 1fr"]) {
                if (!wikiCss.includes(contract)) fail(`wiki.css: missing documentation health contract '${contract}'`);
            }
        }
    }
}

async function verifyBuiltWikiExperience() {
    const template = await readFile(path.join(docsRoot, "wiki", "theme", "main.html"), "utf8");
    const templateStyleMatches = [...template.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
    if (templateStyleMatches.length !== 1) fail(`wiki/theme/main.html: expected one extractable shared style block, found ${templateStyleMatches.length}`);
    const normalizedTemplateCss = templateStyleMatches.length === 1
        ? `${templateStyleMatches[0][1].replace(/\r\n/g, "\n").trim()}\n`
        : "";
    const expectedStyleHash = createHash("sha256").update(normalizedTemplateCss).digest("hex").slice(0, 16);
    const expectedStyleName = `wiki-template.${expectedStyleHash}.css`;
    const expectedStyleHref = `/css/${expectedStyleName}`;
    const hashedTemplateStyles = (await readdir(path.join(docsRoot, "css"))).filter((name) => /^wiki-template\.[a-f0-9]{16}\.css$/.test(name));
    if (hashedTemplateStyles.length !== 1 || hashedTemplateStyles[0] !== expectedStyleName) {
        fail(`docs/css: expected only '${expectedStyleName}', found ${hashedTemplateStyles.join(", ") || "none"}`);
    } else {
        const sharedStyle = await readFile(path.join(docsRoot, "css", expectedStyleName), "utf8");
        if (sharedStyle !== normalizedTemplateCss) fail(`${expectedStyleName}: content differs from the template style block`);
    }
    for (const legacyToken of ["--primary", "--primary-light", "--text-primary", "--text-secondary", "--bg-hover"]) {
        if (template.includes(`var(${legacyToken})`)) fail(`wiki/theme/main.html: references undefined legacy token '${legacyToken}'`);
    }
    if (/^\s*\.api-main\s+thead\s*\{\s*display:\s*none/im.test(template)) {
        fail("wiki/theme/main.html: table headings are hidden outside the API-only page scope");
    }
    for (const contract of ["class=\"skip-link\"", "id=\"main-content\"", "aria-controls=\"primary-navigation\"", "class=\"doc-provenance\"", "data-docs-search-trigger", "data-doc-context-trigger", "data-doc-build-provenance", "data-doc-build-facts", "id=\"docs-search-dialog\"", "id=\"docs-search-filters\"", "/js/docs-search.js?v=2", "/css/docs-search.css?v=2", "/js/wiki-generated.js?v=7", "/css/wiki-generated.css?v=4", "/css/style.css?v=14", "/js/main.js?v=10", "rel=\"manifest\" href=\"/site.webmanifest\"", "width=\"256\" height=\"256\"", "class=\"api-sidebar-toggle\"", "id=\"api-namespace-tree\"", "rel=\"canonical\"", "type=\"text/plain\"", "type=\"application/json\"", "property=\"og:title\"", "name=\"twitter:card\"", "application/ld+json", "BreadcrumbList", "LearningResource", "TechArticle", "data-doc-outline", "id=\"doc-outline-links\"", "aria-controls=\"doc-outline-links\"", "overflow-wrap: anywhere", "min-width: 7rem", "nav-priority", "/wiki.html#start-here", "/wiki.html?layer=manual#written-guides", "data-site-action=\"theme\"", "data-site-action=\"menu\"", "http-equiv=\"Content-Security-Policy\"", "script-src-attr 'none'"]) {
        if (!template.includes(contract)) fail(`wiki/theme/main.html: missing generated-document contract '${contract}'`);
    }
    if (template.includes("document.querySelectorAll('.api-main pre')")) fail("wiki/theme/main.html: repeated code-copy runtime must live in the shared generated-page script");

    for (const builtFile of await walk(path.join(docsRoot, "wiki", "site"), ".html")) {
        const html = await readFile(builtFile, "utf8");
        const relative = posix(path.relative(docsRoot, builtFile));
        if (!html.includes(`<link rel="stylesheet" href="${expectedStyleHref}">`)) fail(`${relative}: missing content-hashed shared template style`);
        if (metaContent(html, "http-equiv", "Content-Security-Policy") !== commonStaticCsp) fail(`${relative}: generated page CSP differs from the static documentation contract`);
        if (metaContent(html, "name", "referrer") !== "strict-origin-when-cross-origin") fail(`${relative}: missing strict cross-origin referrer policy`);
        if (/\son[a-z]+\s*=/i.test(html)) fail(`${relative}: generated page contains an inline event handler`);
        if (/\sstyle\s*=/i.test(html)) fail(`${relative}: generated page contains an inline style attribute`);
        if (/<style\b/i.test(html)) fail(`${relative}: generated page contains an inline style element`);
        if (!html.includes('/js/main.js?v=10')) fail(`${relative}: generated page uses a stale shared interaction runtime`);

        if (relative === "wiki/site/404.html") {
            if (metaContent(html, "name", "robots") !== "noindex, follow") fail(`${relative}: generated error page must be excluded from indexing`);
            if (canonicalHref(html)) fail(`${relative}: generated error page must not claim a canonical document URL`);
            continue;
        }

        const navigationLanguage = relative.includes("/zh/") ? "zh" : "en";
        const expectedNavigationHrefs = [
            `/wiki/site/${navigationLanguage}/learn/getting-started.html`,
            "/wiki.html#start-here",
            "/wiki.html?layer=manual#written-guides",
            `/wiki/site/${navigationLanguage}/api/index.html`,
            "/roadmap.html",
            "/community.html",
            "/download.html",
            "https://github.com/ChenlizheMe/Infernux"
        ];
        let expectedActiveHref = null;
        if (relative.includes("/learn/getting-started.html")) expectedActiveHref = expectedNavigationHrefs[0];
        else if (relative.includes("/learn/")) expectedActiveHref = expectedNavigationHrefs[1];
        else if (relative.includes("/manual/") || relative.includes("/architecture/")) expectedActiveHref = expectedNavigationHrefs[2];
        else if (relative.includes("/api/")) expectedActiveHref = expectedNavigationHrefs[3];
        verifyTaskNavigation(html, relative, expectedNavigationHrefs, expectedActiveHref);

        if (!html.includes("data-doc-build-provenance") || !html.includes("data-doc-build-facts")) fail(`${relative}: missing visible documentation build evidence`);
        if (!html.includes('href="/docs-manifest.json"')) fail(`${relative}: missing machine manifest from visible build evidence`);

        const canonical = canonicalHref(html);
        if (!canonical) fail(`${relative}: missing canonical URL`);
        for (const property of ["og:type", "og:site_name", "og:title", "og:description", "og:url", "og:locale", "og:image", "og:image:type", "og:image:width", "og:image:height", "og:image:alt"]) {
            if (metaContent(html, "property", property) === null) fail(`${relative}: missing ${property}`);
        }
        for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"]) {
            if (metaContent(html, "name", name) === null) fail(`${relative}: missing ${name}`);
        }
        if (metaContent(html, "property", "og:type") !== "article") fail(`${relative}: generated document must use the article Open Graph type`);
        if (metaContent(html, "property", "og:url") !== canonical) fail(`${relative}: Open Graph URL differs from canonical URL`);
        if (metaContent(html, "property", "og:image") !== socialImageUrl) fail(`${relative}: social image must use the versioned NASA Punk card`);
        if (metaContent(html, "property", "og:image:type") !== "image/jpeg") fail(`${relative}: social image MIME type is incorrect`);
        if (metaContent(html, "property", "og:image:width") !== String(socialImageWidth) || metaContent(html, "property", "og:image:height") !== String(socialImageHeight)) fail(`${relative}: social image dimensions differ from the source asset`);
        if (metaContent(html, "name", "twitter:card") !== "summary_large_image") fail(`${relative}: X card must use the large-image format`);
        if (metaContent(html, "name", "twitter:image") !== socialImageUrl) fail(`${relative}: X card image differs from Open Graph image`);

        const localized = relative.includes("/en/") || relative.includes("/zh/");
        const expectedLanguage = relative.includes("/zh/") ? "zh-CN" : "en";
        const expectedLocale = expectedLanguage === "zh-CN" ? "zh_CN" : "en_US";
        const htmlLanguage = attribute(htmlTags(html, "html")[0] || "", "lang");
        if (htmlLanguage !== expectedLanguage) fail(`${relative}: HTML language '${htmlLanguage}' differs from expected '${expectedLanguage}'`);
        if (metaContent(html, "property", "og:locale") !== expectedLocale) fail(`${relative}: Open Graph locale differs from page language`);
        if (localized && metaContent(html, "property", "og:locale:alternate") === null) fail(`${relative}: localized page is missing its alternate Open Graph locale`);

        const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
        if (!blocks.length) fail(`${relative}: missing JSON-LD structured data`);
        const nodes = [];
        for (const block of blocks) {
            try {
                const value = JSON.parse(block[1]);
                if (value["@context"] !== "https://schema.org") fail(`${relative}: JSON-LD must use the Schema.org context`);
                nodes.push(...(Array.isArray(value["@graph"]) ? value["@graph"] : [value]));
            } catch (error) {
                fail(`${relative}: invalid JSON-LD (${error.message})`);
            }
        }
        if (canonical) {
            const documentNode = nodes.find((node) => node?.["@id"] === `${canonical}#document`);
            const expectedType = relative.includes("/learn/") ? "LearningResource" : "TechArticle";
            if (!documentNode) {
                fail(`${relative}: JSON-LD is missing the canonical document node`);
            } else {
                if (documentNode["@type"] !== expectedType) fail(`${relative}: expected Schema.org type '${expectedType}', found '${documentNode["@type"]}'`);
                if (documentNode.url !== canonical || documentNode.mainEntityOfPage?.["@id"] !== canonical) fail(`${relative}: structured document URL differs from canonical URL`);
                if (documentNode.inLanguage !== expectedLanguage) fail(`${relative}: structured document language differs from HTML language`);
                if (!documentNode.description || !documentNode.headline || !documentNode.learningResourceType) fail(`${relative}: structured document is missing its human and Agent discovery fields`);
                if (documentNode.image?.url !== socialImageUrl || documentNode.image?.width !== socialImageWidth || documentNode.image?.height !== socialImageHeight) fail(`${relative}: structured image does not match the versioned social card`);
            }
            const breadcrumb = nodes.find((node) => node?.["@id"] === `${canonical}#breadcrumb` && node?.["@type"] === "BreadcrumbList");
            const items = breadcrumb?.itemListElement;
            if (!Array.isArray(items) || items.length < 2) {
                fail(`${relative}: structured breadcrumb is missing or incomplete`);
            } else {
                if (items.at(-1)?.item !== canonical) fail(`${relative}: structured breadcrumb does not end at the canonical page`);
                if (items.some((item, index) => item.position !== index + 1 || !item.name || !item.item)) fail(`${relative}: structured breadcrumb positions or labels are invalid`);
            }
        }
    }

    const docsIndex = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
    let curatedDiagramCount = 0;
    const diagramKinds = new Set();
    const localizedDiagramShapes = new Map();
    const requiredManualDiagramShapes = new Map([
        ["engine-map", "hierarchy,timeline"],
        ["scenes-and-objects", "hierarchy"],
        ["rendering-and-renderstack", "pipeline"],
        ["physics", "timeline"],
        ["input-and-time", "decision"],
        ["assets-and-meta", "pipeline"],
        ["ui", "pipeline"],
    ]);
    for (const document of docsIndex.documents) {
        const builtFile = path.join(docsRoot, document.url.replace(/^\//, ""));
        if (!await exists(builtFile)) {
            fail(`generated Wiki: missing curated page '${document.url}'`);
            continue;
        }
        const html = await readFile(builtFile, "utf8");
        const markdown = await readFile(path.join(repoRoot, document.source), "utf8");
        const diagramMarkers = [...markdown.matchAll(/^\[INX-DIAGRAM:([a-z][a-z0-9-]*):([^\]]+)\]$/gm)];
        const markerFragments = markdown.match(/\[INX-DIAGRAM:/g) || [];
        if (markerFragments.length !== diagramMarkers.length) fail(`${document.source}: malformed INX diagram marker`);
        const builtDiagrams = [...html.matchAll(/<figure class="doc-diagram doc-diagram--([a-z][a-z0-9-]*)" role="group" aria-label="[^"]+">/g)];
        if (builtDiagrams.length !== diagramMarkers.length) fail(`${document.url}: expected ${diagramMarkers.length} semantic diagram(s), found ${builtDiagrams.length}`);
        if (html.includes("[INX-DIAGRAM:")) fail(`${document.url}: raw diagram marker leaked into generated HTML`);
        const sourceKinds = diagramMarkers.map((marker) => marker[1]);
        if (builtDiagrams.some((diagram, index) => diagram[1] !== sourceKinds[index])) fail(`${document.url}: generated diagram order or kind differs from Markdown source`);
        const documentSlug = path.basename(document.url, ".html");
        const expectedDiagramShape = requiredManualDiagramShapes.get(documentSlug);
        if (expectedDiagramShape && sourceKinds.join(",") !== expectedDiagramShape) fail(`${document.url}: expected diagram shape '${expectedDiagramShape}', found '${sourceKinds.join(",") || "none"}'`);
        curatedDiagramCount += diagramMarkers.length;
        sourceKinds.forEach((kind) => diagramKinds.add(kind));
        const pairKey = document.url.replace(/\/(?:en|zh)\//, "/{locale}/");
        const pair = localizedDiagramShapes.get(pairKey) || {};
        pair[document.language] = sourceKinds.join(",");
        localizedDiagramShapes.set(pairKey, pair);
        if (!/<body\s+class=["']guide-page["']/.test(html)) fail(`${document.url}: missing guide-page scope`);
        if (!html.includes(`data-status="${document.status}"`)) fail(`${document.url}: visible status does not match docs-index`);
        if (!html.includes(`data-last-verified="${document.last_verified}"`)) fail(`${document.url}: visible verification date does not match docs-index`);
        if (!html.includes('href="/docs-manifest.json"')) fail(`${document.url}: missing documentation manifest link`);
        if (!html.includes(`<link rel="canonical" href="${document.canonical_url}">`)) fail(`${document.url}: canonical metadata does not match docs-index`);
        if (!html.includes('<link rel="alternate" type="text/plain" title="Infernux Agent index" href="/llms.txt">')) fail(`${document.url}: missing Agent text-index discovery link`);
        if (!html.includes('<link rel="alternate" type="application/json" title="Infernux machine-readable document index" href="/docs-index.json">')) fail(`${document.url}: missing curated JSON-index discovery link`);
        if (!html.includes("data-doc-context-trigger")) fail(`${document.url}: missing Agent context copy control`);
        if (!html.includes('class="doc-breadcrumb"')) fail(`${document.url}: missing document breadcrumb`);
        if (!html.includes('data-doc-trail')) fail(`${document.url}: missing document navigation and feedback fallback`);
        if (!html.includes('/js/wiki-generated.js?v=7')) fail(`${document.url}: missing shared generated-page runtime v7`);
        if (!html.includes('data-doc-build-provenance')) fail(`${document.url}: missing visible documentation build evidence`);
        if (!html.includes('data-doc-outline')) fail(`${document.url}: missing progressive document outline container`);
        const counterpart = document.language === "zh-CN"
            ? document.url.replace("/zh/", "/en/")
            : document.url.replace("/en/", "/zh/");
        if (!html.includes(`href="${counterpart}"`)) fail(`${document.url}: missing same-page language counterpart`);
        if (/<a\b[^>]*\bhref=["'][^"']+["'][^>]*\bhref=/i.test(html)) fail(`${document.url}: anchor contains duplicate href attributes`);
        for (const sourcePath of document.source_paths) {
            const leaf = sourcePath.split("/").at(-1) || "";
            const route = leaf.includes(".") ? "blob" : "tree";
            const expected = `https://github.com/ChenlizheMe/Infernux/${route}/main/${sourcePath}`;
            if (!html.includes(`href="${expected}"`)) fail(`${document.url}: missing source evidence link '${sourcePath}'`);
        }
    }
    if (curatedDiagramCount < 16) fail(`curated documentation: expected at least 16 semantic diagrams, found ${curatedDiagramCount}`);
    for (const kind of ["hierarchy", "timeline", "pipeline", "decision"]) {
        if (!diagramKinds.has(kind)) fail(`curated documentation: missing '${kind}' diagram coverage`);
    }
    for (const [pairKey, pair] of localizedDiagramShapes) {
        if (pair.en !== pair["zh-CN"]) fail(`${pairKey}: English and Chinese diagram shapes differ`);
    }

    const apiSample = await readFile(path.join(docsRoot, "wiki", "site", "en", "api", "GameObject.html"), "utf8");
    for (const contract of [
        '<body class="api-reference-page">',
        '<a class="skip-link" href="#main-content">',
        '<main class="api-main" id="main-content">',
        '<button type="button" class="ns-hd',
        'aria-expanded="true"',
        'aria-controls="primary-navigation"',
        'target="_blank" rel="noopener"',
        'href="/wiki/site/zh/api/GameObject.html"',
        'aria-haspopup="dialog"',
        'id="docs-search-results"',
        'id="docs-search-filters"',
        'aria-controls="api-namespace-tree"',
        'class="api-current-page"',
        'class="doc-breadcrumb"',
        'data-doc-trail',
        '<link rel="canonical" href="https://infernux-engine.com/wiki/site/en/api/GameObject.html">',
        '<link rel="alternate" type="application/json" title="Infernux machine-readable document index" href="/api-index.json">',
        'data-doc-context-trigger',
        '/js/wiki-generated.js?v=7',
        'data-doc-build-provenance',
        'data-doc-build-facts',
        'data-doc-outline'
    ]) {
        if (!apiSample.includes(contract)) fail(`generated API sample: missing accessibility contract '${contract}'`);
    }
    if (/<a\b[^>]*\bhref=["'][^"']+["'][^>]*\bhref=/i.test(apiSample)) fail("generated API sample: anchor contains duplicate href attributes");
    const generatedWikiJs = await readFile(path.join(docsRoot, "js", "wiki-generated.js"), "utf8");
    for (const contract of ["matchMedia(\"(max-width: 768px)\")", "setApiSidebarCollapsed", "syncApiSidebarBreakpoint", "apiSidebarToggle.hidden = false", "buildAgentContext", "findContextEntry", "/docs-manifest.json", "/api-index.json", "/docs-index.json", "/docs-health.json", "/learning-paths.json", "navigator.clipboard", "fallbackCopy", "doc-code-copy", "textContent || \"\"", "Copy for Agent", "复制给 Agent", "findLearningStep", "buildLearningTrack", "infernux-learning-progress-v1", "aria-pressed", "first_playable_after_step", "findDocumentNeighbors", "buildFeedbackIssueUrl", "issues/new", "Documentation build", "data-doc-trail", "Copy page link", "反馈文档问题", "## Related API", "## Related guides", "related_documents", "normalizeOutlineEntries", "initializeDocumentOutline", "hashchange", "aria-current", "Show sections", "展开章节", "buildProvenanceFacts", "initializeBuildProvenance", "data-doc-build-provenance", "Release provenance unavailable", "Local preview · unstamped"]) {
        if (!generatedWikiJs.includes(contract)) fail(`wiki-generated.js: missing shared generated-page contract '${contract}'`);
    }
    if (/innerHTML\s*=/.test(generatedWikiJs)) fail("wiki-generated.js: shared documentation runtime must not construct UI with innerHTML");
    const generatedWikiCss = await readFile(path.join(docsRoot, "css", "wiki-generated.css"), "utf8");
    for (const contract of ["data-collapsed=\"true\"", "min-width: 44px", "prefers-reduced-motion", ".docs-context-trigger", "data-state=\"success\"", ".learning-track", ".learning-track-steps", ".learning-complete-toggle", "grid-template-columns: 1fr", ".doc-breadcrumb", ".doc-trail", ".doc-trail-action", ".doc-trail-link.next", ".doc-outline", ".doc-outline-toggle", ".doc-outline-link", ".doc-build-provenance", "data-state=\"stamped\"", ".doc-build-facts", ".doc-build-manifest", "scroll-margin-top", ".doc-diagram", ".doc-diagram--timeline", "overscroll-behavior-inline: contain"] ) {
        if (!generatedWikiCss.includes(contract)) fail(`wiki-generated.css: missing generated-page interaction contract '${contract}'`);
    }
    const optimizer = await readFile(path.join(docsRoot, "tools", "optimize-static-site.mjs"), "utf8");
    for (const contract of ["wiki-template.${sharedWikiCssHash}.css", "inline shared Wiki style", "stale shared Wiki style", "createHash(\"sha256\")", "semantic text diagram", "INX-DIAGRAM", "role=\"group\""]) {
        if (!optimizer.includes(contract)) fail(`optimize-static-site.mjs: missing shared style extraction contract '${contract}'`);
    }

    const docsSearch = await readFile(path.join(docsRoot, "js", "docs-search.js"), "utf8");
    for (const contract of ["/api-index.json", "/docs-index.json", "function buildSearchModel", "function search", "function score", "function createFilter", "document.createElement(\"select\")", "option.textContent", "generated_for_release", "languageFilter.value", "layerFilter.value", "statusFilter.value", "select:not([disabled])", "HTMLSelectElement", "aria-expanded", "event.key === \"/\"", "event.key === \"Escape\"", "event.key === \"Tab\""]) {
        if (!docsSearch.includes(contract)) fail(`docs-search.js: missing global search contract '${contract}'`);
    }
    if (/\.innerHTML\s*=/.test(docsSearch)) fail("docs-search.js: search UI must not construct filter or result markup with innerHTML");
    const docsSearchCss = await readFile(path.join(docsRoot, "css", "docs-search.css"), "utf8");
    for (const contract of [".docs-search-filters", ".docs-search-filter select", "min-height: 44px", "overflow-x: auto", "overscroll-behavior-inline: contain", "scroll-snap-type: inline proximity"]) {
        if (!docsSearchCss.includes(contract)) fail(`docs-search.css: missing responsive search-filter contract '${contract}'`);
    }
    const docsSearchTest = await readFile(path.join(docsRoot, "tools", "test-doc-search.mjs"), "utf8");
    for (const contract of ["release parity", "bilingual facets", "layer/status browsing", "exact API symbol matches", "idle search should not flood"]) {
        if (!docsSearchTest.includes(contract)) fail(`test-doc-search.mjs: missing search assertion '${contract}'`);
    }
    for (const workflowName of ["website-quality.yml", "build-wiki.yml"]) {
        const workflow = await readFile(path.join(repoRoot, ".github", "workflows", workflowName), "utf8");
        if (!workflow.includes("node docs/tools/test-doc-search.mjs")) fail(`${workflowName}: documentation search test is not enforced`);
    }
    if (await exists(path.join(docsRoot, "wiki", "site", "assets"))) fail("generated Wiki: unused Material assets directory was not removed");
    if (await exists(path.join(docsRoot, "wiki", "site", "search"))) fail("generated Wiki: unused Material search index was not removed");
}

async function verifyIndexes() {
    const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
    const docsIndex = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
    const apiIndex = JSON.parse(await readFile(path.join(docsRoot, "api-index.json"), "utf8"));
    const apiChanges = JSON.parse(await readFile(path.join(docsRoot, "api-changes.json"), "utf8"));
    const releaseNotes = JSON.parse(await readFile(path.join(docsRoot, "release-notes.json"), "utf8"));
    const learningPaths = JSON.parse(await readFile(path.join(docsRoot, "learning-paths.json"), "utf8"));
    const docsHealth = JSON.parse(await readFile(path.join(docsRoot, "docs-health.json"), "utf8"));
    const apiSnapshot = JSON.parse(await readFile(path.join(docsRoot, "api-snapshots", `${manifest.documented_release}.json`), "utf8"));

    if (docsIndex.schema_version !== 3) fail("docs-index.json: expected schema_version 3 with navigation order");
    if (apiIndex.schema_version !== 3) fail("api-index.json: expected schema_version 3 with related documents");
    if (docsIndex.document_count !== docsIndex.documents.length) fail("docs-index.json: document_count mismatch");
    if (apiIndex.symbol_count !== apiIndex.symbols.length) fail("api-index.json: symbol_count mismatch");
    if (apiIndex.curated_example_count !== apiIndex.symbols.filter((item) => item.example_status === "curated").length) fail("api-index.json: curated_example_count mismatch");
    if (docsIndex.generated_for_release !== manifest.documented_release) fail("docs-index.json: release mismatch");
    if (apiIndex.generated_for_release !== manifest.documented_release) fail("api-index.json: release mismatch");
    if (apiChanges.current_release !== manifest.documented_release) fail("api-changes.json: current release mismatch");
    if (apiSnapshot.release !== manifest.documented_release) fail("api snapshot: release mismatch");
    if (apiSnapshot.symbol_count !== apiSnapshot.symbols.length) fail("api snapshot: symbol_count mismatch");
    if (releaseNotes.version !== manifest.documented_release || releaseNotes.tag !== `v${manifest.documented_release}`) fail("release-notes.json: release mismatch");
    if (releaseNotes.source !== "UpdateLog.md" || releaseNotes.language !== "en") fail("release-notes.json: source or language mismatch");
    if (releaseNotes.section_count !== releaseNotes.sections.length) fail("release-notes.json: section_count mismatch");
    if (releaseNotes.item_count !== releaseNotes.sections.reduce((count, section) => count + section.items.length, 0)) fail("release-notes.json: item_count mismatch");
    if (releaseNotes.comparison?.to !== releaseNotes.version || !/^https:\/\/github\.com\/ChenlizheMe\/Infernux\/compare\//.test(releaseNotes.comparison?.url || "")) fail("release-notes.json: invalid comparison baseline");
    if (learningPaths.schema_version !== 1 || learningPaths.documented_release !== manifest.documented_release) fail("learning-paths.json: schema or documented release mismatch");
    if (!Array.isArray(learningPaths.paths) || !learningPaths.paths.length) fail("learning-paths.json: expected at least one path");
    if (docsHealth.schema_version !== 1 || docsHealth.documented_release !== manifest.documented_release || docsHealth.release_status !== manifest.release_status) fail("docs-health.json: schema or release mismatch");
    if (docsHealth.coverage?.curated_documents !== docsIndex.document_count || docsHealth.coverage?.api_symbols !== apiIndex.symbol_count || docsHealth.coverage?.localized_pages !== docsIndex.document_count + apiIndex.symbol_count) fail("docs-health.json: coverage counts disagree with indexes");
    const expectedStatusCounts = { stable: 0, preview: 0, experimental: 0, deprecated: 0 };
    for (const item of [...docsIndex.documents, ...apiIndex.symbols]) expectedStatusCounts[item.status] = (expectedStatusCounts[item.status] || 0) + 1;
    if (JSON.stringify(docsHealth.coverage?.statuses) !== JSON.stringify(expectedStatusCounts)) fail("docs-health.json: status counts disagree with indexes");
    if (docsHealth.coverage?.api_examples?.curated !== apiIndex.curated_example_count || docsHealth.coverage?.api_examples?.unknown !== apiIndex.symbols.filter((symbol) => symbol.example_status === "unknown").length) fail("docs-health.json: API example counts disagree with index");
    if (docsHealth.coverage?.localized_relationship_edges !== docsIndex.documents.reduce((count, document) => count + document.related_api.length, 0)) fail("docs-health.json: relationship count disagrees with docs index");
    const expectedVerificationDates = docsIndex.documents.map((document) => document.last_verified).filter(Boolean).sort();
    if (docsHealth.verification?.manifest_last_verified !== manifest.last_verified || docsHealth.verification?.curated_oldest !== expectedVerificationDates[0] || docsHealth.verification?.curated_latest !== expectedVerificationDates.at(-1) || docsHealth.verification?.curated_missing_dates !== docsIndex.document_count - expectedVerificationDates.length) fail("docs-health.json: verification window disagrees with source evidence");
    if (docsHealth.verification?.freshness_policy_days !== 120) fail("docs-health.json: freshness policy must remain explicit at 120 days");
    if (JSON.stringify(docsHealth.build) !== JSON.stringify(manifest.build)) fail("docs-health.json: build provenance disagrees with manifest");
    const indexedDocsByUrl = new Map(docsIndex.documents.map((document) => [document.url, document]));
    const apiKeysByLanguage = new Map();
    for (const symbol of apiIndex.symbols) {
        if (!apiKeysByLanguage.has(symbol.language)) apiKeysByLanguage.set(symbol.language, new Set());
        apiKeysByLanguage.get(symbol.language).add(symbol.symbol_key);
    }
    const navigationSlots = new Set();
    for (const document of docsIndex.documents) {
        if (!Number.isInteger(document.navigation_order) || document.navigation_order < 0) fail(`docs-index.json: '${document.id}' is missing a valid navigation_order`);
        const slot = `${document.language}:${document.layer}:${document.navigation_order}`;
        if (navigationSlots.has(slot)) fail(`docs-index.json: duplicate navigation slot '${slot}'`);
        navigationSlots.add(slot);
        if (!Array.isArray(document.related_api)) fail(`docs-index.json: '${document.id}' is missing related_api`);
        for (const symbolKey of document.related_api || []) {
            if (!apiKeysByLanguage.get(document.language)?.has(symbolKey)) fail(`docs-index.json: '${document.id}' has unresolved related API '${symbolKey}'`);
        }
    }
    const documentsById = new Map(docsIndex.documents.map((document) => [document.id, document]));
    for (const document of docsIndex.documents.filter((item) => item.language === "en")) {
        const counterpart = documentsById.get(document.id.replace(/^en\./, "zh."));
        if (!counterpart) continue;
        if (JSON.stringify(document.related_api) !== JSON.stringify(counterpart.related_api)) fail(`docs-index.json: related_api differs across languages for '${document.id}'`);
    }
    for (const symbol of apiIndex.symbols) {
        if (!Array.isArray(symbol.related_documents)) fail(`api-index.json: '${symbol.id}' is missing related_documents`);
        for (const relation of symbol.related_documents || []) {
            const document = documentsById.get(relation.id);
            if (!document || document.language !== symbol.language || document.url !== relation.url || document.title !== relation.title) fail(`api-index.json: '${symbol.id}' has invalid related document '${relation.id}'`);
            else if (!document.related_api.includes(symbol.symbol_key)) fail(`api-index.json: '${symbol.id}' relation '${relation.id}' is not bidirectional`);
        }
    }
    const learningPathIds = new Set();
    for (const learningPath of learningPaths.paths || []) {
        if (!/^[a-z0-9-]+$/.test(learningPath.id || "") || learningPathIds.has(learningPath.id)) fail(`learning-paths.json: invalid or duplicate path id '${learningPath.id}'`);
        learningPathIds.add(learningPath.id);
        if (!/^\d+(?:-\d+)?$/.test(learningPath.estimated_minutes || "")) fail(`learning-paths.json: invalid estimated_minutes for '${learningPath.id}'`);
        for (const field of ["title", "description", "completion_summary"]) {
            if (!learningPath[field]?.en || !learningPath[field]?.["zh-CN"]) fail(`learning-paths.json: '${learningPath.id}' is missing bilingual ${field}`);
        }
        if (!Array.isArray(learningPath.steps) || learningPath.steps.length < 2) fail(`learning-paths.json: '${learningPath.id}' requires at least two ordered steps`);
        if (!Number.isInteger(learningPath.first_playable_after_step) || learningPath.first_playable_after_step < 1 || learningPath.first_playable_after_step > learningPath.steps.length) fail(`learning-paths.json: '${learningPath.id}' has an invalid first playable milestone`);
        const stepIds = new Set();
        const previousNavigationOrder = { en: -1, "zh-CN": -1 };
        for (const [index, step] of (learningPath.steps || []).entries()) {
            if (step.position !== index + 1) fail(`learning-paths.json: '${learningPath.id}' step positions must be contiguous`);
            if (!/^[a-z0-9-]+$/.test(step.id || "") || stepIds.has(step.id)) fail(`learning-paths.json: invalid or duplicate step id '${step.id}'`);
            stepIds.add(step.id);
            if (!/^\d+(?:-\d+)?$/.test(step.estimated_minutes || "")) fail(`learning-paths.json: invalid estimated_minutes for step '${step.id}'`);
            for (const field of ["title", "completion"]) if (!step[field]?.en || !step[field]?.["zh-CN"]) fail(`learning-paths.json: step '${step.id}' is missing bilingual ${field}`);
            for (const language of ["en", "zh-CN"]) {
                const document = indexedDocsByUrl.get(step.documents?.[language]);
                if (!document) fail(`learning-paths.json: step '${step.id}' points to an unindexed ${language} document`);
                else if (document.language !== language || document.layer !== "learn") fail(`learning-paths.json: step '${step.id}' ${language} target is not a matching Learn document`);
                else if (document.navigation_order <= previousNavigationOrder[language]) fail(`learning-paths.json: '${learningPath.id}' ${language} steps disagree with MkDocs navigation order`);
                else previousNavigationOrder[language] = document.navigation_order;
            }
        }
    }
    if (!manifest.build || !["stamped", "unstamped"].includes(manifest.build.status)) fail("docs-manifest.json: invalid build provenance status");
    if (manifest.build?.status === "stamped") {
        if (!/^[a-f0-9]{40}$/.test(manifest.build.source_commit || "")) fail("docs-manifest.json: invalid build source commit");
        if (manifest.build.source_url !== `https://github.com/ChenlizheMe/Infernux/commit/${manifest.build.source_commit}`) fail("docs-manifest.json: build source URL mismatch");
        if (!manifest.build.generated_at || Number.isNaN(Date.parse(manifest.build.generated_at))) fail("docs-manifest.json: invalid build generation time");
    } else if (manifest.build?.source_commit !== null || manifest.build?.generated_at !== null || manifest.build?.source_url !== null) {
        fail("docs-manifest.json: unstamped build provenance must not claim a source commit or generation time");
    }

    for (const [name, items] of [["docs-index", docsIndex.documents], ["api-index", apiIndex.symbols]]) {
        const ids = new Set();
        const canonicals = new Set();
        for (const item of items) {
            if (ids.has(item.id)) fail(`${name}: duplicate id '${item.id}'`);
            ids.add(item.id);
            if (canonicals.has(item.canonical_url)) fail(`${name}: duplicate canonical_url '${item.canonical_url}'`);
            canonicals.add(item.canonical_url);
            if (!await exists(path.join(repoRoot, item.source))) fail(`${name}: source does not exist '${item.source}'`);
        }
    }

    const enKeys = new Set(apiIndex.symbols.filter((item) => item.language === "en").map((item) => item.symbol_key));
    const zhKeys = new Set(apiIndex.symbols.filter((item) => item.language === "zh-CN").map((item) => item.symbol_key));
    for (const key of enKeys) if (!zhKeys.has(key)) fail(`api-index: missing zh symbol '${key}'`);
    for (const key of zhKeys) if (!enKeys.has(key)) fail(`api-index: missing en symbol '${key}'`);
    for (const item of apiIndex.symbols) {
        if (!["curated", "unavailable"].includes(item.example_status)) fail(`api-index: invalid example_status for '${item.id}'`);
        const source = await readFile(path.join(repoRoot, item.source), "utf8");
        if (source.includes("TODO: Add example")) fail(`${item.source}: unprocessed API example TODO`);
        if (item.example_status === "unavailable") {
            const builtPage = path.join(docsRoot, item.url.replace(/^\/wiki\/site\//, "wiki/site/"));
            if (!await exists(builtPage)) {
                fail(`api-index: generated page missing for '${item.id}'`);
            } else {
                const builtHtml = await readFile(builtPage, "utf8");
                const notice = item.language === "zh-CN"
                    ? `当前尚未为此符号验证 ${manifest.documented_release} 示例`
                    : `No curated example has been verified for this symbol in ${manifest.documented_release}`;
                if (!builtHtml.includes(notice)) fail(`api-index: generated page does not expose example status for '${item.id}'`);
            }
        }
    }

    if (manifest.indexes.api !== "/api-index.json") fail("docs-manifest.json: indexes.api must point to /api-index.json");
    if (manifest.indexes.learning_paths !== "/learning-paths.json") fail("docs-manifest.json: indexes.learning_paths must point to /learning-paths.json");
    if (manifest.indexes.docs_health !== "/docs-health.json") fail("docs-manifest.json: indexes.docs_health must point to /docs-health.json");
    if (manifest.indexes.api_changes !== "/api-changes.json") fail("docs-manifest.json: indexes.api_changes must point to /api-changes.json");
    if (manifest.indexes.llms_full !== "/llms-full.txt") fail("docs-manifest.json: indexes.llms_full must point to /llms-full.txt");
    if (manifest.indexes.release_notes !== "/release-notes.json") fail("docs-manifest.json: indexes.release_notes must point to /release-notes.json");
    const llms = await readFile(path.join(docsRoot, "llms.txt"), "utf8");
    if (!llms.includes("https://infernux-engine.com/api-index.json")) fail("llms.txt: missing API index link");
    if (!llms.includes("https://infernux-engine.com/api-changes.json")) fail("llms.txt: missing API changes link");
    if (!llms.includes("https://infernux-engine.com/llms-full.txt")) fail("llms.txt: missing full corpus link");
    if (!llms.includes("https://infernux-engine.com/learning-paths.json")) fail("llms.txt: missing learning paths link");
    if (!llms.includes("https://infernux-engine.com/docs-health.json")) fail("llms.txt: missing documentation health link");
    if (!llms.includes("https://infernux-engine.com/release-notes.json")) fail("llms.txt: missing release notes link");

    const fullCorpus = (await readFile(path.join(docsRoot, "llms-full.txt"), "utf8")).replace(/\r\n/g, "\n");
    const corpusBoundary = "--- BEGIN CORPUS ---\n\n";
    const boundaryIndex = fullCorpus.indexOf(corpusBoundary);
    if (boundaryIndex < 0) {
        fail("llms-full.txt: missing corpus boundary");
    } else {
        const corpusBody = fullCorpus.slice(boundaryIndex + corpusBoundary.length);
        const expectedHash = fullCorpus.match(/^Corpus-Content-SHA256:\s*([a-f0-9]{64})$/m)?.[1];
        const actualHash = createHash("sha256").update(corpusBody, "utf8").digest("hex");
        if (!expectedHash || expectedHash !== actualHash) fail("llms-full.txt: content fingerprint mismatch");
    }
    if (!fullCorpus.includes(`Documented-Release: ${manifest.documented_release}`)) fail("llms-full.txt: documented release mismatch");
    if (!fullCorpus.includes(`<!-- RELEASE ${manifest.documented_release} START -->`) || !fullCorpus.includes(`<!-- RELEASE ${manifest.documented_release} END -->`)) fail("llms-full.txt: missing structured release notes section");
    for (const learningPath of learningPaths.paths || []) {
        if (!fullCorpus.includes(`<!-- LEARNING-PATH ${learningPath.id} START -->`) || !fullCorpus.includes(`<!-- LEARNING-PATH ${learningPath.id} END -->`)) fail(`llms-full.txt: missing learning path '${learningPath.id}'`);
    }
    if (Buffer.byteLength(fullCorpus, "utf8") < 100_000) fail("llms-full.txt: corpus is unexpectedly small");
    if (Buffer.byteLength(fullCorpus, "utf8") > 768 * 1024) fail("llms-full.txt: corpus exceeds the 768 KiB retrieval budget");
    if (/[A-Za-z]:\\(?:Users|project)\\/i.test(fullCorpus)) fail("llms-full.txt: leaked a local absolute path");
    if (fullCorpus.includes("[INX-DIAGRAM:")) fail("llms-full.txt: raw presentation marker leaked into the Agent corpus");
    if ((fullCorpus.match(/^Diagram \([a-z][a-z0-9-]*\): /gm) || []).length < 16) fail("llms-full.txt: semantic diagram descriptions are incomplete");
    for (const item of docsIndex.documents) {
        if (!fullCorpus.includes(`<!-- DOC ${item.id} START -->`)) fail(`llms-full.txt: missing document '${item.id}'`);
    }
    for (const item of apiIndex.symbols) {
        if (!fullCorpus.includes(`<!-- API ${item.id} START -->`)) fail(`llms-full.txt: missing API symbol '${item.id}'`);
    }
}

async function verifyPublishingFiles() {
    const wikiRequirements = await readFile(path.join(docsRoot, "wiki", "requirements.txt"), "utf8");
    for (const requirement of ["mkdocs>=1.6,<2", "mkdocs-material>=9.5,<10", "pymdown-extensions>=10.8,<12"]) {
        if (!wikiRequirements.split(/\r?\n/).includes(requirement)) fail(`wiki/requirements.txt: missing compatibility bound '${requirement}'`);
    }
    const releaseManifest = JSON.parse(await readFile(path.join(docsRoot, "release.json"), "utf8"));
    if (socialImageName !== `infernux-social-card-${releaseManifest.version}.jpg`) fail("social card filename must follow the release single source of truth");
    const socialImage = await readFile(path.join(docsRoot, "assets", socialImageName));
    const dimensions = jpegDimensions(socialImage);
    if (!dimensions) fail(`assets/${socialImageName}: expected a valid JPEG social image`);
    else if (dimensions.width !== socialImageWidth || dimensions.height !== socialImageHeight) {
        fail(`assets/${socialImageName}: expected ${socialImageWidth}x${socialImageHeight}, found ${dimensions.width}x${dimensions.height}`);
    }
    if (createHash("sha256").update(socialImage).digest("hex") !== socialImageSha256) fail(`assets/${socialImageName}: content hash differs from the reviewed social card`);
    const sitemap = await readFile(path.join(docsRoot, "sitemap.xml"), "utf8");
    const sitemapDocs = JSON.parse(await readFile(path.join(docsRoot, "docs-index.json"), "utf8"));
    const sitemapApi = JSON.parse(await readFile(path.join(docsRoot, "api-index.json"), "utf8"));
    const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const expectedSitemapLocations = new Set([
        "https://infernux-engine.com/",
        "https://infernux-engine.com/wiki.html",
        "https://infernux-engine.com/roadmap.html",
        "https://infernux-engine.com/community.html",
        "https://infernux-engine.com/download.html",
        "https://infernux-engine.com/wiki/site/index.html",
        "https://infernux-engine.com/wiki/site/en/api/index.html",
        "https://infernux-engine.com/wiki/site/zh/api/index.html",
        ...sitemapDocs.documents.map((document) => document.canonical_url),
        ...sitemapApi.symbols.map((symbol) => symbol.canonical_url)
    ]);
    if (new Set(sitemapLocations).size !== sitemapLocations.length) fail("sitemap.xml: duplicate URL entries");
    if (sitemapLocations.length !== expectedSitemapLocations.size) fail(`sitemap.xml: expected ${expectedSitemapLocations.size} URLs, found ${sitemapLocations.length}`);
    for (const url of expectedSitemapLocations) if (!sitemapLocations.includes(url)) fail(`sitemap.xml: missing '${url}'`);
    for (const url of sitemapLocations) if (!expectedSitemapLocations.has(url)) fail(`sitemap.xml: unexpected '${url}'`);
    if ((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length !== sitemapLocations.length) fail("sitemap.xml: every URL must have a valid lastmod date");
    const localizedSitemapEntries = sitemapDocs.documents.length + sitemapApi.symbols.length + 2;
    if ((sitemap.match(/<xhtml:link\b/g) || []).length !== localizedSitemapEntries * 3) fail("sitemap.xml: localized URLs must declare en, zh-CN, and x-default alternates");
    if (sitemap.includes("offline.html") || sitemap.includes("404.html")) fail("sitemap.xml: recovery/error pages must not be indexed");
    const sitemapBuilder = await readFile(path.join(docsRoot, "tools", "build-sitemap.mjs"), "utf8");
    for (const contract of ["docs-index.json", "api-index.json", "counterpart", "hreflang=\"x-default\"", "Sitemap target does not exist", "sitemap.xml is stale"]) {
        if (!sitemapBuilder.includes(contract)) fail(`build-sitemap.mjs: missing deterministic sitemap contract '${contract}'`);
    }
    const robots = await readFile(path.join(docsRoot, "robots.txt"), "utf8");
    if (!robots.includes("https://infernux-engine.com/sitemap.xml")) fail("robots.txt: missing root sitemap declaration");
    if ((robots.match(/^Sitemap:/gm) || []).length !== 1) fail("robots.txt: expected exactly one authoritative sitemap declaration");
    const community = await readFile(path.join(docsRoot, "community.html"), "utf8");
    for (const token of ["R_kgDOO_wV3A", "DIC_kwDOO_wV3M4C5oaC", "Infernux Community Wall"]) {
        if (!community.includes(token)) fail(`community.html: missing Giscus configuration token '${token}'`);
    }
    for (const url of [
        "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
        "https://github.com/settings/applications",
        "https://github.com/giscus/giscus/blob/main/PRIVACY-POLICY.md"
    ]) {
        if (!community.includes(url)) fail(`community.html: missing privacy or authorization link '${url}'`);
    }
    for (const contract of [
        "id=\"community-filters\"",
        "id=\"community-search\"",
        "id=\"community-category\"",
        "id=\"community-refresh\"",
        "id=\"community-filter-status\"",
        "id=\"community-reset\"",
        "id=\"community-load-more\"",
        "id=\"community-browse-all\"",
        "id=\"giscus-readiness\"",
        "id=\"giscus-load\"",
        "id=\"giscus-thread\"",
        "id=\"giscus-open-discussions\"",
        "id=\"giscus-install\"",
        "https://github.com/apps/giscus/installations/new",
        "choosing “Load replies” is remembered only in the current tab via sessionStorage",
        "giscus.app is contacted only after you choose “Load replies”",
        "learning-path progress in localStorage",
        "data-loading=\"lazy\"",
        "js/community.js?v=5",
        "css/community.css?v=7"
    ]) {
        if (!community.includes(contract)) fail(`community.html: missing forum discovery contract '${contract}'`);
    }
    const discussionCategories = ["general", "q-a", "ideas", "show-and-tell"];
    for (const slug of discussionCategories) {
        const browseUrl = `https://github.com/ChenlizheMe/Infernux/discussions/categories/${slug}`;
        const createUrl = `https://github.com/ChenlizheMe/Infernux/discussions/new?category=${slug}`;
        if (!community.includes(`href="${browseUrl}"`)) fail(`community.html: missing '${slug}' browse route`);
        if (!community.includes(`href="${createUrl}"`)) fail(`community.html: missing '${slug}' structured creation route`);
        const formFile = path.join(repoRoot, ".github", "DISCUSSION_TEMPLATE", `${slug}.yml`);
        if (!await exists(formFile)) {
            fail(`.github/DISCUSSION_TEMPLATE/${slug}.yml: missing category form`);
            continue;
        }
        const form = await readFile(formFile, "utf8");
        if (!/^title:\s*"\[[^"]+\]\s*"\s*$/m.test(form)) fail(`.github/DISCUSSION_TEMPLATE/${slug}.yml: missing prefixed title`);
        if (!/^body:\s*$/m.test(form)) fail(`.github/DISCUSSION_TEMPLATE/${slug}.yml: missing body`);
        const nonMarkdownFields = [...form.matchAll(/^\s+- type:\s*(input|textarea|dropdown|checkboxes)\s*$/gm)];
        if (!nonMarkdownFields.length) fail(`.github/DISCUSSION_TEMPLATE/${slug}.yml: requires a non-Markdown field`);
        const ids = [...form.matchAll(/^\s+id:\s*([a-z0-9_-]+)\s*$/gm)].map((match) => match[1]);
        if (ids.length !== new Set(ids).size || ids.length !== nonMarkdownFields.length) fail(`.github/DISCUSSION_TEMPLATE/${slug}.yml: field IDs are missing or duplicated`);
        if (!/^\s+label:\s*.+\s\/\s.+$/m.test(form)) fail(`.github/DISCUSSION_TEMPLATE/${slug}.yml: fields must expose a bilingual label`);
        if (!/^\s+required:\s*true\s*$/m.test(form)) fail(`.github/DISCUSSION_TEMPLATE/${slug}.yml: no required field protects submission quality`);
    }
    for (const name of ["bug_report.yml", "feature_request.yml", "question.yml", "config.yml"]) {
        const issueTemplate = path.join(repoRoot, ".github", "ISSUE_TEMPLATE", name);
        if (!await exists(issueTemplate)) fail(`.github/ISSUE_TEMPLATE/${name}: missing website issue destination`);
    }
    const issueConfig = await readFile(path.join(repoRoot, ".github", "ISSUE_TEMPLATE", "config.yml"), "utf8");
    if (!issueConfig.includes("blank_issues_enabled: false") || !issueConfig.includes("https://github.com/ChenlizheMe/Infernux/discussions")) {
        fail(".github/ISSUE_TEMPLATE/config.yml: issue chooser must disable blank reports and route open conversation to Discussions");
    }
    const communityJs = await readFile(path.join(docsRoot, "js", "community.js"), "utf8");
    for (const contract of [
        "COMMUNITY_PAGE_SIZE = 20",
        "sort=updated",
        "COMMUNITY_CACHE_VERSION = 2",
        "COMMUNITY_CACHE_TTL_MS = 5 * 60 * 1000",
        "sessionStorage.setItem",
        "normalizeCommunityTopic",
        "filteredCommunityTopics",
        "history.replaceState",
        "communityCategory",
        "communityNextPage",
        "mergeCommunityTopics",
        "loadCommunityTopics({ page: communityNextPage })",
        "loadCommunityTopics({ force: true })",
        "title.textContent = topic.title",
        "answer_chosen_at",
        "replaceChildren()",
        "GISCUS_ORIGIN = \"https://giscus.app\"",
        "GISCUS_OPT_IN_KEY = \"infernux-giscus-opt-in-v1\"",
        "GISCUS_SCRIPT_ID = \"giscus-client\"",
        "readGiscusOptIn",
        "rememberGiscusOptIn",
        "giscusConfiguration",
        "loadGiscusEmbed",
        "document.createElement(\"script\")",
        "for (const [key, value] of Object.entries(config)) script.dataset[key] = value",
        "classifyGiscusError",
        "event.origin !== GISCUS_ORIGIN",
        "event.source !== frame.contentWindow",
        "payload.resizeHeight",
        "renderGiscusReadiness",
        "AbortController"
    ]) {
        if (!communityJs.includes(contract)) fail(`community.js: missing resilient forum contract '${contract}'`);
    }
    if (/innerHTML\s*=/.test(communityJs)) fail("community.js: forum UI must be constructed without innerHTML");
    if (communityJs.includes("giscus.app/api/discussions/categories")) fail("community.js: browser must use verified frame messages instead of the non-CORS Giscus category API");
    if (/<script\b[^>]*src=["']https:\/\/giscus\.app\/client\.js/i.test(community)) fail("community.html: Giscus must not contact a third party before the visitor explicitly loads replies");
    const communityCss = await readFile(path.join(docsRoot, "css", "community.css"), "utf8");
    if (!/\.forum-field input,[\s\S]*?min-height:\s*48px;/.test(communityCss)) fail("community.css: forum inputs must preserve a 48px touch target");
    if (!/@media\s*\(max-width:\s*520px\)[\s\S]*?\.forum-controls\s*\{[\s\S]*?grid-template-columns:\s*1fr;/.test(communityCss)) fail("community.css: forum controls must collapse at phone width");
    for (const contract of [".forum-pagination", ".forum-load-more", ".forum-browse-all", ".topic-signals", "min-height: 44px"]) {
        if (!communityCss.includes(contract)) fail(`community.css: missing paginated forum contract '${contract}'`);
    }
    for (const contract of [".channel-actions", ".channel-create", "grid-template-columns: repeat(2, minmax(0, 1fr))"]) {
        if (!communityCss.includes(contract)) fail(`community.css: missing structured channel contract '${contract}'`);
    }
    for (const contract of [".giscus-readiness", "data-state=\"standby\"", "data-state=\"ready\"", "data-state=\"uninstalled\"", ".giscus-readiness-actions", ".giscus-load-action", ".giscus-install-action"]) {
        if (!communityCss.includes(contract)) fail(`community.css: missing embedded-reply readiness contract '${contract}'`);
    }
    const sharedCss = await readFile(path.join(docsRoot, "css", "style.css"), "utf8");
    if (!/@media\s*\(max-width:\s*1180px\)[\s\S]*?\.nav-links\s*\{\s*display:\s*none;\s*\}/.test(sharedCss)) {
        fail("style.css: navigation must collapse by 1180px");
    }
    if (!/\.nav-links\.mobile-open a\s*\{[\s\S]*?min-height:\s*44px;/.test(sharedCss)) {
        fail("style.css: mobile navigation links must preserve a 44px touch target");
    }
    for (const contract of [".nav-links a.nav-priority", ".nav-links.mobile-open a.nav-priority", "border-left: 2px solid var(--accent)", "background: var(--accent-soft)"]) {
        if (!sharedCss.includes(contract)) fail(`style.css: missing task-navigation priority contract '${contract}'`);
    }
    for (const contract of [".hero-platform-note", ".hero-text-links", "min-height: 44px", "color: var(--info)", "#runtime-capture"]) {
        if (!sharedCss.includes(contract)) fail(`style.css: missing evidence-first hero contract '${contract}'`);
    }
    for (const contract of ["body.mobile-menu-open", "overflow: hidden", "overscroll-behavior: contain", "scrollbar-gutter: stable"]) {
        if (!sharedCss.includes(contract)) fail(`style.css: missing mobile-navigation containment contract '${contract}'`);
    }
    const sharedJs = await readFile(path.join(docsRoot, "js", "main.js"), "utf8");
    if (!sharedJs.includes("window.innerWidth > 1180")) fail("main.js: mobile menu resize boundary must match CSS");
    for (const contract of ["serviceWorker\" in navigator", "navigator.serviceWorker.register(\"/sw.js\"", "updateViaCache: \"none\"", "window.isSecureContext"]) {
        if (!sharedJs.includes(contract)) fail(`main.js: missing PWA registration contract '${contract}'`);
    }
    for (const contract of ["window.innerWidth <= 1180", "moveFocus", "returnFocus", "mobileMenuFocusables", "document.activeElement", "event.key !== 'Tab'", "handleMobileMenuPointerDown", "requestAnimationFrame", "mobile-menu-open"]) {
        if (!sharedJs.includes(contract)) fail(`main.js: missing mobile-navigation focus contract '${contract}'`);
    }
    const mobileNavigationTest = await readFile(path.join(docsRoot, "tools", "test-mobile-navigation.mjs"), "utf8");
    for (const contract of ["focus entry", "Tab from the final link", "Shift+Tab from the menu button", "Escape should return focus", "outside the header", "desktop layout must not open"]) {
        if (!mobileNavigationTest.includes(contract)) fail(`test-mobile-navigation.mjs: missing interaction assertion '${contract}'`);
    }
    const sharedI18n = await readFile(path.join(docsRoot, "js", "i18n.js"), "utf8");
    for (const contract of ["\"nav.start\"", "\"nav.learn\"", "\"nav.manual\"", "\"nav.api\""]) {
        if ((sharedI18n.match(new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length !== 2) {
            fail(`i18n.js: task-navigation key '${contract.slice(1, -1)}' must exist in both languages`);
        }
    }
    for (const contract of ["[data-i18n-aria-label]", "element.setAttribute('aria-label', value)"]) {
        if (!sharedI18n.includes(contract)) fail(`i18n.js: missing localized accessible-name contract '${contract}'`);
    }

    const wikiJs = await readFile(path.join(docsRoot, "js", "wiki.js"), "utf8");
    for (const contract of ["function searchScore", "URLSearchParams", "history.replaceState", "event.key === \"/\"", "event.key === \"Escape\"", "currentSelectedLayer", "currentSelectedStatus", "wiki-card-metadata", "wiki-doc-status-", "apiIndex.symbols", "[...allDocs, ...apiDocs]"]) {
        if (!wikiJs.includes(contract)) fail(`wiki.js: missing searchable Wiki interaction contract '${contract}'`);
    }
    if (/wiki-docs\.json\?v=/i.test(wikiJs)) fail("wiki.js: Wiki catalog still uses a manually versioned query parameter");

    const wikiHtml = await readFile(path.join(docsRoot, "wiki.html"), "utf8");
    const catalogReference = wikiHtml.match(/<meta\s+name=["']infernux-wiki-catalog["']\s+content=["']([^"']+)["']/i)?.[1];
    const catalogMatch = catalogReference?.match(/^assets\/wiki-docs\.([a-f0-9]{16})\.json$/);
    if (!catalogMatch) {
        fail("wiki.html: Wiki catalog reference must contain a 16-character content hash");
    } else {
        const sourceCatalog = await readFile(path.join(docsRoot, "assets", "wiki-docs.json"));
        const hashedCatalogPath = path.join(docsRoot, catalogReference);
        if (!await exists(hashedCatalogPath)) {
            fail(`wiki.html: hashed Wiki catalog does not exist '${catalogReference}'`);
        } else {
            const hashedCatalog = await readFile(hashedCatalogPath);
            const actualHash = createHash("sha256").update(sourceCatalog).digest("hex").slice(0, 16);
            if (catalogMatch[1] !== actualHash) fail("wiki.html: Wiki catalog hash does not match source content");
            if (!hashedCatalog.equals(sourceCatalog)) fail("wiki.html: hashed Wiki catalog content differs from canonical catalog");
        }
        const hashedCatalogs = (await readdir(path.join(docsRoot, "assets"))).filter((name) => /^wiki-docs\.[a-f0-9]{16}\.json$/.test(name));
        if (hashedCatalogs.length !== 1) fail(`assets: expected exactly one hashed Wiki catalog, found ${hashedCatalogs.length}`);
    }

    const fontHashes = {
        "inter-latin.woff2": "3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62",
        "jetbrains-mono-latin.woff2": "83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be",
        "space-grotesk-latin.woff2": "0640890476fc1198ab4de571fb658de443c4d85b66466ec09534a8737ab1ce9d",
        "fa-solid-subset-900.woff2": "1ab0dea7613a56456bd30de51fee7d0fccb6def013fe1f46862e2eb204fba343",
        "fa-brands-subset-400.woff2": "7d7c0b8449df96bbfdc8b4e6c6740ce2337af2c90363a5213713977df3e7ae76"
    };
    for (const [name, expectedHash] of Object.entries(fontHashes)) {
        const target = path.join(docsRoot, "assets", "fonts", name);
        if (!await exists(target)) fail(`self-hosted font missing '${name}'`);
        else if (await sha256(target) !== expectedHash) fail(`self-hosted font checksum mismatch '${name}'`);
    }
    for (const name of ["Inter-OFL.txt", "JetBrains-Mono-OFL.txt", "Space-Grotesk-OFL.txt", "Font-Awesome-LICENSE.txt"]) {
        if (!await exists(path.join(docsRoot, "assets", "vendor-licenses", name))) fail(`vendor license missing '${name}'`);
    }

    const iconCss = await readFile(path.join(docsRoot, "css", "fontawesome-subset.css"), "utf8");
    for (const name of ["fa-solid-subset-900.woff2", "fa-brands-subset-400.woff2"]) {
        const bytes = (await stat(path.join(docsRoot, "assets", "fonts", name))).size;
        if (bytes < 500 || bytes > 16 * 1024) fail(`self-hosted icon font is not a plausible subset '${name}' (${bytes} bytes)`);
        if (!iconCss.includes(`../assets/fonts/${name}`)) fail(`fontawesome-subset.css: missing subset font reference '${name}'`);
    }
    for (const range of [
        "U+F002, U+F00C, U+F00D, U+F019, U+F059, U+F078, U+F086, U+F08E, U+F09C, U+F0C1, U+F0C5, U+F0C9, U+F0E7, U+F0EB, U+F135, U+F15C, U+F185, U+F186, U+F188, U+F1B3, U+F1DE, U+F21A, U+F27A, U+F2DB, U+F2F1, U+F3ED, U+F542, U+F552, U+F5CB, U+F5FD, U+F7C0",
        "U+F09B, U+F3E2"
    ]) {
        if (!iconCss.includes(`unicode-range: ${range};`)) fail(`fontawesome-subset.css: missing verified glyph range '${range}'`);
    }
    const iconSources = [
        ...["index.html", "wiki.html", "roadmap.html", "community.html", "download.html"].map((name) => path.join(docsRoot, name)),
        path.join(docsRoot, "wiki", "theme", "main.html"),
        path.join(docsRoot, "js", "main.js"),
        path.join(docsRoot, "js", "wiki.js")
    ];
    const usedIcons = new Set();
    for (const sourceFile of iconSources) {
        const source = await readFile(sourceFile, "utf8");
        for (const match of source.matchAll(/\bfa-([a-z0-9-]+)/g)) usedIcons.add(match[1]);
    }
    for (const icon of usedIcons) {
        if (!iconCss.includes(`.fa-${icon}::before`)) fail(`fontawesome-subset.css: missing used icon 'fa-${icon}'`);
    }

    const wikiTemplate = await readFile(path.join(docsRoot, "wiki", "theme", "main.html"), "utf8");
    if (/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)/i.test(wikiTemplate)) {
        fail("wiki/theme/main.html: runtime font/icon CDN dependency must be self-hosted");
    }
    for (const builtFile of await walk(path.join(docsRoot, "wiki", "site"))) {
        if (!/\.(?:html|css)$/i.test(builtFile)) continue;
        const builtSource = await readFile(builtFile, "utf8");
        if (/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)/i.test(builtSource)) {
            fail(`${posix(path.relative(repoRoot, builtFile))}: generated Wiki restored a runtime font/icon CDN dependency`);
        }
    }
    const webManifest = JSON.parse(await readFile(path.join(docsRoot, "site.webmanifest"), "utf8"));
    if (webManifest.id !== "/" || webManifest.start_url !== "/" || webManifest.scope !== "/") fail("site.webmanifest: id, start_url, and scope must remain root-scoped");
    if (!Array.isArray(webManifest.display_override) || !webManifest.display_override.includes("standalone")) fail("site.webmanifest: missing standalone display fallback");
    for (const icon of webManifest.icons || []) {
        if (!await exists(path.join(docsRoot, icon.src.replace(/^\//, "")))) fail(`site.webmanifest: missing icon '${icon.src}'`);
        if (icon.src === "/assets/logo.png" && icon.sizes !== "256x256") fail("site.webmanifest: logo dimensions must match the 256x256 source asset");
    }

    const offline = await readFile(path.join(docsRoot, "offline.html"), "utf8");
    for (const contract of ["noindex, nofollow", "Connection interrupted.", "恢复网络后", "width=\"256\" height=\"256\"", "href=\"/wiki.html\""]) {
        if (!offline.includes(contract)) fail(`offline.html: missing offline recovery contract '${contract}'`);
    }

    const serviceWorker = await readFile(path.join(docsRoot, "sw.js"), "utf8");
    const cacheVersion = serviceWorker.match(/const CACHE_VERSION = "([a-f0-9]{16})";/)?.[1];
    const precacheSource = serviceWorker.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/)?.[1];
    let precacheRoutes = [];
    try {
        precacheRoutes = JSON.parse(precacheSource || "[]");
    } catch (error) {
        fail(`sw.js: invalid precache list (${error.message})`);
    }
    for (const required of ["/offline.html", "/index.html", "/wiki.html", "/docs-index.json", "/docs-health.json", "/learning-paths.json", "/api-index.json", "/docs-manifest.json", "/assets/logo.png"]) {
        if (!precacheRoutes.includes(required)) fail(`sw.js: precache is missing '${required}'`);
    }
    if (!precacheRoutes.some((route) => /^\/css\/wiki-template\.[a-f0-9]{16}\.css$/.test(route))) fail("sw.js: precache is missing the content-hashed Wiki style");
    if (new Set(precacheRoutes).size !== precacheRoutes.length) fail("sw.js: precache contains duplicate routes");
    const serviceWorkerEvidence = [];
    let precacheBytes = 0;
    for (const route of precacheRoutes) {
        if (!/^\/[A-Za-z0-9._/-]+$/.test(route)) {
            fail(`sw.js: invalid same-origin precache route '${route}'`);
            continue;
        }
        const target = path.join(docsRoot, route.slice(1));
        if (!await exists(target)) {
            fail(`sw.js: precache target does not exist '${route}'`);
            continue;
        }
        const content = await readFile(target);
        precacheBytes += content.length;
        serviceWorkerEvidence.push(`${route}\0${createHash("sha256").update(content).digest("hex")}`);
    }
    const expectedCacheVersion = createHash("sha256").update(serviceWorkerEvidence.join("\n")).digest("hex").slice(0, 16);
    if (cacheVersion !== expectedCacheVersion) fail(`sw.js: cache version '${cacheVersion}' is stale; expected '${expectedCacheVersion}'`);
    if (precacheBytes > 2 * 1024 * 1024) fail(`sw.js: precache exceeds 2 MiB (${precacheBytes} bytes)`);
    for (const contract of ["networkFirst(request, true)", "cacheFirst(request)", "staleWhileRevalidate(request)", "url.origin !== self.location.origin", "url.pathname === \"/sw.js\"", "caches.delete(key)", "ignoreSearch: true"]) {
        if (!serviceWorker.includes(contract)) fail(`sw.js: missing offline safety contract '${contract}'`);
    }
    const serviceWorkerBuilder = await readFile(path.join(docsRoot, "tools", "build-service-worker.mjs"), "utf8");
    for (const contract of ["maxPrecacheBytes = 2 * 1024 * 1024", "createHash(\"sha256\")", "sw.js is stale", "networkFirst", "cacheFirst", "staleWhileRevalidate"]) {
        if (!serviceWorkerBuilder.includes(contract)) fail(`build-service-worker.mjs: missing deterministic PWA contract '${contract}'`);
    }

    const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
    const release = JSON.parse(await readFile(path.join(docsRoot, "release.json"), "utf8"));
    const apiDiffTool = await readFile(path.join(docsRoot, "tools", "build-api-diff.mjs"), "utf8");
    for (const contract of ["Refusing to overwrite immutable API snapshot", "Do not overwrite the published snapshot", "changedPreview", "addedPreview", "removedPreview"]) {
        if (!apiDiffTool.includes(contract)) fail(`build-api-diff.mjs: missing immutable snapshot safety contract '${contract}'`);
    }
    if (release.version !== manifest.documented_release) fail("release.json: version must match docs-manifest documented_release");
    if (manifest.indexes.release !== "/release.json") fail("docs-manifest.json: indexes.release must point to /release.json");
    if (!Array.isArray(release.assets) || release.assets.length < 2) fail("release.json: expected installer and wheel assets");
    for (const asset of release.assets || []) {
        if (!Number.isInteger(asset.size_bytes) || asset.size_bytes <= 0) fail(`release.json: invalid size for '${asset.name}'`);
        if (!/^[a-f0-9]{64}$/.test(asset.sha256 || "")) fail(`release.json: invalid SHA-256 for '${asset.name}'`);
        if (!/^https:\/\/github\.com\/ChenlizheMe\/Infernux\/releases\/download\//.test(asset.url || "")) fail(`release.json: non-canonical asset URL for '${asset.name}'`);
    }
    const download = await readFile(path.join(docsRoot, "download.html"), "utf8");
    for (const contract of ["id=\"release-notes-status\"", "id=\"release-notes-summary\"", "id=\"release-notes-grid\"", "downloadPage.releaseNotes.title"]) {
        if (!download.includes(contract)) fail(`download.html: missing structured release-note contract '${contract}'`);
    }
    const downloadJs = await readFile(path.join(docsRoot, "js", "download.js"), "utf8");
    for (const contract of ["release-notes.json", "function renderReleaseNotes", "document.createElement(\"article\")", "textContent = item.title"]) {
        if (!downloadJs.includes(contract)) fail(`download.js: missing safe release-note rendering contract '${contract}'`);
    }
}

await verifyCuratedDocs();
await verifyMarkdownLinks();
await verifyRootHtml();
await verifyBuiltWikiExperience();
await verifyIndexes();
await verifyPublishingFiles();

if (errors.length) {
    console.error(`Website verification failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}

console.log("Website verification passed: content schema, language parity, links, accessibility, indexes, and publishing files.");

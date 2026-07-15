import { createHash } from "node:crypto";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const docsRoot = path.resolve("docs");
const assetsRoot = path.join(docsRoot, "assets");
const sourceFile = path.join(assetsRoot, "wiki-docs.json");
const wikiHtmlFile = path.join(docsRoot, "wiki.html");
const checkOnly = process.argv.includes("--check");
const hashedPattern = /^wiki-docs\.([a-f0-9]{16})\.json$/;
const directoryStart = "<!-- BEGIN GENERATED WIKI DIRECTORY -->";
const directoryEnd = "<!-- END GENERATED WIKI DIRECTORY -->";

const source = await readFile(sourceFile);
const catalog = JSON.parse(source.toString("utf8"));
const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
const targetName = `wiki-docs.${hash}.json`;
const targetFile = path.join(assetsRoot, targetName);
const expectedReference = `assets/${targetName}`;
const existingHashed = (await readdir(assetsRoot)).filter((name) => hashedPattern.test(name));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function staticStatusLabel(status, language) {
  const labels = language === "zh"
    ? { stable: "稳定", preview: "预览", experimental: "实验性", deprecated: "已弃用" }
    : { stable: "Stable", preview: "Preview", experimental: "Experimental", deprecated: "Deprecated" };
  return labels[status] || status || (language === "zh" ? "未记录" : "Not recorded");
}

function staticGroupLabel(groupKey, fallback, language) {
  const labels = language === "zh"
    ? { learn: "学习", manual: "手册", architecture: "架构" }
    : { learn: "Learn", manual: "Manual", architecture: "Architecture" };
  return labels[groupKey] || fallback || groupKey;
}

function renderStaticCard(document, language) {
  if (!new RegExp(`^wiki/site/${language}/(?:learn|manual|architecture)/[A-Za-z0-9._-]+\\.html$`).test(document.url || "")) {
    throw new Error(`Wiki catalog contains an unsafe or unexpected static URL: ${document.url}`);
  }
  const meta = document.meta || {};
  const status = String(meta.status || "").toLowerCase();
  const statusClass = /^[a-z-]+$/.test(status) ? ` wiki-doc-status-${status}` : "";
  const sinceLabel = language === "zh" ? "始于" : "Since";
  const verifiedLabel = language === "zh" ? "验证于" : "Verified";
  return [
    `                <a class="hub-card docs-library-card docs-static-card" href="${escapeHtml(document.url)}">`,
    '                    <span class="card-mark" aria-hidden="true"><i class="fas fa-file-lines"></i></span>',
    `                    <h4>${escapeHtml(document.title)}</h4>`,
    `                    <p>${escapeHtml(document.summary || document.title)}</p>`,
    '                    <span class="wiki-card-metadata">',
    `                        <span class="wiki-doc-status${statusClass}">${escapeHtml(staticStatusLabel(status, language))}</span>`,
    `                        <span>${escapeHtml(sinceLabel)} ${escapeHtml(meta.since || "—")}</span>`,
    `                        <span>${escapeHtml(verifiedLabel)} ${escapeHtml(meta.last_verified || "—")}</span>`,
    "                    </span>",
    `                    <small class="docs-library-path">${escapeHtml(document.source || "")}</small>`,
    "                </a>"
  ].join("\n");
}

function renderStaticLanguage(language) {
  const documents = Array.isArray(catalog[language]) ? catalog[language] : [];
  if (!documents.length) throw new Error(`Wiki catalog has no '${language}' documents for the static directory`);
  const groups = new Map();
  for (const document of documents) {
    const key = document.groupKey || "documentation";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(document);
  }
  const groupOrder = ["learn", "manual", "architecture"];
  const orderedGroups = [...groups.entries()].sort((left, right) => {
    const leftOrder = groupOrder.indexOf(left[0]);
    const rightOrder = groupOrder.indexOf(right[0]);
    return (leftOrder < 0 ? 99 : leftOrder) - (rightOrder < 0 ? 99 : rightOrder) || left[0].localeCompare(right[0], "en");
  });
  const languageCode = language === "zh" ? "zh-CN" : "en";
  const languageTitle = language === "zh" ? "中文文档" : "English documentation";
  const countLabel = language === "zh" ? `${documents.length} 篇文档` : `${documents.length} documents`;
  const sections = orderedGroups.map(([groupKey, items]) => {
    const headingId = `static-${language}-${groupKey}-title`;
    const title = staticGroupLabel(groupKey, items[0]?.groupTitle, language);
    const groupCount = language === "zh" ? `${items.length} 篇` : `${items.length} documents`;
    return [
      `        <section class="docs-library-group" aria-labelledby="${escapeHtml(headingId)}">`,
      '            <div class="docs-library-group-head">',
      `                <h3 id="${escapeHtml(headingId)}">${escapeHtml(title)}</h3>`,
      `                <span class="docs-library-group-meta">${escapeHtml(groupCount)}</span>`,
      "            </div>",
      '            <div class="docs-library-grid">',
      items.map((item) => renderStaticCard(item, language)).join("\n"),
      "            </div>",
      "        </section>"
    ].join("\n");
  }).join("\n");
  return [
    `    <section class="docs-static-language" data-directory-lang="${language}" lang="${languageCode}" aria-label="${escapeHtml(languageTitle)}">`,
    '        <div class="docs-static-language-head">',
    `            <h3>${escapeHtml(languageTitle)}</h3>`,
    `            <span>${escapeHtml(countLabel)}</span>`,
    "        </div>",
    sections,
    "    </section>"
  ].join("\n");
}

function renderStaticDirectory() {
  const count = ["en", "zh"].reduce((total, language) => total + (Array.isArray(catalog[language]) ? catalog[language].length : 0), 0);
  return [
    `<div class="docs-static-directory" data-static-doc-directory data-document-count="${count}">`,
    '    <div class="docs-static-note">',
    '        <div><strong>Static documentation directory · 静态文档目录</strong><span>Search loads progressively; these canonical links remain available without JavaScript or when an index request fails. · 搜索为渐进增强；关闭脚本或索引请求失败时仍可使用以下权威链接。</span></div>',
    '        <div class="docs-static-machine-links"><a href="docs-index.json">docs-index.json</a><a href="api-index.json">api-index.json</a><a href="llms.txt">llms.txt</a></div>',
    "    </div>",
    renderStaticLanguage("en"),
    renderStaticLanguage("zh"),
    "</div>",
    '<noscript><style>.docs-static-language { display: grid !important; }</style></noscript>'
  ].join("\n");
}

const html = await readFile(wikiHtmlFile, "utf8");
const metaPattern = /(<meta\s+name=["']infernux-wiki-catalog["']\s+content=["'])([^"']+)(["']\s*\/?>)/i;
if (!metaPattern.test(html)) {
  throw new Error("wiki.html is missing the infernux-wiki-catalog meta element");
}
const directoryPattern = new RegExp(`(${directoryStart})[\\s\\S]*?(${directoryEnd})`);
if (!directoryPattern.test(html)) {
  throw new Error("wiki.html is missing generated static directory markers");
}
const expectedHtml = html
  .replace(metaPattern, `$1${expectedReference}$3`)
  .replace(directoryPattern, `$1\n${renderStaticDirectory()}\n$2`);

if (checkOnly) {
  const target = await readFile(targetFile).catch(() => null);
  const stale = existingHashed.filter((name) => name !== targetName);
  const problems = [];
  if (!target || !target.equals(source)) problems.push(`${targetName} is missing or differs from wiki-docs.json`);
  if (stale.length) problems.push(`stale hashed catalogs remain: ${stale.join(", ")}`);
  if (expectedHtml !== html) problems.push(`wiki.html catalog reference or static directory is stale`);
  if (problems.length) throw new Error(`Hashed Wiki catalog is stale:\n- ${problems.join("\n- ")}`);
  console.log(`Verified hashed Wiki catalog ${targetName}.`);
} else {
  await writeFile(targetFile, source);
  for (const name of existingHashed) {
    if (name !== targetName) await unlink(path.join(assetsRoot, name));
  }
  if (expectedHtml !== html) await writeFile(wikiHtmlFile, expectedHtml, "utf8");
  console.log(`Generated hashed Wiki catalog ${targetName}.`);
}

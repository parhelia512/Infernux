import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "docs");
const outputFile = path.join(docsRoot, "release-notes.json");
const checkOnly = process.argv.includes("--check");

function cleanInline(value) {
  return String(value || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const markdown = (await readFile(path.join(repoRoot, "UpdateLog.md"), "utf8")).replace(/\r\n/g, "\n").trim();
const release = JSON.parse(await readFile(path.join(docsRoot, "release.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(docsRoot, "docs-manifest.json"), "utf8"));
const heading = markdown.match(/^#\s+Infernux\s+v([^\s·]+)(?:\s+·\s+(.+))?$/m);
if (!heading) throw new Error("UpdateLog.md must start with '# Infernux v<version> · <codename>'");
const version = heading[1];
if (version !== release.version || version !== manifest.documented_release) {
  throw new Error(`UpdateLog version ${version} must match release.json and docs-manifest.json`);
}

const bodyAfterTitle = markdown.slice(heading.index + heading[0].length).trim();
const firstSection = bodyAfterTitle.search(/^###\s+/m);
const preamble = firstSection >= 0 ? bodyAfterTitle.slice(0, firstSection) : bodyAfterTitle;
const summary = cleanInline(preamble.split(/\n\s*\n/).find((block) => block.trim() && !/Baseline for comparison|^---$/m.test(block)) || "");
const comparison = markdown.match(/\*\*Baseline for comparison:\*\*\s+\[`v?([^`]+?)\.\.\.v?([^`]+)`\]\(([^)]+)\)/);
if (!comparison) throw new Error("UpdateLog.md must include a linked baseline comparison");

const sections = [];
for (const match of markdown.matchAll(/^###\s+(.+)\n([\s\S]*?)(?=^###\s+|(?![\s\S]))/gm)) {
  const title = cleanInline(match[1]);
  const items = [];
  for (const line of match[2].split("\n")) {
    const bullet = line.match(/^\s*[*-]\s+(.+)$/);
    if (!bullet) continue;
    const emphasized = bullet[1].match(/^\*\*([^*]+)\*\*\s*(.*)$/);
    items.push({
      title: cleanInline(emphasized?.[1] || bullet[1]),
      detail: cleanInline(emphasized?.[2] || ""),
      text: cleanInline(bullet[1])
    });
  }
  if (!items.length) throw new Error(`Release note section '${title}' must contain at least one bullet`);
  sections.push({
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    title,
    kind: /^upgrade notes$/i.test(title) ? "upgrade" : "changes",
    items
  });
}
if (!sections.length) throw new Error("UpdateLog.md contains no release note sections");

const output = `${JSON.stringify({
  schema_version: 1,
  version,
  tag: `v${version}`,
  title: cleanInline(heading[0].replace(/^#\s+/, "")),
  codename: cleanInline(heading[2] || ""),
  language: "en",
  published_at: release.published_at,
  release_url: release.release_url,
  source: "UpdateLog.md",
  summary,
  comparison: {
    from: comparison[1],
    to: comparison[2],
    url: comparison[3]
  },
  section_count: sections.length,
  item_count: sections.reduce((count, section) => count + section.items.length, 0),
  sections
}, null, 2)}\n`;

const current = await readFile(outputFile, "utf8").catch(() => "");
if (checkOnly) {
  if (current.replace(/\r\n/g, "\n") !== output) throw new Error("release-notes.json is stale. Run: node docs/tools/build-release-notes.mjs");
  console.log(`Verified release notes for v${version}: ${sections.length} sections, ${sections.reduce((count, section) => count + section.items.length, 0)} items.`);
} else {
  await writeFile(outputFile, output, "utf8");
  console.log(`Generated release notes for v${version}: ${sections.length} sections, ${sections.reduce((count, section) => count + section.items.length, 0)} items.`);
}

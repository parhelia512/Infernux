import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const docsRoot = path.resolve("docs");
const errors = [];

const limits = {
  rootHtml: 64 * 1024,
  stylesheet: 64 * 1024,
  script: 96 * 1024,
  image: 1024 * 1024,
  webfont: 192 * 1024,
  machineIndex: 512 * 1024,
  fullCorpus: 768 * 1024,
  rootExperience: 1250 * 1024,
  generatedWikiHtml: 96 * 1024,
  generatedWikiTotal: 8 * 1024 * 1024,
};

async function files(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name));
}

async function recursiveFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await recursiveFiles(target));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}

async function size(file) {
  return (await stat(file)).size;
}

function human(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function enforce(file, limit, label) {
  const bytes = await size(file);
  if (bytes > limit) errors.push(`${path.relative(process.cwd(), file)} is ${human(bytes)}; ${label} budget is ${human(limit)}`);
  return bytes;
}

let rootExperience = 0;
for (const file of (await files(docsRoot)).filter((file) => file.endsWith(".html"))) {
  rootExperience += await enforce(file, limits.rootHtml, "root HTML");
}
for (const file of await files(path.join(docsRoot, "css"))) {
  rootExperience += await enforce(file, limits.stylesheet, "stylesheet");
}
for (const file of await files(path.join(docsRoot, "js"))) {
  rootExperience += await enforce(file, limits.script, "script");
}
rootExperience += await enforce(path.join(docsRoot, "sw.js"), limits.script, "service worker");
for (const file of (await files(path.join(docsRoot, "assets"))).filter((file) => /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file))) {
  rootExperience += await enforce(file, limits.image, "image");
}
for (const file of (await files(path.join(docsRoot, "assets", "fonts"))).filter((file) => /\.(?:woff2?|ttf|otf)$/i.test(file))) {
  rootExperience += await enforce(file, limits.webfont, "webfont");
}
for (const name of ["docs-index.json", "docs-health.json", "learning-paths.json", "api-index.json", "api-changes.json", "release-notes.json"]) {
  await enforce(path.join(docsRoot, name), limits.machineIndex, "machine index");
}
await enforce(path.join(docsRoot, "sitemap.xml"), limits.machineIndex, "unified sitemap");
for (const name of (await readdir(path.join(docsRoot, "assets"))).filter((name) => /^wiki-docs\.[a-f0-9]{16}\.json$/.test(name))) {
  await enforce(path.join(docsRoot, "assets", name), limits.machineIndex, "hashed Wiki catalog");
}
await enforce(path.join(docsRoot, "llms-full.txt"), limits.fullCorpus, "full Agent corpus");

const generatedWikiFiles = await recursiveFiles(path.join(docsRoot, "wiki", "site"));
let generatedWikiTotal = 0;
for (const file of generatedWikiFiles) {
  generatedWikiTotal += file.endsWith(".html")
    ? await enforce(file, limits.generatedWikiHtml, "generated Wiki HTML")
    : await size(file);
}
if (generatedWikiTotal > limits.generatedWikiTotal) {
  errors.push(`generated Wiki total ${human(generatedWikiTotal)}; generated site budget is ${human(limits.generatedWikiTotal)}`);
}

if (rootExperience > limits.rootExperience) {
  errors.push(`root HTML/CSS/JS/images total ${human(rootExperience)}; experience budget is ${human(limits.rootExperience)}`);
}

if (errors.length) {
  console.error(`Static performance budget failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Static performance budget passed: root experience ${human(rootExperience)} / ${human(limits.rootExperience)}; generated Wiki ${human(generatedWikiTotal)} / ${human(limits.generatedWikiTotal)}.`);

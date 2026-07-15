import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const docsRoot = path.resolve("docs");
const errors = [];

const limits = {
  rootHtml: 64 * 1024,
  stylesheet: 64 * 1024,
  script: 96 * 1024,
  image: 1024 * 1024,
  machineIndex: 512 * 1024,
  rootExperience: 1250 * 1024,
};

async function files(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name));
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
for (const file of (await files(path.join(docsRoot, "assets"))).filter((file) => /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file))) {
  rootExperience += await enforce(file, limits.image, "image");
}
for (const name of ["docs-index.json", "api-index.json", "api-changes.json"]) {
  await enforce(path.join(docsRoot, name), limits.machineIndex, "machine index");
}

if (rootExperience > limits.rootExperience) {
  errors.push(`root HTML/CSS/JS/images total ${human(rootExperience)}; experience budget is ${human(limits.rootExperience)}`);
}

if (errors.length) {
  console.error(`Static performance budget failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Static performance budget passed: root experience ${human(rootExperience)} / ${human(limits.rootExperience)}.`);

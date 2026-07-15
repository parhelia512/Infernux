import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve("docs/wiki/site");
const check = process.argv.includes("--check");
const changes = [];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

for (const file of await walk(root)) {
  const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
  if (file.endsWith(".map")) {
    changes.push(relative);
    if (!check) await rm(file);
    continue;
  }

  if (file.endsWith(".js") || file.endsWith(".css")) {
    const source = await readFile(file, "utf8");
    const optimized = source
      .replace(/\n?\/\/# sourceMappingURL=[^\r\n*]+(?:\r?\n)?/g, "\n")
      .replace(/\n?\/\*# sourceMappingURL=[^*]+\*\/(?:\r?\n)?/g, "\n");
    if (optimized !== source) {
      changes.push(`${relative} (sourceMappingURL)`);
      if (!check) await writeFile(file, optimized, "utf8");
    }
  }
}

if (check && changes.length) {
  console.error("Static Wiki output still contains production sourcemap artifacts:");
  for (const item of changes) console.error(`- ${item}`);
  process.exit(1);
}

console.log(check
  ? "Static Wiki output has no production sourcemaps."
  : `Optimized static Wiki output (${changes.length} sourcemap artifact(s) removed).`);


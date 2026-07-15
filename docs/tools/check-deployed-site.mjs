import process from "node:process";

const baseArg = process.argv.indexOf("--base-url");
const base = new URL(baseArg >= 0 ? process.argv[baseArg + 1] : "https://infernux-engine.com/");
const failures = [];

const checks = [
  { route: "/", type: "text/html", token: "<h1" },
  { route: "/wiki.html", type: "text/html", token: "DOCUMENTATION DECK" },
  { route: "/community.html", type: "text/html", token: "Infernux Community Wall" },
  { route: "/wiki/site/index.html", type: "text/html", token: "Infernux Documentation" },
  { route: "/wiki/site/en/learn/getting-started.html", type: "text/html", token: "Getting Started" },
  { route: "/wiki/site/zh/manual/physics.html", type: "text/html", token: "Physics" },
  { route: "/docs-index.json", type: "application/json", jsonKey: "documents" },
  { route: "/api-index.json", type: "application/json", jsonKey: "symbols" },
  { route: "/api-changes.json", type: "application/json", token: "current_release" },
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
    if (!contentType.includes(check.type)) throw new Error(`unexpected content-type '${contentType}'`);
    const body = await response.text();
    if (check.token && !body.includes(check.token)) throw new Error(`missing content token '${check.token}'`);
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

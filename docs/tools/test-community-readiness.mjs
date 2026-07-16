import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    parseCommunityReadinessConfig,
    validateCommunityRepository,
    validateGiscusInstallation
} from "./community-readiness-core.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.resolve(scriptDir, "..", "community.html"), "utf8");
const config = parseCommunityReadinessConfig(html);

assert.deepEqual(config.administrators, ["ChenlizheMe"]);
assert.equal(config.repo, "ChenlizheMe/Infernux");
assert.equal(config.mapping, "specific");

validateCommunityRepository({
    node_id: config.repoId,
    visibility: "public",
    archived: false,
    has_discussions: true,
    has_issues: true
}, config);
assert.throws(() => validateCommunityRepository({
    node_id: config.repoId,
    visibility: "private",
    archived: false,
    has_discussions: true,
    has_issues: true
}, config), /public and active/);

const category = validateGiscusInstallation(200, {
    repositoryId: config.repoId,
    categories: [{ id: config.categoryId, name: config.category }]
}, config);
assert.equal(category.name, "General");
assert.throws(() => validateGiscusInstallation(403, {
    error: "giscus is not installed on this repository"
}, config), /not installed/);
assert.throws(() => validateGiscusInstallation(200, {
    repositoryId: config.repoId,
    categories: [{ id: config.categoryId, name: "Ideas" }]
}, config), /category name changed/);

const extraAdmin = html.replace('data-community-administrators="ChenlizheMe"', 'data-community-administrators="ChenlizheMe,SomeoneElse"');
assert.throws(() => parseCommunityReadinessConfig(extraAdmin), /exactly ChenlizheMe/);
const missingAdmin = html.replace(' data-community-administrators="ChenlizheMe"', "");
assert.throws(() => parseCommunityReadinessConfig(missingAdmin), /missing data-community-administrators/);

console.log("Community readiness test passed: public repository, hard Giscus installation, exact category mapping, and ChenlizheMe-only administrator declaration.");

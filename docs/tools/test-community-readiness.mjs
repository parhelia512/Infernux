import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    parseCommunityReadinessConfig,
    validateCommunityGateway,
    validateCommunityRepository,
    validateGiscusInstallation
} from "./community-readiness-core.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const communityHtml = await readFile(path.resolve(scriptDir, "..", "community.html"), "utf8");
const topicHtml = await readFile(path.resolve(scriptDir, "..", "community-topic.html"), "utf8");
const apiSource = await readFile(path.resolve(scriptDir, "..", "js", "community-api.js"), "utf8");
const config = parseCommunityReadinessConfig(communityHtml, topicHtml, apiSource);

assert.deepEqual(config.administrators, ["ChenlizheMe"]);
assert.equal(config.repo, "ChenlizheMe/Infernux");
assert.equal(config.mapping, "number");
assert.equal(config.gatewayOrigin, "https://infernux-community.chenlizheme.workers.dev");

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
validateCommunityGateway(200, "ok");
assert.throws(() => validateCommunityGateway(503, "unavailable"), /health check failed/);

const extraAdmin = communityHtml.replace('data-community-administrators="ChenlizheMe"', 'data-community-administrators="ChenlizheMe,SomeoneElse"');
assert.throws(() => parseCommunityReadinessConfig(extraAdmin, topicHtml, apiSource), /exactly ChenlizheMe/);
const missingAdmin = communityHtml.replace(' data-community-administrators="ChenlizheMe"', "");
assert.throws(() => parseCommunityReadinessConfig(missingAdmin, topicHtml, apiSource), /missing data-community-administrators/);
const legacyComposer = communityHtml.replace('id="community-compose-form"', 'id="community-compose-form" data-mapping="specific"');
assert.throws(() => parseCommunityReadinessConfig(legacyComposer, topicHtml, apiSource), /must not create topics through/);
const wrongReplyMapping = topicHtml.replace('data-mapping="number"', 'data-mapping="specific"');
assert.throws(() => parseCommunityReadinessConfig(communityHtml, wrongReplyMapping, apiSource), /explicit Discussion number/);

console.log("Community readiness test passed: native topic publishing, user-owned gateway sessions, numbered Giscus replies, and repository contracts.");

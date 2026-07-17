function requiredAttribute(html, name, source = "community topic") {
    const value = html.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];
    if (!value) throw new Error(`${source} is missing ${name}`);
    return value;
}

function requireMarkup(html, marker, message) {
    if (!html.includes(marker)) throw new Error(message);
}

export function parseCommunityReadinessConfig(communityHtml, topicHtml, apiSource) {
    requireMarkup(communityHtml, 'id="community-compose-form"', "community.html must contain the native topic form");
    requireMarkup(communityHtml, 'id="community-compose-body"', "community.html must collect the complete topic body");
    requireMarkup(communityHtml, 'id="community-compose-publish"', "community.html must require an explicit publish action");
    if (/data-mapping=["']specific["']/i.test(communityHtml)) {
        throw new Error("community.html must not create topics through a specific Giscus mapping");
    }
    const gatewayOrigin = apiSource.match(/FALLBACK_API_ORIGIN\s*=\s*["'](https:\/\/[^"']+)["']/)?.[1];
    if (!gatewayOrigin) throw new Error("community-api-v5.js is missing the HTTPS community gateway origin");
    const gatewayPath = apiSource.match(/SAME_ORIGIN_PREFIX\s*=\s*["'](\/[^"']+)["']/)?.[1];
    if (!gatewayPath) throw new Error("community-api-v5.js is missing the same-origin community gateway path");
    const config = {
        repo: requiredAttribute(topicHtml, "data-repo"),
        repoId: requiredAttribute(topicHtml, "data-repo-id"),
        category: requiredAttribute(topicHtml, "data-category"),
        categoryId: requiredAttribute(topicHtml, "data-category-id"),
        mapping: requiredAttribute(topicHtml, "data-mapping"),
        gatewayOrigin,
        gatewayPath,
        administrators: requiredAttribute(communityHtml, "data-community-administrators", "community.html")
            .split(/[\s,]+/)
            .filter(Boolean)
    };
    if (config.mapping !== "number") {
        throw new Error("Giscus replies must map to the explicit Discussion number");
    }
    if (JSON.stringify(config.administrators) !== JSON.stringify(["ChenlizheMe"])) {
        throw new Error("community administrator declaration must contain exactly ChenlizheMe");
    }
    return config;
}

export function validateCommunityRepository(repository, config) {
    if (repository.node_id !== config.repoId) throw new Error(`repository ID changed from ${config.repoId} to ${repository.node_id}`);
    if (repository.visibility !== "public" || repository.archived) throw new Error("community repository must remain public and active");
    if (!repository.has_discussions || !repository.has_issues) throw new Error("GitHub Discussions and Issues must both remain enabled");
}

export function validateGiscusInstallation(status, payload, config) {
    if (status === 403 && /not installed/i.test(payload?.error || "")) {
        throw new Error(`Giscus is not installed on ${config.repo}; embedded sign-in and replies are unavailable`);
    }
    if (status < 200 || status >= 300) throw new Error(`Giscus category API returned HTTP ${status}`);
    if (payload.repositoryId !== config.repoId) throw new Error("Giscus repository ID does not match community.html");
    const category = (payload.categories || []).find((item) => item.id === config.categoryId);
    if (!category) throw new Error(`Giscus category ID ${config.categoryId} is unavailable`);
    if (category.name !== config.category) throw new Error(`Giscus category name changed from ${config.category} to ${category.name}`);
    return category;
}

export function validateCommunityGateway(status, body) {
    if (status < 200 || status >= 300 || String(body).trim() !== "ok") {
        throw new Error(`community gateway health check failed with HTTP ${status}`);
    }
}

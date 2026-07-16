function requiredAttribute(html, name) {
    const value = html.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];
    if (!value) throw new Error(`community.html is missing ${name}`);
    return value;
}

export function parseCommunityReadinessConfig(html) {
    const config = {
        repo: requiredAttribute(html, "data-repo"),
        repoId: requiredAttribute(html, "data-repo-id"),
        category: requiredAttribute(html, "data-category"),
        categoryId: requiredAttribute(html, "data-category-id"),
        mapping: requiredAttribute(html, "data-mapping"),
        term: requiredAttribute(html, "data-term"),
        administrators: requiredAttribute(html, "data-community-administrators")
            .split(/[\s,]+/)
            .filter(Boolean)
    };
    if (config.mapping !== "specific" || !config.term) {
        throw new Error("Giscus must use a non-empty, specific Discussion mapping");
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

function formatAssetSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function renderRelease(release) {
    document.getElementById("release-version").textContent = release.version;
    document.getElementById("release-date").textContent = new Intl.DateTimeFormat(
        document.documentElement.lang.startsWith("zh") ? "zh-CN" : "en",
        { year: "numeric", month: "short", day: "numeric" }
    ).format(new Date(release.published_at));
    document.getElementById("release-notes-link").href = release.release_url;

    release.assets.forEach((asset) => {
        const card = document.querySelector(`[data-release-kind="${CSS.escape(asset.kind)}"]`);
        if (!card) return;
        card.querySelector('[data-release-field="name"]').textContent = asset.name;
        card.querySelector('[data-release-field="size"]').textContent = formatAssetSize(asset.size_bytes);
        card.querySelector('[data-release-field="sha256"]').textContent = asset.sha256;
        card.querySelector('[data-release-field="url"]').href = asset.url;
    });

    const status = document.getElementById("release-status");
    status.dataset.i18n = "downloadPage.ready";
    if (typeof applyLanguage === "function") applyLanguage(document.documentElement.lang.startsWith("zh") ? "zh" : "en");
}

function renderReleaseNotes(notes) {
    const summary = document.getElementById("release-notes-summary");
    const grid = document.getElementById("release-notes-grid");
    const status = document.getElementById("release-notes-status");
    if (!summary || !grid || !status) return;
    summary.textContent = notes.summary;
    grid.innerHTML = "";
    notes.sections.forEach((section) => {
        const article = document.createElement("article");
        article.className = `release-note-section release-note-section-${section.kind}`;
        const heading = document.createElement("h3");
        heading.textContent = section.title;
        const list = document.createElement("ul");
        section.items.forEach((item) => {
            const entry = document.createElement("li");
            const title = document.createElement("strong");
            title.textContent = item.title;
            entry.appendChild(title);
            if (item.detail) entry.append(document.createTextNode(`${/^[,.;:]/.test(item.detail) ? "" : " "}${item.detail}`));
            list.appendChild(entry);
        });
        article.append(heading, list);
        grid.appendChild(article);
    });
    status.dataset.i18n = document.documentElement.lang.startsWith("zh")
        ? "downloadPage.releaseNotes.sourceLanguage"
        : "downloadPage.releaseNotes.ready";
    if (typeof applyLanguage === "function") applyLanguage(document.documentElement.lang.startsWith("zh") ? "zh" : "en");
}

function releaseCopy(key) {
    const zh = document.documentElement.lang.startsWith("zh");
    const copy = {
        ready: zh ? "SHA-256 已复制。" : "SHA-256 copied.",
        failed: zh ? "复制失败，请手工选择校验值。" : "Copy failed; select the checksum manually."
    };
    return copy[key];
}

document.addEventListener("DOMContentLoaded", () => {
    fetch("release.json")
        .then((response) => {
            if (!response.ok) throw new Error(`release manifest ${response.status}`);
            return response.json();
        })
        .then(renderRelease)
        .catch((error) => {
            console.warn(error);
            const status = document.getElementById("release-status");
            status.dataset.i18n = "downloadPage.fallback";
            if (typeof applyLanguage === "function") applyLanguage(document.documentElement.lang.startsWith("zh") ? "zh" : "en");
        });

    fetch("release-notes.json")
        .then((response) => {
            if (!response.ok) throw new Error(`release notes ${response.status}`);
            return response.json();
        })
        .then(renderReleaseNotes)
        .catch((error) => {
            console.warn(error);
            const notesStatus = document.getElementById("release-notes-status");
            if (notesStatus) notesStatus.dataset.i18n = "downloadPage.releaseNotes.fallback";
            if (typeof applyLanguage === "function") applyLanguage(document.documentElement.lang.startsWith("zh") ? "zh" : "en");
        });

    document.querySelectorAll(".copy-checksum").forEach((button) => {
        button.addEventListener("click", async () => {
            const checksum = button.closest(".download-card").querySelector('[data-release-field="sha256"]').textContent.trim();
            try {
                await navigator.clipboard.writeText(checksum);
                button.textContent = releaseCopy("ready");
            } catch {
                button.textContent = releaseCopy("failed");
            }
        });
    });
});

(() => {
    "use strict";

    function syncLanguage(event) {
        const language = event?.detail?.lang || (document.documentElement.lang.startsWith("zh") ? "zh" : "en");
        document.querySelectorAll("[data-page-language]").forEach((section) => {
            section.hidden = section.dataset.pageLanguage !== language;
        });
    }

    document.addEventListener("site:language-changed", syncLanguage);
    document.addEventListener("DOMContentLoaded", syncLanguage);
})();

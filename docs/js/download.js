(() => {
    "use strict";

    function syncVersionLink(select) {
        const link = select.closest(".version-picker")?.querySelector("[data-version-link]");
        if (link) link.href = select.value;
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("[data-version-select]").forEach((select) => {
            syncVersionLink(select);
            select.addEventListener("change", () => syncVersionLink(select));
        });
    });
})();

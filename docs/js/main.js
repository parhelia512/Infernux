/**
 * Infernux Engine - Main JavaScript
 */

// Register the root-scoped offline shell. HTML and machine-readable evidence
// remain network-first inside the worker so a cache cannot silently replace a
// newer authoritative document.
if ("serviceWorker" in navigator && (window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", async () => {
        try {
            const registration = await navigator.serviceWorker.register("/sw.js", {
                scope: "/",
                updateViaCache: "none"
            });
            registration.update().catch(() => {});
        } catch (error) {
            console.warn("Infernux offline shell could not be registered.", error);
        }
    });
}

// ── Theme toggle ─────────────────────────────
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    applyNavbarBackground();
    document.dispatchEvent(new CustomEvent('site:theme-changed', { detail: { theme: next } }));
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    const button = document.querySelector('.theme-toggle');
    if (icon) {
        icon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
    }
    if (button) {
        const isLight = theme === 'light';
        const zh = document.documentElement.lang?.toLowerCase().startsWith('zh');
        button.setAttribute('aria-pressed', String(isLight));
        const label = isLight
            ? (zh ? '切换到深色主题' : 'Switch to dark theme')
            : (zh ? '切换到浅色主题' : 'Switch to light theme');
        button.setAttribute('aria-label', label);
        button.title = label;
    }
}

// Apply saved theme on load
(function() {
    const saved = localStorage.getItem('theme') || 'dark';
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    document.addEventListener('DOMContentLoaded', function() {
        updateThemeIcon(saved);
    });
})();

// Mobile menu toggle
function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    const open = !navLinks.classList.contains('mobile-open');
    setMobileMenuState(open, { moveFocus: open });
}

function mobileMenuElements() {
    const navLinks = document.querySelector('.nav-links');
    const button = document.querySelector('.mobile-menu-btn');
    return { navLinks, button };
}

function mobileMenuFocusables() {
    const { navLinks, button } = mobileMenuElements();
    if (!navLinks || !button) return [];
    return [button, ...navLinks.querySelectorAll('a[href]')];
}

function setMobileMenuState(open, { moveFocus = false, returnFocus = false } = {}) {
    const { navLinks, button } = mobileMenuElements();
    if (!navLinks || !button) return;
    const nextOpen = Boolean(open && window.innerWidth <= 1180);
    navLinks.classList.toggle('mobile-open', nextOpen);
    document.body?.classList.toggle('mobile-menu-open', nextOpen);
    button.setAttribute('aria-expanded', String(nextOpen));
    const zh = document.documentElement.lang?.toLowerCase().startsWith('zh');
    button.setAttribute('aria-label', nextOpen
        ? (zh ? '关闭导航菜单' : 'Close navigation menu')
        : (zh ? '打开导航菜单' : 'Open navigation menu'));
    const icon = button.querySelector('i');
    if (icon) icon.className = nextOpen ? 'fas fa-xmark' : 'fas fa-bars';
    if (nextOpen && moveFocus) {
        window.requestAnimationFrame(() => navLinks.querySelector('a[href]')?.focus({ preventScroll: true }));
    } else if (!nextOpen && returnFocus) {
        button.focus({ preventScroll: true });
    }
}

function handleMobileMenuKeydown(event) {
    const { navLinks } = mobileMenuElements();
    if (!navLinks?.classList.contains('mobile-open')) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        setMobileMenuState(false, { returnFocus: true });
        return;
    }
    if (event.key !== 'Tab') return;
    const focusables = mobileMenuFocusables();
    if (focusables.length < 2) return;
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
    }
}

function handleMobileMenuPointerDown(event) {
    const { navLinks } = mobileMenuElements();
    if (!navLinks?.classList.contains('mobile-open')) return;
    if (!event.target?.closest?.('.navbar')) setMobileMenuState(false);
}

// Copy code to clipboard
function copyCode(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code, pre');
    const text = code.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        const icon = button.querySelector('i');
        icon.className = 'fas fa-check';
        button.style.color = '#27ca40';
        
        setTimeout(() => {
            icon.className = 'fas fa-copy';
            button.style.color = '';
        }, 2000);
    });
}

// Smooth scroll for anchor links
document.addEventListener('DOMContentLoaded', function() {
    applyNavbarBackground();
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => setMobileMenuState(false));
    });
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
                });
            }
        });
    });
});

// Navbar background: scroll + theme must both refresh — inline RGB from a
// previous theme would otherwise stick after toggleTheme() (e.g. after focus
// or code selection causes a scroll event).
function applyNavbarBackground() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    const style = getComputedStyle(document.documentElement);
    if (window.scrollY > 50) {
        navbar.style.background = style.getPropertyValue('--nav-bg-scroll').trim();
    } else {
        navbar.style.background = style.getPropertyValue('--nav-bg').trim();
    }
}

window.addEventListener('scroll', applyNavbarBackground);
window.addEventListener('resize', () => {
    if (window.innerWidth > 1180) setMobileMenuState(false);
});
document.addEventListener('keydown', handleMobileMenuKeydown);
document.addEventListener('pointerdown', handleMobileMenuPointerDown);
document.addEventListener('site:language-changed', () => {
    const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    updateThemeIcon(theme);
    const zh = document.documentElement.lang?.toLowerCase().startsWith('zh');
    const languageButton = document.querySelector('.lang-toggle');
    if (languageButton) languageButton.setAttribute('aria-label', zh ? '切换到英文' : 'Switch to Chinese');
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) skipLink.textContent = zh ? '跳到正文' : 'Skip to content';
    setMobileMenuState(false);
});

// Add animation classes when elements come into view
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const observer = !reduceMotion && 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions)
    : null;

document.addEventListener('DOMContentLoaded', function() {
    const animatedElements = document.querySelectorAll('[data-reveal], .hero-slab, .subpage-hero, .hub-hero, .cta-panel');
    animatedElements.forEach(el => {
        if (!observer) {
            el.classList.add('animate-in');
            return;
        }
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(el);
    });
});

// Tab switching for code examples
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.classList.add('active');
        // Find the button that triggered this
        document.querySelectorAll('.tab-btn').forEach(b => {
            if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(tabId)) {
                b.classList.add('active');
            }
        });
    }
}

if (globalThis.__INFERNUX_NAV_TEST__) {
    globalThis.__infernuxNavigation = {
        handleMobileMenuKeydown,
        handleMobileMenuPointerDown,
        mobileMenuFocusables,
        setMobileMenuState,
        toggleMobileMenu
    };
}

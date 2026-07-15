/**
 * Infernux Engine - Main JavaScript
 */

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
    setMobileMenuState(!navLinks.classList.contains('mobile-open'));
}
function setMobileMenuState(open) {
    const navLinks = document.querySelector('.nav-links');
    const button = document.querySelector('.mobile-menu-btn');
    if (!navLinks || !button) return;
    navLinks.classList.toggle('mobile-open', open);
    button.setAttribute('aria-expanded', String(open));
    const zh = document.documentElement.lang?.toLowerCase().startsWith('zh');
    button.setAttribute('aria-label', open
        ? (zh ? '关闭导航菜单' : 'Close navigation menu')
        : (zh ? '打开导航菜单' : 'Open navigation menu'));
    const icon = button.querySelector('i');
    if (icon) icon.className = open ? 'fas fa-xmark' : 'fas fa-bars';
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
    if (window.innerWidth > 820) setMobileMenuState(false);
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        const wasOpen = document.querySelector('.nav-links')?.classList.contains('mobile-open');
        setMobileMenuState(false);
        if (wasOpen) document.querySelector('.mobile-menu-btn')?.focus();
    }
});
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

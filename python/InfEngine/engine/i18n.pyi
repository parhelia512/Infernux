"""Internationalization — bilingual (EN / ZH) translation system.

All user-facing editor strings pass through :func:`t` for localization.

Example::

    from InfEngine.engine.i18n import t, get_locale, set_locale

    print(t("menu.file"))          # "File" (en) or "文件" (zh)
    set_locale("zh")               # switch to Chinese
    print(get_locale())            # "zh"
"""

from __future__ import annotations


def t(key: str) -> str:
    """Translate *key* using the current locale.

    Returns the key itself if no translation is found.

    Args:
        key: Dot-separated translation key, e.g. ``"menu.file"``.
    """
    ...

def get_locale() -> str:
    """Return the active locale code (``"en"`` or ``"zh"``)."""
    ...

def set_locale(locale: str) -> None:
    """Switch the active locale and persist the preference.

    Args:
        locale: ``"en"`` or ``"zh"``.
    """
    ...

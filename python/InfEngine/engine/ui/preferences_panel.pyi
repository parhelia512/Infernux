"""preferences_panel — standalone Preferences window."""

from __future__ import annotations


class PreferencesPanel:
    """Standalone floating Preferences window.

    Usage::

        prefs = PreferencesPanel()
        prefs.open()
        prefs.render(ctx)
    """

    def __init__(self) -> None: ...
    def open(self) -> None: ...
    def close(self) -> None: ...

    @property
    def is_open(self) -> bool: ...

    def render(self, ctx: object) -> None: ...

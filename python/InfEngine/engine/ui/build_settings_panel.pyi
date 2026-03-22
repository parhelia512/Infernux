"""build_settings_panel — Build Settings window with scene list and platform config."""

from __future__ import annotations

from typing import List, Optional


BUILD_SETTINGS_FILE: str
"""Default filename for build settings (``BuildSettings.json``)."""

DRAG_DROP_SCENE: str
DRAG_DROP_REORDER: str


def load_build_settings() -> dict:
    """Load the project's build settings from disk.

    Returns:
        Parsed JSON dict, or empty dict if the file doesn't exist.
    """
    ...

def save_build_settings(settings: dict) -> None:
    """Persist *settings* to the project's ``BuildSettings.json``."""
    ...


class BuildSettingsPanel:
    """Floating Build Settings window with scene list and platform config.

    Usage::

        panel = BuildSettingsPanel()
        panel.open()
        panel.render(ctx)
    """

    def __init__(self) -> None: ...
    def open(self) -> None: ...
    def close(self) -> None: ...

    @property
    def is_open(self) -> bool: ...

    def get_scene_list(self) -> List[str]:
        """Return ordered list of scene paths included in the build."""
        ...

    def render(self, ctx: object) -> None: ...

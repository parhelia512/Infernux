"""EditorEventBus — lightweight publish/subscribe event system.

Example::

    bus = EditorEventBus.instance()
    bus.subscribe(EditorEvent.SELECTION_CHANGED, my_handler)
    bus.emit(EditorEvent.SELECTION_CHANGED, game_object)
    bus.unsubscribe(EditorEvent.SELECTION_CHANGED, my_handler)
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Callable, Optional


class EditorEvent(Enum):
    """Well-known editor events with documented callback signatures."""

    SELECTION_CHANGED = "selection_changed"
    """``callback(game_object: Optional[GameObject])``"""
    FILE_SELECTED = "file_selected"
    """``callback(file_path: Optional[str])``"""
    SCENE_LOADED = "scene_loaded"
    """``callback(scene)``"""
    SCENE_SAVED = "scene_saved"
    """``callback()``"""
    PLAY_MODE_CHANGED = "play_mode_changed"
    """``callback(old_state: PlayModeState, new_state: PlayModeState)``"""
    ASSET_CHANGED = "asset_changed"
    """``callback(file_path: str, event_type: str)``"""
    SCRIPT_RELOADED = "script_reloaded"
    """``callback(file_path: str)``"""
    UNDO_STATE_CHANGED = "undo_state_changed"
    """``callback()``"""
    PANEL_FOCUSED = "panel_focused"
    """``callback(panel_id: str)``"""


class EditorEventBus:
    """Singleton event bus for editor-wide communication."""

    def __init__(self) -> None: ...

    @classmethod
    def instance(cls) -> EditorEventBus: ...

    def subscribe(self, event: Any, callback: Callable) -> None:
        """Subscribe *callback* to *event*.

        Args:
            event: An :class:`EditorEvent` member or any hashable key.
            callback: The handler function.
        """
        ...

    def unsubscribe(self, event: Any, callback: Callable) -> None:
        """Remove *callback* from *event* subscribers."""
        ...

    def emit(self, event: Any, *args: Any, **kwargs: Any) -> None:
        """Emit *event*, calling all subscribers.

        Exceptions in individual callbacks are caught and logged.
        """
        ...

    def clear(self) -> None:
        """Remove all subscriptions."""
        ...

    def subscriber_count(self, event: Any) -> int: ...

"""EngineStatus — global engine activity indicator.

Example::

    EngineStatus.set("Saving…", 0.5)
    EngineStatus.flash("Done ✓", 1.0, duration=1.5)
    EngineStatus.clear()
"""

from __future__ import annotations


class EngineStatus:
    """Singleton-style engine status (class-level state)."""

    @classmethod
    def set(cls, text: str, progress: float = -1.0) -> None:
        """Set a persistent status.

        Args:
            text: Status message.
            progress: 0..1 for determinate, <0 for indeterminate.
        """
        ...

    @classmethod
    def flash(cls, text: str, progress: float = -1.0, duration: float = 1.5) -> None:
        """Set a status that auto-clears after *duration* seconds."""
        ...

    @classmethod
    def clear(cls) -> None:
        """Clear the status immediately."""
        ...

    @classmethod
    def get(cls) -> tuple[str, float]:
        """Return ``(text, progress)``."""
        ...

    @classmethod
    def is_active(cls) -> bool: ...

"""Minimal bootstrap breadcrumbs for diagnosing editor startup hangs (no heavy imports)."""

from __future__ import annotations

import os
import tempfile


def bootstrap_checkpoint(message: str) -> None:
    """Write the last completed bootstrap sub-step to the temp directory.

    On Windows this is typically ``%TEMP%\\Infernux_bootstrap_checkpoint.txt``.
    If the editor freezes during splash loading, support can ask the user to
    open that file — the final line is the last checkpoint reached.

    Set ``INFERNUX_BOOTSTRAP_TRACE=1`` to also mirror each line to the engine
    internal log via :mod:`Infernux.debug`.
    """
    try:
        path = os.path.join(tempfile.gettempdir(), "Infernux_bootstrap_checkpoint.txt")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(message + "\n")
            f.flush()
            os.fsync(f.fileno())
    except OSError:
        pass

    flag = os.environ.get("INFERNUX_BOOTSTRAP_TRACE", "").strip().lower()
    if flag not in {"1", "true", "yes", "on"}:
        return
    try:
        from Infernux.debug import Debug

        Debug.log_internal(f"[bootstrap] {message}")
    except Exception:
        pass

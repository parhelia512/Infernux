"""Public caller-controlled headless runtime loop."""

from __future__ import annotations

import math
from collections.abc import Callable
from os import PathLike
from typing import Any

from Infernux.lib import LogLevel, RuntimeMode
from .engine import Engine

HeadlessUpdate = Callable[[Engine, int], Any]


def run_headless(
    project_path: str | PathLike[str],
    update: HeadlessUpdate,
    *,
    fixed_delta: float = 1.0 / 60.0,
    max_frames: int | None = None,
    engine_log_level=LogLevel.Info,
) -> int:
    """Run a deterministic no-window loop and return the number of frames stepped.

    ``update`` runs before each native tick. Returning ``False`` or calling
    ``engine.request_exit()`` stops the loop without stepping another frame.
    """
    if not callable(update):
        raise TypeError("update must be callable")
    if not math.isfinite(fixed_delta) or fixed_delta <= 0.0:
        raise ValueError("fixed_delta must be finite and greater than zero")
    if max_frames is not None and max_frames < 0:
        raise ValueError("max_frames cannot be negative")

    engine = Engine(engine_log_level, RuntimeMode.Headless)
    engine.init_headless(str(project_path))
    frames = 0
    try:
        native = engine.get_native_engine()
        while max_frames is None or frames < max_frames:
            if update(engine, frames) is False or native.exit_requested:
                break
            engine.tick(fixed_delta)
            frames += 1
        return frames
    finally:
        engine.exit()

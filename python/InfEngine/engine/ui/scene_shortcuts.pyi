"""scene_shortcuts — keyboard/mouse state snapshot for the Scene View."""

from __future__ import annotations

from InfEngine.lib import InfGUIContext

TOOL_NONE: int
TOOL_TRANSLATE: int
TOOL_ROTATE: int
TOOL_SCALE: int


class SceneInput:
    """Snapshot of keyboard/mouse state relevant to the Scene View.

    Usage::

        si = SceneInput(ctx, hovered=True)
        if si.tool_translate_pressed:
            ...
    """

    __slots__ = (
        "ctx",
        "hovered",
        "key_w",
        "key_s",
        "key_a",
        "key_d",
        "key_q",
        "key_e",
        "shift_down",
        "tool_none_pressed",
        "tool_translate_pressed",
        "tool_rotate_pressed",
        "tool_scale_pressed",
        "focus_pressed",
    )

    ctx: InfGUIContext
    hovered: bool
    key_w: bool
    key_s: bool
    key_a: bool
    key_d: bool
    key_q: bool
    key_e: bool
    shift_down: bool
    tool_none_pressed: bool
    tool_translate_pressed: bool
    tool_rotate_pressed: bool
    tool_scale_pressed: bool
    focus_pressed: bool

    def __init__(
        self,
        ctx: InfGUIContext,
        hovered: bool,
        right_down: bool = False,
    ) -> None: ...

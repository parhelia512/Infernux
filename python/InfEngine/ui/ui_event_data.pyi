"""Type stubs for InfEngine.ui.ui_event_data — pointer event data."""

from __future__ import annotations

from enum import IntEnum
from typing import Optional, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from InfEngine.ui.inf_ui_screen_component import InfUIScreenComponent
    from InfEngine.ui.ui_canvas import UICanvas


class PointerButton(IntEnum):
    """Mouse button index (matches SDL / ``Input.get_mouse_button``)."""
    Left = 0
    Right = 1
    Middle = 2


class PointerEventData:
    """Data container for a single pointer event.

    Passed to ``on_pointer_enter``, ``on_pointer_click``, etc. on any
    ``InfUIScreenComponent`` subclass.

    Attributes:
        position: Current pointer position in canvas design pixels.
        delta: Frame-to-frame delta in canvas design pixels.
        button: Which mouse button triggered this event.
        press_position: Canvas-space position where the button was pressed.
        click_count: Rapid click count (1 = single, 2 = double, ...).
        scroll_delta: ``(sx, sy)`` scroll delta this frame.
        canvas: The ``UICanvas`` owning the target element.
        target: The ``InfUIScreenComponent`` this event is addressed to.
        used: Set to ``True`` in a handler to stop further propagation.
    """

    position: Tuple[float, float]
    delta: Tuple[float, float]
    button: PointerButton
    press_position: Tuple[float, float]
    click_count: int
    scroll_delta: Tuple[float, float]
    canvas: Optional[UICanvas]
    target: Optional[InfUIScreenComponent]
    used: bool

    def __init__(self) -> None: ...

    def Use(self) -> None:
        """Mark event as consumed (stops propagation to parent elements)."""
        ...

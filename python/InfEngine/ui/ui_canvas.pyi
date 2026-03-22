"""Type stubs for InfEngine.ui.ui_canvas — root container for screen-space UI."""

from __future__ import annotations

from typing import Iterator, List, Optional

from InfEngine.ui.inf_ui_component import InfUIComponent
from InfEngine.ui.inf_ui_screen_component import InfUIScreenComponent
from InfEngine.ui.enums import RenderMode


class UICanvas(InfUIComponent):
    """Screen-space UI canvas — root container for all UI elements.

    Defines a *design* reference resolution (default 1920x1080).  At runtime
    the Game View scales from design resolution to actual viewport size so
    that all positions, sizes and font sizes adapt proportionally.

    Attributes:
        render_mode: ``ScreenOverlay`` or ``CameraOverlay``.
        sort_order: Rendering order (lower draws first).
        target_camera_id: Camera GameObject ID (CameraOverlay mode only).
        reference_width: Design reference width in pixels (default 1920).
        reference_height: Design reference height in pixels (default 1080).
    """

    render_mode: RenderMode
    sort_order: int
    target_camera_id: int
    reference_width: int
    reference_height: int

    def invalidate_element_cache(self) -> None:
        """Mark the cached element list as stale.

        Called automatically when ``structure_version`` changes.
        Also call manually after hierarchy changes (add/remove children).
        """
        ...

    def iter_ui_elements(self) -> Iterator[InfUIScreenComponent]:
        """Yield all screen-space UI components on child GameObjects (depth-first)."""
        ...

    def raycast(self, canvas_x: float, canvas_y: float) -> Optional[InfUIScreenComponent]:
        """Return the front-most element hit at ``(canvas_x, canvas_y)``, or ``None``.

        Iterates children in reverse depth-first order (last drawn = top).
        Only elements with ``raycast_target = True`` participate.

        Args:
            canvas_x: X coordinate in canvas design pixels.
            canvas_y: Y coordinate in canvas design pixels.
        """
        ...

    def raycast_all(self, canvas_x: float, canvas_y: float) -> List[InfUIScreenComponent]:
        """Return all elements hit at the given point, front-to-back order.

        Args:
            canvas_x: X coordinate in canvas design pixels.
            canvas_y: Y coordinate in canvas design pixels.
        """
        ...

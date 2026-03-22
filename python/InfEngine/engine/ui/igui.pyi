"""igui — unified high-level editor widgets.

Usage::

    from InfEngine.engine.ui.igui import IGUI

    clicked = IGUI.object_field(ctx, "myfield", "MyObject", "GameObject")
    idx = IGUI.searchable_combo(ctx, "combo1", 0, ["A", "B", "C"])
"""

from __future__ import annotations

from typing import Any, Callable, Optional, Sequence


class IGUI:
    """Static namespace for unified editor widgets."""

    @staticmethod
    def drop_target(
        ctx: object,
        accept_type: str,
        on_drop: Callable,
        *,
        outline: bool = True,
    ) -> bool:
        """Accept a single drag-drop payload type on the last item."""
        ...

    @staticmethod
    def multi_drop_target(
        ctx: object,
        accept_types: Sequence[str],
        on_drop: Callable[[str, Any], None],
        *,
        outline: bool = True,
    ) -> bool:
        """Accept multiple drag-drop payload types on the last item."""
        ...

    @staticmethod
    def object_field(
        ctx: object,
        field_id: str,
        display_text: str,
        type_hint: str,
        *,
        selected: bool = False,
        clickable: bool = True,
        accept: Optional[str] = None,
        on_drop: Optional[Callable] = None,
        picker_scene_items: Optional[Sequence] = None,
        picker_asset_items: Optional[Sequence] = None,
        on_pick: Optional[Callable] = None,
        on_clear: Optional[Callable] = None,
    ) -> bool:
        """Render an object reference field with optional picker popup."""
        ...

    @staticmethod
    def reorder_separator(
        ctx: object,
        sep_id: str,
        accept_type: str,
        on_drop: Callable,
    ) -> bool:
        """Render a reorder drop separator between list items."""
        ...

    @staticmethod
    def list_header(
        ctx: object,
        label: str,
        count: int,
        *,
        on_add: Optional[Callable] = None,
        on_remove: Optional[Callable] = None,
        accept_drop: Optional[str] = None,
        on_header_drop: Optional[Callable] = None,
        level: str = "secondary",
    ) -> bool:
        """Render a collapsible list header with optional add/remove buttons."""
        ...

    @staticmethod
    def begin_list(
        ctx: object,
        list_id: str,
        count: int,
        *,
        on_add: Optional[Callable] = None,
        on_remove_last: Optional[Callable] = None,
        accept_drop: Optional[str] = None,
        on_header_drop: Optional[Callable] = None,
        level: str = "secondary",
    ) -> bool:
        """Begin a list region with header. Returns ``True`` if open."""
        ...

    @staticmethod
    def list_item_remove_button(ctx: object, item_id: str) -> bool:
        """Render a small ``×`` remove button for a list entry."""
        ...

    @staticmethod
    def searchable_combo(
        ctx: object,
        combo_id: str,
        current_idx: int,
        labels: Sequence[str],
        *,
        width: float = 0.0,
    ) -> int:
        """Render a combo box with a built-in search/filter field.

        Returns:
            New selected index (unchanged if no selection was made).
        """
        ...

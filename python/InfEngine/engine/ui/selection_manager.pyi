"""SelectionManager — centralized selection state for the editor.

Example::

    sel = SelectionManager.instance()
    sel.select(obj_id)           # single select
    sel.toggle(obj_id)           # ctrl+click
    sel.range_select(obj_id)     # shift+click
    sel.box_select([id1, id2])   # replace with box-select
    sel.clear()
"""

from __future__ import annotations

from typing import Callable, Optional, Sequence


class SelectionManager:
    """Singleton that owns the set of selected GameObject IDs."""

    @classmethod
    def instance(cls) -> SelectionManager: ...

    def __init__(self) -> None: ...

    def add_listener(self, cb: Callable[[], None]) -> None: ...
    def remove_listener(self, cb: Callable[[], None]) -> None: ...

    def set_ordered_ids(self, ids: Sequence[int]) -> None:
        """Provide the visible ordering so shift-select can compute ranges."""
        ...

    def select(self, obj_id: int) -> None:
        """Replace selection with a single object."""
        ...

    def toggle(self, obj_id: int) -> None:
        """Ctrl+click: add or remove *obj_id*."""
        ...

    def range_select(self, obj_id: int) -> None:
        """Shift+click: select contiguous range from primary → *obj_id*."""
        ...

    def box_select(self, ids: Sequence[int], *, additive: bool = False) -> None:
        """Replace (or union) selection with box/lasso result."""
        ...

    def clear(self) -> None: ...

    def set_ids(self, ids: Sequence[int]) -> None:
        """Replace the entire selection (used by undo/redo)."""
        ...

    def get_ids(self) -> list[int]:
        """Ordered list of selected IDs (last = most recently added)."""
        ...

    def get_primary(self) -> int:
        """The primary (most recently selected) object ID, or ``0``."""
        ...

    def is_selected(self, obj_id: int) -> bool: ...
    def count(self) -> int: ...
    def is_empty(self) -> bool: ...
    def is_single(self) -> bool: ...
    def is_multi(self) -> bool: ...

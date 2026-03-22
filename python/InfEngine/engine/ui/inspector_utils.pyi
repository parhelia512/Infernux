"""inspector_utils — shared inspector widgets and layout helpers.

Usage::

    from InfEngine.engine.ui.inspector_utils import (
        render_serialized_field,
        render_component_header,
        pretty_field_name,
    )
"""

from __future__ import annotations

from typing import Any, Callable, Optional, Tuple

from InfEngine.lib import InfGUIContext


# ── Layout constants ────────────────────────────────────────────────

LABEL_PAD: float
MIN_LABEL_WIDTH: float
DRAG_SPEED_DEFAULT: float
DRAG_SPEED_FINE: float
DRAG_SPEED_INT: float


# ── Text utilities ──────────────────────────────────────────────────

def float_close(
    a: float, b: float, rel_tol: float = 1e-5, abs_tol: float = 1e-7,
) -> bool:
    """Return ``True`` if *a* and *b* are approximately equal."""
    ...

def format_display_name(name: str, *, title_case: bool = False) -> str:
    """Convert ``snake_case`` or ``camelCase`` to a display label."""
    ...

def pretty_field_name(name: str) -> str:
    """Shortcut for ``format_display_name(name, title_case=True)``."""
    ...

def max_label_w(
    ctx: InfGUIContext, labels: object, *, min_width: float = 0.0,
) -> float:
    """Calculate the pixel width needed to fit the widest label."""
    ...

def field_label(ctx: InfGUIContext, label: str, width: float = 0.0) -> None:
    """Render a left-aligned field label at *width* pixels."""
    ...


# ── Enum helpers ────────────────────────────────────────────────────

def get_enum_members(enum_cls: type) -> list: ...
def get_enum_member_name(member: object) -> str: ...
def get_enum_member_value(member: object) -> Any: ...
def find_enum_index(members: list, current_value: object) -> int: ...


# ── Serialized field rendering ──────────────────────────────────────

def render_serialized_field(
    ctx: InfGUIContext,
    wid: str,
    display_name: str,
    metadata: object,
    current_value: Any,
    lw: float,
) -> Any:
    """Render a single serialized field and return the (possibly changed) value."""
    ...

def has_field_changed(field_type: str, old_value: Any, new_value: Any) -> bool:
    """Return ``True`` if *new_value* differs from *old_value*."""
    ...


# ── Inspector widgets ──────────────────────────────────────────────

def render_info_text(ctx: InfGUIContext, text: str) -> None:
    """Render a read-only informational text block."""
    ...

def render_component_header(
    ctx: InfGUIContext,
    type_name: str,
    *,
    icon_id: int = 0,
    show_enabled: bool = True,
    is_enabled: bool = True,
    suffix: str = "",
    default_open: bool = True,
    force_open: bool = False,
) -> Tuple[bool, bool]:
    """Render a collapsible component header.

    Returns:
        ``(is_open, is_enabled)`` — whether the section is expanded and
        the component toggle is checked.
    """
    ...

def render_inspector_checkbox(
    ctx: InfGUIContext, label: str, value: bool,
) -> bool:
    """Render a labelled checkbox and return the new value."""
    ...

def render_compact_section_header(
    ctx: InfGUIContext,
    label: str,
    *,
    icon_id: int = 0,
    default_open: bool = True,
    text_color: Optional[object] = None,
    level: str = "secondary",
    allow_overlap: bool = False,
) -> bool:
    """Render a compact collapsible section header. Returns ``True`` if open."""
    ...

def render_apply_revert(
    ctx: InfGUIContext,
    is_dirty: bool,
    on_apply: Callable,
    on_revert: Callable,
) -> None:
    """Render Apply / Revert buttons (greyed out when not dirty)."""
    ...

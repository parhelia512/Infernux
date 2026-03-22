"""theme — central colour/layout theme for the InfEngine Editor.

Provides ``Theme`` (a static collection of RGBA colour constants,
layout metrics, and style-push helpers) plus ImGui enum mirrors
(``ImGuiCol``, ``ImGuiWindowFlags``, etc.).

Usage::

    from InfEngine.engine.ui.theme import Theme, srgb_to_linear

    col = Theme.ACCENT          # (r, g, b, a) in linear space
    n = Theme.push_ghost_button_style(ctx)  # push N style vars
    # … render …
    ctx.pop_style_color(n)
"""

from __future__ import annotations

from typing import Iterable, Tuple


RGBA = Tuple[float, float, float, float]
"""Linear RGBA colour tuple ``(r, g, b, a)``."""


# ── Colour-space helpers ────────────────────────────────────────────

def srgb_to_linear(s: float) -> float:
    """Convert a single sRGB channel ``[0..1]`` to linear."""
    ...

def srgb3(r: float, g: float, b: float, a: float = 1.0) -> RGBA:
    """Build an RGBA tuple from sRGB 0-1 components."""
    ...

def hex_to_linear(hex_r: int, hex_g: int, hex_b: int, a: float = 1.0) -> RGBA:
    """Build an RGBA tuple from 0-255 hex-style integers."""
    ...


# ── ImGui enum mirrors ─────────────────────────────────────────────

class ImGuiCol:
    """Mirror of ``ImGuiCol_`` constants (integer IDs)."""

    Text: int
    TextDisabled: int
    WindowBg: int
    ChildBg: int
    PopupBg: int
    Border: int
    BorderShadow: int
    FrameBg: int
    FrameBgHovered: int
    FrameBgActive: int
    TitleBg: int
    TitleBgActive: int
    TitleBgCollapsed: int
    MenuBarBg: int
    ScrollbarBg: int
    ScrollbarGrab: int
    ScrollbarGrabHovered: int
    ScrollbarGrabActive: int
    CheckMark: int
    SliderGrab: int
    SliderGrabActive: int
    Button: int
    ButtonHovered: int
    ButtonActive: int
    Header: int
    HeaderHovered: int
    HeaderActive: int
    Separator: int
    SeparatorHovered: int
    SeparatorActive: int
    ResizeGrip: int
    ResizeGripHovered: int
    ResizeGripActive: int
    Tab: int
    TabHovered: int
    TabActive: int
    TabUnfocused: int
    TabUnfocusedActive: int
    DockingPreview: int
    DockingEmptyBg: int
    PlotLines: int
    PlotLinesHovered: int
    PlotHistogram: int
    PlotHistogramHovered: int
    TableHeaderBg: int
    TableBorderStrong: int
    TableBorderLight: int
    TableRowBg: int
    TableRowBgAlt: int
    TextSelectedBg: int
    DragDropTarget: int
    NavHighlight: int
    NavWindowingHighlight: int
    NavWindowingDimBg: int
    ModalWindowDimBg: int


class ImGuiWindowFlags:
    """Mirror of ``ImGuiWindowFlags_`` constants (bit flags)."""

    NoTitleBar: int
    NoResize: int
    NoMove: int
    NoScrollbar: int
    NoScrollWithMouse: int
    NoCollapse: int
    AlwaysAutoResize: int
    NoBackground: int
    NoSavedSettings: int
    NoMouseInputs: int
    MenuBar: int
    HorizontalScrollbar: int
    NoFocusOnAppearing: int
    NoBringToFrontOnFocus: int
    AlwaysVerticalScrollbar: int
    AlwaysHorizontalScrollbar: int
    NoNavInputs: int
    NoNavFocus: int
    NoDocking: int
    NoNav: int
    NoDecoration: int
    NoInputs: int


class ImGuiTreeNodeFlags:
    """Mirror of ``ImGuiTreeNodeFlags_`` constants (bit flags)."""

    Selected: int
    Framed: int
    AllowOverlap: int
    NoTreePushOnOpen: int
    NoAutoOpenOnLog: int
    DefaultOpen: int
    OpenOnDoubleClick: int
    OpenOnArrow: int
    Leaf: int
    Bullet: int
    FramePadding: int
    SpanAvailWidth: int
    SpanFullWidth: int
    SpanAllColumns: int


class ImGuiMouseCursor:
    """Mirror of ``ImGuiMouseCursor_`` constants."""

    Arrow: int
    TextInput: int
    ResizeAll: int
    ResizeNS: int
    ResizeEW: int
    ResizeNESW: int
    ResizeNWSE: int
    Hand: int
    NotAllowed: int


class ImGuiStyleVar:
    """Mirror of ``ImGuiStyleVar_`` constants."""

    Alpha: int
    DisabledAlpha: int
    WindowPadding: int
    WindowRounding: int
    WindowBorderSize: int
    WindowMinSize: int
    WindowTitleAlign: int
    ChildRounding: int
    ChildBorderSize: int
    PopupRounding: int
    PopupBorderSize: int
    FramePadding: int
    FrameRounding: int
    FrameBorderSize: int
    ItemSpacing: int
    ItemInnerSpacing: int
    IndentSpacing: int
    CellPadding: int
    ScrollbarSize: int
    ScrollbarRounding: int
    GrabMinSize: int
    GrabRounding: int
    TabRounding: int
    TabBorderSize: int
    TabBarBorderSize: int
    TabBarOverlineSize: int
    TableAngledHeadersAngle: int
    TableAngledHeadersTextAlign: int
    ButtonTextAlign: int
    SelectableTextAlign: int
    SeparatorTextBorderSize: int
    SeparatorTextAlign: int
    SeparatorTextPadding: int
    DockingSeparatorSize: int


# ── Theme ───────────────────────────────────────────────────────────

class Theme:
    """Central theme for the InfEngine Editor.

    All colour values are linear-space RGBA tuples.
    All ``push_*`` methods return the number of style items pushed;
    call ``ctx.pop_style_color(n)`` / ``ctx.pop_style_var(n)``
    with the returned value to restore.
    """

    # ── Text colours ──
    TEXT: RGBA
    TEXT_DIM: RGBA
    TEXT_BRIGHT: RGBA
    META_TEXT: RGBA
    ERROR_TEXT: RGBA
    WARNING_TEXT: RGBA
    SUCCESS_TEXT: RGBA
    LINK_TEXT: RGBA

    # ── Backgrounds ──
    BG_DARK: RGBA
    BG_MAIN: RGBA
    BG_PANEL: RGBA
    BG_POPUP: RGBA
    BG_HEADER: RGBA
    BG_SECTION: RGBA
    BG_CHILD: RGBA
    FRAME_BG: RGBA
    FRAME_BG_ACTIVE: RGBA

    # ── Borders ──
    BORDER: RGBA
    BORDER_LIGHT: RGBA
    SEPARATOR: RGBA

    # ── Buttons ──
    BUTTON: RGBA
    BUTTON_HOVER: RGBA
    BUTTON_ACTIVE: RGBA
    GHOST_BUTTON: RGBA
    GHOST_BUTTON_HOVER: RGBA
    GHOST_BUTTON_ACTIVE: RGBA

    # ── Headers ──
    HEADER: RGBA
    HEADER_HOVERED: RGBA
    HEADER_ACTIVE: RGBA

    # ── Selection / Highlight ──
    ACCENT: RGBA
    SELECTION_BG: RGBA
    SELECTION_OUTLINE: RGBA

    # ── Drag-Drop ──
    DRAG_DROP_TARGET: RGBA
    DRAG_DROP_BG: RGBA
    DRAG_DROP_OUTLINE: RGBA

    # ── Console / Log ──
    LOG_INFO: RGBA
    LOG_WARNING: RGBA
    LOG_ERROR: RGBA
    LOG_DEBUG: RGBA

    # ── Play Mode ──
    PLAY_MODE_BORDER: RGBA
    PLAY_MODE_PAUSED_BORDER: RGBA

    # ── Inspector layout ──
    INSPECTOR_LABEL_PAD: tuple
    INSPECTOR_MIN_LABEL_WIDTH: float
    INSPECTOR_HEADER_ITEM_SPC: tuple
    INSPECTOR_SECTION_PAD: tuple

    # ── Toolbar ──
    TOOLBAR_HEIGHT: float
    TOOLBAR_BUTTON_SIZE: tuple

    # ── Icon identifiers ──
    ICON_PLAY: str
    ICON_PAUSE: str
    ICON_STOP: str
    ICON_STEP: str

    # ── Window flags / conditions ──
    ALWAYS: int
    FIRST_USE: int
    APPEARING: int
    ONCE: int

    # ── Static helpers ──

    @staticmethod
    def push_ghost_button_style(ctx: object) -> int: ...
    @staticmethod
    def push_flat_button_style(
        ctx: object, r: float, g: float, b: float, a: float = 1.0,
    ) -> int: ...
    @staticmethod
    def push_toolbar_vars(ctx: object) -> int: ...
    @staticmethod
    def push_popup_vars(ctx: object) -> int: ...
    @staticmethod
    def push_status_bar_button_style(ctx: object) -> int: ...
    @staticmethod
    def push_transparent_border(ctx: object) -> int: ...
    @staticmethod
    def push_drag_drop_target_style(ctx: object) -> int: ...
    @staticmethod
    def push_console_toolbar_vars(ctx: object) -> int: ...
    @staticmethod
    def push_splitter_style(ctx: object) -> int: ...
    @staticmethod
    def push_selected_icon_style(ctx: object) -> int: ...
    @staticmethod
    def push_unselected_icon_style(ctx: object) -> int: ...
    @staticmethod
    def get_play_border_color(is_paused: bool) -> RGBA: ...
    @staticmethod
    def push_inline_button_style(
        ctx: object, active: bool = False,
    ) -> int: ...
    @staticmethod
    def render_inline_button_row(
        ctx: object,
        row_id: str,
        items: Iterable[tuple[str, str]],
        *,
        active_items: object = None,
        height: float = 0.0,
    ) -> None: ...

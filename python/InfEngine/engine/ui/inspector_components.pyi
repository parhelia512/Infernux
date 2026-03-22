"""inspector_components — component rendering dispatch and built-in renderers.

Usage::

    from InfEngine.engine.ui.inspector_components import (
        render_component,
        register_component_renderer,
    )

    register_component_renderer("MyComp", my_render_fn)
    render_component(ctx, comp)
"""

from __future__ import annotations

from InfEngine.lib import InfGUIContext


def register_component_renderer(type_name: str, render_fn: object) -> None:
    """Register a custom render function for a C++ component type."""
    ...

def register_component_extra_renderer(type_name: str, render_fn: object) -> None:
    """Register an *extra* section renderer appended below the main inspector."""
    ...

def register_py_component_renderer(type_name: str, render_fn: object) -> None:
    """Register a custom render function for a Python component type."""
    ...

def render_component(ctx: InfGUIContext, comp: object) -> None:
    """Render the full inspector UI for *comp* (dispatch to registered renderers)."""
    ...

def render_transform_component(ctx: InfGUIContext, trans: object) -> None:
    """Render the Transform component inspector (position / rotation / scale)."""
    ...

def render_builtin_via_setters(
    ctx: InfGUIContext, comp: object, wrapper_cls: type,
) -> None:
    """Generic renderer for C++ components with Python property wrappers."""
    ...

def render_cpp_component_generic(ctx: InfGUIContext, comp: object) -> None:
    """Fallback renderer for C++ components without a custom renderer."""
    ...

"""Component restoration — recreate Python components from C++ PendingPyComponent data.

All code paths (scene load, prefab instantiation, play-mode transitions)
funnel through :func:`restore_pending_py_components`.
"""

from __future__ import annotations

from typing import Any, Optional


def resolve_script_from_guid(
    script_guid: str,
    asset_database: Any = None,
) -> Optional[str]:
    """Resolve a script GUID to an absolute filesystem path.

    Args:
        script_guid: The GUID string assigned by the asset database.
        asset_database: Optional C++ ``AssetDatabase`` instance.

    Returns:
        Absolute path to the script file, or *None* if unresolvable.
    """
    ...

def create_component_instance(
    script_guid: str,
    type_name: str,
    asset_database: Any = None,
) -> tuple[Optional[Any], Optional[str]]:
    """Create a Python component instance from GUID / type name.

    Returns:
        ``(instance, script_path)`` — *instance* may be ``None`` if the
        script cannot be loaded.
    """
    ...

def restore_single_component(
    scene: Any,
    pc: Any,
    asset_database: Any = None,
) -> Optional[Any]:
    """Restore a single PendingPyComponent onto its GameObject.

    Args:
        scene: The active scene.
        pc: A ``PendingPyComponent`` record from C++.
        asset_database: Optional C++ ``AssetDatabase``.

    Returns:
        The restored component instance, or *None* on failure.
    """
    ...

def restore_pending_py_components(
    scene: Any,
    asset_database: Any = None,
) -> None:
    """Restore all pending Python components in *scene*.

    Args:
        scene: The active scene whose pending components should be restored.
        asset_database: Optional C++ ``AssetDatabase`` for GUID look-ups.
    """
    ...

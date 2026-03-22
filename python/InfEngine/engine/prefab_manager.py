"""
Prefab system for InfEngine.

Handles saving GameObjects as .prefab files and instantiating them back into scenes.
Prefab files contain the serialized JSON from GameObject.serialize(), wrapped in an
envelope with a prefab_version field.
"""

import json
import os
import copy

from InfEngine.debug import Debug

PREFAB_EXTENSION = ".prefab"
PREFAB_VERSION = 1


def _strip_prefab_runtime_fields(obj_data: dict):
    if not isinstance(obj_data, dict):
        return

    for comp in obj_data.get("components", []) or []:
        if isinstance(comp, dict):
            comp.pop("component_id", None)
            comp.pop("instance_guid", None)

    for py_comp in obj_data.get("py_components", []) or []:
        if not isinstance(py_comp, dict):
            continue
        py_comp.pop("component_id", None)
        py_comp.pop("instance_guid", None)
        py_fields = py_comp.get("py_fields")
        if isinstance(py_fields, dict):
            py_fields.pop("__component_id__", None)

    for child in obj_data.get("children", []) or []:
        _strip_prefab_runtime_fields(child)


def save_prefab(game_object, file_path: str, asset_database=None) -> bool:
    """Serialize a GameObject hierarchy to a .prefab file.

    Returns True on success, False on failure.
    """
    if game_object is None:
        Debug.log_warning("Cannot save prefab: no GameObject provided.")
        return False

    if not file_path.lower().endswith(PREFAB_EXTENSION):
        file_path += PREFAB_EXTENSION

    try:
        go_json_str = game_object.serialize()
        go_data = json.loads(go_json_str)
    except Exception as exc:
        Debug.log_error(f"Failed to serialize GameObject for prefab: {exc}")
        return False

    # Strip any existing prefab linkage and runtime-only IDs from the saved template.
    _strip_prefab_fields(go_data)
    _strip_prefab_runtime_fields(go_data)

    prefab_data = {
        "prefab_version": PREFAB_VERSION,
        "root_object": go_data,
    }

    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(prefab_data, f, indent=2, ensure_ascii=False)
    except OSError as exc:
        Debug.log_error(f"Failed to write prefab file: {exc}")
        return False

    if asset_database:
        try:
            guid = asset_database.import_asset(file_path)
            Debug.log_internal(f"Registered prefab: {os.path.basename(file_path)} -> {guid}")
        except Exception as exc:
            Debug.log_warning(f"Failed to register prefab in AssetDatabase: {exc}")

    Debug.log_internal(f"Prefab saved: {file_path}")
    return True


def instantiate_prefab(file_path: str = None, guid: str = None,
                       scene=None, parent=None, asset_database=None):
    """Instantiate a prefab into the active scene.

    Supply either *file_path* or *guid* (GUID is resolved via asset_database).
    Returns the root GameObject, or None on failure.
    """
    # Resolve path from GUID if needed
    resolved_guid = guid or ""
    if not file_path and guid and asset_database:
        file_path = asset_database.get_path_from_guid(guid)

    if not file_path or not os.path.isfile(file_path):
        Debug.log_warning(f"Prefab file not found: {file_path}")
        return None

    # If we have a path but no GUID, try to resolve GUID from the asset database
    if not resolved_guid and asset_database:
        try:
            resolved_guid = asset_database.get_guid_from_path(file_path) or ""
        except Exception:
            resolved_guid = ""

    if scene is None:
        from InfEngine.lib import SceneManager
        scene = SceneManager.instance().get_active_scene()
    if scene is None:
        Debug.log_warning("No active scene — cannot instantiate prefab.")
        return None

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            prefab_data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        Debug.log_error(f"Failed to read prefab file: {exc}")
        return None

    root_obj_data = prefab_data.get("root_object")
    if root_obj_data is None:
        Debug.log_error("Invalid prefab file: missing 'root_object'.")
        return None

    # Validate prefab version — reject files from incompatible future versions
    file_version = prefab_data.get("prefab_version", 0)
    if file_version > PREFAB_VERSION:
        Debug.log_error(
            f"Prefab '{file_path}' uses version {file_version} but this "
            f"engine only supports up to version {PREFAB_VERSION}. "
            f"Please update InfEngine."
        )
        return None
    if file_version < 1:
        Debug.log_warning(
            f"Prefab '{file_path}' has no version tag — treating as v1."
        )

    root_obj_data = copy.deepcopy(root_obj_data)
    _strip_prefab_runtime_fields(root_obj_data)

    # Stamp prefab linkage into the JSON before instantiation
    if resolved_guid:
        _stamp_prefab_guid(root_obj_data, resolved_guid)

    # Use C++ InstantiateFromJson — creates fresh IDs and collects pending py_components
    go_json_str = json.dumps(root_obj_data)
    new_obj = scene.instantiate_from_json(go_json_str, parent)
    if new_obj is None:
        Debug.log_error("Failed to instantiate prefab from JSON.")
        return None

    # Restore Python components that were collected as pending
    try:
        _restore_pending_py_components(scene, asset_database)
    except Exception as exc:
        Debug.log_error(f"Failed to restore prefab Python components: {exc}")

    return new_obj


def _stamp_prefab_guid(obj_data: dict, guid: str, is_root: bool = True):
    """Recursively stamp prefab_guid (and prefab_root on root) into JSON data."""
    obj_data["prefab_guid"] = guid
    if is_root:
        obj_data["prefab_root"] = True
    for child in obj_data.get("children", []):
        _stamp_prefab_guid(child, guid, is_root=False)


def _strip_prefab_fields(obj_data: dict):
    """Recursively remove prefab_guid/prefab_root so the template is clean."""
    obj_data.pop("prefab_guid", None)
    obj_data.pop("prefab_root", None)
    for child in obj_data.get("children", []):
        _strip_prefab_fields(child)


def _restore_pending_py_components(scene, asset_database=None):
    """Restore any pending Python components after prefab instantiation."""
    from InfEngine.engine.component_restore import restore_pending_py_components
    restore_pending_py_components(scene, asset_database=asset_database)

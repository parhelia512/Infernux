"""
SceneSaveMixin for strict, durable scene persistence.

Handles:
- Tracking the current scene file path (.scene)
- Saving / loading scene files (delegates to C++ Scene::SaveToFile / LoadFromFile)
- Python component serialization during save, recreation during load
- Remembering last opened scene per project (EditorSettings.json)
- Default scene fallback when a scene file is missing
- File-dialog for "Save As" when the scene has no file yet
- Enforcing that scenes must be saved under Assets/

The C++ layer already provides ``Scene.serialize / deserialize / save_to_file /
load_from_file`` and ``PendingPyComponent`` for Python component recreation.
This module orchestrates those primitives into a complete workflow.
"""
from __future__ import annotations

import os
from typing import Optional, Callable

from Infernux.debug import Debug
from Infernux.engine.project_context import get_project_root
from Infernux.engine.path_utils import safe_path as _safe_path
from .scene_manager import (
    SCENE_EXTENSION,
    DEFAULT_SCENE_FILE_BASE,
    _effective_project_root,
    _show_save_dialog,
    _load_editor_settings,
    _save_editor_settings,
    _get_scene_root_objects,
)


class SceneSaveMixin:
    """SceneSaveMixin method group for SceneFileManager."""

    def save_current_scene(self) -> bool:
        """Save the current scene.  If no file is associated, show a Save-As dialog.

        Returns True if the save happened synchronously, False if a dialog was
        opened (the actual save happens asynchronously via the dialog callback).
        """
        if self._is_play_mode():
            Debug.log_warning("Cannot save scene while in Play mode.")
            return False

        # In Prefab Mode, Ctrl+S is ignored — prefab auto-saves on exit.
        if self.is_prefab_mode:
            return False

        if self._current_scene_path:
            return self._do_save(self._current_scene_path)

        # No file yet — show a Save As dialog
        self._show_save_as_dialog()
        return False

    def _save_prefab(self) -> bool:
        """Save the currently-edited prefab in Prefab Mode."""
        if not self.prefab_mode_path:
            Debug.log_warning("No prefab path in Prefab Mode.")
            return False

        from Infernux.lib import SceneManager
        from Infernux.engine.prefab_manager import save_prefab

        scene = SceneManager.instance().get_active_scene()
        roots = _get_scene_root_objects(scene)
        if not roots:
            Debug.log_warning("No root objects in Prefab Mode scene.")
            return False

        source_canvas_name = ""
        if isinstance(self.prefab_envelope, dict):
            source_canvas_name = self.prefab_envelope.get("source_canvas_name", "")
        if not save_prefab(
            roots[0],
            self.prefab_mode_path,
            asset_database=self._asset_database,
            source_canvas_name=source_canvas_name,
        ):
            return False

        self._dirty = False
        Debug.log_internal(f"Prefab saved: {self.prefab_mode_path}")
        return True

    def save_scene_as(self):
        """Force a Save-As dialog regardless of whether a path exists."""
        if self._is_play_mode():
            Debug.log_warning("Cannot save scene while in Play mode.")
            return
        self._show_save_as_dialog()

    def _do_save(self, path: str) -> bool:
        """Actually write the scene to *path*."""
        from Infernux.engine.ui.engine_status import EngineStatus
        ok = self._do_save_inner(path)
        if ok:
            EngineStatus.flash("保存完成 Saved", 1.0, duration=1.5)
        else:
            EngineStatus.flash("保存失败 Save Failed", 0.0, duration=2.0)
        return ok

    def _do_save_inner(self, path: str) -> bool:
        """Internal save implementation.

        Serializes the scene on the main thread, then durably replaces the file
        synchronously. The future DocumentStore will own background writes,
        generation ordering, coalescing, and shutdown drain as one contract.
        """
        if not self._is_under_assets(path):
            Debug.log_warning("Cannot save scene outside of Assets/ directory.")
            return False

        # Ensure .scene extension
        if not path.lower().endswith(SCENE_EXTENSION):
            path += SCENE_EXTENSION

        from Infernux.lib import SceneManager
        sm = SceneManager.instance()
        scene = sm.get_active_scene()
        if not scene:
            Debug.log_warning("No active scene to save.")
            return False

        # Step 1 (main thread): serialize scene graph → JSON string
        try:
            json_str = scene.serialize()
        except Exception as exc:
            Debug.log_error(f"Failed to serialize scene: {exc}")
            return False

        if not json_str:
            Debug.log_error("Scene serialization returned empty data.")
            return False

        # Step 2: durably replace the scene file. The old daemon+immediate-join
        # path was synchronous in practice and could outlive a timeout.
        abs_path = os.path.abspath(path)
        try:
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)
            from Infernux.core.document_store import DocumentStore
            DocumentStore.instance().write_and_wait(abs_path, json_str)
        except (OSError, RuntimeError) as exc:
            Debug.log_error(f"Failed to write scene file: {exc}")
            return False

        self._current_scene_path = abs_path
        self._dirty = False

        # Notify undo system of clean state
        from Infernux.engine.undo import UndoManager
        mgr = UndoManager.instance()
        if mgr:
            mgr.mark_save_point()

        # Update scene name to match file
        scene.name = os.path.splitext(os.path.basename(path))[0]

        # Persist editor camera state for this scene
        self._save_camera_state(self._current_scene_path)

        self._remember_last_scene(self._current_scene_path)
        Debug.log_internal(f"Scene saved: {path}")
        return True

    def _default_scene_save_path(self) -> Optional[str]:
        """Return a unique default scene path under Assets/ for untitled saves."""
        root = _effective_project_root()
        if not root:
            return None

        assets_dir = os.path.join(root, "Assets")
        os.makedirs(assets_dir, exist_ok=True)

        base_name = DEFAULT_SCENE_FILE_BASE
        candidate = os.path.join(assets_dir, f"{base_name}{SCENE_EXTENSION}")
        if not os.path.exists(candidate):
            return candidate

        index = 1
        while True:
            candidate = os.path.join(assets_dir, f"{base_name} {index}{SCENE_EXTENSION}")
            if not os.path.exists(candidate):
                return candidate
            index += 1

    def _show_save_as_dialog(self):
        """Open a file dialog (on a background thread)."""
        root = _effective_project_root()
        if not root:
            Debug.log_warning("No project root set — cannot save scene.")
            return

        assets_dir = os.path.join(root, "Assets")
        os.makedirs(assets_dir, exist_ok=True)

        def _on_result(chosen_path: Optional[str]):
            if chosen_path:
                # Validate under Assets/
                if self._is_under_assets(chosen_path):
                    self._pending_save_path = chosen_path
                else:
                    Debug.log_warning("Scene must be saved under Assets/ directory.")
                    self._pending_save_path = ""  # cancel sentinel
            else:
                self._pending_save_path = ""  # cancel sentinel

        if self._current_scene_path:
            default_filename = os.path.basename(self._current_scene_path)
        else:
            default_filename = f"{DEFAULT_SCENE_FILE_BASE}{SCENE_EXTENSION}"
        _show_save_dialog(assets_dir, _on_result, default_filename)

    def _is_under_assets(self, path: str) -> bool:
        """Check if *path* is within the project's Assets/ directory."""
        root = _effective_project_root()
        if not root:
            return False
        assets = os.path.normcase(os.path.abspath(os.path.join(root, "Assets")))
        target = os.path.normcase(os.path.abspath(path))
        return target.startswith(assets + os.sep) or target == assets

    def _remember_last_scene(self, path: str):
        settings = _load_editor_settings()
        settings["lastOpenedScene"] = path
        _save_editor_settings(settings)


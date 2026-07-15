"""SceneConfirmationMixin — extracted from SceneFileManager."""
from __future__ import annotations

"""
Scene file management for Infernux.

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

import os
import json
import threading
from typing import Optional, Callable

from Infernux.debug import Debug
from Infernux.engine.project_context import get_project_root
from Infernux.engine.path_utils import safe_path as _safe_path


class SceneConfirmationMixin:
    """SceneConfirmationMixin method group for SceneFileManager."""

    def _request_save_confirmation(self, action: str, open_path: Optional[str] = None):
        """Set up the confirmation popup state."""
        self._pending_action = action
        self._pending_open_path = open_path
        self._show_confirm = True

    def _execute_pending_action(self) -> bool:
        """Run the action that was deferred by the confirmation dialog."""
        action = self._pending_action
        path = self._pending_open_path
        self._pending_action = None
        self._pending_open_path = None

        if action == 'new':
            self._begin_deferred_new()
            return True
        elif action == 'open' and path:
            self._begin_deferred_open(path)
            return True
        elif action == 'close' and self._engine:
            self._engine.confirm_close()
            return True
        elif action == 'close':
            native = self._native_engine_for_close()
            if native:
                native.confirm_close()
                return True
        return False

    def _clear_pending_action(self):
        self._pending_action = None
        self._pending_open_path = None

    def render_confirmation_popup(self, ctx):
        """Must be called every frame (by menu_bar).

        Draws the modal "Save before …?" dialog when ``_show_confirm`` is set.
        """
        from Infernux.engine.i18n import t
        from Infernux.engine.ui.unsaved_changes_dialog import render_unsaved_changes_dialog

        POPUP_ID = "Unsaved Changes###scene_save_confirm"

        if not self._show_confirm and self._pending_action is None:
            return

        choice = render_unsaved_changes_dialog(
            ctx,
            popup_id=POPUP_ID,
            semantic_prefix="scene.confirm",
            document_title=t("editor.unsaved.scene"),
            action="exit" if self._pending_action == "close" else "close",
            request_open=self._show_confirm,
        )
        self._show_confirm = False

        if choice == "save":
            if self._current_scene_path:
                action = self._pending_action
                if self._do_save(self._current_scene_path):
                    if not self._execute_pending_action():
                        native = self._native_engine_for_close()
                        if native and action == 'close':
                            native.confirm_close()
                else:
                    native = self._native_engine_for_close()
                    if self._pending_action == 'close' and native:
                        native.cancel_close()
                    self._close_in_progress = False
                    self._clear_pending_action()
            else:
                self._post_save_callback = self._execute_pending_action
                self._show_save_as_dialog()
        elif choice == "discard":
            self._execute_pending_action()
        elif choice == "cancel":
            native = self._native_engine_for_close()
            if self._pending_action == 'close' and native:
                native.cancel_close()
            self._close_in_progress = False
            self._clear_pending_action()

    def poll_pending_save(self):
        """Check if the file dialog has produced a result and perform the save."""
        if self._pending_save_path is not None:
            path = self._pending_save_path
            self._pending_save_path = None  # consume
            if path:
                success = self._do_save(path)
                if success and self._post_save_callback:
                    cb = self._post_save_callback
                    self._post_save_callback = None
                    cb()
                elif not success:
                    # Save failed — cancel pending close/open/new chain so user can retry.
                    if self._post_save_callback is not None:
                        if self._pending_action == 'close' and self._engine:
                            self._engine.cancel_close()
                        self._close_in_progress = False
                        self._clear_pending_action()
                    self._post_save_callback = None
            else:
                # User cancelled the Save As dialog — cancel pending close/open/new chain.
                if self._post_save_callback is not None:
                    if self._pending_action == 'close' and self._engine:
                        self._engine.cancel_close()
                    self._close_in_progress = False
                    self._clear_pending_action()
                self._post_save_callback = None


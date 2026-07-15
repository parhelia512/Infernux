"""Editor-owned Save As modal shared by asset authoring panels."""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Optional

from Infernux.debug import Debug
from Infernux.engine.project_context import get_project_root
from Infernux.engine.ui._dialogs import is_synthetic_input_frame, save_file_dialog


class AssetSaveAsDialog:
    """Persist an asset below ``Assets/`` through visible Editor controls."""

    def __init__(self, semantic_prefix: str, asset_label: str) -> None:
        self._semantic_prefix = semantic_prefix
        self._asset_label = asset_label
        self._title = "Save Asset"
        self._extension = ""
        self._project_root = ""
        self._current_path = ""
        self._folder = "Assets"
        self._name = ""
        self._error = ""
        self._open = False
        self._requested = False
        self._focus_name = False
        self._agent_modal = False
        self._native_dialog_pending = False

    @property
    def is_open(self) -> bool:
        return self._open or self._native_dialog_pending

    @property
    def folder(self) -> str:
        return self._folder

    @folder.setter
    def folder(self, value: str) -> None:
        self._folder = str(value or "")

    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, value: str) -> None:
        self._name = str(value or "")

    def request(
        self,
        *,
        title: str,
        extension: str,
        default_name: str,
        current_path: str = "",
        project_root: Optional[str] = None,
    ) -> bool:
        raw_root = project_root or get_project_root()
        if not raw_root:
            return False
        root = os.path.abspath(raw_root)

        normalized_extension = str(extension or "").strip().lstrip(".")
        if not normalized_extension:
            raise ValueError("extension must be non-empty")

        self._title = str(title or "Save Asset")
        self._extension = normalized_extension
        self._project_root = root
        self._current_path = os.path.normcase(os.path.abspath(current_path)) if current_path else ""
        self._folder = "Assets"
        self._name = self._strip_extension(default_name)
        self._error = ""
        self._agent_modal = is_synthetic_input_frame()
        self._open = self._agent_modal
        self._requested = self._agent_modal
        self._focus_name = self._agent_modal
        self._native_dialog_pending = not self._agent_modal
        return True

    def resolve_path(self) -> tuple[str, str]:
        """Return the requested absolute asset path, or a validation error."""
        if not self._project_root:
            return "", "No project root is available."

        folder = self._folder.strip().replace("\\", "/") or "Assets"
        if os.path.isabs(folder):
            return "", "Folder must be a project-relative path under Assets."

        target_folder = os.path.abspath(os.path.join(self._project_root, folder))
        assets_root = os.path.normcase(os.path.realpath(os.path.join(self._project_root, "Assets")))
        target_real = os.path.normcase(os.path.realpath(target_folder))
        try:
            if os.path.commonpath((assets_root, target_real)) != assets_root:
                return "", "Assets must be saved under the project's Assets directory."
        except ValueError:
            return "", "Assets must be saved under the project's Assets directory."

        name = self._strip_extension(self._name)
        if not name:
            return "", f"Enter a {self._asset_label} name."
        if name != os.path.basename(name) or any(ch in name for ch in '<>:"/\\|?*'):
            return "", f"{self._asset_label.capitalize()} name contains an invalid path or filename character."

        return self._validate_path(os.path.join(target_folder, f"{name}.{self._extension}"))

    def _validate_path(self, path: str) -> tuple[str, str]:
        """Normalize and validate an absolute target chosen by either workflow."""
        if not self._project_root:
            return "", "No project root is available."

        target = os.path.abspath(str(path or ""))
        suffix = f".{self._extension}"
        if not target.lower().endswith(suffix.lower()):
            target += suffix

        assets_root = os.path.normcase(os.path.realpath(os.path.join(self._project_root, "Assets")))
        target_real = os.path.normcase(os.path.realpath(target))
        try:
            if os.path.commonpath((assets_root, target_real)) != assets_root:
                return "", "Assets must be saved under the project's Assets directory."
        except ValueError:
            return "", "Assets must be saved under the project's Assets directory."

        name = os.path.basename(target[: -len(suffix)])
        if not name or any(ch in name for ch in '<>:"/\\|?*'):
            return "", f"{self._asset_label.capitalize()} name contains an invalid path or filename character."
        return target, ""

    def render(
        self,
        ctx,
        save_callback: Callable[[str], bool],
        cancel_callback: Optional[Callable[[], None]] = None,
    ) -> None:
        """Render the modal and call *save_callback* after validation."""
        if self._native_dialog_pending:
            self._native_dialog_pending = False
            self._save_with_native_dialog(save_callback, cancel_callback)
            return

        if not self._open:
            return

        popup_id = f"{self._title}###{self._semantic_prefix.replace('.', '_')}"
        if self._requested:
            ctx.open_popup(popup_id)
            self._requested = False

        # ImGuiWindowFlags_AlwaysAutoResize = 1 << 6 = 64.
        if not ctx.begin_popup_modal(popup_id, 64):
            return

        ctx.record_semantic_window("modal", self._title, f"{self._semantic_prefix}.dialog")
        ctx.label(f"Save this {self._asset_label} under the project's Assets directory.")
        ctx.spacing()

        self._folder = ctx.text_input(
            f"Folder##{self._semantic_prefix}_folder", self._folder, 512
        )
        ctx.record_semantic_item("text_input", "Folder", True, f"{self._semantic_prefix}.folder")
        if self._focus_name:
            ctx.set_keyboard_focus_here()
            self._focus_name = False
        self._name = ctx.text_input(
            f"Name##{self._semantic_prefix}_name", self._name, 256
        )
        ctx.record_semantic_item("text_input", "Name", True, f"{self._semantic_prefix}.name")

        if self._error:
            ctx.spacing()
            ctx.text_wrapped(self._error)

        ctx.spacing()
        ctx.separator()
        ctx.spacing()

        def _save() -> None:
            path, error = self.resolve_path()
            if error:
                self._error = error
                return
            if not self._save_path(path, save_callback):
                self._error = self._error or f"The {self._asset_label} could not be saved. Check the Console for details."
                return
            self._close(ctx)

        def _cancel() -> None:
            if cancel_callback is not None:
                cancel_callback()
            self._close(ctx)

        ctx.button("Save##asset_save_as_confirm", _save)
        ctx.record_semantic_item("button", "Save", True, f"{self._semantic_prefix}.confirm")
        ctx.same_line()
        ctx.button("Cancel##asset_save_as_cancel", _cancel)
        ctx.record_semantic_item("button", "Cancel", True, f"{self._semantic_prefix}.cancel")
        ctx.end_popup()

    def _save_with_native_dialog(
        self,
        save_callback: Callable[[str], bool],
        cancel_callback: Optional[Callable[[], None]],
    ) -> None:
        assets_dir = os.path.join(self._project_root, "Assets")
        default_filename = f"{self._strip_extension(self._name)}.{self._extension}"
        label = self._asset_label.capitalize()
        path = save_file_dialog(
            title=self._title,
            win32_filter=f"{label} (*.{self._extension})\0*.{self._extension}\0\0",
            initial_dir=assets_dir,
            default_filename=default_filename,
            default_ext=self._extension,
            tk_filetypes=[(f"{label} (*.{self._extension})", f"*.{self._extension}")],
        )
        if not path:
            if cancel_callback is not None:
                cancel_callback()
            return

        path, error = self._validate_path(path)
        if error:
            Debug.log_warning(f"[AssetSaveAsDialog] {error}")
            return
        self._save_path(path, save_callback)

    def _save_path(self, path: str, save_callback: Callable[[str], bool]) -> bool:
        normalized_path = os.path.normcase(os.path.abspath(path))
        if os.path.exists(path) and normalized_path != self._current_path:
            self._error = "An asset already exists at this location. Choose another name to avoid overwriting it."
            Debug.log_warning(f"[AssetSaveAsDialog] {self._error}")
            return False
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            saved = bool(save_callback(path))
        except Exception as exc:
            Debug.log_warning(f"[AssetSaveAsDialog] Save failed: {exc}")
            saved = False
        if not saved:
            self._error = f"The {self._asset_label} could not be saved. Check the Console for details."
        return saved

    def _strip_extension(self, value: str) -> str:
        name = str(value or "").strip()
        suffix = f".{self._extension}" if self._extension else ""
        if suffix and name.lower().endswith(suffix.lower()):
            name = name[: -len(suffix)]
        return name

    def _close(self, ctx) -> None:
        self._open = False
        self._requested = False
        self._focus_name = False
        self._agent_modal = False
        self._native_dialog_pending = False
        self._error = ""
        ctx.close_current_popup()

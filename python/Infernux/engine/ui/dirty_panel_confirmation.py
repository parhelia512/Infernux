"""Non-blocking Editor confirmation for dirty authoring panels."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Optional

from Infernux.debug import Debug


class DirtyPanelConfirmationCoordinator:
    """Serialize panel save/discard/cancel decisions through one ImGui modal."""

    _instance: Optional["DirtyPanelConfirmationCoordinator"] = None

    def __init__(self) -> None:
        self._scope = ""
        self._panel_id = ""
        self._handled_ids: set[str] = set()
        self._active_entry: Optional[dict[str, Any]] = None
        self._on_complete: Optional[Callable[[], None]] = None
        self._on_cancel: Optional[Callable[[], None]] = None
        self._show_popup = False
        self._waiting_for_save = False
        self._error = ""

    @classmethod
    def instance(cls) -> "DirtyPanelConfirmationCoordinator":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def is_active(self) -> bool:
        return bool(self._scope)

    @property
    def active_panel_id(self) -> str:
        return str((self._active_entry or {}).get("panel_id") or "")

    @property
    def waiting_for_save(self) -> bool:
        return self._waiting_for_save

    def request_exit(
        self,
        on_complete: Callable[[], None],
        on_cancel: Callable[[], None],
    ) -> bool:
        """Begin a global close transaction, superseding a panel-only prompt."""
        if self.is_active:
            if self._scope == "exit":
                return False
            self._reset(notify_cancel=True)
        self._begin("exit", "", on_complete, on_cancel)
        return True

    def request_panel_close(
        self,
        panel_id: str,
        on_complete: Callable[[], None],
        on_cancel: Optional[Callable[[], None]] = None,
    ) -> bool:
        """Begin a titlebar-close transaction for one panel."""
        identifier = str(panel_id or "").strip()
        if not identifier or self.is_active:
            return False
        self._begin("panel", identifier, on_complete, on_cancel)
        return True

    def render(self, ctx) -> None:
        """Poll asynchronous saves and render the current Editor modal."""
        if not self.is_active:
            return
        if self._waiting_for_save:
            self._poll_save()
        if not self.is_active or self._waiting_for_save:
            return

        entry = self._active_entry
        if entry is None:
            self._advance()
            entry = self._active_entry
        if entry is None:
            return
        if not self._entry_is_dirty(entry):
            self._resolve_active()
            entry = self._active_entry
            if entry is None:
                return

        popup_id = "Unsaved Panel Changes###editor_dirty_panel_confirm"
        if self._show_popup:
            ctx.open_popup(popup_id)
            self._show_popup = False
        if not ctx.begin_popup_modal(popup_id, 64):
            return

        title = str(entry.get("title") or entry.get("panel_id") or "Panel")
        ctx.record_semantic_window("modal", "Unsaved Panel Changes", "editor.dirty_panel.dialog")
        ctx.label(f"{title} has unsaved changes.")
        ctx.label("Save before closing?" if self._scope == "panel" else "Save before exiting?")
        if self._error:
            ctx.spacing()
            ctx.text_wrapped(self._error)
        ctx.spacing()
        ctx.separator()
        ctx.spacing()

        def _save() -> None:
            self.choose_save()
            ctx.close_current_popup()

        def _discard() -> None:
            self.choose_discard()
            ctx.close_current_popup()

        def _cancel() -> None:
            self.choose_cancel()
            ctx.close_current_popup()

        ctx.button("Save##dirty_panel_save", _save)
        ctx.record_semantic_item("button", "Save", True, "editor.dirty_panel.save")
        ctx.same_line()
        ctx.button("Discard##dirty_panel_discard", _discard)
        ctx.record_semantic_item("button", "Discard", True, "editor.dirty_panel.discard")
        ctx.same_line()
        ctx.button("Cancel##dirty_panel_cancel", _cancel)
        ctx.record_semantic_item("button", "Cancel", True, "editor.dirty_panel.cancel")
        ctx.end_popup()

    def choose_save(self) -> None:
        entry = self._active_entry
        if entry is None:
            return
        save_handler = entry.get("save_handler")
        if not callable(save_handler):
            self._error = "This panel does not provide a save action."
            self._show_popup = True
            return
        try:
            save_handler()
        except Exception as exc:
            Debug.log_suppressed(
                f"DirtyPanelConfirmation.save[{self.active_panel_id}]", exc
            )
            self._error = "The panel could not be saved. Check the Console for details."
            self._show_popup = True
            return

        if not self._entry_is_dirty(entry):
            self._resolve_active()
            return
        if self._entry_save_pending(entry):
            self._waiting_for_save = True
            self._error = ""
            return
        self._error = "The save was cancelled or failed."
        self._show_popup = True

    def choose_discard(self) -> None:
        entry = self._active_entry
        if entry is None:
            return
        # A global discard applies only to this close transaction. If a later
        # scene confirmation is cancelled, the still-open panel must remain
        # dirty instead of silently treating its in-memory edits as saved.
        if self._scope == "panel":
            discard_handler = entry.get("discard_handler")
            if not callable(discard_handler):
                self._error = "This panel cannot discard its unsaved changes safely."
                self._show_popup = True
                return
            try:
                discard_handler()
            except Exception as exc:
                Debug.log_suppressed(
                    f"DirtyPanelConfirmation.discard[{self.active_panel_id}]", exc
                )
                self._error = "The panel could not discard its unsaved changes."
                self._show_popup = True
                return
            if self._entry_is_dirty(entry):
                self._error = "The panel is still dirty after the discard action."
                self._show_popup = True
                return
        self._resolve_active()

    def choose_cancel(self) -> None:
        self._reset(notify_cancel=True)

    def _begin(
        self,
        scope: str,
        panel_id: str,
        on_complete: Callable[[], None],
        on_cancel: Optional[Callable[[], None]],
    ) -> None:
        self._scope = scope
        self._panel_id = panel_id
        self._handled_ids.clear()
        self._active_entry = None
        self._on_complete = on_complete
        self._on_cancel = on_cancel
        self._show_popup = False
        self._waiting_for_save = False
        self._error = ""
        self._advance()

    def _advance(self) -> None:
        from Infernux.engine.project_context import get_dirty_panel_entries

        entries = list(get_dirty_panel_entries())
        if self._scope == "panel":
            entries = [
                entry
                for entry in entries
                if str(entry.get("panel_id") or "") == self._panel_id
            ]
        else:
            entries = [
                entry
                for entry in entries
                if str(entry.get("panel_id") or "") not in self._handled_ids
            ]

        if entries:
            self._active_entry = entries[0]
            self._show_popup = True
            self._waiting_for_save = False
            self._error = ""
            return

        callback = self._on_complete
        self._reset(notify_cancel=False)
        self._invoke(callback, "complete")

    def _resolve_active(self) -> None:
        panel_id = self.active_panel_id
        if panel_id:
            self._handled_ids.add(panel_id)
        self._active_entry = None
        self._waiting_for_save = False
        self._error = ""
        self._advance()

    def _poll_save(self) -> None:
        entry = self._active_entry
        if entry is None:
            self._waiting_for_save = False
            self._advance()
            return
        if not self._entry_is_dirty(entry):
            self._resolve_active()
            return
        if self._entry_save_pending(entry):
            return
        self._waiting_for_save = False
        self._error = "The save was cancelled or failed."
        self._show_popup = True

    @staticmethod
    def _entry_is_dirty(entry: dict[str, Any]) -> bool:
        from Infernux.engine.project_context import is_panel_dirty

        return is_panel_dirty(str(entry.get("panel_id") or ""))

    @staticmethod
    def _entry_save_pending(entry: dict[str, Any]) -> bool:
        handler = entry.get("save_pending_handler")
        if not callable(handler):
            return False
        try:
            return bool(handler())
        except Exception as exc:
            Debug.log_suppressed("DirtyPanelConfirmation.save_pending", exc)
            return False

    def _reset(self, *, notify_cancel: bool) -> None:
        callback = self._on_cancel if notify_cancel else None
        self._scope = ""
        self._panel_id = ""
        self._handled_ids.clear()
        self._active_entry = None
        self._on_complete = None
        self._on_cancel = None
        self._show_popup = False
        self._waiting_for_save = False
        self._error = ""
        self._invoke(callback, "cancel")

    @staticmethod
    def _invoke(callback: Optional[Callable[[], None]], action: str) -> None:
        if not callable(callback):
            return
        try:
            callback()
        except Exception as exc:
            Debug.log_suppressed(f"DirtyPanelConfirmation.{action}", exc)

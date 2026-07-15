"""Editor-owned confirmation for Project asset deletion."""

from __future__ import annotations

import os
from collections.abc import Callable, Iterable
from typing import Optional

from Infernux.debug import Debug


class ProjectDeleteConfirmationCoordinator:
    """Confirm destructive Project operations without opening an OS dialog."""

    _instance: Optional["ProjectDeleteConfirmationCoordinator"] = None

    def __init__(self) -> None:
        self._paths: tuple[str, ...] = ()
        self._delete_handler: Optional[Callable[[list[str]], bool]] = None
        self._requested = False
        self._error = ""

    @classmethod
    def instance(cls) -> "ProjectDeleteConfirmationCoordinator":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def is_active(self) -> bool:
        return bool(self._paths)

    @property
    def paths(self) -> tuple[str, ...]:
        return self._paths

    def request(
        self,
        paths: Iterable[str],
        delete_handler: Callable[[list[str]], bool],
    ) -> bool:
        if self.is_active or not callable(delete_handler):
            return False
        unique: list[str] = []
        seen: set[str] = set()
        for value in paths:
            path = os.path.abspath(str(value or ""))
            key = os.path.normcase(path)
            if not value or key in seen or not os.path.exists(path):
                continue
            seen.add(key)
            unique.append(path)
        if not unique:
            return False
        self._paths = tuple(unique)
        self._delete_handler = delete_handler
        self._requested = True
        self._error = ""
        return True

    def render(self, ctx) -> None:
        if not self.is_active:
            return

        popup_id = "Delete Assets###project_delete_confirm"
        if self._requested:
            ctx.open_popup(popup_id)
            self._requested = False
        if not ctx.begin_popup_modal(popup_id, 64):
            return

        ctx.record_semantic_window("modal", "Delete Assets", "project.delete.dialog")
        if len(self._paths) == 1:
            ctx.text_wrapped(f"Delete '{os.path.basename(self._paths[0])}' permanently?")
        else:
            ctx.text_wrapped(f"Delete {len(self._paths)} selected assets permanently?")
        ctx.text_wrapped("This operation cannot be undone.")
        if self._error:
            ctx.spacing()
            ctx.text_wrapped(self._error)
        ctx.spacing()
        ctx.separator()
        ctx.spacing()

        ctx.button("Delete##project_delete_confirm", lambda: self._confirm(ctx))
        ctx.record_semantic_item("button", "Delete", True, "project.delete.confirm")
        ctx.same_line()
        ctx.button("Cancel##project_delete_cancel", lambda: self._cancel(ctx))
        ctx.record_semantic_item("button", "Cancel", True, "project.delete.cancel")
        ctx.end_popup()

    def _confirm(self, ctx) -> None:
        handler = self._delete_handler
        if handler is None:
            self._error = "The delete operation is no longer available."
            return
        try:
            deleted = bool(handler(list(self._paths)))
        except Exception as exc:
            Debug.log_error(f"Project asset deletion failed: {exc}")
            deleted = False
        if not deleted:
            self._error = "One or more assets could not be deleted. Check the Console for details."
            return
        self._close(ctx)

    def _cancel(self, ctx) -> None:
        self._close(ctx)

    def _close(self, ctx) -> None:
        self._paths = ()
        self._delete_handler = None
        self._requested = False
        self._error = ""
        ctx.close_current_popup()

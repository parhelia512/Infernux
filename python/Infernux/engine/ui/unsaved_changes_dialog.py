"""Shared presentation for unsaved editor documents."""

from __future__ import annotations

from typing import Optional

from Infernux.engine.i18n import t
from .theme import Theme


def render_unsaved_changes_dialog(
    ctx,
    *,
    popup_id: str,
    semantic_prefix: str,
    document_title: str,
    action: str,
    error: str = "",
    request_open: bool = False,
) -> Optional[str]:
    """Render the standard unsaved-document modal and return a chosen action."""
    if request_open:
        ctx.open_popup(popup_id)

    viewport_x, viewport_y, viewport_w, viewport_h = ctx.get_main_viewport_bounds()
    ctx.set_next_window_pos(
        viewport_x + viewport_w * 0.5,
        viewport_y + viewport_h * 0.5,
        Theme.COND_ALWAYS,
        0.5,
        0.5,
    )
    if not ctx.begin_popup_modal(popup_id, 64):
        return None

    dialog_title = t("editor.unsaved.title")
    ctx.record_semantic_window("modal", dialog_title, f"{semantic_prefix}.dialog")
    ctx.label(t("editor.unsaved.message").format(document=document_title))
    question_key = "editor.unsaved.before_exit" if action == "exit" else "editor.unsaved.before_close"
    ctx.label(t(question_key))
    if error:
        ctx.spacing()
        ctx.text_wrapped(error)
    ctx.spacing()
    ctx.separator()
    ctx.spacing()

    selected: Optional[str] = None

    def _choose(value: str) -> None:
        nonlocal selected
        selected = value
        ctx.close_current_popup()

    save_label = t("editor.unsaved.save")
    discard_label = t("editor.unsaved.dont_save")
    cancel_label = t("editor.unsaved.cancel")
    suffix = semantic_prefix.replace(".", "_")
    ctx.button(f"{save_label}##{suffix}_save", lambda: _choose("save"))
    ctx.record_semantic_item("button", save_label, True, f"{semantic_prefix}.save")
    ctx.same_line()
    ctx.button(f"{discard_label}##{suffix}_discard", lambda: _choose("discard"))
    ctx.record_semantic_item("button", discard_label, True, f"{semantic_prefix}.discard")
    ctx.same_line()
    ctx.button(f"{cancel_label}##{suffix}_cancel", lambda: _choose("cancel"))
    ctx.record_semantic_item("button", cancel_label, True, f"{semantic_prefix}.cancel")
    ctx.end_popup()
    return selected

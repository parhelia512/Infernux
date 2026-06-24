"""Timeline Editor — visual editor for ``.animtimeline`` transform timelines.

A minimal Unity-Timeline-style editor for a single transform track: a horizontal
timeline bar (like a video scrubber) shows keyframes as diamonds and a draggable
playhead.  Add a keyframe at the playhead, select a keyframe to edit its
transform and the transition curve used to reach it (from the previous keyframe).

Shortcuts: Space play/pause, Ctrl+S save, Ctrl+Shift+S save-as, Ctrl+N new.

Opened from Window menu → Timeline Editor, or by double-clicking a
``.animtimeline`` asset in the Project panel.
"""

from __future__ import annotations

import os
import time
from typing import Optional

from Infernux.debug import Debug
from Infernux.engine.i18n import t
from Infernux.lib import InxGUIContext

from Infernux.core.animation_timeline import (
    AnimationTimeline,
    TimelineKeyframe,
    INTERP_MODES,
    APPLY_MODES,
)
from .editor_panel import EditorPanel
from .panel_registry import editor_panel
from .imgui_keys import KEY_S, KEY_N, KEY_SPACE
from .theme import ImGuiCol, Theme

_MOD_CTRL = 1 << 12
_MOD_SHIFT = 1 << 13

_INTERP_LABELS = ("Constant", "Linear", "Ease In", "Ease Out", "Ease In-Out")
_APPLY_LABELS = ("Additive (Increment)", "Absolute")
_RIGHT_PANEL_W = 290.0
_BAR_H = 84.0
_DRAG_THRESHOLD = 4.0  # px the mouse must move before a keyframe starts dragging (Blender-like)

# Theme-aligned palette (black/white/gray + red accent).
_C_BAR_BG = (0.135, 0.135, 0.140, 1.0)
_C_RULER_BG = (0.175, 0.175, 0.180, 1.0)
_C_LANE = (0.205, 0.205, 0.210, 1.0)
_C_TICK = (0.45, 0.45, 0.47, 0.85)
_C_TEXT_DIM = (0.55, 0.55, 0.57, 0.95)
_C_KEY = (0.62, 0.62, 0.64, 1.0)
_C_KEY_HOVER = (0.82, 0.82, 0.84, 1.0)
_C_ACCENT = (0.922, 0.341, 0.341, 1.0)  # theme red (#EB5757)


@editor_panel(
    "Timeline Editor",
    type_id="animtimeline_editor",
    title_key="panel.animtimeline_editor",
    menu_path="Animation",
)
class AnimTimelineEditorPanel(EditorPanel):
    """Visual single-track transform timeline editor."""

    window_id = "animtimeline_editor"

    def __init__(self):
        super().__init__(title="Timeline Editor", window_id="animtimeline_editor")
        self._timeline: AnimationTimeline = AnimationTimeline(name="Timeline")
        self._file_path: str = ""
        self._dirty: bool = False
        self._playhead: float = 0.0
        self._playing: bool = False
        self._last_tick: float = 0.0
        self._sel_key: Optional[TimelineKeyframe] = None
        self._drag_key: Optional[TimelineKeyframe] = None
        self._drag_armed: bool = False
        self._press_x: float = 0.0
        self._bar_was_active: bool = False

    # Unsaved marker in the window title (shared dirty/save/close handled by ClosablePanel).
    def _window_title_suffix(self) -> str:
        return " *" if self._dirty else ""

    # ── Lifecycle ──────────────────────────────────────────────────────
    def _initial_size(self):
        return (940, 560)

    def _open_timeline(self, path: str):
        tl = AnimationTimeline.load(path)
        if tl is None:
            Debug.log_warning(f"[TimelineEditor] Failed to load: {path}")
            return
        self._timeline = tl
        self._file_path = path
        self._playhead = 0.0
        self._playing = False
        self._sel_key = None
        self._drag_key = None
        self._set_dirty(False)

    def _new_timeline(self):
        self._timeline = AnimationTimeline(name="Timeline")
        self._file_path = ""
        self._playhead = 0.0
        self._playing = False
        self._sel_key = None
        self._drag_key = None
        self._set_dirty(False)

    def _set_dirty(self, value: bool):
        # ClosablePanel._sync_dirty_registry() reads self._dirty every frame and
        # registers the title + _do_save handler, so we only flip the flag here.
        self._dirty = bool(value)

    # ── Save ───────────────────────────────────────────────────────────
    def _do_save(self):
        if self._file_path:
            self._save_to(self._file_path)
        else:
            self._show_save_as_dialog()

    def _save_to(self, path: str):
        self._timeline.name = os.path.splitext(os.path.basename(path))[0]
        if self._timeline.save(path):
            self._file_path = path
            Debug.log(f"[TimelineEditor] Saved: {path}")
            try:
                from Infernux.core.assets import AssetManager
                AssetManager.reimport_asset(path)
            except Exception:
                pass
            self._set_dirty(False)
        else:
            Debug.log_warning(f"[TimelineEditor] Failed to save: {path}")

    def _show_save_as_dialog(self):
        try:
            from Infernux.engine.project_context import get_project_root
            initial_dir = os.path.join(get_project_root() or ".", "Assets")
        except Exception:
            initial_dir = "."
        safe = (self._timeline.name or "Timeline").replace(" ", "_")
        try:
            from ._dialogs import save_file_dialog
            result = save_file_dialog(
                title="Save Timeline",
                win32_filter="Timeline files (*.animtimeline)\0*.animtimeline\0All files (*.*)\0*.*\0\0",
                initial_dir=initial_dir,
                default_filename=f"{safe}.animtimeline",
                default_ext="animtimeline",
                tk_filetypes=[("Timeline", "*.animtimeline"), ("All Files", "*.*")],
            )
        except Exception as exc:
            Debug.log_warning(f"[TimelineEditor] Save dialog error: {exc}")
            result = None
        if result:
            self._save_to(result)

    # ── Selection helpers ──────────────────────────────────────────────
    def _current_sel_key(self) -> Optional[TimelineKeyframe]:
        """Return the selected keyframe if it is still in the list (by identity)."""
        if self._sel_key is None:
            return None
        for k in self._timeline.keyframes:
            if k is self._sel_key:
                return k
        self._sel_key = None
        return None

    def _add_keyframe_at_playhead(self):
        sampled = self._timeline.sample(self._playhead)
        if sampled is not None:
            pos, rot, scl = sampled
        else:
            pos, rot, scl = [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]
        key = TimelineKeyframe(
            time=float(self._playhead), position=pos, rotation=rot, scale=scl,
        )
        self._timeline.keyframes.append(key)
        self._sel_key = key
        self._set_dirty(True)

    def _delete_selected_key(self):
        k = self._current_sel_key()
        if k is None:
            return
        self._timeline.keyframes = [x for x in self._timeline.keyframes if x is not k]
        self._sel_key = None
        self._drag_key = None
        self._set_dirty(True)

    # ── Playback ───────────────────────────────────────────────────────
    def _advance_playback(self):
        now = time.perf_counter()
        if self._playing:
            dt = now - self._last_tick if self._last_tick else 0.0
            dt = max(0.0, min(dt, 0.05))  # clamp to avoid jumps when frames stall
            self._playhead += dt
            dur = max(1e-6, self._timeline.duration)
            # The editor preview always loops; runtime looping is decided by the FSM state.
            if self._playhead >= dur:
                self._playhead = self._playhead % dur
        self._last_tick = now

    # ── Render ─────────────────────────────────────────────────────────
    def on_render_content(self, ctx: InxGUIContext):
        self._handle_shortcuts(ctx)
        self._advance_playback()

        self._render_toolbar(ctx)
        ctx.separator()

        avail_h = max(120.0, ctx.get_content_region_avail_height())
        avail_w = ctx.get_content_region_avail_width()
        right_w = min(_RIGHT_PANEL_W, max(200.0, avail_w * 0.34))
        left_w = max(220.0, avail_w - right_w - 8.0)

        if ctx.begin_child("##tl_left", left_w, avail_h, False):
            self._render_left(ctx)
        ctx.end_child()
        ctx.same_line()
        if ctx.begin_child("##tl_right", right_w, avail_h, True):
            self._render_keyframe_inspector(ctx)
        ctx.end_child()

    def _handle_shortcuts(self, ctx: InxGUIContext):
        ctrl = ctx.is_key_down(_MOD_CTRL)
        shift = ctx.is_key_down(_MOD_SHIFT)
        if ctrl and ctx.is_key_pressed(KEY_S):
            if shift:
                self._show_save_as_dialog()
            else:
                self._do_save()
        if ctrl and ctx.is_key_pressed(KEY_N):
            self._new_timeline()
        # Space toggles playback only when no widget (e.g. a text field) is focused.
        if ctx.is_key_pressed(KEY_SPACE) and not ctx.is_any_item_active():
            self._toggle_play()

    def _toggle_play(self):
        self._playing = not self._playing
        self._last_tick = time.perf_counter()

    def _render_toolbar(self, ctx: InxGUIContext):
        if ctx.button(t("animtimeline_editor.new")):
            self._new_timeline()
        ctx.same_line()
        if ctx.button(t("animtimeline_editor.save")):
            self._do_save()
        ctx.same_line()
        if ctx.button(t("animtimeline_editor.save_as")):
            self._show_save_as_dialog()
        ctx.same_line()
        ctx.label(f"{t('animtimeline_editor.name')}:")
        ctx.same_line()
        ctx.set_next_item_width(150.0)
        new_name = ctx.text_input("##tl_name", self._timeline.name, 128)
        if new_name != self._timeline.name:
            self._timeline.name = new_name
            self._set_dirty(True)
        ctx.same_line()
        ctx.label(f"{t('animtimeline_editor.duration')}:")
        ctx.same_line()
        ctx.set_next_item_width(70.0)
        new_dur = ctx.drag_float("##tl_dur", float(self._timeline.duration), 0.05, 0.05, 3600.0)
        if new_dur != self._timeline.duration:
            self._timeline.duration = max(0.05, float(new_dur))
            self._set_dirty(True)
        ctx.same_line()
        ctx.label(f"{t('animtimeline_editor.apply_mode')}:")
        ctx.same_line()
        ctx.set_next_item_width(160.0)
        cur_mode = self._timeline.apply_mode if self._timeline.apply_mode in APPLY_MODES else APPLY_MODES[0]
        mode_idx = APPLY_MODES.index(cur_mode)
        new_mode = ctx.combo("##tl_apply_mode", mode_idx, list(_APPLY_LABELS), len(_APPLY_LABELS))
        if new_mode != mode_idx:
            self._timeline.apply_mode = APPLY_MODES[new_mode]
            self._set_dirty(True)

    def _render_left(self, ctx: InxGUIContext):
        # Transport
        if ctx.button(t("animtimeline_editor.pause") if self._playing else t("animtimeline_editor.play")):
            self._toggle_play()
        ctx.same_line()
        if ctx.button(t("animtimeline_editor.stop")):
            self._playing = False
            self._playhead = 0.0
        ctx.same_line()
        ctx.label(f"{self._playhead:.2f} / {self._timeline.duration:.2f}s")

        ctx.dummy(0, 4)
        self._render_timeline_bar(ctx)
        ctx.dummy(0, 6)

        if ctx.button(t("animtimeline_editor.add_key")):
            self._add_keyframe_at_playhead()
        ctx.same_line()
        if ctx.button(t("animtimeline_editor.delete_key")):
            self._delete_selected_key()

    def _render_timeline_bar(self, ctx: InxGUIContext):
        dur = max(1e-6, float(self._timeline.duration))
        bar_w = max(80.0, ctx.get_content_region_avail_width())
        ctx.invisible_button("##tl_bar", bar_w, _BAR_H)
        x0 = ctx.get_item_rect_min_x()
        y0 = ctx.get_item_rect_min_y()
        x1 = ctx.get_item_rect_max_x()
        y1 = ctx.get_item_rect_max_y()
        w = max(1.0, x1 - x0)
        active = ctx.is_item_active()
        hovered = ctx.is_item_hovered()
        mx = ctx.get_mouse_pos_x()

        ruler_h = 18.0
        ruler_y = y0 + ruler_h
        lane_y = (ruler_y + y1) * 0.5
        ks = 6.5  # keyframe half-size (square)

        def time_to_x(tm: float) -> float:
            return x0 + (max(0.0, min(dur, tm)) / dur) * w

        def x_to_time(xx: float) -> float:
            return max(0.0, min(1.0, (xx - x0) / w)) * dur

        # Background, ruler strip, track lane
        ctx.draw_filled_rect(x0, y0, x1, y1, *_C_BAR_BG, 4.0)
        ctx.draw_filled_rect(x0, y0, x1, ruler_y, *_C_RULER_BG, 4.0)
        ctx.draw_filled_rect(x0 + 4, lane_y - 11, x1 - 4, lane_y + 11, *_C_LANE, 3.0)
        ctx.draw_text(x0 + 6, lane_y - 9, t("animtimeline_editor.transform"), *_C_TEXT_DIM)

        # Ruler ticks + time labels
        for i in range(0, 11):
            frac = i / 10.0
            tx = x0 + frac * w
            major = (i % 5 == 0)
            ctx.draw_line(tx, ruler_y - (8.0 if major else 4.0), tx, ruler_y, *_C_TICK, 1.0)
            if major:
                ctx.draw_text(tx + 2, y0 + 2, f"{frac * dur:.2f}", *_C_TEXT_DIM)

        # Hover highlight: which keyframe would be grabbed
        hover_key = None
        if hovered and not active:
            best_dx = 9.0
            for k in self._timeline.keyframes:
                if abs(time_to_x(k.time) - mx) <= best_dx:
                    best_dx = abs(time_to_x(k.time) - mx)
                    hover_key = k

        # Keyframe markers: gray squares; selection draws an outer border (no rotate/scale).
        sel = self._current_sel_key()
        for k in self._timeline.keyframes:
            kx = time_to_x(k.time)
            col = _C_KEY_HOVER if (k is hover_key or k is sel) else _C_KEY
            ctx.draw_filled_rect(kx - ks, lane_y - ks, kx + ks, lane_y + ks, *col, 2.0)
            if k is sel:
                b = ks + 3.0
                ctx.draw_rect(kx - b, lane_y - b, kx + b, lane_y + b, *_C_ACCENT, 1.6, 2.0)

        # Playhead (line + top handle, theme red)
        px = time_to_x(self._playhead)
        ctx.draw_line(px, y0, px, y1, *_C_ACCENT, 2.0)
        ctx.draw_filled_rect(px - 4.0, y0, px + 4.0, y0 + 7.0, *_C_ACCENT, 1.0)

        # ── Interaction: grab a keyframe to drag (after a threshold); empty area scrubs ──
        press_started = active and not self._bar_was_active
        if press_started:
            self._press_x = mx
            self._drag_key = None
            self._drag_armed = False
            best_dx = max(9.0, ks + 2.0)
            for k in self._timeline.keyframes:
                if abs(time_to_x(k.time) - mx) <= best_dx:
                    best_dx = abs(time_to_x(k.time) - mx)
                    self._drag_key = k
            if self._drag_key is not None:
                self._sel_key = self._drag_key   # click selects immediately
                self._drag_armed = True          # but moving waits for the threshold
                self._playing = False
            else:
                self._playhead = x_to_time(mx)   # empty press scrubs right away
                self._playing = False
        elif active:
            if self._drag_key is not None:
                if self._drag_armed and abs(mx - self._press_x) > _DRAG_THRESHOLD:
                    self._drag_armed = False
                if not self._drag_armed:
                    self._drag_key.time = x_to_time(mx)
                    self._playhead = self._drag_key.time
                    self._set_dirty(True)
            else:
                self._playhead = x_to_time(mx)
                self._playing = False
        if not active:
            self._drag_key = None
            self._drag_armed = False
        self._bar_was_active = active

    def _render_keyframe_inspector(self, ctx: InxGUIContext):
        ctx.push_style_color(ImGuiCol.Text, 0.55, 0.56, 0.58, 1.0)
        ctx.label(t("animtimeline_editor.keyframe"))
        ctx.pop_style_color(1)
        ctx.separator()

        k = self._current_sel_key()
        if k is None:
            ctx.push_style_color(ImGuiCol.Text, 0.50, 0.51, 0.53, 1.0)
            ctx.label(t("animtimeline_editor.no_key_selected"))
            ctx.pop_style_color(1)
            return

        ctx.label(t("animtimeline_editor.key_time"))
        ctx.set_next_item_width(-1)
        nt = ctx.drag_float("##k_time", float(k.time), 0.01, 0.0, float(self._timeline.duration))
        if nt != k.time:
            k.time = max(0.0, min(float(self._timeline.duration), float(nt)))
            self._playhead = k.time
            self._set_dirty(True)

        ctx.label(t("animtimeline_editor.transition"))
        ctx.set_next_item_width(-1)
        idx = INTERP_MODES.index(k.interp) if k.interp in INTERP_MODES else 1
        nidx = ctx.combo("##k_interp", idx, list(_INTERP_LABELS), len(_INTERP_LABELS))
        if nidx != idx:
            k.interp = INTERP_MODES[nidx]
            self._set_dirty(True)

        ctx.dummy(0, 6)
        ctx.push_style_color(ImGuiCol.Text, 0.55, 0.56, 0.58, 1.0)
        ctx.label(t("animtimeline_editor.transform"))
        ctx.pop_style_color(1)
        ctx.separator()

        if self._vec3_row(ctx, "pos", t("animtimeline_editor.position"), k.position, 0.01):
            self._set_dirty(True)
        if self._vec3_row(ctx, "rot", t("animtimeline_editor.rotation"), k.rotation, 0.25):
            self._set_dirty(True)
        if self._vec3_row(ctx, "scl", t("animtimeline_editor.scale"), k.scale, 0.01):
            self._set_dirty(True)

    @staticmethod
    def _vec3_row(ctx: InxGUIContext, vid: str, label: str, values, speed: float) -> bool:
        """Render an X/Y/Z drag row (Inspector-style). Mutates *values* in place."""
        ctx.label(label)
        changed = False
        avail = ctx.get_content_region_avail_width()
        field_w = max(36.0, (avail - 16.0) / 3.0)
        for i, axis in enumerate(("X", "Y", "Z")):
            ctx.set_next_item_width(field_w)
            nv = ctx.drag_float(f"##{vid}_{axis}", float(values[i]), speed, -1.0e9, 1.0e9)
            if nv != values[i]:
                values[i] = float(nv)
                changed = True
            if i < 2:
                ctx.same_line(0, 6)
        return changed

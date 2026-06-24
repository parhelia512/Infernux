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

import math
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
_C_PREVIEW_BG = (0.11, 0.11, 0.12, 1.0)
_C_FLOOR = (0.26, 0.27, 0.30, 0.85)
_C_FLOOR_AXIS = (0.36, 0.30, 0.30, 0.9)

# Unit cube centred at origin (Y up), faces + outward normals.
_CUBE_VERTS = [(-.5, -.5, -.5), (.5, -.5, -.5), (.5, .5, -.5), (-.5, .5, -.5),
               (-.5, -.5, .5), (.5, -.5, .5), (.5, .5, .5), (-.5, .5, .5)]
_CUBE_FACES = [(0, 1, 2, 3), (5, 4, 7, 6), (4, 0, 3, 7), (1, 5, 6, 2), (3, 2, 6, 7), (4, 5, 1, 0)]
_CUBE_NORMALS = [(0, 0, -1), (0, 0, 1), (-1, 0, 0), (1, 0, 0), (0, 1, 0), (0, -1, 0)]
_LIGHT = (-0.35, 0.78, -0.50)

# Floor camera: Y up, floor = XZ plane. Yaw then pitch (look slightly down at floor).
_CAM_YAW = math.radians(-32.0)
_CAM_PITCH = math.radians(-27.0)


def _rot_xyz(p, rx, ry, rz):
    x, y, z = p
    ca, sa = math.cos(rx), math.sin(rx); y, z = y * ca - z * sa, y * sa + z * ca
    ca, sa = math.cos(ry), math.sin(ry); x, z = x * ca + z * sa, -x * sa + z * ca
    ca, sa = math.cos(rz), math.sin(rz); x, y = x * ca - y * sa, x * sa + y * ca
    return (x, y, z)


def _cam(p):
    """World (Y-up) → view space via fixed yaw+pitch (object-resting-on-floor view)."""
    x, y, z = p
    ca, sa = math.cos(_CAM_YAW), math.sin(_CAM_YAW); x, z = x * ca + z * sa, -x * sa + z * ca
    ca, sa = math.cos(_CAM_PITCH), math.sin(_CAM_PITCH); y, z = y * ca - z * sa, y * sa + z * ca
    return (x, y, z)


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
        self._idle_suppressed: bool = False
        self._idle_prev: bool = True

    def on_disable(self) -> None:
        # Always restore the editor idle setting if we suppressed it.
        self._set_engine_active(False)

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
            # The timeline has no loop of its own — looping is decided solely by the
            # owning FSM state at runtime. The editor preview plays once and holds.
            if self._playhead >= dur:
                self._playhead = dur
                self._playing = False
        self._last_tick = now

    def _set_engine_active(self, active: bool):
        """Suppress editor idle while *active* so autonomous playback stays smooth.

        Editor idle mode caps the loop to ~10 FPS when there is no input; during
        timeline playback there is no input, so we temporarily disable idle and
        restore the previous setting when playback stops / the panel closes.
        """
        try:
            from .asset_resource_preview import _resolve_native_engine
            native = _resolve_native_engine(self)
            if native is None:
                return
            if active and not self._idle_suppressed:
                self._idle_prev = bool(native.is_editor_idle_enabled())
                native.set_editor_idle_enabled(False)
                self._idle_suppressed = True
            elif not active and self._idle_suppressed:
                native.set_editor_idle_enabled(self._idle_prev)
                self._idle_suppressed = False
        except Exception:
            pass

    # ── Render ─────────────────────────────────────────────────────────
    def on_render_content(self, ctx: InxGUIContext):
        self._handle_shortcuts(ctx)
        self._advance_playback()
        self._set_engine_active(self._playing)

        self._render_toolbar(ctx)
        ctx.separator()

        avail_h = max(120.0, ctx.get_content_region_avail_height())
        avail_w = ctx.get_content_region_avail_width()
        left_w = min(_RIGHT_PANEL_W, max(200.0, avail_w * 0.34))
        right_w = max(220.0, avail_w - left_w - 8.0)

        # Left: compact selected-keyframe inspector only.
        if ctx.begin_child("##tl_left", left_w, avail_h, True):
            self._render_keyframe_inspector(ctx)
        ctx.end_child()
        ctx.same_line()
        # Right: transport + visual timeline + add/delete.
        if ctx.begin_child("##tl_right", right_w, avail_h, False):
            self._render_left(ctx)
        ctx.end_child()
        # Floating cube preview in the bottom-right corner of the editor.
        rx1 = ctx.get_item_rect_max_x()
        ry1 = ctx.get_item_rect_max_y()
        self._draw_floating_preview(ctx, rx1, ry1)

    def _is_focused(self, ctx: InxGUIContext) -> bool:
        # RootAndChildWindows = RootWindow(1<<1) | ChildWindows(1<<0) = 3
        try:
            return ctx.is_window_focused(3)
        except Exception:
            return True

    def _handle_shortcuts(self, ctx: InxGUIContext):
        # Only the focused editor window reacts to its shortcuts.
        if not self._is_focused(ctx):
            return
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
        # Replaying from the end restarts (the preview plays once, no auto-loop).
        if not self._playing and self._playhead >= float(self._timeline.duration) - 1e-4:
            self._playhead = 0.0
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

    # ── Floating cube preview (bottom-right corner) ─────────────────────
    def _draw_floating_preview(self, ctx: InxGUIContext, anchor_x: float, anchor_y: float):
        """Compact floating preview: a cube resting on a floor, driven by the playhead."""
        W, H, pad = 184.0, 150.0, 10.0
        x1 = anchor_x - pad
        y1 = anchor_y - pad
        x0 = x1 - W
        y0 = y1 - H
        ctx.draw_filled_rect(x0, y0, x1, y1, *_C_PREVIEW_BG, 5.0)
        ctx.draw_rect(x0, y0, x1, y1, 0.07, 0.07, 0.08, 1.0, 1.0, 5.0)
        ctx.draw_text(x0 + 8.0, y0 + 5.0, t("animtimeline_editor.preview"), 0.55, 0.56, 0.58, 0.9)
        sampled = self._timeline.sample(self._playhead)
        if sampled is not None:
            pos, rot, scl = sampled
        else:
            pos, rot, scl = [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]
        self._draw_cube_on_floor(ctx, x0, y0 + 16.0, x1, y1, pos, rot, scl)

    @staticmethod
    def _draw_cube_on_floor(ctx: InxGUIContext, x0, y0, x1, y1, pos, rot, scl):
        box = min(x1 - x0, y1 - y0)
        proj = box * 0.34
        ox = (x0 + x1) * 0.5
        oy = y0 + (y1 - y0) * 0.66  # origin lower so the cube sits above the floor

        def project(p):
            v = _cam(p)
            return (ox + v[0] * proj, oy - v[1] * proj)

        # Floor grid (XZ plane, y = 0).
        g = 1.5
        steps = 6
        for i in range(steps + 1):
            t01 = i / steps
            c = -g + 2 * g * t01
            a1 = project((c, 0.0, -g)); a2 = project((c, 0.0, g))
            b1 = project((-g, 0.0, c)); b2 = project((g, 0.0, c))
            col = _C_FLOOR_AXIS if abs(c) < 1e-3 else _C_FLOOR
            ctx.draw_line(a1[0], a1[1], a2[0], a2[1], *col, 1.0)
            ctx.draw_line(b1[0], b1[1], b2[0], b2[1], *col, 1.0)

        rx, ry, rz = math.radians(rot[0]), math.radians(rot[1]), math.radians(rot[2])
        sx = max(0.05, float(scl[0])); sy = max(0.05, float(scl[1])); sz = max(0.05, float(scl[2]))
        px, py, pz = float(pos[0]), float(pos[1]), float(pos[2])
        lift = 0.5 * sy  # rest the cube's base on the floor (rotation is about its centre)

        # Contact shadow (cube footprint projected on the floor).
        foot = []
        for sgx, sgz in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
            foot.append(project((sgx * sx + px, 0.0, sgz * sz + pz)))
        AnimTimelineEditorPanel._fill_quad(ctx, foot[0], foot[1], foot[2], foot[3], (0.0, 0.0, 0.0, 0.30))

        view = []
        for v in _CUBE_VERTS:
            p = (v[0] * sx, v[1] * sy, v[2] * sz)
            p = _rot_xyz(p, rx, ry, rz)
            p = (p[0] + px, p[1] + lift + py, p[2] + pz)
            view.append(_cam(p))
        scr = [(ox + p[0] * proj, oy - p[1] * proj) for p in view]
        order = sorted(range(6), key=lambda fi: sum(view[i][2] for i in _CUBE_FACES[fi]) / 4.0, reverse=True)
        for fi in order:
            n = _cam(_rot_xyz(_CUBE_NORMALS[fi], rx, ry, rz))
            if n[2] >= 0.0:  # backface cull (viewer toward -z)
                continue
            d = max(0.0, n[0] * _LIGHT[0] + n[1] * _LIGHT[1] + n[2] * _LIGHT[2])
            b = 0.30 + 0.58 * d
            col = (b * 0.80, b * 0.82, b * 0.86, 1.0)
            face = _CUBE_FACES[fi]
            a, bb, c, dd = scr[face[0]], scr[face[1]], scr[face[2]], scr[face[3]]
            AnimTimelineEditorPanel._fill_quad(ctx, a, bb, c, dd, col)
            for k in range(4):
                p1 = scr[face[k]]
                p2 = scr[face[(k + 1) % 4]]
                ctx.draw_line(p1[0], p1[1], p2[0], p2[1], 0.09, 0.09, 0.10, 0.95, 1.2)

    @staticmethod
    def _fill_quad(ctx: InxGUIContext, a, b, c, d, color):
        """Scanline-fill a convex quad a-b-c-d (no native triangle primitive)."""
        maxlen = max(abs(b[0] - a[0]) + abs(b[1] - a[1]), abs(c[0] - d[0]) + abs(c[1] - d[1]))
        steps = max(8, min(80, int(maxlen / 2.0) + 2))
        for i in range(steps + 1):
            t = i / steps
            p1x = a[0] + (b[0] - a[0]) * t
            p1y = a[1] + (b[1] - a[1]) * t
            p2x = d[0] + (c[0] - d[0]) * t
            p2y = d[1] + (c[1] - d[1]) * t
            ctx.draw_line(p1x, p1y, p2x, p2y, *color, 2.0)

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

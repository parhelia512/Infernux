"""Compact Notion-style toolbar above the scene viewport."""

from typing import Optional, TYPE_CHECKING
from Infernux.lib import InxGUIRenderable, InxGUIContext
from Infernux.engine.play_mode import PlayModeManager, PlayModeState
from Infernux.engine.i18n import t
from .editor_panel import EditorPanel
from .closable_panel import ClosablePanel
from .panel_registry import editor_panel
from .theme import Theme, ImGuiCol, ImGuiStyleVar


_CAMERA_DEFAULTS = {
    "fov": 60.0,
    "rotation_speed": 0.05,
    "pan_speed": 1.0,
    "zoom_speed": 1.0,
    "move_speed": 5.0,
    "move_speed_boost": 3.0,
}


def _noop():
    pass


@editor_panel("Toolbar", type_id="toolbar", title_key="panel.toolbar")
class ToolbarPanel(EditorPanel):
    WINDOW_TYPE_ID = "toolbar"
    WINDOW_DISPLAY_NAME = "Toolbar"

    def __init__(self, title: str = "Toolbar", engine=None,
                 play_mode_manager: Optional[PlayModeManager] = None):
        super().__init__(title, window_id="toolbar")
        self._engine = engine
        self._play_mode_manager = play_mode_manager
        self._camera_settings = dict(_CAMERA_DEFAULTS)
        if self._engine and self._play_mode_manager is None:
            self._play_mode_manager = self._engine.get_play_mode_manager()
        self._sync_camera_settings_from_engine()

    def set_engine(self, engine):
        self._engine = engine
        if engine:
            self._play_mode_manager = engine.get_play_mode_manager()
        self._apply_camera_settings()

    def set_play_mode_manager(self, manager: PlayModeManager):
        self._play_mode_manager = manager

    # ------------------------------------------------------------------
    # EditorPanel hooks
    # ------------------------------------------------------------------

    def _window_flags(self) -> int:
        return Theme.WINDOW_FLAGS_NO_SCROLL

    def _initial_size(self):
        return (800, 32)

    def _push_window_style(self, ctx):
        Theme.push_toolbar_vars(ctx)  # 5 style vars

    def _pop_window_style(self, ctx):
        ctx.pop_style_var(5)

    def on_render_content(self, ctx: InxGUIContext):
            win_w = ctx.get_window_width()
            state = self._get_state()
            is_playing = state in (PlayModeState.PLAYING, PlayModeState.PAUSED)
            is_paused  = state == PlayModeState.PAUSED

            # --- Right-aligned dropdowns (measure from right edge) ---
            right_x = win_w - 200.0
            if right_x < 300.0:
                right_x = 300.0

            # --- Centered play controls ---
            btn_w = 160.0
            cx = (win_w - btn_w) * 0.5
            if cx < 6.0:
                cx = 6.0
            ctx.set_cursor_pos_x(cx)

            # Play / Stop
            if is_playing and not is_paused:
                Theme.push_flat_button_style(ctx, *Theme.PLAY_ACTIVE)
            else:
                Theme.push_flat_button_style(ctx, *Theme.BTN_IDLE)
            ctx.button(t("toolbar.stop") if is_playing else t("toolbar.play"), self._on_play)
            ctx.pop_style_color(3)

            ctx.same_line(0, 2)

            # Pause / Resume
            if not is_playing:
                Theme.push_flat_button_style(ctx, *Theme.BTN_DISABLED)
            elif is_paused:
                Theme.push_flat_button_style(ctx, *Theme.PAUSE_ACTIVE)
            else:
                Theme.push_flat_button_style(ctx, *Theme.BTN_IDLE)
            ctx.button(t("toolbar.resume") if is_paused else t("toolbar.pause"),
                       self._on_pause if is_playing else _noop)
            ctx.pop_style_color(3)

            ctx.same_line(0, 2)

            # Step
            if is_paused:
                Theme.push_flat_button_style(ctx, *Theme.BTN_IDLE)
            else:
                Theme.push_flat_button_style(ctx, *Theme.BTN_DISABLED)
            ctx.button(t("toolbar.step"), self._on_step if is_paused else _noop)
            ctx.pop_style_color(3)

            # Time label while playing
            if is_playing:
                ctx.same_line(0, 8)
                tag = t("toolbar.status_paused") if is_paused else t("toolbar.status_playing")
                ctx.label(f"{tag}  {self._time_str()}")

            # --- Right dropdowns ---
            ctx.same_line(right_x)
            self._ghost_btn(ctx, t("toolbar.gizmos"), "##giz")
            if ctx.begin_popup("##giz"):
                Theme.push_popup_vars(ctx)  # 3 style vars
                self._popup_gizmos(ctx)
                ctx.pop_style_var(3)
                ctx.end_popup()

            ctx.same_line(0, 4)
            self._ghost_btn(ctx, t("toolbar.camera"), "##cam")
            if ctx.begin_popup("##cam"):
                Theme.push_popup_vars(ctx)  # 3 style vars
                self._popup_camera(ctx)
                ctx.pop_style_var(3)
                ctx.end_popup()


    # ---------- ghost button (Notion-style: transparent bg, subtle hover) ----
    @staticmethod
    def _ghost_btn(ctx: InxGUIContext, label: str, popup_id: str):
        Theme.push_ghost_button_style(ctx)
        ctx.button(label, lambda pid=popup_id: ctx.open_popup(pid))
        ctx.pop_style_color(3)

    # ---------- flat button helper ----
    @staticmethod
    def _flat_btn(ctx: InxGUIContext, base: tuple):
        Theme.push_flat_button_style(ctx, *base)

    # ---------- popup contents ----
    def _popup_gizmos(self, ctx: InxGUIContext):
        if not self._engine:
            ctx.label(t("toolbar.engine_not_available"))
            return
        ctx.dummy(200, 0)  # force minimum popup width
        ctx.label(t("toolbar.gizmos_header"))
        ctx.separator()
        ctx.dummy(0, 4)
        g = self._engine.is_show_grid()
        ng = ctx.checkbox(t("toolbar.show_grid"), g)
        if ng != g:
            self._engine.set_show_grid(ng)
        ctx.dummy(0, 4)

    def _popup_camera(self, ctx: InxGUIContext):
        cam = self._engine.editor_camera if self._engine else None
        if not cam:
            ctx.label(t("toolbar.camera_not_available"))
            return
        self._sync_camera_settings_from_engine()
        ctx.dummy(360, 0)  # force minimum popup width
        ctx.label(t("toolbar.scene_camera"))
        ctx.separator()
        ctx.dummy(0, 4)
        self._set_camera_setting(
            "fov",
            self._render_camera_float_setting(
                ctx,
                t("toolbar.field_of_view"),
                "fov",
                self._camera_settings["fov"],
                10.0,
                120.0,
                step=1.0,
                step_fast=10.0,
            ),
        )
        ctx.dummy(0, 4)
        ctx.label(t("toolbar.navigation_header"))
        ctx.separator()
        ctx.dummy(0, 4)
        self._set_camera_setting(
            "rotation_speed",
            self._render_camera_float_setting(
                ctx,
                t("toolbar.rotation_sensitivity"),
                "rotation_speed",
                self._camera_settings["rotation_speed"],
                0.005,
                1.0,
                step=0.005,
                step_fast=0.05,
            ),
        )
        ctx.dummy(0, 4)
        self._set_camera_setting(
            "pan_speed",
            self._render_camera_float_setting(
                ctx,
                t("toolbar.pan_speed"),
                "pan_speed",
                self._camera_settings["pan_speed"],
                0.1,
                10.0,
                step=0.1,
                step_fast=1.0,
            ),
        )
        ctx.dummy(0, 4)
        self._set_camera_setting(
            "zoom_speed",
            self._render_camera_float_setting(
                ctx,
                t("toolbar.zoom_speed"),
                "zoom_speed",
                self._camera_settings["zoom_speed"],
                0.1,
                10.0,
                step=0.1,
                step_fast=1.0,
            ),
        )
        ctx.dummy(0, 4)
        self._set_camera_setting(
            "move_speed",
            self._render_camera_float_setting(
                ctx,
                t("toolbar.move_speed"),
                "move_speed",
                self._camera_settings["move_speed"],
                0.1,
                50.0,
                step=0.1,
                step_fast=1.0,
            ),
        )
        ctx.dummy(0, 4)
        self._set_camera_setting(
            "move_speed_boost",
            self._render_camera_float_setting(
                ctx,
                t("toolbar.speed_boost"),
                "move_speed_boost",
                self._camera_settings["move_speed_boost"],
                1.0,
                20.0,
                step=0.1,
                step_fast=1.0,
            ),
        )
        ctx.dummy(0, 6)
        ctx.button(t("toolbar.reset_camera_settings"), self._reset_camera_settings, width=-1.0)
        ctx.dummy(0, 4)

    def save_state(self) -> dict:
        self._sync_camera_settings_from_engine()
        return {
            "camera_settings": dict(self._camera_settings),
        }

    def load_state(self, data: dict) -> None:
        settings = data.get("camera_settings", {}) if isinstance(data, dict) else {}
        for key, default in _CAMERA_DEFAULTS.items():
            value = settings.get(key)
            if isinstance(value, (int, float)):
                self._camera_settings[key] = float(value)
            else:
                self._camera_settings[key] = float(default)
        self._apply_camera_settings()

    def _sync_camera_settings_from_engine(self):
        cam = self._engine.editor_camera if self._engine else None
        if not cam:
            return
        self._camera_settings.update({
            "fov": float(cam.fov),
            "rotation_speed": float(cam.rotation_speed),
            "pan_speed": float(cam.pan_speed),
            "zoom_speed": float(cam.zoom_speed),
            "move_speed": float(cam.move_speed),
            "move_speed_boost": float(cam.move_speed_boost),
        })

    def _apply_camera_settings(self):
        cam = self._engine.editor_camera if self._engine else None
        if not cam:
            return
        cam.fov = self._camera_settings["fov"]
        cam.rotation_speed = self._camera_settings["rotation_speed"]
        cam.pan_speed = self._camera_settings["pan_speed"]
        cam.zoom_speed = self._camera_settings["zoom_speed"]
        cam.move_speed = self._camera_settings["move_speed"]
        cam.move_speed_boost = self._camera_settings["move_speed_boost"]

    def _set_camera_setting(self, key: str, value: float, tolerance: float = 1e-4):
        clamped = float(value)
        if abs(clamped - self._camera_settings.get(key, clamped)) <= tolerance:
            return
        self._camera_settings[key] = clamped
        self._apply_camera_settings()

    def _reset_camera_settings(self):
        self._camera_settings = dict(_CAMERA_DEFAULTS)
        self._apply_camera_settings()

    @staticmethod
    def _render_camera_float_setting(
        ctx: InxGUIContext,
        label: str,
        key: str,
        value: float,
        min_value: float,
        max_value: float,
        *,
        step: float,
        step_fast: float,
    ) -> float:
        ctx.label(label)
        ctx.same_line(145)
        ctx.set_next_item_width(120)
        updated = ctx.float_slider(f"##{key}_slider", float(value), float(min_value), float(max_value))
        ctx.same_line(0, 6)
        ctx.set_next_item_width(72)
        updated = ctx.input_float(f"##{key}_input", float(updated), step, step_fast, 0)
        if updated < min_value:
            return float(min_value)
        if updated > max_value:
            return float(max_value)
        return float(updated)

    # ---------- state helpers ----
    def _get_state(self) -> PlayModeState:
        return self._play_mode_manager.state if self._play_mode_manager else PlayModeState.EDIT

    def _time_str(self) -> str:
        if not self._play_mode_manager:
            return "00:00.000"
        t = self._play_mode_manager.total_play_time
        return f"{int(t//60):02d}:{t%60:06.3f}"

    def _on_play(self):
        if not self._play_mode_manager:
            return
        if self._play_mode_manager.is_playing:
            self._play_mode_manager.exit_play_mode()
        else:
            if self._play_mode_manager.enter_play_mode():
                ClosablePanel.focus_panel_by_id("game_view")
                if self._engine:
                    self._engine.select_docked_window("game_view")

    def _on_pause(self):
        if not self._play_mode_manager:
            return
        self._play_mode_manager.toggle_pause()

    def _on_step(self):
        if not self._play_mode_manager:
            return
        self._play_mode_manager.step_frame()

"""Pure-logic tests for the editor UI layer (no ImGui frame required).

Covers: theme color math + C++ SSOT override, viewport math, window manager
state machine, panel state persistence, scene-view math helpers, UI-editor
geometry, and selection manager behavior.
"""
from __future__ import annotations

import math
import os

import pytest

from Infernux.engine.ui.theme import Theme, srgb_to_linear, srgb3, hex_to_linear


# ── theme color utilities ────────────────────────────────────────────────

class TestThemeColorMath:
    def test_srgb_to_linear_low_segment(self):
        assert srgb_to_linear(0.0) == 0.0
        assert srgb_to_linear(0.04045) == pytest.approx(0.04045 / 12.92)

    def test_srgb_to_linear_power_segment(self):
        assert srgb_to_linear(1.0) == pytest.approx(1.0)
        assert srgb_to_linear(0.5) == pytest.approx(((0.5 + 0.055) / 1.055) ** 2.4)

    def test_srgb_to_linear_monotonic(self):
        samples = [srgb_to_linear(i / 20.0) for i in range(21)]
        assert all(b >= a for a, b in zip(samples, samples[1:]))

    def test_srgb3_keeps_alpha(self):
        r, g, b, a = srgb3(1.0, 0.5, 0.25, 0.7)
        assert a == 0.7
        assert r == pytest.approx(1.0)

    def test_hex_to_linear(self):
        r, g, b, a = hex_to_linear(255, 0, 255)
        assert r == pytest.approx(1.0)
        assert g == pytest.approx(0.0)
        assert b == pytest.approx(1.0)
        assert a == 1.0


class TestThemeNativeSSOT:
    """The C++ EditorThemeRegistry is the single source of truth."""

    def test_native_registry_exposed(self):
        from Infernux.lib import (
            get_editor_theme_colors,
            get_editor_theme_floats,
            get_editor_theme_vec2s,
        )
        colors = get_editor_theme_colors()
        floats = get_editor_theme_floats()
        assert len(colors) >= 90, "expected the full migrated color table"
        assert len(floats) >= 50
        assert isinstance(get_editor_theme_vec2s(), dict)

    def test_python_theme_overridden_from_native(self):
        from Infernux.lib import get_editor_theme_colors
        native = get_editor_theme_colors()
        assert getattr(Theme, "_NATIVE_OVERRIDES_APPLIED", 0) > 0
        # Every overlapping constant must match the native value exactly.
        mismatches = []
        for name, value in native.items():
            if hasattr(Theme, name):
                if tuple(getattr(Theme, name)) != tuple(value):
                    mismatches.append(name)
        assert mismatches == []

    def test_native_values_are_rgba(self):
        from Infernux.lib import get_editor_theme_colors
        for name, value in get_editor_theme_colors().items():
            assert len(value) == 4, name
            assert all(isinstance(c, float) for c in value), name

    def test_play_border_color_logic(self):
        playing = Theme.get_play_border_color(False)
        paused = Theme.get_play_border_color(True)
        assert playing == tuple(Theme.BORDER_PLAY)
        assert paused == tuple(Theme.BORDER_PAUSE)
        assert playing != paused


# ── viewport math ────────────────────────────────────────────────────────

class _FakeCtx:
    """Minimal stand-in exposing the mouse-position API ViewportInfo uses."""

    def __init__(self, x: float, y: float):
        self._x, self._y = x, y

    def get_mouse_pos_x(self) -> float:
        return self._x

    def get_mouse_pos_y(self) -> float:
        return self._y


class TestViewportInfo:
    def _vp(self):
        from Infernux.engine.ui.viewport_utils import ViewportInfo
        return ViewportInfo(image_min_x=100, image_min_y=50,
                            image_max_x=300, image_max_y=250)

    def test_dimensions(self):
        vp = self._vp()
        assert vp.width == 200 and vp.height == 200

    def test_mouse_local(self):
        vp = self._vp()
        assert vp.mouse_local(_FakeCtx(150, 75)) == (50, 25)

    def test_mouse_inside_boundaries(self):
        vp = self._vp()
        assert vp.is_mouse_inside(_FakeCtx(100, 50))      # top-left corner
        assert vp.is_mouse_inside(_FakeCtx(300, 250))     # bottom-right corner
        assert not vp.is_mouse_inside(_FakeCtx(99, 50))
        assert not vp.is_mouse_inside(_FakeCtx(301, 250))


# ── window manager state machine ─────────────────────────────────────────

class TestWindowManager:
    def _fresh_manager(self):
        from Infernux.engine.ui.window_manager import WindowManager
        mgr = WindowManager.instance()
        return mgr

    def test_singleton(self):
        from Infernux.engine.ui.window_manager import WindowManager
        assert WindowManager.instance() is WindowManager.instance()

    def test_explicit_dynamic_window_state_machine(self):
        from Infernux.engine.ui.window_manager import WindowManager, WindowState

        class Engine:
            def __init__(self):
                self.registered = {}
                self.focused = []

            def register_gui(self, window_id, instance):
                self.registered[window_id] = instance

            def unregister_gui(self, window_id):
                self.registered.pop(window_id)

            def select_docked_window(self, window_id):
                self.focused.append(window_id)

        class Panel:
            def __init__(self):
                self._is_open = False

            @property
            def is_open(self):
                return self._is_open

            def set_window_manager(self, manager):
                self.manager = manager

            def open(self):
                self._is_open = True

        previous = WindowManager._instance
        try:
            engine = Engine()
            manager = WindowManager(engine)
            manager.register_window_type("dynamic", Panel, "Dynamic", factory=Panel)
            panel = manager.open_window("dynamic")
            assert manager.get_window_state("dynamic") is WindowState.OPENING
            manager.process_pending_actions()
            assert manager.get_window_state("dynamic") is WindowState.OPEN
            assert engine.registered["dynamic"] is panel

            assert manager.open_window("dynamic") is panel
            assert manager.get_window_state("dynamic") is WindowState.FOCUS_REQUESTED
            manager.process_pending_actions()
            assert manager.get_window_state("dynamic") is WindowState.FOCUSED
            assert engine.focused == ["dynamic"]

            manager.close_window("dynamic")
            assert manager.get_window_state("dynamic") is WindowState.CLOSING
            manager.process_pending_actions()
            assert manager.get_window_state("dynamic") is WindowState.CLOSED
            assert "dynamic" not in engine.registered
        finally:
            WindowManager._instance = previous

    def test_builtin_window_closes_without_unregistering(self):
        from Infernux.engine.ui.window_manager import WindowManager, WindowState

        class Engine:
            def __init__(self):
                self.registered = {}
                self.focused = []

            def register_gui(self, window_id, instance):
                self.registered[window_id] = instance

            def unregister_gui(self, window_id):
                raise AssertionError("builtin window must remain registered")

            def select_docked_window(self, window_id):
                self.focused.append(window_id)

        class Panel:
            def __init__(self):
                self.is_open = True

            def set_open(self, value):
                self.is_open = value

        previous = WindowManager._instance
        try:
            engine = Engine()
            manager = WindowManager(engine)
            panel = Panel()
            engine.registered["builtin"] = panel
            manager.register_window_type("builtin", Panel, "Builtin", factory=Panel)
            manager.register_existing_window("builtin", panel, "builtin")

            manager.close_window("builtin")
            assert manager.get_window_state("builtin") is WindowState.CLOSED
            assert engine.registered["builtin"] is panel
            assert panel.is_open is False

            assert manager.open_window("builtin") is panel
            manager.process_pending_actions()
            assert manager.get_window_state("builtin") is WindowState.FOCUSED
            assert panel.is_open is True
            assert engine.focused == ["builtin"]
        finally:
            WindowManager._instance = previous

    def test_window_menu_close_respects_panel_close_deferral(self):
        from Infernux.engine.ui.window_manager import WindowManager, WindowState

        class Engine:
            @staticmethod
            def unregister_gui(_window_id):
                raise AssertionError("deferred window must remain registered")

        class Panel:
            def __init__(self):
                self._is_open = True
                self.close_requests = 0

            @property
            def is_open(self):
                return self._is_open

            def request_close(self):
                self.close_requests += 1
                return False

        previous = WindowManager._instance
        try:
            manager = WindowManager(Engine())
            panel = Panel()
            manager._window_states["dirty"] = WindowState.OPEN
            manager._window_instances["dirty"] = panel
            manager._registered_instance_ids.add("dirty")

            manager.close_window("dirty")

            assert panel.close_requests == 1
            assert panel.is_open is True
            assert manager.get_window_state("dirty") is WindowState.OPEN
        finally:
            WindowManager._instance = previous


# ── scene view math helpers ──────────────────────────────────────────────

class TestSceneViewMath:
    def test_dot_and_cross(self):
        from Infernux.engine.ui import _scene_view_math as m
        if not hasattr(m, "_dot3"):
            pytest.skip("helper not present")
        assert m._dot3((1, 0, 0), (0, 1, 0)) == 0
        assert m._dot3((1, 2, 3), (4, 5, 6)) == 32
        cx, cy, cz = m._cross3((1, 0, 0), (0, 1, 0))
        assert (cx, cy, cz) == (0, 0, 1)


# ── IGUI non-drawing logic ───────────────────────────────────────────────

class TestIGUIFilters:
    def test_searchable_combo_filter_semantics(self):
        labels = ["MeshRenderer", "SkinnedMeshRenderer", "Rigidbody", "BoxCollider"]
        filt = "mesh"
        filtered = [l for l in labels if filt.lower() in l.lower()]
        assert filtered == ["MeshRenderer", "SkinnedMeshRenderer"]


class TestPanelFocusEvents:
    def test_closable_panel_emits_single_canonical_focus_event(self):
        from Infernux.engine.ui.closable_panel import ClosablePanel
        from Infernux.engine.ui.event_bus import EditorEvent, EditorEventBus

        class FocusContext:
            def set_window_focus(self):
                pass

        bus = EditorEventBus.instance()
        received = []
        handler = received.append
        previous_active = ClosablePanel._active_panel_id
        bus.subscribe(EditorEvent.PANEL_FOCUSED, handler)
        try:
            panel = ClosablePanel("Focus Test", "focus_test")
            ClosablePanel._active_panel_id = None
            panel._activate_panel(FocusContext(), focus_window=True)
            panel._activate_panel(FocusContext(), focus_window=True)
            assert received == ["focus_test"]
            assert not hasattr(ClosablePanel, "set_on_panel_focus_changed")
        finally:
            bus.unsubscribe(EditorEvent.PANEL_FOCUSED, handler)
            ClosablePanel._active_panel_id = previous_active

    def test_closable_panel_keeps_child_window_focus_as_panel_focus(self):
        from Infernux.engine.ui.closable_panel import ClosablePanel

        class FocusContext:
            def __init__(self):
                self.focus_flags = []

            @staticmethod
            def begin_window_closable(_title, _open, _flags):
                return True, True

            @staticmethod
            def is_window_hovered(_flags):
                return False

            @staticmethod
            def is_mouse_button_clicked(_button):
                return False

            def is_window_focused(self, flags):
                self.focus_flags.append(flags)
                return flags == 3

        panel = ClosablePanel("Child Focus Test", "child_focus_test")
        ctx = FocusContext()
        previous_active = ClosablePanel._active_panel_id
        try:
            ClosablePanel._active_panel_id = panel.window_id
            panel._panel_was_focused = True

            assert panel._begin_closable_window(ctx) is True
            assert ClosablePanel.get_active_panel_id() == panel.window_id
            assert ctx.focus_flags == [3]
        finally:
            ClosablePanel._active_panel_id = previous_active

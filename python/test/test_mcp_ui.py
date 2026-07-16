"""Semantic screen-UI MCP tool contracts."""

from __future__ import annotations

import inspect

import pytest

from Infernux.mcp.tools import ui
from Infernux.mcp.tools.common import _requires_saved_scene_file


class _FakeMcp:
    def __init__(self) -> None:
        self.tools = {}

    def tool(self, *args, **kwargs):
        name = str(kwargs.get("name") or (args[0] if args else ""))

        def _register(fn):
            self.tools[name] = fn
            return fn

        return _register


def test_ui_bind_click_is_registered():
    mcp = _FakeMcp()

    ui.register_ui_tools(mcp)

    assert "ui_bind_click" in mcp.tools
    assert "script_path" not in inspect.signature(mcp.tools["ui_bind_click"]).parameters


def test_ui_mutations_require_a_saved_scene():
    assert _requires_saved_scene_file("ui_bind_click") is True
    assert _requires_saved_scene_file("ui_set_text") is True
    assert _requires_saved_scene_file("ui_inspect") is False


def test_ui_bind_click_creates_typed_persistent_entry(monkeypatch):
    class MenuController:
        def start_expedition(self):
            pass

    class UIButton:
        def __init__(self):
            self.on_click_entries = []

    class Object:
        def __init__(self, object_id, name, components):
            self.id = object_id
            self.name = name
            self._components = components

        def get_parent(self):
            return None

        def get_py_components(self):
            return list(self._components)

    button = UIButton()
    target_component = MenuController()
    objects = {
        10: Object(10, "Start Expedition", [button]),
        20: Object(20, "Menu Controller", [target_component]),
    }
    monkeypatch.setattr(ui, "main_thread", lambda _name, fn, **_kwargs: fn())
    monkeypatch.setattr(ui, "_find_game_object", lambda object_id: objects[object_id])
    monkeypatch.setattr(ui, "_mark_ui_dirty", lambda: None)

    import Infernux.engine.ui._inspector_undo as inspector_undo

    monkeypatch.setattr(
        inspector_undo,
        "_record_property",
        lambda obj, field, _old, new, _description: setattr(obj, field, new),
    )
    mcp = _FakeMcp()
    ui.register_ui_tools(mcp)

    result = mcp.tools["ui_bind_click"](
        button_id=10,
        target_id=20,
        component_name="MenuController",
        method_name="start_expedition",
    )

    assert result["binding"] == {
        "target_id": 20,
        "component_name": "MenuController",
        "method_name": "start_expedition",
        "argument_count": 0,
    }
    from Infernux.ui.ui_event_entry import _get_serializable_raw_field

    assert _get_serializable_raw_field(
        button.on_click_entries[0], "target"
    ).persistent_id == 20


def test_ui_bind_click_rejects_component_not_attached_to_target(monkeypatch):
    class UIButton:
        on_click_entries = []

    class Object:
        def __init__(self, object_id, components):
            self.id = object_id
            self.name = str(object_id)
            self._components = components

        def get_py_components(self):
            return list(self._components)

    objects = {10: Object(10, [UIButton()]), 20: Object(20, [])}
    monkeypatch.setattr(ui, "main_thread", lambda _name, fn, **_kwargs: fn())
    monkeypatch.setattr(ui, "_find_game_object", lambda object_id: objects[object_id])
    mcp = _FakeMcp()
    ui.register_ui_tools(mcp)

    with pytest.raises(FileNotFoundError, match="was not found on GameObject 20"):
        mcp.tools["ui_bind_click"](
            button_id=10,
            target_id=20,
            component_name="MenuController",
            method_name="start_expedition",
        )


def test_persistent_click_dispatch_resolves_attached_component():
    from Infernux.components import GameObjectRef
    from Infernux.ui import UIButton
    from Infernux.ui.ui_event_entry import UIEventEntry

    calls = []

    class MenuController:
        def start_expedition(self):
            calls.append("started")

    class TargetObject:
        id = 20
        name = "Menu Controller"

        def __init__(self):
            self._components = [MenuController()]

        def get_py_components(self):
            return list(self._components)

    target = TargetObject()
    button = UIButton()
    button.on_click_entries = [
        UIEventEntry(
            target=GameObjectRef(target),
            component_name="MenuController",
            method_name="start_expedition",
            arguments=[],
        )
    ]

    button.on_pointer_click(None)

    assert calls == ["started"]

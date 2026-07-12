from __future__ import annotations

import importlib

from Infernux.core.assets import AssetManager


class _Database:
    def __init__(self, order):
        self.order = order
        self.paths = {"old.txt": "guid"}

    def get_guid_from_path(self, path):
        return self.paths.get(path, "")

    def import_asset(self, path):
        self.order.append("db-import")
        self.paths[path] = "new-guid"
        return "new-guid"

    def reimport_asset(self, path):
        self.order.append("db-reimport")
        return path in self.paths

    def get_meta_by_guid(self, guid):
        return _Metadata() if guid == "guid" else None

    def delete_asset(self, path):
        self.order.append("db-delete")
        self.paths.pop(path, None)
        return True

    def move_asset(self, old_path, new_path):
        self.order.append("db-move")
        guid = self.paths.pop(old_path, "")
        if not guid:
            return False
        self.paths[new_path] = guid
        return True


class _Registry:
    def __init__(self, order):
        self.order = order

    def is_loaded(self, guid):
        return guid == "guid"

    def reload_asset(self, guid):
        self.order.append("registry-reload")
        return True

    def remove_asset(self, guid):
        self.order.append("registry-remove")

    def update_loaded_asset_path(self, old_path, new_path):
        self.order.append("registry-move")


class _Metadata:
    def has_key(self, key):
        return key == "shader_id"

    def get_string(self, key):
        assert key == "shader_id"
        return "previous-shader"


class _NativeEngine:
    has_renderer = True

    def __init__(self, order):
        self.order = order

    def reload_shader_runtime(self, path, previous_shader_id):
        assert path == "old.vert"
        assert previous_shader_id == "previous-shader"
        self.order.append("shader-runtime")
        return ""


def _isolate_side_effects(monkeypatch, order):
    AssetManager._watcher_echo_suppression.clear()
    registry = _Registry(order)
    monkeypatch.setattr(AssetManager, "_get_registry", classmethod(lambda _cls: registry))
    monkeypatch.setattr(AssetManager, "invalidate", classmethod(lambda _cls, _guid: order.append("py-evict")))
    monkeypatch.setattr(
        AssetManager,
        "_emit_editor_asset_changed",
        classmethod(lambda _cls, _path, event="modified": order.append(f"editor-{event}")),
    )
    monkeypatch.setattr(AssetManager, "_invalidate_project_panel_cache", classmethod(lambda _cls: None))


def test_reimport_reloads_registry_before_dependency_publication(monkeypatch):
    order = []
    database = _Database(order)
    _isolate_side_effects(monkeypatch, order)

    assert AssetManager.reimport_asset("old.txt", database=database) is True
    assert order == ["registry-reload", "db-reimport", "py-evict", "editor-modified"]


def test_delete_evicts_registry_before_database_event(monkeypatch):
    order = []
    database = _Database(order)
    _isolate_side_effects(monkeypatch, order)

    assert AssetManager.delete_asset("old.txt", database=database) is True
    assert order == ["registry-remove", "py-evict", "db-delete", "editor-deleted"]


def test_move_commits_mapping_before_patching_loaded_path(monkeypatch):
    order = []
    database = _Database(order)
    _isolate_side_effects(monkeypatch, order)

    assert AssetManager.move_asset("old.txt", "new.txt", database=database) is True
    assert order == ["db-move", "registry-move", "py-evict", "editor-moved"]


def test_shader_reimport_mutates_database_once_before_runtime_compile(monkeypatch):
    order = []
    database = _Database(order)
    database.paths = {"old.vert": "guid"}
    _isolate_side_effects(monkeypatch, order)
    native = _NativeEngine(order)
    monkeypatch.setattr(AssetManager, "_native_engine", classmethod(lambda _cls: native))
    shader_utils = importlib.import_module("Infernux.engine.ui.inspector_shader_utils")
    monkeypatch.setattr(shader_utils, "bump_shader_property_generation", lambda: None)

    assert AssetManager.reimport_asset("old.vert", database=database) is True
    assert order == ["db-reimport", "shader-runtime", "py-evict", "editor-modified"]

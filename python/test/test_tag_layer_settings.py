"""Strict TagLayerSettings document and startup-loading integration tests."""

from __future__ import annotations

import json

from Infernux.engine.engine import Engine
from Infernux.lib import TagLayerManager


def test_invalid_asymmetric_collision_matrix_is_rejected_transactionally():
    manager = TagLayerManager.instance()
    original = manager.serialize()
    document = json.loads(original)
    document["layer_collision_masks"][10] &= ~(1 << 11)
    document["layer_collision_masks"][11] |= 1 << 10

    assert manager.deserialize(json.dumps(document)) is False
    assert manager.serialize() == original


def test_save_atomically_replaces_file_without_temporary_residue(tmp_path):
    manager = TagLayerManager.instance()
    path = tmp_path / "TagLayerSettings.json"
    path.write_text("old content", encoding="utf-8")

    assert manager.save_to_file(str(path)) is True
    document = json.loads(path.read_text(encoding="utf-8"))
    assert document["schema_version"] == 1
    assert len(document["layers"]) == 32
    assert list(tmp_path.glob("TagLayerSettings.json.tmp.*")) == []


def test_engine_common_settings_path_loads_collision_matrix(tmp_path):
    manager = TagLayerManager.instance()
    original = manager.serialize()
    project_settings = tmp_path / "ProjectSettings"
    project_settings.mkdir()
    path = project_settings / "TagLayerSettings.json"

    try:
        manager.set_layers_collide(10, 11, False)
        assert manager.save_to_file(str(path)) is True
        manager.set_layers_collide(10, 11, True)

        Engine._apply_project_settings(str(tmp_path))

        assert manager.get_layers_collide(10, 11) is False
    finally:
        assert manager.deserialize(original) is True

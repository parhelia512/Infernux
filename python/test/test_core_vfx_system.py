from __future__ import annotations

import copy
import json
import os

import pytest

from Infernux.core.node_graph import node_catalog
from Infernux.core.vfx_system import (
    VFX_FORMAT,
    VfxAttribute,
    VfxEmitter,
    VfxSchemaError,
    VfxSystem,
)


def test_default_vfx_system_has_real_vfx_graph_domain():
    system = VfxSystem()
    assert "vfx" in node_catalog.graph_kinds()
    assert len(system.emitters) == 1
    assert system.emitters[0].graph.graph_kind == "vfx"
    assert [node.type_id for node in system.emitters[0].graph.nodes] == [
        "vfx_spawn_rate",
        "vfx_set_velocity",
        "vfx_set_lifetime",
        "vfx_billboard_output",
    ]
    assert system.to_dict()["$format"] == VFX_FORMAT


def test_default_vfx_system_compiles_without_authoring_changes():
    from Infernux.vfx import VfxGraphCompiler

    artifact = VfxGraphCompiler().compile(VfxSystem().emitters[0])

    assert [instruction.opcode for instruction in artifact.spawn] == ["spawn_rate"]
    assert [instruction.opcode for instruction in artifact.output] == ["billboard_output"]


def test_vfx_system_round_trip_preserves_domain_data():
    system = VfxSystem(name="Sparks", parameters=[VfxAttribute("intensity", "float", 1.0)])
    system.emitters[0].name = "Metal"
    system.emitters[0].capacity = 10_000
    system.emitters[0].attributes = [VfxAttribute("temperature", "float", 1200.0)]

    restored = VfxSystem.from_dict(system.to_dict())

    assert restored.to_dict() == system.to_dict()
    assert restored.emitters[0].graph.graph_kind == "vfx"


def test_legacy_empty_vfx_graph_is_upgraded_to_runnable_template():
    from Infernux.vfx import VfxGraphCompiler

    legacy = VfxSystem(name="Legacy", emitters=[VfxEmitter()]).to_dict()
    restored = VfxSystem.from_dict(legacy)

    assert len(restored.emitters[0].graph.nodes) == 4
    assert VfxGraphCompiler().compile(restored.emitters[0]).output[0].opcode == "billboard_output"


@pytest.mark.parametrize(
    "mutation, message",
    [
        (lambda value: value.update({"future": True}), "unknown fields"),
        (lambda value: value["emitters"][0].update({"future": True}), "unknown fields"),
        (lambda value: value["emitters"][0]["graph"].update({"future": True}), "unknown fields"),
        (lambda value: value["emitters"][0]["renderer"].update({"blend": "additive"}), "unknown fields"),
        (lambda value: value["emitters"][0]["graph"]["nodes"].append({"uid": "bad"}), "missing fields"),
        (lambda value: value.update({"$version": 99}), "unsupported VFX system version"),
        (lambda value: value["emitters"][0].update({"capacity": 0}), "positive integer"),
    ],
)
def test_vfx_schema_rejects_unknown_or_malformed_documents(mutation, message):
    value = copy.deepcopy(VfxSystem().to_dict())
    mutation(value)
    with pytest.raises(VfxSchemaError, match=message):
        VfxSystem.from_dict(value)


def test_vfx_system_document_store_round_trip(tmp_path):
    path = tmp_path / "Fire.vfxsystem"
    system = VfxSystem(name="Fire")

    system.save(str(path))
    restored = VfxSystem.load(str(path))

    assert restored.to_dict() == system.to_dict()
    assert os.path.normcase(restored.file_path) == os.path.normcase(str(path.resolve()))
    assert json.loads(path.read_text(encoding="utf-8"))["$format"] == VFX_FORMAT


def test_vfx_editor_shell_opens_and_saves_asset(tmp_path):
    from Infernux.engine.ui.vfx_graph_editor_panel import VfxGraphEditorPanel

    path = tmp_path / "Smoke.vfxsystem"
    VfxSystem(name="Smoke").save(str(path))
    panel = VfxGraphEditorPanel()

    assert panel._open_vfxsystem(str(path))
    assert panel.system.name == "Smoke"
    panel.system.name = "Dense Smoke"
    panel._mark_changed()
    assert panel._do_save()
    assert VfxSystem.load(str(path)).name == "Dense Smoke"

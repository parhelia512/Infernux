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


@pytest.fixture(autouse=True)
def _isolate_vfx_panel_dirty_tracking():
    from Infernux.engine.project_context import clear_panel_tracking

    clear_panel_tracking("vfx_graph_editor")
    try:
        yield
    finally:
        clear_panel_tracking("vfx_graph_editor")


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


def test_untitled_vfx_save_requests_save_as_dialog(tmp_path, monkeypatch):
    from Infernux.engine.ui import asset_save_dialog
    from Infernux.engine.ui.vfx_graph_editor_panel import VfxGraphEditorPanel

    monkeypatch.setattr(asset_save_dialog, "get_project_root", lambda: str(tmp_path))
    monkeypatch.setattr(asset_save_dialog, "is_synthetic_input_frame", lambda: True)
    panel = VfxGraphEditorPanel()
    panel.system.name = "Smoke Trail"

    assert panel._do_save() is False
    assert panel._save_as_dialog.is_open is True
    assert panel._save_as_dialog.name == "Smoke_Trail"


class _VfxDetailContext:
    semantic_capture_enabled = True

    def __init__(self, values):
        self.values = iter(values)
        self.semantics = []

    def label(self, _label):
        pass

    def separator(self):
        pass

    def drag_float(self, *_args):
        return next(self.values)

    def drag_int(self, *_args):
        return int(next(self.values))

    def checkbox(self, *_args):
        return bool(next(self.values))

    def record_semantic_item(self, *args, **kwargs):
        self.semantics.append((args, kwargs))


def test_vfx_node_detail_publishes_stable_typed_parameter_semantics():
    from Infernux.engine.ui.vfx_graph_editor_panel import VfxGraphEditorPanel

    panel = VfxGraphEditorPanel()
    emitter = panel.system.emitters[0]
    spawn = next(node for node in emitter.graph.nodes if node.type_id == "vfx_spawn_rate")
    velocity = next(node for node in emitter.graph.nodes if node.type_id == "vfx_set_velocity")

    panel._selected_node_uid = spawn.uid
    scalar_ctx = _VfxDetailContext([24.0])
    panel._render_node_detail(scalar_ctx)
    assert scalar_ctx.semantics == [
        (
            ("drag_float", "Rate", True, f"vfx.graph.node.{spawn.uid}.parameter.rate"),
            {"numeric_value": 24.0},
        )
    ]

    panel._selected_node_uid = velocity.uid
    vector_ctx = _VfxDetailContext([0.0, 1.5, -0.5])
    panel._render_node_detail(vector_ctx)
    assert [entry[0][3] for entry in vector_ctx.semantics] == [
        f"vfx.graph.node.{velocity.uid}.parameter.value.x",
        f"vfx.graph.node.{velocity.uid}.parameter.value.y",
        f"vfx.graph.node.{velocity.uid}.parameter.value.z",
    ]
    assert [entry[1]["numeric_value"] for entry in vector_ctx.semantics] == [0.0, 1.5, -0.5]


def test_vfx_node_detail_skips_semantic_string_work_on_ordinary_frames():
    from Infernux.engine.ui.vfx_graph_editor_panel import VfxGraphEditorPanel

    panel = VfxGraphEditorPanel()
    spawn = next(
        node for node in panel.system.emitters[0].graph.nodes if node.type_id == "vfx_spawn_rate"
    )
    panel._selected_node_uid = spawn.uid
    ctx = _VfxDetailContext([10.0])
    ctx.semantic_capture_enabled = False

    panel._render_node_detail(ctx)

    assert ctx.semantics == []


def test_vfx_document_publishes_authoritative_name_path_and_dirty_state(tmp_path):
    from Infernux.engine.ui.vfx_graph_editor_panel import VfxGraphEditorPanel

    panel = VfxGraphEditorPanel()
    panel._system.name = "RaceDust"
    panel._file_path = str(tmp_path / "RaceDust.vfxsystem")
    panel._dirty = True
    ctx = _VfxDetailContext([])

    panel._record_document_semantics(ctx)

    by_id = {entry[0][3]: entry for entry in ctx.semantics}
    assert {entry[0][0] for entry in ctx.semantics} == {"status"}
    assert by_id["vfx.document.name"][1]["string_value"] == "RaceDust"
    assert by_id["vfx.document.path"][1]["string_value"] == panel._file_path
    assert by_id["vfx.document.dirty"][1]["bool_value"] is True


def test_deleted_vfx_asset_clears_live_particle_reference_and_marks_scene_dirty(monkeypatch, tmp_path):
    from Infernux.components.component import InxComponent
    from Infernux.components.particle_system import ParticleSystem
    from Infernux.components.serialized_field import get_raw_field_value
    from Infernux.core.asset_ref import VfxSystemRef
    from Infernux.engine import asset_reference_cleanup

    path = tmp_path / "RaceDust.vfxsystem"
    reference = VfxSystemRef(guid="race-dust-guid", path_hint=str(path))
    reference._cached = VfxSystem(name="RaceDust")
    particle = ParticleSystem()
    particle.system = reference
    particle._runtime = object()
    dirty_calls = []
    monkeypatch.setattr(InxComponent, "_active_instances", {11: [particle]})
    monkeypatch.setattr(asset_reference_cleanup, "_mark_active_scene_dirty", lambda: dirty_calls.append(True))

    result = asset_reference_cleanup.clear_deleted_asset_references("race-dust-guid", str(path))

    raw = get_raw_field_value(particle, "system")
    assert result["references_cleared"] == 1
    assert result["components_changed"] == 1
    assert result["fields"] == [f"ParticleSystem:{particle.component_id}.system"]
    assert raw.guid == ""
    assert particle.system is None
    assert particle._runtime is None
    assert dirty_calls == [True]

from __future__ import annotations

import numpy as np
import pytest

from Infernux.core.vfx_system import VfxEmitter
from Infernux.core.vfx_system import VfxSystem
from Infernux.components.particle_system import ParticleSystem
from Infernux.lib import SceneManager
from Infernux.vfx import CpuParticleRuntime, VfxCompileError, VfxGraphCompiler


def _compiled_emitter(*, rate: float = 4.0, capacity: int = 32):
    emitter = VfxEmitter(capacity=capacity)
    graph = emitter.graph
    rate_value = graph.add_node("vfx_float", uid="rate_value", value=rate)
    spawn = graph.add_node("vfx_spawn_rate", uid="spawn")
    velocity = graph.add_node("vfx_set_velocity", uid="velocity", value=[0.0, 2.0, 0.0])
    lifetime = graph.add_node("vfx_set_lifetime", uid="lifetime", value=2.0)
    gravity = graph.add_node("vfx_gravity", uid="gravity", strength=-1.0)
    output = graph.add_node("vfx_billboard_output", uid="output")

    assert graph.add_link(rate_value.uid, "value", spawn.uid, "rate")
    assert graph.add_link(spawn.uid, "exec_out", velocity.uid, "exec_in")
    assert graph.add_link(velocity.uid, "exec_out", lifetime.uid, "exec_in")
    assert graph.add_link(lifetime.uid, "exec_out", gravity.uid, "exec_in")
    assert graph.add_link(gravity.uid, "exec_out", output.uid, "exec_in")
    return emitter, VfxGraphCompiler().compile(emitter)


def test_vfx_compiler_freezes_stage_order_and_linked_constant():
    emitter, artifact = _compiled_emitter(rate=12.0, capacity=64)

    assert artifact.capacity == 64
    assert [item.opcode for item in artifact.spawn] == ["spawn_rate"]
    assert artifact.spawn[0].parameter_dict()["rate"] == 12.0
    assert [item.opcode for item in artifact.initialize] == ["set_velocity", "set_lifetime"]
    assert [item.opcode for item in artifact.update] == ["gravity"]
    assert [item.opcode for item in artifact.output] == ["billboard_output"]
    assert {name for name, _, _ in artifact.attributes} >= {
        "position", "velocity", "color", "size", "age", "lifetime"
    }
    assert emitter.graph.find_node("spawn").data == {}


def test_vfx_compiler_requires_one_output_and_forward_stage_flow():
    emitter = VfxEmitter()
    with pytest.raises(VfxCompileError, match="exactly one Billboard Output"):
        VfxGraphCompiler().compile(emitter)


@pytest.mark.parametrize(
    ("type_id", "data", "message"),
    [
        ("vfx_set_velocity", {"value": [1.0, 2.0]}, "exactly 3 numbers"),
        ("vfx_float", {"value": float("nan")}, "must be finite"),
        ("vfx_set_size", {"value": -1.0}, "must be non-negative"),
        ("vfx_gravity", {"typo": 1.0}, "unknown parameter"),
    ],
)
def test_vfx_compiler_rejects_invalid_node_parameters(type_id, data, message):
    emitter = VfxEmitter()
    node = emitter.graph.add_node(type_id, uid="invalid", **data)
    output = emitter.graph.add_node("vfx_billboard_output", uid="output")
    if node.type_id != "vfx_float":
        assert emitter.graph.add_link(node.uid, "exec_out", output.uid, "exec_in")
    with pytest.raises(VfxCompileError, match=message):
        VfxGraphCompiler().compile(emitter)


def test_vfx_compiler_converts_vec3_constant_to_color():
    emitter = VfxEmitter()
    color = emitter.graph.add_node("vfx_vec3", uid="color", value=[0.2, 0.4, 0.6])
    initialize = emitter.graph.add_node("vfx_set_color", uid="initialize")
    output = emitter.graph.add_node("vfx_billboard_output", uid="output")
    assert emitter.graph.add_link(color.uid, "value", initialize.uid, "value")
    assert emitter.graph.add_link(initialize.uid, "exec_out", output.uid, "exec_in")

    artifact = VfxGraphCompiler().compile(emitter)

    assert artifact.initialize[0].parameter_dict()["value"] == [0.2, 0.4, 0.6, 1.0]

    spawn = emitter.graph.add_node("vfx_spawn_rate", uid="spawn")
    output = emitter.graph.add_node("vfx_billboard_output", uid="output")
    assert emitter.graph.add_link(output.uid, "exec_out", spawn.uid, "exec_in")
    with pytest.raises(VfxCompileError, match="cannot move from output back to spawn"):
        VfxGraphCompiler().compile(emitter)


def test_cpu_particle_runtime_emits_updates_and_returns_contiguous_instances():
    _, artifact = _compiled_emitter(rate=4.0)
    runtime = CpuParticleRuntime(artifact)

    instances = runtime.tick(0.5)

    assert runtime.particle_count == 2
    assert instances.shape == (2, 9)
    assert instances.dtype == np.float32
    assert instances.flags.c_contiguous
    assert np.allclose(instances[:, 1], 0.75)
    assert np.allclose(instances[:, 3], 1.0)
    assert np.allclose(instances[:, 4:8], 1.0)


def test_cpu_particle_runtime_burst_runs_once_and_reuses_instance_storage():
    emitter = VfxEmitter(capacity=8)
    burst = emitter.graph.add_node("vfx_burst", uid="burst", count=3)
    output = emitter.graph.add_node("vfx_billboard_output", uid="output")
    assert emitter.graph.add_link(burst.uid, "exec_out", output.uid, "exec_in")
    runtime = CpuParticleRuntime(VfxGraphCompiler().compile(emitter))

    first = runtime.tick(0.0)
    first_pointer = first.__array_interface__["data"][0]
    second = runtime.tick(0.0)

    assert runtime.particle_count == 3
    assert second.shape == (3, 9)
    assert second.__array_interface__["data"][0] == first_pointer


def test_particle_system_component_runs_in_scene_play_mode(scene, engine, monkeypatch):
    emitter, _ = _compiled_emitter(rate=8.0, capacity=32)
    component = ParticleSystem()
    component.system = VfxSystem(name="Play Mode VFX", emitters=[emitter])
    game_object = scene.create_game_object("ParticleSystemProbe")
    game_object.add_py_component(component)
    monkeypatch.setattr(ParticleSystem, "_native_engine", staticmethod(lambda: engine))

    manager = SceneManager.instance()
    try:
        manager.play()
        assert manager.is_playing()
        component.awake()
        component.start()
        for _ in range(3):
            component.update(0.25)
        assert engine.gpu_residency_snapshot["particle_bytes"] > 0
    finally:
        if manager.is_playing():
            manager.stop()
        component._remove_native_batch()
    assert engine.gpu_residency_snapshot["particle_bytes"] == 0


@pytest.mark.parametrize("delta_time", [-0.1, float("nan"), float("inf")])
def test_cpu_particle_runtime_rejects_invalid_delta_time(delta_time):
    _, artifact = _compiled_emitter()
    with pytest.raises(ValueError, match="finite and non-negative"):
        CpuParticleRuntime(artifact).tick(delta_time)

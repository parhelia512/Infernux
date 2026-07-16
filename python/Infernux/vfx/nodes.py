"""Built-in VFX node catalog."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from Infernux.core.node_graph import (
    NodeTypeDef,
    PinCategory,
    PinDef,
    PinKind,
    node_catalog,
)


@dataclass(frozen=True)
class VfxNodeSpec:
    typedef: NodeTypeDef
    stage: str
    opcode: str
    defaults: Dict[str, Any]
    inputs: Dict[str, str]


def _exec_pins() -> list[PinDef]:
    return [
        PinDef("exec_in", "", PinKind.INPUT, max_connections=1, pin_category=PinCategory.EXEC),
        PinDef("exec_out", "", PinKind.OUTPUT, max_connections=1, pin_category=PinCategory.EXEC),
    ]


def _module(
    type_id: str,
    label: str,
    stage: str,
    opcode: str,
    *,
    data_type: str = "",
    parameter: str = "value",
    default: Any = None,
    color=(0.25, 0.32, 0.36, 1.0),
) -> VfxNodeSpec:
    pins = _exec_pins()
    inputs: Dict[str, str] = {}
    defaults: Dict[str, Any] = {}
    if data_type:
        pins.insert(
            1,
            PinDef(
                parameter,
                parameter.replace("_", " ").title(),
                PinKind.INPUT,
                max_connections=1,
                data_type=data_type,
            ),
        )
        inputs[parameter] = parameter
        defaults[parameter] = default
    return VfxNodeSpec(
        NodeTypeDef(type_id=type_id, label=label, header_color=color, pins=pins, min_width=170.0),
        stage,
        opcode,
        defaults,
        inputs,
    )


def _constant(type_id: str, label: str, data_type: str, default: Any) -> VfxNodeSpec:
    return VfxNodeSpec(
        NodeTypeDef(
            type_id=type_id,
            label=label,
            header_color=(0.28, 0.28, 0.30, 1.0),
            pins=[PinDef("value", "Value", PinKind.OUTPUT, data_type=data_type)],
            min_width=130.0,
        ),
        "value",
        "constant",
        {"value": default},
        {},
    )


_SPECS = [
    _constant("vfx_float", "Value / Float", "float", 0.0),
    _constant("vfx_int", "Value / Integer", "int", 0),
    _constant("vfx_vec3", "Value / Vector 3", "vec3", [0.0, 0.0, 0.0]),
    _constant("vfx_color", "Value / Color", "color", [1.0, 1.0, 1.0, 1.0]),
    _module("vfx_spawn_rate", "Spawn / Rate", "spawn", "spawn_rate", data_type="float", parameter="rate", default=10.0, color=(0.22, 0.38, 0.30, 1.0)),
    _module("vfx_burst", "Spawn / Burst", "spawn", "burst", data_type="int", parameter="count", default=10, color=(0.22, 0.38, 0.30, 1.0)),
    _module("vfx_set_capacity", "Spawn / Capacity", "spawn", "set_capacity", data_type="int", parameter="capacity", default=1000, color=(0.22, 0.38, 0.30, 1.0)),
    _module("vfx_set_position", "Initialize / Position", "initialize", "set_position", data_type="vec3", default=[0.0, 0.0, 0.0], color=(0.26, 0.34, 0.46, 1.0)),
    _module("vfx_set_velocity", "Initialize / Velocity", "initialize", "set_velocity", data_type="vec3", default=[0.0, 1.0, 0.0], color=(0.26, 0.34, 0.46, 1.0)),
    _module("vfx_set_color", "Initialize / Color", "initialize", "set_color", data_type="color", default=[1.0, 1.0, 1.0, 1.0], color=(0.26, 0.34, 0.46, 1.0)),
    _module("vfx_set_size", "Initialize / Size", "initialize", "set_size", data_type="float", default=1.0, color=(0.26, 0.34, 0.46, 1.0)),
    _module("vfx_set_lifetime", "Initialize / Lifetime", "initialize", "set_lifetime", data_type="float", default=5.0, color=(0.26, 0.34, 0.46, 1.0)),
    _module("vfx_add_force", "Update / Add Force", "update", "add_force", data_type="vec3", parameter="force", default=[0.0, 0.0, 0.0], color=(0.42, 0.30, 0.25, 1.0)),
    _module("vfx_gravity", "Update / Gravity", "update", "gravity", data_type="float", parameter="strength", default=-9.81, color=(0.42, 0.30, 0.25, 1.0)),
    _module("vfx_noise", "Update / Turbulence", "update", "noise", data_type="float", parameter="amplitude", default=1.0, color=(0.42, 0.30, 0.25, 1.0)),
    _module("vfx_size_over_life", "Update / Size over Life", "update", "size_over_life", color=(0.42, 0.30, 0.25, 1.0)),
    _module("vfx_kill", "Update / Kill", "update", "kill", data_type="float", parameter="age", default=5.0, color=(0.42, 0.30, 0.25, 1.0)),
    _module("vfx_billboard_output", "Output / Billboard", "output", "billboard_output", color=(0.38, 0.25, 0.38, 1.0)),
]


VFX_NODE_SPECS = {spec.typedef.type_id: spec for spec in _SPECS}
node_catalog.register("vfx", [spec.typedef for spec in _SPECS])


__all__ = ["VFX_NODE_SPECS", "VfxNodeSpec"]

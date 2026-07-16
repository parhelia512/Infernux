"""VFX graph compiler producing immutable, stage-ordered CPU IR."""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any, Dict, List, Sequence, Tuple

from Infernux.core.node_graph import (
    GraphCompiler,
    GraphCycleError,
    GraphDiagnostic,
    PinCategory,
)
from Infernux.core.vfx_system import VfxEmitter

from .nodes import VFX_NODE_SPECS


_STAGE_ORDER = {"spawn": 0, "initialize": 1, "update": 2, "output": 3, "value": -1}


def _parameter_type(spec, parameter_name: str) -> str:
    for pin in spec.typedef.pins:
        if pin.id == parameter_name:
            return pin.data_type
    if spec.opcode == "constant":
        return spec.typedef.output_pins()[0].data_type
    return "any"


def _parameter_error(data_type: str, value: Any) -> str:
    if data_type == "int":
        if not isinstance(value, int) or isinstance(value, bool):
            return "must be an integer"
        return ""
    if data_type == "float":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return "must be a number"
        if not math.isfinite(float(value)):
            return "must be finite"
        return ""
    component_count = {"vec3": 3, "color": 4}.get(data_type)
    if component_count is not None:
        if not isinstance(value, (list, tuple)) or len(value) != component_count:
            return f"must contain exactly {component_count} numbers"
        if any(
            not isinstance(component, (int, float))
            or isinstance(component, bool)
            or not math.isfinite(float(component))
            for component in value
        ):
            return "must contain only finite numbers"
    return ""


def _range_error(opcode: str, value: Any) -> str:
    if opcode in {"spawn_rate", "burst", "noise", "set_size", "kill"} and float(value) < 0.0:
        return "must be non-negative"
    if opcode in {"set_capacity", "set_lifetime"} and float(value) <= 0.0:
        return "must be positive"
    return ""


class VfxCompileError(ValueError):
    def __init__(self, diagnostics: Sequence[GraphDiagnostic]):
        self.diagnostics = tuple(diagnostics)
        super().__init__("; ".join(item.message for item in diagnostics))


@dataclass(frozen=True)
class VfxInstruction:
    stage: str
    opcode: str
    parameters: Tuple[Tuple[str, Any], ...]
    node_uid: str

    def parameter_dict(self) -> Dict[str, Any]:
        return dict(self.parameters)


@dataclass(frozen=True)
class CompiledVfxEmitter:
    capacity: int
    attributes: Tuple[Tuple[str, str, Any], ...]
    spawn: Tuple[VfxInstruction, ...]
    initialize: Tuple[VfxInstruction, ...]
    update: Tuple[VfxInstruction, ...]
    output: Tuple[VfxInstruction, ...]


class VfxGraphCompiler(GraphCompiler):
    def validate(self, graph) -> List[GraphDiagnostic]:
        diagnostics = list(graph.validate())
        for node in graph.nodes:
            spec = VFX_NODE_SPECS.get(node.type_id)
            if spec is None:
                diagnostics.append(GraphDiagnostic(
                    "unknown_vfx_node", f"Unknown VFX node type {node.type_id!r}", node_uid=node.uid
                ))
                continue
            unknown_parameters = set(node.data) - set(spec.defaults)
            for parameter_name in sorted(unknown_parameters):
                diagnostics.append(GraphDiagnostic(
                    "unknown_vfx_parameter",
                    f"{spec.typedef.label} has unknown parameter {parameter_name!r}",
                    node_uid=node.uid,
                ))
            for parameter_name, default in spec.defaults.items():
                value = node.data.get(parameter_name, default)
                error = _parameter_error(_parameter_type(spec, parameter_name), value)
                if not error:
                    error = _range_error(spec.opcode, value)
                if error:
                    diagnostics.append(GraphDiagnostic(
                        "invalid_vfx_parameter",
                        f"{spec.typedef.label}.{parameter_name} {error}",
                        node_uid=node.uid,
                    ))
            for pin_id, parameter_name in spec.inputs.items():
                linked_value = self._linked_constant(graph, node.uid, pin_id)
                if linked_value is None:
                    continue
                error = _parameter_error(_parameter_type(spec, parameter_name), linked_value)
                if not error:
                    error = _range_error(spec.opcode, linked_value)
                if error:
                    diagnostics.append(GraphDiagnostic(
                        "invalid_linked_vfx_parameter",
                        f"{spec.typedef.label}.{parameter_name} {error}",
                        node_uid=node.uid,
                    ))
        try:
            graph.topological_nodes(PinCategory.EXEC)
        except GraphCycleError as exc:
            diagnostics.append(GraphDiagnostic("exec_cycle", str(exc)))

        for link in graph.links_for_category(PinCategory.EXEC):
            source = graph.find_node(link.source_node)
            target = graph.find_node(link.target_node)
            if source is None or target is None:
                continue
            source_spec = VFX_NODE_SPECS.get(source.type_id)
            target_spec = VFX_NODE_SPECS.get(target.type_id)
            if source_spec and target_spec and _STAGE_ORDER[source_spec.stage] > _STAGE_ORDER[target_spec.stage]:
                diagnostics.append(GraphDiagnostic(
                    "stage_regression",
                    f"Exec flow cannot move from {source_spec.stage} back to {target_spec.stage}",
                    link_uid=link.uid,
                ))

        outputs = [node for node in graph.nodes if node.type_id == "vfx_billboard_output"]
        if len(outputs) != 1:
            diagnostics.append(GraphDiagnostic(
                "billboard_output_count", "VFX emitter requires exactly one Billboard Output node"
            ))
        return diagnostics

    def compile(self, emitter: VfxEmitter) -> CompiledVfxEmitter:
        diagnostics = self.validate(emitter.graph)
        if diagnostics:
            raise VfxCompileError(diagnostics)

        ordered = emitter.graph.topological_nodes(PinCategory.EXEC)
        instructions: Dict[str, List[VfxInstruction]] = {
            "spawn": [], "initialize": [], "update": [], "output": []
        }
        capacity = emitter.capacity
        for node in ordered:
            spec = VFX_NODE_SPECS[node.type_id]
            if spec.stage == "value":
                continue
            parameters = dict(spec.defaults)
            parameters.update(node.data)
            for pin_id, parameter_name in spec.inputs.items():
                linked_value = self._linked_constant(emitter.graph, node.uid, pin_id)
                if linked_value is not None:
                    parameters[parameter_name] = linked_value
            instruction = VfxInstruction(
                stage=spec.stage,
                opcode=spec.opcode,
                parameters=tuple(sorted(parameters.items())),
                node_uid=node.uid,
            )
            instructions[spec.stage].append(instruction)
            if spec.opcode == "set_capacity":
                capacity = int(parameters["capacity"])

        if capacity <= 0:
            raise VfxCompileError([GraphDiagnostic("capacity", "Particle capacity must be positive")])
        attributes = tuple(
            (attribute.name, attribute.data_type, attribute.default)
            for attribute in emitter.attributes
        )
        return CompiledVfxEmitter(
            capacity=capacity,
            attributes=attributes,
            spawn=tuple(instructions["spawn"]),
            initialize=tuple(instructions["initialize"]),
            update=tuple(instructions["update"]),
            output=tuple(instructions["output"]),
        )

    @staticmethod
    def _linked_constant(graph, target_uid: str, target_pin: str):
        for link in graph.links:
            if link.target_node != target_uid or link.target_pin != target_pin:
                continue
            source = graph.find_node(link.source_node)
            if source is None:
                return None
            spec = VFX_NODE_SPECS.get(source.type_id)
            if spec is None or spec.opcode != "constant":
                return None
            value = source.data.get("value", spec.defaults["value"])
            source_type = spec.typedef.output_pins()[0].data_type
            target_node = graph.find_node(target_uid)
            target_type = "any"
            if target_node is not None:
                target_spec = VFX_NODE_SPECS.get(target_node.type_id)
                if target_spec is not None:
                    for pin in target_spec.typedef.input_pins():
                        if pin.id == target_pin:
                            target_type = pin.data_type
                            break
            if source_type == "vec3" and target_type == "color":
                return [*value, 1.0]
            if source_type == "color" and target_type == "vec3":
                return list(value[:3])
            return value
        return None


__all__ = [
    "CompiledVfxEmitter",
    "VfxCompileError",
    "VfxGraphCompiler",
    "VfxInstruction",
]

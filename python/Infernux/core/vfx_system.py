"""Strict domain model for ``.vfxsystem`` authoring assets."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from typing import Any, Dict, List

from Infernux.core.node_graph import NodeGraph, node_catalog


VFX_FORMAT = "infernux.vfx_system"
VFX_VERSION = 1


class VfxSchemaError(ValueError):
    pass


def _object(value: Any, location: str) -> dict:
    if not isinstance(value, dict):
        raise VfxSchemaError(f"{location} must be an object")
    return value


def _keys(value: dict, required: set[str], location: str) -> None:
    missing = required - value.keys()
    unknown = value.keys() - required
    if missing:
        raise VfxSchemaError(f"{location} is missing fields: {', '.join(sorted(missing))}")
    if unknown:
        raise VfxSchemaError(f"{location} has unknown fields: {', '.join(sorted(unknown))}")


def _list(value: Any, location: str) -> list:
    if not isinstance(value, list):
        raise VfxSchemaError(f"{location} must be an array")
    return value


def _validate_graph_document(value: Any, location: str) -> dict:
    graph = _object(value, location)
    _keys(graph, {"nodes", "links"}, location)
    for index, node in enumerate(_list(graph["nodes"], f"{location}.nodes")):
        item_location = f"{location}.nodes[{index}]"
        node = _object(node, item_location)
        _keys(node, {"uid", "type_id", "pos_x", "pos_y", "data"}, item_location)
        _object(node["data"], f"{item_location}.data")
    for index, link in enumerate(_list(graph["links"], f"{location}.links")):
        item_location = f"{location}.links[{index}]"
        link = _object(link, item_location)
        _keys(
            link,
            {"uid", "source_node", "source_pin", "target_node", "target_pin", "data"},
            item_location,
        )
        _object(link["data"], f"{item_location}.data")
    return graph


@dataclass
class VfxAttribute:
    name: str
    data_type: str
    default: Any

    def to_dict(self) -> dict:
        return {"name": self.name, "type": self.data_type, "default": self.default}

    @classmethod
    def from_dict(cls, value: Any, location: str) -> "VfxAttribute":
        value = _object(value, location)
        _keys(value, {"name", "type", "default"}, location)
        name = value["name"]
        data_type = value["type"]
        if not isinstance(name, str) or not name:
            raise VfxSchemaError(f"{location}.name must be a non-empty string")
        if not isinstance(data_type, str) or not data_type:
            raise VfxSchemaError(f"{location}.type must be a non-empty string")
        return cls(name=name, data_type=data_type, default=value["default"])


@dataclass
class VfxRenderer:
    mode: str = "billboard"
    material: str = ""

    def to_dict(self) -> dict:
        return {"mode": self.mode, "material": self.material}

    @classmethod
    def from_dict(cls, value: Any, location: str) -> "VfxRenderer":
        value = _object(value, location)
        _keys(value, {"mode", "material"}, location)
        if value["mode"] != "billboard":
            raise VfxSchemaError(f"{location}.mode must be 'billboard' in version 1")
        if not isinstance(value["material"], str):
            raise VfxSchemaError(f"{location}.material must be a GUID string")
        return cls(mode=value["mode"], material=value["material"])


def _standard_particle_attributes() -> List[VfxAttribute]:
    return [
        VfxAttribute("position", "vec3", [0.0, 0.0, 0.0]),
        VfxAttribute("velocity", "vec3", [0.0, 0.0, 0.0]),
        VfxAttribute("color", "color", [1.0, 1.0, 1.0, 1.0]),
        VfxAttribute("size", "float", 1.0),
        VfxAttribute("age", "float", 0.0),
        VfxAttribute("lifetime", "float", 5.0),
    ]


@dataclass
class VfxEmitter:
    name: str = "Emitter"
    capacity: int = 1000
    graph: NodeGraph = field(default_factory=lambda: NodeGraph(graph_kind="vfx"))
    renderer: VfxRenderer = field(default_factory=VfxRenderer)
    attributes: List[VfxAttribute] = field(default_factory=_standard_particle_attributes)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "capacity": self.capacity,
            "graph": self.graph.to_dict(),
            "renderer": self.renderer.to_dict(),
            "attributes": [attribute.to_dict() for attribute in self.attributes],
        }

    @classmethod
    def from_dict(cls, value: Any, location: str) -> "VfxEmitter":
        value = _object(value, location)
        _keys(value, {"name", "capacity", "graph", "renderer", "attributes"}, location)
        if not isinstance(value["name"], str) or not value["name"]:
            raise VfxSchemaError(f"{location}.name must be a non-empty string")
        capacity = value["capacity"]
        if not isinstance(capacity, int) or isinstance(capacity, bool) or capacity <= 0:
            raise VfxSchemaError(f"{location}.capacity must be a positive integer")
        graph_document = _validate_graph_document(value["graph"], f"{location}.graph")
        graph = NodeGraph(graph_kind="vfx")
        graph.load_dict(graph_document)
        attributes = [
            VfxAttribute.from_dict(item, f"{location}.attributes[{index}]")
            for index, item in enumerate(_list(value["attributes"], f"{location}.attributes"))
        ]
        if len({attribute.name for attribute in attributes}) != len(attributes):
            raise VfxSchemaError(f"{location}.attributes contains duplicate names")
        return cls(
            name=value["name"],
            capacity=capacity,
            graph=graph,
            renderer=VfxRenderer.from_dict(value["renderer"], f"{location}.renderer"),
            attributes=attributes,
        )


def _default_vfx_emitter() -> VfxEmitter:
    """Build a visible, immediately runnable graph for newly created assets."""
    # Importing the node module registers the VFX catalog. Keep this lazy so
    # schema-only consumers do not pull the editor/compiler package eagerly.
    from Infernux.vfx import nodes as _vfx_nodes  # noqa: F401

    emitter = VfxEmitter()
    graph = emitter.graph
    spawn = graph.add_node("vfx_spawn_rate", 40.0, 80.0, rate=10.0)
    velocity = graph.add_node("vfx_set_velocity", 260.0, 80.0, value=[0.0, 1.0, 0.0])
    lifetime = graph.add_node("vfx_set_lifetime", 480.0, 80.0, value=5.0)
    output = graph.add_node("vfx_billboard_output", 700.0, 80.0)
    graph.add_link(spawn.uid, "exec_out", velocity.uid, "exec_in")
    graph.add_link(velocity.uid, "exec_out", lifetime.uid, "exec_in")
    graph.add_link(lifetime.uid, "exec_out", output.uid, "exec_in")
    return emitter


@dataclass
class VfxSystem:
    name: str = "New VFX System"
    emitters: List[VfxEmitter] = field(default_factory=lambda: [_default_vfx_emitter()])
    parameters: List[VfxAttribute] = field(default_factory=list)
    file_path: str = field(default="", repr=False, compare=False)

    def to_dict(self) -> dict:
        return {
            "$format": VFX_FORMAT,
            "$version": VFX_VERSION,
            "name": self.name,
            "emitters": [emitter.to_dict() for emitter in self.emitters],
            "parameters": [parameter.to_dict() for parameter in self.parameters],
        }

    @classmethod
    def from_dict(cls, value: Any) -> "VfxSystem":
        value = _object(value, "$")
        _keys(value, {"$format", "$version", "name", "emitters", "parameters"}, "$")
        if value["$format"] != VFX_FORMAT:
            raise VfxSchemaError(f"$.$format must be {VFX_FORMAT!r}")
        if value["$version"] != VFX_VERSION:
            raise VfxSchemaError(f"unsupported VFX system version: {value['$version']!r}")
        if not isinstance(value["name"], str) or not value["name"]:
            raise VfxSchemaError("$.name must be a non-empty string")
        emitters = [
            VfxEmitter.from_dict(item, f"$.emitters[{index}]")
            for index, item in enumerate(_list(value["emitters"], "$.emitters"))
        ]
        # Early version-1 assets were created with an entirely empty graph,
        # even though the runtime requires one output node. Upgrade only that
        # unmistakable template state; authored non-empty graphs stay intact.
        for emitter in emitters:
            if not emitter.graph.nodes and not emitter.graph.links:
                emitter.graph = _default_vfx_emitter().graph
        parameters = [
            VfxAttribute.from_dict(item, f"$.parameters[{index}]")
            for index, item in enumerate(_list(value["parameters"], "$.parameters"))
        ]
        if len({parameter.name for parameter in parameters}) != len(parameters):
            raise VfxSchemaError("$.parameters contains duplicate names")
        return cls(name=value["name"], emitters=emitters, parameters=parameters)

    def save(self, path: str = "") -> None:
        target = path or self.file_path
        if not target:
            raise ValueError("VFX system save requires a target path")
        from Infernux.core.document_store import write_document_text

        write_document_text(target, json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n")
        self.file_path = target

    @classmethod
    def load(cls, path: str) -> "VfxSystem":
        with open(path, "r", encoding="utf-8") as stream:
            value = json.load(stream)
        system = cls.from_dict(value)
        system.file_path = os.path.abspath(path)
        return system


# Establish the second real graph domain before S4 registers its node set.
node_catalog.register("vfx", [])


__all__ = [
    "VFX_FORMAT",
    "VFX_VERSION",
    "VfxAttribute",
    "VfxEmitter",
    "VfxRenderer",
    "VfxSchemaError",
    "VfxSystem",
]

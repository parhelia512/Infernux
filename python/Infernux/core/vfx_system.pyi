from __future__ import annotations

from typing import Any

from Infernux.core.node_graph import NodeGraph

VFX_FORMAT: str
VFX_VERSION: int

class VfxSchemaError(ValueError): ...

class VfxAttribute:
    name: str
    data_type: str
    default: Any
    def __init__(self, name: str, data_type: str, default: Any) -> None: ...
    def to_dict(self) -> dict: ...

class VfxRenderer:
    mode: str
    material: str
    def __init__(self, mode: str = ..., material: str = ...) -> None: ...
    def to_dict(self) -> dict: ...

class VfxEmitter:
    name: str
    capacity: int
    graph: NodeGraph
    renderer: VfxRenderer
    attributes: list[VfxAttribute]
    def __init__(
        self,
        name: str = ...,
        capacity: int = ...,
        graph: NodeGraph = ...,
        renderer: VfxRenderer = ...,
        attributes: list[VfxAttribute] = ...,
    ) -> None: ...
    def to_dict(self) -> dict: ...

class VfxSystem:
    name: str
    emitters: list[VfxEmitter]
    parameters: list[VfxAttribute]
    file_path: str
    def __init__(
        self,
        name: str = ...,
        emitters: list[VfxEmitter] = ...,
        parameters: list[VfxAttribute] = ...,
        file_path: str = ...,
    ) -> None: ...
    def to_dict(self) -> dict: ...
    @classmethod
    def from_dict(cls, value: Any) -> VfxSystem: ...
    def save(self, path: str = ...) -> None: ...
    @classmethod
    def load(cls, path: str) -> VfxSystem: ...

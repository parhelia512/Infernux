"""Type stubs for InfEngine.renderstack.sharpen_effect."""

from __future__ import annotations

from typing import List, TYPE_CHECKING

from InfEngine.renderstack.fullscreen_effect import FullScreenEffect

if TYPE_CHECKING:
    from InfEngine.rendergraph.graph import RenderGraph
    from InfEngine.renderstack.resource_bus import ResourceBus


class SharpenEffect(FullScreenEffect):
    """Contrast Adaptive Sharpening (CAS) post-processing effect.

    AMD FidelityFX CAS-inspired — enhances local contrast without
    visible halos.  Placed after tone mapping to sharpen the final LDR image.

    Attributes:
        intensity: Sharpening strength (0 = off, 1 = maximum).
    """

    name: str
    injection_point: str
    default_order: int
    menu_path: str

    intensity: float

    def get_shader_list(self) -> List[str]: ...
    def setup_passes(self, graph: RenderGraph, bus: ResourceBus) -> None: ...

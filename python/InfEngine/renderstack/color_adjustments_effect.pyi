"""Type stubs for InfEngine.renderstack.color_adjustments_effect."""

from __future__ import annotations

from typing import List, TYPE_CHECKING

from InfEngine.renderstack.fullscreen_effect import FullScreenEffect

if TYPE_CHECKING:
    from InfEngine.rendergraph.graph import RenderGraph
    from InfEngine.renderstack.resource_bus import ResourceBus


class ColorAdjustmentsEffect(FullScreenEffect):
    """URP-aligned Color Adjustments post-processing effect.

    Post-exposure, contrast, saturation, hue shift — operates in HDR space.

    Attributes:
        post_exposure: Exposure offset in EV stops (default 0.0).
        contrast: Contrast adjustment (-100 to 100).
        saturation: Saturation adjustment (-100 to 100).
        hue_shift: Hue rotation in degrees (-180 to 180).
    """

    name: str
    injection_point: str
    default_order: int
    menu_path: str

    post_exposure: float
    contrast: float
    saturation: float
    hue_shift: float

    def get_shader_list(self) -> List[str]: ...
    def setup_passes(self, graph: RenderGraph, bus: ResourceBus) -> None: ...

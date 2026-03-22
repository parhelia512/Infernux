"""Type stubs for InfEngine.renderstack.film_grain_effect."""

from __future__ import annotations

from typing import List, TYPE_CHECKING

from InfEngine.renderstack.fullscreen_effect import FullScreenEffect

if TYPE_CHECKING:
    from InfEngine.rendergraph.graph import RenderGraph
    from InfEngine.renderstack.resource_bus import ResourceBus


class FilmGrainEffect(FullScreenEffect):
    """URP-aligned Film Grain post-processing effect.

    Adds cinematic noise overlay.  Operates in LDR space (after tone mapping).

    Attributes:
        intensity: Grain strength (0 = off, 1 = heavy).
        response: Luminance response (0 = uniform, 1 = highlights only).
    """

    name: str
    injection_point: str
    default_order: int
    menu_path: str

    intensity: float
    response: float

    def get_shader_list(self) -> List[str]: ...
    def setup_passes(self, graph: RenderGraph, bus: ResourceBus) -> None: ...

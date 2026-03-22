"""Type stubs for InfEngine.renderstack.white_balance_effect."""

from __future__ import annotations

from typing import List, TYPE_CHECKING

from InfEngine.renderstack.fullscreen_effect import FullScreenEffect

if TYPE_CHECKING:
    from InfEngine.rendergraph.graph import RenderGraph
    from InfEngine.renderstack.resource_bus import ResourceBus


class WhiteBalanceEffect(FullScreenEffect):
    """URP-aligned White Balance post-processing effect.

    Color temperature and tint adjustment using Bradford chromatic adaptation.

    Attributes:
        temperature: Warm/cool shift (-100 to 100, 0 = neutral).
        tint: Green/magenta shift (-100 to 100, 0 = neutral).
    """

    name: str
    injection_point: str
    default_order: int
    menu_path: str

    temperature: float
    tint: float

    def get_shader_list(self) -> List[str]: ...
    def setup_passes(self, graph: RenderGraph, bus: ResourceBus) -> None: ...

"""Type stubs for InfEngine.renderstack.bloom_effect — Unity-aligned Bloom post-processing."""

from __future__ import annotations

from typing import List, TYPE_CHECKING

from InfEngine.renderstack.fullscreen_effect import FullScreenEffect

if TYPE_CHECKING:
    from InfEngine.rendergraph.graph import RenderGraph
    from InfEngine.renderstack.resource_bus import ResourceBus


class BloomEffect(FullScreenEffect):
    """Unity-aligned Bloom post-processing effect.

    Uses a progressive downsample/upsample chain with soft threshold
    and scatter-based diffusion, matching Unity URP's Bloom implementation.

    Attributes:
        threshold: Minimum brightness for bloom contribution (default 1.0).
        intensity: Final bloom intensity multiplier (default 0.8).
        scatter: Diffusion / spread factor (default 0.7).
        clamp: Maximum brightness to prevent fireflies (default 65472).
        tint_r: Red channel tint (0–1).
        tint_g: Green channel tint (0–1).
        tint_b: Blue channel tint (0–1).
        max_iterations: Maximum downsample/upsample iterations (1–8).
    """

    name: str
    injection_point: str
    default_order: int
    menu_path: str

    threshold: float
    intensity: float
    scatter: float
    clamp: float
    tint_r: float
    tint_g: float
    tint_b: float
    max_iterations: int

    def get_shader_list(self) -> List[str]: ...
    def setup_passes(self, graph: RenderGraph, bus: ResourceBus) -> None: ...

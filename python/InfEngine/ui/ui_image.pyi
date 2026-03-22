"""Type stubs for InfEngine.ui.ui_image — rectangular image UI element."""

from __future__ import annotations

from InfEngine.ui.inf_ui_screen_component import InfUIScreenComponent


class UIImage(InfUIScreenComponent):
    """Screen-space image element rendered from a texture asset.

    Inherits ``x``, ``y``, ``width``, ``height``, ``opacity``,
    ``corner_radius``, ``rotation``, ``mirror_x``, ``mirror_y``
    from ``InfUIScreenComponent``.

    Attributes:
        texture_path: Path to texture asset (drag from Project panel).
        color: Tint color as ``[R, G, B, A]`` (0–1 each).

    Example::

        img = game_object.add_component(UIImage)
        img.texture_path = "Assets/Textures/logo.png"
        img.color = [1.0, 1.0, 1.0, 0.8]
    """

    texture_path: str
    color: list

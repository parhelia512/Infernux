"""Type stubs for InfEngine.ui.inf_ui_component — abstract base for all UI components."""

from __future__ import annotations

from InfEngine.components import InfComponent


class InfUIComponent(InfComponent):
    """Base class for every UI component in InfEngine.

    All UI-related components (screen-space, world-space, canvas, etc.)
    should inherit from this class instead of ``InfComponent`` directly.

    The ``_component_category_`` is set to ``"UI"`` so that all UI
    components are grouped together in the *Add Component* menu.
    """

    _component_category_: str

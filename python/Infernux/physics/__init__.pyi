from __future__ import annotations

from typing import Any, List, Optional, Tuple, Union


class Physics:
    """Global physics system for raycasting and spatial queries."""

    @classmethod
    @property
    def gravity(cls) -> Any:
        """The global gravity vector applied to all rigidbodies."""
        ...
    @classmethod
    @gravity.setter
    def gravity(cls, value: Any) -> None: ...

    @staticmethod
    def get_gravity() -> Any:
        """Get the global gravity vector."""
        ...
    @staticmethod
    def set_gravity(value: Any) -> None:
        """Set the global gravity vector."""
        ...

    @staticmethod
    def raycast(
        origin: Any,
        direction: Any,
        max_distance: float = ...,
        layer_mask: int = ...,
        query_triggers: bool = ...,
    ) -> Optional[Any]:
        """Cast a ray and return the first hit, or None."""
        ...

    @staticmethod
    def raycast_all(
        origin: Any,
        direction: Any,
        max_distance: float = ...,
        layer_mask: int = ...,
        query_triggers: bool = ...,
    ) -> List[Any]:
        """Cast a ray and return all hits."""
        ...

    @staticmethod
    def overlap_sphere(
        center: Any,
        radius: float,
        layer_mask: int = ...,
        query_triggers: bool = ...,
    ) -> List[Any]:
        """Find all colliders within a sphere."""
        ...

    @staticmethod
    def overlap_box(
        center: Any,
        half_extents: Any,
        orientation: Any = ...,
        layer_mask: int = ...,
        query_triggers: bool = ...,
    ) -> List[Any]:
        """Find all colliders within an oriented box."""
        ...

    @staticmethod
    def overlap_capsule(point0: Any, point1: Any, radius: float, layer_mask: int = ..., query_triggers: bool = ...) -> List[Any]: ...

    @staticmethod
    def sphere_cast(
        origin: Any,
        radius: float,
        direction: Any,
        max_distance: float = ...,
        layer_mask: int = ...,
        query_triggers: bool = ...,
    ) -> Optional[Any]:
        """Cast a sphere along a direction and return the first hit, or None."""
        ...

    @staticmethod
    def box_cast(
        center: Any,
        half_extents: Any,
        direction: Any,
        orientation: Any = ...,
        max_distance: float = ...,
        layer_mask: int = ...,
        query_triggers: bool = ...,
    ) -> Optional[Any]:
        """Cast a box along a direction and return the first hit, or None."""
        ...

    @staticmethod
    def capsule_cast(point0: Any, point1: Any, radius: float, direction: Any, max_distance: float = ..., layer_mask: int = ..., query_triggers: bool = ...) -> Optional[Any]: ...

    @staticmethod
    def ignore_layer_collision(layer1: int, layer2: int, ignore: bool = ...) -> None:
        """Set whether collisions between two layers are ignored."""
        ...

    @staticmethod
    def get_ignore_layer_collision(layer1: int, layer2: int) -> bool:
        """Check if collisions between two layers are ignored."""
        ...


__all__ = ["Physics"]

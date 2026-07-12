"""
Infernux.physics — Physics query API (Unity: UnityEngine.Physics).

Provides ``Physics.raycast()``, ``Physics.raycast_all()``,
``Physics.overlap_sphere()``, ``Physics.overlap_box()``, ``Physics.overlap_capsule()``,
``Physics.sphere_cast()``, ``Physics.box_cast()``, ``Physics.capsule_cast()``,
and gravity / layer-collision control.

Example::

    from Infernux.physics import Physics
    from Infernux.math import Vector3

    hit = Physics.raycast(Vector3(0, 10, 0), Vector3.down)
    if hit is not None:
        print(f"Hit {hit.game_object.name} at distance {hit.distance}")
"""

from __future__ import annotations

from typing import Optional, List

from Infernux.math.coerce import coerce_quat, coerce_vec3
from Infernux.lib import Physics as _CppPhysics


class _PhysicsMeta(type):
    @property
    def gravity(cls):
        return _CppPhysics.get_gravity()

    @gravity.setter
    def gravity(cls, value):
        _CppPhysics.set_gravity(coerce_vec3(value))


class Physics(metaclass=_PhysicsMeta):
    """Static physics query interface (mirrors Unity's Physics class).

    All methods delegate to the C++ ``PhysicsWorld`` singleton via pybind11.
    """

    # ------------------------------------------------------------------
    # Raycast
    # ------------------------------------------------------------------

    @staticmethod
    def raycast(origin, direction, max_distance: float = 1000.0, layer_mask: int = (0xFFFFFFFF & ~(1 << 2)),
                query_triggers: bool = True):
        """Cast a ray and return the closest RaycastHit, or None.

        Args:
            origin: Ray origin as ``Vector3`` or ``(x, y, z)`` tuple.
            direction: Ray direction as ``Vector3`` or ``(x, y, z)`` tuple.
            max_distance: Maximum ray distance (default 1000).
            layer_mask: 32-bit layer mask used to filter hits.
            query_triggers: Whether trigger colliders should be returned.

        Returns:
            A ``RaycastHit`` object with ``point``, ``normal``, ``distance``,
            ``game_object``, and ``collider`` attributes — or ``None``.
        """
        o = coerce_vec3(origin)
        d = coerce_vec3(direction)
        return _CppPhysics.raycast(o, d, max_distance, int(layer_mask), bool(query_triggers))

    @staticmethod
    def raycast_all(origin, direction, max_distance: float = 1000.0, layer_mask: int = (0xFFFFFFFF & ~(1 << 2)),
                    query_triggers: bool = True):
        """Cast a ray and return all hits.

        Returns:
            A list of ``RaycastHit`` objects.
        """
        o = coerce_vec3(origin)
        d = coerce_vec3(direction)
        return _CppPhysics.raycast_all(o, d, max_distance, int(layer_mask), bool(query_triggers))

    # ------------------------------------------------------------------
    # Overlap queries
    # ------------------------------------------------------------------

    @staticmethod
    def overlap_sphere(center, radius: float, layer_mask: int = (0xFFFFFFFF & ~(1 << 2)),
                       query_triggers: bool = True):
        """Find all colliders within a sphere.

        Args:
            center: World-space center of the sphere.
            radius: Radius of the sphere.
            layer_mask: 32-bit layer mask.
            query_triggers: Whether to include trigger colliders.

        Returns:
            A list of ``Collider`` objects overlapping the sphere.
        """
        c = coerce_vec3(center)
        return _CppPhysics.overlap_sphere(c, float(radius), int(layer_mask), bool(query_triggers))

    @staticmethod
    def overlap_box(center, half_extents, orientation=None, layer_mask: int = (0xFFFFFFFF & ~(1 << 2)),
                    query_triggers: bool = True):
        """Find all colliders within an oriented box.

        Args:
            center: World-space center of the box.
            half_extents: Half-extents ``(hx, hy, hz)`` of the box.
            layer_mask: 32-bit layer mask.
            query_triggers: Whether to include trigger colliders.

        Returns:
            A list of ``Collider`` objects overlapping the box.
        """
        c = coerce_vec3(center)
        he = coerce_vec3(half_extents)
        return _CppPhysics.overlap_box(c, he, coerce_quat(orientation), int(layer_mask), bool(query_triggers))

    @staticmethod
    def overlap_capsule(point0, point1, radius: float, layer_mask: int = (0xFFFFFFFF & ~(1 << 2)),
                        query_triggers: bool = True):
        """Find all colliders within a capsule defined by two segment endpoints."""
        return _CppPhysics.overlap_capsule(
            coerce_vec3(point0), coerce_vec3(point1), float(radius), int(layer_mask), bool(query_triggers)
        )

    # ------------------------------------------------------------------
    # Shape casts
    # ------------------------------------------------------------------

    @staticmethod
    def sphere_cast(origin, radius: float, direction, max_distance: float = 1000.0,
                    layer_mask: int = (0xFFFFFFFF & ~(1 << 2)), query_triggers: bool = True):
        """Cast a sphere along a direction and return closest RaycastHit, or None.

        Args:
            origin: Start center of the sphere.
            radius: Radius of the sphere.
            direction: Direction to cast.
            max_distance: Maximum cast distance.

        Returns:
            A ``RaycastHit`` or ``None``.
        """
        o = coerce_vec3(origin)
        d = coerce_vec3(direction)
        return _CppPhysics.sphere_cast(o, float(radius), d, max_distance, int(layer_mask), bool(query_triggers))

    @staticmethod
    def box_cast(center, half_extents, direction, orientation=None, max_distance: float = 1000.0,
                 layer_mask: int = (0xFFFFFFFF & ~(1 << 2)), query_triggers: bool = True):
        """Cast a box along a direction and return closest RaycastHit, or None.

        Args:
            center: Start center of the box.
            half_extents: Half-extents ``(hx, hy, hz)`` of the box.
            direction: Direction to cast.
            max_distance: Maximum cast distance.

        Returns:
            A ``RaycastHit`` or ``None``.
        """
        c = coerce_vec3(center)
        he = coerce_vec3(half_extents)
        d = coerce_vec3(direction)
        return _CppPhysics.box_cast(
            c, he, d, coerce_quat(orientation), max_distance, int(layer_mask), bool(query_triggers)
        )

    @staticmethod
    def capsule_cast(point0, point1, radius: float, direction, max_distance: float = 1000.0,
                     layer_mask: int = (0xFFFFFFFF & ~(1 << 2)), query_triggers: bool = True):
        """Cast a capsule and return the closest RaycastHit, or None."""
        return _CppPhysics.capsule_cast(
            coerce_vec3(point0), coerce_vec3(point1), float(radius), coerce_vec3(direction), max_distance,
            int(layer_mask), bool(query_triggers)
        )

    # ------------------------------------------------------------------
    # Layer collision control
    # ------------------------------------------------------------------

    @staticmethod
    def ignore_layer_collision(layer1: int, layer2: int, ignore: bool = True):
        """Set whether two layers should ignore collisions with each other.

        Args:
            layer1: First layer index (0-31).
            layer2: Second layer index (0-31).
            ignore: If True, disable collisions; if False, enable them.
        """
        _CppPhysics.ignore_layer_collision(int(layer1), int(layer2), bool(ignore))

    @staticmethod
    def get_ignore_layer_collision(layer1: int, layer2: int) -> bool:
        """Check if two layers are set to ignore collisions.

        Returns:
            True if the layers ignore collisions with each other.
        """
        return _CppPhysics.get_ignore_layer_collision(int(layer1), int(layer2))


__all__ = ["Physics"]

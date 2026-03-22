"""
Rigidbody — Python BuiltinComponent wrapper for C++ Rigidbody.

Mirrors Unity's ``Rigidbody`` component. When attached alongside a Collider,
the Collider's body becomes dynamic (affected by gravity, forces, etc.).

Example::

    from InfEngine.components.builtin import Rigidbody
    from InfEngine.math import Vector3

    class MyScript(InfComponent):
        def start(self):
            rb = self.get_component(Rigidbody)
            rb.mass = 2.0
            rb.use_gravity = True

        def fixed_update(self, dt):
            rb = self.get_component(Rigidbody)
            rb.add_force(Vector3(0, 10, 0))
"""

from __future__ import annotations

from enum import IntEnum, IntFlag

from InfEngine.components.builtin_component import BuiltinComponent, CppProperty
from InfEngine.components.serialized_field import FieldType
from InfEngine.math.coerce import coerce_vec3
from InfEngine.lib import ForceMode as _ForceMode


class RigidbodyConstraints(IntFlag):
    """Unity-style rigidbody constraint bitmask."""

    None_ = 0
    FreezePositionX = 2
    FreezePositionY = 4
    FreezePositionZ = 8
    FreezePosition = FreezePositionX | FreezePositionY | FreezePositionZ
    FreezeRotationX = 16
    FreezeRotationY = 32
    FreezeRotationZ = 64
    FreezeRotation = FreezeRotationX | FreezeRotationY | FreezeRotationZ
    FreezeAll = FreezePosition | FreezeRotation


class CollisionDetectionMode(IntEnum):
    """Unity-style CCD modes.

    Backend mapping:
    Dynamic ``Continuous`` and any ``ContinuousDynamic`` use Jolt LinearCast
    sweep CCD.
    Kinematic ``Continuous`` defaults to speculative contacts so MovePosition /
    MoveRotation bodies keep Unity-like expectations without forcing full sweeps.
    ``ContinuousSpeculative`` uses discrete motion quality plus Jolt's
    speculative contacts, which is the closest engine-level match.
    """

    Discrete = 0
    Continuous = 1
    ContinuousDynamic = 2
    ContinuousSpeculative = 3


class RigidbodyInterpolation(IntEnum):
    """Unity-style rigidbody interpolation mode."""

    None_ = 0
    Interpolate = 1


class Rigidbody(BuiltinComponent):
    """Python wrapper for the C++ Rigidbody component."""

    _cpp_type_name = "Rigidbody"

    _component_category_ = "Physics"

    # ---- Serialized properties (displayed in Inspector) ----

    mass = CppProperty(
        "mass",
        FieldType.FLOAT,
        default=1.0,
        tooltip="Mass in kilograms",
        range=(0.001, 1000.0),
        slider=False,
    )

    drag = CppProperty(
        "drag",
        FieldType.FLOAT,
        default=0.001,
        tooltip="Linear drag coefficient",
        range=(0.001, 100.0),
        slider=False,
    )

    angular_drag = CppProperty(
        "angular_drag",
        FieldType.FLOAT,
        default=0.05,
        tooltip="Angular drag coefficient",
        range=(0.001, 100.0),
        slider=False,
    )

    use_gravity = CppProperty(
        "use_gravity",
        FieldType.BOOL,
        default=True,
        tooltip="Should this rigidbody be affected by gravity?",
    )

    is_kinematic = CppProperty(
        "is_kinematic",
        FieldType.BOOL,
        default=False,
        tooltip="If enabled, the object is not driven by physics but by script/animation",
    )

    collision_detection_mode = CppProperty(
        "collision_detection_mode",
        FieldType.ENUM,
        default=CollisionDetectionMode.Discrete,
        enum_type=CollisionDetectionMode,
        enum_labels=["Discrete", "Continuous", "Continuous Dynamic", "Continuous Speculative"],
        tooltip="Unity-style CCD mode. Dynamic Continuous uses sweep CCD, Kinematic Continuous defaults to speculative contacts, ContinuousDynamic forces sweep CCD, and ContinuousSpeculative uses speculative contacts.",
        range=(0, 3),
    )

    interpolation = CppProperty(
        "interpolation",
        FieldType.ENUM,
        default=RigidbodyInterpolation.Interpolate,
        enum_type=RigidbodyInterpolation,
        enum_labels=["None", "Interpolate"],
        tooltip="Smooths presentation between fixed physics steps.",
        range=(0, 1),
    )

    # ---- Per-axis freeze constraints (displayed as checkboxes) ----

    freeze_position_x = CppProperty(
        "freeze_position_x", FieldType.BOOL, default=False,
        tooltip="Freeze movement on the X axis",
    )
    freeze_position_y = CppProperty(
        "freeze_position_y", FieldType.BOOL, default=False,
        tooltip="Freeze movement on the Y axis",
    )
    freeze_position_z = CppProperty(
        "freeze_position_z", FieldType.BOOL, default=False,
        tooltip="Freeze movement on the Z axis",
    )
    freeze_rotation_x = CppProperty(
        "freeze_rotation_x", FieldType.BOOL, default=False,
        tooltip="Freeze rotation on the X axis",
    )
    freeze_rotation_y = CppProperty(
        "freeze_rotation_y", FieldType.BOOL, default=False,
        tooltip="Freeze rotation on the Y axis",
    )
    freeze_rotation_z = CppProperty(
        "freeze_rotation_z", FieldType.BOOL, default=False,
        tooltip="Freeze rotation on the Z axis",
    )

    _FREEZE_FIELDS = frozenset({
        'freeze_position_x', 'freeze_position_y', 'freeze_position_z',
        'freeze_rotation_x', 'freeze_rotation_y', 'freeze_rotation_z',
    })

    # ------------------------------------------------------------------
    # Custom inspector: freeze checkboxes in compact two-row layout
    # ------------------------------------------------------------------

    def render_inspector(self, ctx) -> None:
        from InfEngine.engine.ui.inspector_components import (
            render_builtin_via_setters, _record_builtin_property,
        )

        # Standard properties (skip freeze fields — rendered below)
        render_builtin_via_setters(ctx, self, type(self),
                                   skip_fields=self._FREEZE_FIELDS)

        # Freeze Transform section
        ctx.separator()
        ctx.label("Freeze Transform")
        self._render_freeze_row(ctx, "Position", "freeze_position")
        self._render_freeze_row(ctx, "Rotation", "freeze_rotation")

    def _render_freeze_row(self, ctx, label: str, prefix: str) -> None:
        from InfEngine.engine.ui.inspector_components import _record_builtin_property

        ctx.align_text_to_frame_padding()
        ctx.label(label)
        for i, axis in enumerate('xyz'):
            if i == 0:
                ctx.same_line(90)
            else:
                ctx.same_line(0, 8)
            attr = f"{prefix}_{axis}"
            current = getattr(self, attr)
            new_val = ctx.checkbox(f"{axis.upper()}##{attr}", current)
            if new_val != current:
                _record_builtin_property(self, attr, current, new_val,
                                         f"Set {attr}")

    # ---- Convenience property: freeze_rotation ----

    @property
    def freeze_rotation(self) -> bool:
        """Shortcut to freeze all rotation axes."""
        cpp = self._cpp_component
        if cpp is None:
            return False
        return cpp.freeze_rotation

    @freeze_rotation.setter
    def freeze_rotation(self, value: bool):
        cpp = self._cpp_component
        if cpp is not None:
            cpp.freeze_rotation = value

    @property
    def constraints(self) -> int:
        """Constraints bitmask — use RigidbodyConstraints helpers for readability."""
        cpp = self._cpp_component
        if cpp is None:
            return 0
        return cpp.constraints

    @constraints.setter
    def constraints(self, value: int):
        cpp = self._cpp_component
        if cpp is not None:
            cpp.constraints = int(value)

    @property
    def max_angular_velocity(self) -> float:
        """Maximum angular velocity in rad/s."""
        cpp = self._cpp_component
        if cpp is None:
            return 7.0
        return cpp.max_angular_velocity

    @max_angular_velocity.setter
    def max_angular_velocity(self, value: float):
        cpp = self._cpp_component
        if cpp is not None:
            cpp.max_angular_velocity = float(value)

    @property
    def max_linear_velocity(self) -> float:
        """Maximum linear velocity in m/s."""
        cpp = self._cpp_component
        if cpp is None:
            return 500.0
        return cpp.max_linear_velocity

    @max_linear_velocity.setter
    def max_linear_velocity(self, value: float):
        cpp = self._cpp_component
        if cpp is not None:
            cpp.max_linear_velocity = float(value)

    @property
    def constraints_flags(self) -> RigidbodyConstraints:
        """Typed view of the constraint bitmask."""
        return RigidbodyConstraints(int(self.constraints))

    @constraints_flags.setter
    def constraints_flags(self, value):
        self.constraints = int(value)

    def has_constraint(self, constraint: RigidbodyConstraints) -> bool:
        """Return True when the given constraint flag is enabled."""
        return bool(self.constraints_flags & RigidbodyConstraints(constraint))

    def add_constraint(self, constraint: RigidbodyConstraints):
        """Enable one or more constraint flags."""
        self.constraints = int(self.constraints_flags | RigidbodyConstraints(constraint))

    def remove_constraint(self, constraint: RigidbodyConstraints):
        """Disable one or more constraint flags."""
        self.constraints = int(self.constraints_flags & ~RigidbodyConstraints(constraint))

    # ---- Runtime-only properties (not serialized via CppProperty, accessed via methods) ----

    @property
    def velocity(self):
        """Linear velocity in world space (Vector3)."""
        cpp = self._cpp_component
        if cpp is None:
            from InfEngine.math import Vector3
            return Vector3(0, 0, 0)
        return cpp.velocity

    @velocity.setter
    def velocity(self, value):
        cpp = self._cpp_component
        if cpp is not None:
            cpp.velocity = coerce_vec3(value)

    @property
    def angular_velocity(self):
        """Angular velocity in world space (Vector3)."""
        cpp = self._cpp_component
        if cpp is None:
            from InfEngine.math import Vector3
            return Vector3(0, 0, 0)
        return cpp.angular_velocity

    @angular_velocity.setter
    def angular_velocity(self, value):
        cpp = self._cpp_component
        if cpp is not None:
            cpp.angular_velocity = coerce_vec3(value)

    # ---- Read-only world info ----

    @property
    def world_center_of_mass(self):
        """World-space center of mass (read-only)."""
        cpp = self._cpp_component
        if cpp is None:
            from InfEngine.math import Vector3
            return Vector3(0, 0, 0)
        return cpp.world_center_of_mass

    @property
    def position(self):
        """World-space position of the rigidbody (read-only)."""
        cpp = self._cpp_component
        if cpp is None:
            from InfEngine.math import Vector3
            return Vector3(0, 0, 0)
        return cpp.position

    @property
    def rotation(self):
        """World-space rotation quaternion (x, y, z, w) (read-only)."""
        cpp = self._cpp_component
        if cpp is None:
            return (0.0, 0.0, 0.0, 1.0)
        return cpp.rotation

    # ---- Force / Torque API ----

    def add_force(self, force, mode=None):
        """Add a force to the rigidbody.

        Args:
            force: Force vector (Vector3 or tuple).
            mode: ForceMode enum value (default: ForceMode.Force).
        """
        cpp = self._cpp_component
        if cpp is None:
            return
        if mode is None:
            mode = _ForceMode.Force
        cpp.add_force(coerce_vec3(force), mode)

    def add_torque(self, torque, mode=None):
        """Add a torque to the rigidbody.

        Args:
            torque: Torque vector (Vector3 or tuple).
            mode: ForceMode enum value (default: ForceMode.Force).
        """
        cpp = self._cpp_component
        if cpp is None:
            return
        if mode is None:
            mode = _ForceMode.Force
        cpp.add_torque(coerce_vec3(torque), mode)

    def add_force_at_position(self, force, position, mode=None):
        """Add a force at a world-space position.

        Args:
            force: Force vector (Vector3 or tuple).
            position: World-space point where force is applied.
            mode: ForceMode enum value (default: ForceMode.Force).
        """
        cpp = self._cpp_component
        if cpp is None:
            return
        if mode is None:
            mode = _ForceMode.Force
        cpp.add_force_at_position(coerce_vec3(force), coerce_vec3(position), mode)

    # ---- Kinematic movement ----

    def move_position(self, position):
        """Move a kinematic body to target position (Unity: Rigidbody.MovePosition).

        Args:
            position: Target world-space position (Vector3 or tuple).
        """
        cpp = self._cpp_component
        if cpp is None:
            return
        cpp.move_position(coerce_vec3(position))

    def move_rotation(self, rotation):
        """Rotate a kinematic body to target rotation (Unity: Rigidbody.MoveRotation).

        Args:
            rotation: Target rotation as (x, y, z, w) quaternion tuple.
        """
        cpp = self._cpp_component
        if cpp is None:
            return
        cpp.move_rotation(rotation)

    # ---- Sleep API ----

    def is_sleeping(self) -> bool:
        """Is the rigidbody sleeping?"""
        cpp = self._cpp_component
        if cpp is None:
            return True
        return cpp.is_sleeping()

    def wake_up(self):
        """Wake the rigidbody up."""
        cpp = self._cpp_component
        if cpp is not None:
            cpp.wake_up()

    def sleep(self):
        """Put the rigidbody to sleep."""
        cpp = self._cpp_component
        if cpp is not None:
            cpp.sleep()

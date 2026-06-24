"""Animation Timeline data model (``.animtimeline``).

A minimal, Unity-Timeline-style asset for animating a single GameObject's
transform over time.  This is the 0.2.0 "most basic" timeline: ONE track of
transform keyframes (position / euler-rotation / scale), each keyframe carrying
the transition curve used to interpolate *into* it from the previous keyframe.

The asset mirrors :class:`AnimationClip3D` conventions: plain JSON on disk,
``schema_version`` for migrations, identity by the ``.animtimeline`` extension.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

Vec3 = List[float]

# Interpolation modes describing the transition from the PREVIOUS keyframe INTO
# this keyframe.
INTERP_CONSTANT = "constant"
INTERP_LINEAR = "linear"
INTERP_EASE_IN = "ease_in"
INTERP_EASE_OUT = "ease_out"
INTERP_EASE_IN_OUT = "ease_in_out"

INTERP_MODES: Tuple[str, ...] = (
    INTERP_CONSTANT,
    INTERP_LINEAR,
    INTERP_EASE_IN,
    INTERP_EASE_OUT,
    INTERP_EASE_IN_OUT,
)

# How sampled values are applied to the owner transform at runtime.
#   "additive"  — keyframes are deltas applied on top of the entry transform
#                 (pos += , euler += , scale *= ). The natural FSM mode.
#   "absolute"  — keyframes are the final local transform values.
APPLY_ADDITIVE = "additive"
APPLY_ABSOLUTE = "absolute"
APPLY_MODES: Tuple[str, ...] = (APPLY_ADDITIVE, APPLY_ABSOLUTE)


def _apply_interp(mode: str, u: float) -> float:
    """Remap a normalized 0..1 segment parameter *u* by interpolation *mode*."""
    if u <= 0.0:
        return 0.0
    if u >= 1.0:
        return 1.0
    if mode == INTERP_CONSTANT:
        return 0.0  # hold the previous key until this one is reached
    if mode == INTERP_EASE_IN:
        return u * u
    if mode == INTERP_EASE_OUT:
        return 1.0 - (1.0 - u) * (1.0 - u)
    if mode == INTERP_EASE_IN_OUT:
        return u * u * (3.0 - 2.0 * u)  # smoothstep
    return u  # INTERP_LINEAR (default)


def _lerp3(a: Vec3, b: Vec3, w: float) -> Vec3:
    return [a[i] + (b[i] - a[i]) * w for i in range(3)]


def _vec3(v, default: Vec3) -> Vec3:
    try:
        if isinstance(v, (list, tuple)) and len(v) >= 3:
            return [float(v[0]), float(v[1]), float(v[2])]
    except (TypeError, ValueError):
        pass
    return list(default)


@dataclass
class TimelineKeyframe:
    """A keyframe holding a full local transform + the curve used to reach it."""

    time: float = 0.0
    position: Vec3 = field(default_factory=lambda: [0.0, 0.0, 0.0])
    rotation: Vec3 = field(default_factory=lambda: [0.0, 0.0, 0.0])   # euler degrees
    scale: Vec3 = field(default_factory=lambda: [1.0, 1.0, 1.0])
    # Transition from the PREVIOUS keyframe into this one.
    interp: str = INTERP_LINEAR

    def to_dict(self) -> dict:
        return {
            "time": float(self.time),
            "position": list(self.position),
            "rotation": list(self.rotation),
            "scale": list(self.scale),
            "interp": self.interp,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "TimelineKeyframe":
        interp = str(d.get("interp", INTERP_LINEAR))
        if interp not in INTERP_MODES:
            interp = INTERP_LINEAR
        return cls(
            time=float(d.get("time", 0.0)),
            position=_vec3(d.get("position"), [0.0, 0.0, 0.0]),
            rotation=_vec3(d.get("rotation"), [0.0, 0.0, 0.0]),
            scale=_vec3(d.get("scale"), [1.0, 1.0, 1.0]),
            interp=interp,
        )


@dataclass
class AnimationTimeline:
    """A single-track transform timeline asset (``.animtimeline``).

    Looping is *not* a property of the timeline — it is decided by the owning
    FSM state's ``loop`` flag.  ``apply_mode`` selects additive (delta) vs
    absolute application of the sampled transform.
    """

    schema_version: int = 1
    name: str = ""
    duration: float = 2.0
    apply_mode: str = APPLY_ADDITIVE
    keyframes: List[TimelineKeyframe] = field(default_factory=list)

    # Non-serialized runtime field.
    file_path: str = ""

    # ── Evaluation ─────────────────────────────────────────────────────
    def sorted_keys(self) -> List[TimelineKeyframe]:
        return sorted(self.keyframes, key=lambda k: k.time)

    def sample(self, t: float) -> Optional[Tuple[Vec3, Vec3, Vec3]]:
        """Return ``(position, rotation, scale)`` at time *t*; ``None`` if empty."""
        keys = self.sorted_keys()
        if not keys:
            return None
        if t <= keys[0].time:
            k = keys[0]
            return (list(k.position), list(k.rotation), list(k.scale))
        if t >= keys[-1].time:
            k = keys[-1]
            return (list(k.position), list(k.rotation), list(k.scale))
        for i in range(1, len(keys)):
            a = keys[i - 1]
            b = keys[i]
            if a.time <= t <= b.time:
                span = b.time - a.time
                u = 0.0 if span <= 1e-9 else (t - a.time) / span
                w = _apply_interp(b.interp, u)  # b.interp = transition INTO b
                return (
                    _lerp3(a.position, b.position, w),
                    _lerp3(a.rotation, b.rotation, w),
                    _lerp3(a.scale, b.scale, w),
                )
        k = keys[-1]
        return (list(k.position), list(k.rotation), list(k.scale))

    # ── Serialization ──────────────────────────────────────────────────
    def to_dict(self) -> dict:
        return {
            "schema_version": int(self.schema_version),
            "name": self.name,
            "duration": float(self.duration),
            "apply_mode": self.apply_mode,
            "keyframes": [k.to_dict() for k in self.keyframes],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "AnimationTimeline":
        keys = [TimelineKeyframe.from_dict(k) for k in d.get("keyframes", []) if isinstance(k, dict)]
        mode = str(d.get("apply_mode", APPLY_ADDITIVE))
        if mode not in APPLY_MODES:
            mode = APPLY_ADDITIVE
        return cls(
            schema_version=int(d.get("schema_version", 1)),
            name=str(d.get("name", "")),
            duration=float(d.get("duration", 2.0)),
            apply_mode=mode,
            keyframes=keys,
        )

    def save(self, path: str = "") -> bool:
        target = path or self.file_path
        if not target:
            return False
        try:
            with open(target, "w", encoding="utf-8") as f:
                json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
            return True
        except OSError:
            return False

    @classmethod
    def load(cls, path: str) -> Optional["AnimationTimeline"]:
        if not path or not os.path.isfile(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                return None
            tl = cls.from_dict(data)
            tl.file_path = path
            tl.name = os.path.splitext(os.path.basename(path))[0]
            return tl
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            return None

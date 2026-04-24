"""
AnimationClip3D — data model for a 3D skeletal animation clip.

Serialized as ``.animclip3d`` JSON files.  This is the authoring-side
counterpart to 2D :class:`AnimationClip` — it references a source model
(typically ``.fbx``) and names an animation take embedded in that file.

Runtime sampling / skinning lives in C++ (future milestones); this asset
is intentionally simple and stable for Python workflows + AI tooling.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class AnimationClip3D:
    """A single 3D animation clip — references a model + named take."""

    name: str = "New Animation Clip 3D"
    schema_version: int = 1

    # Source skeletal model (FBX/GLTF/etc.) — GUID is authoritative when present.
    source_model_guid: str = ""
    source_model_path: str = ""

    # Animation take name as reported by Assimp / the importer metadata.
    take_name: str = ""

    # Optional: bind-pose bone names captured at import time (debug / tooling).
    # This is duplicated from the model `.meta` for cheap inspector UX.
    bind_pose_bone_names: List[str] = field(default_factory=list)

    speed: float = 1.0
    loop: bool = True

    file_path: str = field(default="", repr=False, compare=False)

    # ── Serialization ───────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "schema_version": int(self.schema_version),
            "name": self.name,
            "source_model_guid": self.source_model_guid,
            "source_model_path": self.source_model_path,
            "take_name": self.take_name,
            "bind_pose_bone_names": list(self.bind_pose_bone_names),
            "speed": float(self.speed),
            "loop": bool(self.loop),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "AnimationClip3D":
        bones = d.get("bind_pose_bone_names", [])
        if not isinstance(bones, list):
            bones = []
        return cls(
            name=str(d.get("name", "New Animation Clip 3D")),
            schema_version=int(d.get("schema_version", 1)),
            source_model_guid=str(d.get("source_model_guid", "")),
            source_model_path=str(d.get("source_model_path", "")),
            take_name=str(d.get("take_name", "")),
            bind_pose_bone_names=[str(x) for x in bones],
            speed=float(d.get("speed", 1.0)),
            loop=bool(d.get("loop", True)),
        )

    def copy(self) -> "AnimationClip3D":
        return AnimationClip3D.from_dict(self.to_dict())

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, AnimationClip3D):
            return NotImplemented
        return self.to_dict() == other.to_dict()

    # ── File I/O ─────────────────────────────────────────────────────

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
    def load(cls, path: str) -> Optional["AnimationClip3D"]:
        if not os.path.isfile(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                return None
            clip = cls.from_dict(data)
            clip.file_path = path
            # Name always derives from filename (matches 2D clip behaviour).
            clip.name = os.path.splitext(os.path.basename(path))[0]
            return clip
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            return None

    # ── Helpers ───────────────────────────────────────────────────────

    @property
    def is_valid_reference(self) -> bool:
        return bool((self.source_model_guid or "").strip() or (self.source_model_path or "").strip())

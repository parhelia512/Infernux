"""Debug-only control channel for Supervisor-managed standalone Players."""

from __future__ import annotations

import hmac
import json
import os
import tempfile
import time
import uuid
from typing import Any


_MAX_COMMAND_BYTES = 64 * 1024
_MAX_OBJECT_NAMES = 32
_MAX_COMPONENT_PROBES = 16
_MAX_DISCOVERY_COMPONENT_TYPES = 16
_MAX_DISCOVERED_OBJECTS = 64
_MOTION_CAPTURE_TERMINAL_STATES = {"completed", "cancelled", "failed"}


class PlayerControlChannel:
    """Poll a token-authenticated file channel from the Player main thread."""

    def __init__(self, request_path: str = "", response_path: str = "", token: str = "") -> None:
        self.request_path = os.path.abspath(request_path) if request_path else ""
        self.response_path = os.path.abspath(response_path) if response_path else ""
        self._token = str(token or "")
        self._last_command_id = ""
        self._pending_input: dict[str, Any] | None = None
        self._motion_capture: dict[str, Any] | None = None

    @classmethod
    def from_environment(cls) -> "PlayerControlChannel":
        if os.environ.get("_INFERNUX_PLAYER_DEBUG_BUILD") != "1":
            return cls()
        request_path = os.environ.get("_INFERNUX_PLAYER_CONTROL_FILE", "").strip()
        response_path = os.environ.get("_INFERNUX_PLAYER_RESPONSE_FILE", "").strip()
        token = os.environ.get("_INFERNUX_PLAYER_CONTROL_TOKEN", "").strip()
        if not request_path or not response_path or len(token) < 16:
            return cls()
        return cls(request_path, response_path, token)

    @property
    def enabled(self) -> bool:
        return bool(self.request_path and self.response_path and self._token)

    def poll(self, engine) -> str | None:
        """Process at most one command and return an engine-owned action."""
        if not self.enabled:
            return None
        native = engine.get_native_engine() if engine is not None else None
        if native is None:
            return None

        self._poll_motion_capture(engine)

        if self._pending_input is not None:
            pending = self._pending_input
            sequence = int(pending["sequence"])
            if pending.get("kind") == "press":
                names = pending.get("object_names", [])
                if names:
                    observation = _observe_motion_state(engine, names, pending.get("component_probes", []))
                    pending["final_observation"] = observation
                    if observation.get("scene_name") == pending.get("initial_scene_name"):
                        pending["last_same_scene_observation"] = observation
                phase = str(pending.get("phase", "down"))
                if phase == "down":
                    if int(native.last_processed_synthetic_input_sequence) >= sequence:
                        started_at = time.monotonic()
                        pending["phase"] = "hold"
                        pending["hold_started_at"] = started_at
                        pending["release_at"] = started_at + float(pending["duration_seconds"])
                    return None
                if phase == "hold":
                    now = time.monotonic()
                    if now >= float(pending["release_at"]):
                        release_sequence = int(native.queue_synthetic_key_input(
                            int(pending["scancode"]),
                            False,
                            False,
                        ))
                        pending["phase"] = "up"
                        pending["sequence"] = release_sequence
                        pending["released_at"] = now
                    return None
            if int(native.last_processed_synthetic_input_sequence) >= sequence:
                command_id = str(pending["command_id"])
                scancode = int(pending["scancode"])
                from Infernux.input import Input
                from Infernux.lib import InputManager

                input_manager = InputManager.instance()
                response = {
                    "sequence": sequence,
                    "delivered": True,
                    "scancode": scancode,
                    "game_focused": bool(Input.is_game_focused()),
                    "held": bool(input_manager.get_key(scancode)),
                    "down": bool(input_manager.get_key_down(scancode)),
                    "up": bool(input_manager.get_key_up(scancode)),
                    "pending_input_count": int(native.pending_synthetic_input_count),
                }
                if pending.get("kind") == "press":
                    response.update({
                        "down_sequence": int(pending["down_sequence"]),
                        "requested_duration_seconds": float(pending["duration_seconds"]),
                        "actual_duration_seconds": max(
                            0.0,
                            float(pending["released_at"]) - float(pending["hold_started_at"]),
                        ),
                    })
                    if pending.get("object_names"):
                        response.update({
                            "initial_observation": pending["initial_observation"],
                            "final_observation": pending["final_observation"],
                            "last_same_scene_observation": pending["last_same_scene_observation"],
                        })
                self._write_response(command_id, True, response)
                self._pending_input = None
            return None

        command = self._read_command()
        if command is None:
            return None
        command_id = str(command.get("command_id", "") or "").strip()
        if not command_id or command_id == self._last_command_id:
            return None
        self._last_command_id = command_id
        self._remove_request()

        supplied_token = str(command.get("token", "") or "")
        if not hmac.compare_digest(supplied_token, self._token):
            self._write_response(command_id, False, error="control token mismatch")
            return None

        action = str(command.get("action", "") or "").strip().lower()
        try:
            if action == "shutdown":
                self._write_response(command_id, True, {"close_requested": True})
                _append_player_log("validation: normal shutdown requested")
                return "shutdown"
            if action == "key":
                scancode = int(command.get("scancode", 0) or 0)
                if scancode <= 0:
                    raise ValueError("scancode must be positive")
                sequence = int(native.queue_synthetic_key_input(
                    scancode,
                    bool(command.get("pressed", False)),
                    bool(command.get("repeat", False)),
                ))
                self._pending_input = {
                    "command_id": command_id,
                    "sequence": sequence,
                    "scancode": scancode,
                }
                return None
            if action == "press":
                scancode = int(command.get("scancode", 0) or 0)
                if scancode <= 0:
                    raise ValueError("scancode must be positive")
                duration_seconds = float(command.get("duration_seconds", 0.0) or 0.0)
                if duration_seconds < 0.02 or duration_seconds > 10.0:
                    raise ValueError("duration_seconds must be between 0.02 and 10.0")
                object_names = _bounded_names(command.get("object_names", []))
                component_probes = _bounded_component_probes(command.get("component_probes", []), object_names)
                initial_observation = (
                    _observe_motion_state(engine, object_names, component_probes) if object_names else {}
                )
                sequence = int(native.queue_synthetic_key_input(scancode, True, False))
                self._pending_input = {
                    "kind": "press",
                    "phase": "down",
                    "command_id": command_id,
                    "sequence": sequence,
                    "down_sequence": sequence,
                    "scancode": scancode,
                    "duration_seconds": duration_seconds,
                    "object_names": object_names,
                    "component_probes": component_probes,
                    "initial_scene_name": initial_observation.get("scene_name", ""),
                    "initial_observation": initial_observation,
                    "final_observation": initial_observation,
                    "last_same_scene_observation": initial_observation,
                }
                return None
            if action == "motion_capture_arm":
                if self._motion_capture is not None and str(self._motion_capture.get("status")) not in (
                    _MOTION_CAPTURE_TERMINAL_STATES
                ):
                    raise RuntimeError("a Player motion capture is already armed or active")
                object_names = _bounded_names(command.get("object_names", []))
                if not object_names:
                    raise ValueError("object_names must contain at least one public object name")
                component_probes = _bounded_component_probes(command.get("component_probes", []), object_names)
                seconds = float(command.get("seconds", 2.0) or 0.0)
                sample_interval = float(command.get("sample_interval", 0.1) or 0.0)
                trigger_timeout = float(command.get("trigger_timeout", 60.0) or 0.0)
                if seconds < 0.1 or seconds > 10.0:
                    raise ValueError("seconds must be between 0.1 and 10.0")
                if sample_interval < 0.02 or sample_interval > 1.0:
                    raise ValueError("sample_interval must be between 0.02 and 1.0")
                if trigger_timeout < 0.5 or trigger_timeout > 120.0:
                    raise ValueError("trigger_timeout must be between 0.5 and 120.0")
                trigger_scene_name = str(command.get("trigger_scene_name", "") or "").strip()
                initial_scene_name = _active_scene_name()
                if trigger_scene_name and initial_scene_name.casefold() == trigger_scene_name.casefold():
                    raise ValueError("motion capture must be armed before the target scene becomes active")
                now = time.monotonic()
                self._motion_capture = {
                    "capture_id": f"player-motion-{uuid.uuid4().hex[:12]}",
                    "status": "armed",
                    "object_names": object_names,
                    "component_probes": component_probes,
                    "seconds": seconds,
                    "sample_interval": sample_interval,
                    "trigger_scene_name": trigger_scene_name,
                    "initial_scene_name": initial_scene_name,
                    "actual_scene_name": "",
                    "armed_at": now,
                    "trigger_deadline": now + trigger_timeout,
                    "started_at": 0.0,
                    "next_sample_at": 0.0,
                    "trajectory": [],
                    "missing_object_names": list(object_names),
                    "error": "",
                }
                self._write_response(command_id, True, _public_motion_capture(self._motion_capture))
                return None
            if action == "motion_capture_status":
                capture = self._require_motion_capture(command.get("capture_id", ""))
                self._write_response(command_id, True, _public_motion_capture(capture))
                return None
            if action == "motion_capture_cancel":
                capture = self._require_motion_capture(command.get("capture_id", ""))
                cancelled = str(capture.get("status")) not in _MOTION_CAPTURE_TERMINAL_STATES
                if cancelled:
                    capture["status"] = "cancelled"
                self._write_response(
                    command_id,
                    True,
                    {**_public_motion_capture(capture), "cancelled": cancelled},
                )
                return None
            if action == "observe":
                names = _bounded_names(command.get("object_names", []))
                component_probes = _bounded_component_probes(command.get("component_probes", []), names)
                discovery_component_types = _bounded_discovery_component_types(
                    command.get("discovery_component_types", [])
                )
                max_discovered_objects = _bounded_discovered_object_count(
                    command.get("max_discovered_objects", 32)
                )
                self._write_response(
                    command_id,
                    True,
                    _observe_player(
                        engine,
                        names,
                        component_probes,
                        include_scene_objects=bool(command.get("include_scene_objects", False)),
                        discovery_component_types=discovery_component_types,
                        max_discovered_objects=max_discovered_objects,
                    ),
                )
                return None
            raise ValueError(f"unsupported Player control action: {action or '<empty>'}")
        except Exception as exc:
            self._write_response(command_id, False, error=f"{type(exc).__name__}: {exc}")
            return None

    def _require_motion_capture(self, capture_id: Any) -> dict[str, Any]:
        identifier = str(capture_id or "").strip()
        capture = self._motion_capture
        if capture is None or str(capture.get("capture_id")) != identifier:
            raise LookupError(f"Player motion capture '{identifier}' was not found")
        return capture

    def _poll_motion_capture(self, engine) -> None:
        capture = self._motion_capture
        if capture is None or str(capture.get("status")) in _MOTION_CAPTURE_TERMINAL_STATES:
            return
        try:
            now = time.monotonic()
            if str(capture.get("status")) == "armed":
                if now >= float(capture["trigger_deadline"]):
                    capture["status"] = "failed"
                    missing = ", ".join(capture.get("missing_object_names") or [])
                    capture["error"] = f"timed out waiting for target scene and objects: {missing}"
                    return
                scene_name = _active_scene_name()
                target_name = str(capture.get("trigger_scene_name") or "")
                initial_name = str(capture.get("initial_scene_name") or "")
                scene_matches = (
                    scene_name.casefold() == target_name.casefold()
                    if target_name
                    else bool(scene_name and scene_name.casefold() != initial_name.casefold())
                )
                if not scene_matches:
                    return
                first_sample = _observe_motion_state(
                    engine,
                    list(capture["object_names"]),
                    list(capture["component_probes"]),
                )
                missing = [
                    name for name in capture["object_names"] if name not in first_sample.get("objects", {})
                ]
                capture["missing_object_names"] = missing
                if missing:
                    return
                capture["status"] = "active"
                capture["actual_scene_name"] = scene_name
                capture["started_at"] = now
                capture["next_sample_at"] = now + float(capture["sample_interval"])
                capture["trajectory"].append({"time": 0.0, **first_sample})
                return

            started_at = float(capture["started_at"])
            elapsed = max(0.0, now - started_at)
            duration = float(capture["seconds"])
            if now < float(capture["next_sample_at"]) and elapsed < duration:
                return
            sample = _observe_motion_state(
                engine,
                list(capture["object_names"]),
                list(capture["component_probes"]),
            )
            capture["trajectory"].append({"time": min(elapsed, duration), **sample})
            interval = float(capture["sample_interval"])
            capture["next_sample_at"] = now + interval
            if elapsed >= duration:
                capture["status"] = "completed"
        except Exception as exc:
            capture["status"] = "failed"
            capture["error"] = f"{type(exc).__name__}: {exc}"

    def _read_command(self) -> dict[str, Any] | None:
        try:
            if not os.path.isfile(self.request_path):
                return None
            if os.path.getsize(self.request_path) > _MAX_COMMAND_BYTES:
                self._remove_request()
                return None
            with open(self.request_path, "r", encoding="utf-8") as stream:
                value = json.load(stream)
            return value if isinstance(value, dict) else None
        except (OSError, json.JSONDecodeError):
            return None

    def _remove_request(self) -> None:
        try:
            os.remove(self.request_path)
        except FileNotFoundError:
            pass
        except OSError:
            pass

    def _write_response(
        self,
        command_id: str,
        ok: bool,
        data: dict[str, Any] | None = None,
        *,
        error: str = "",
    ) -> None:
        payload = {
            "schema_version": 1,
            "command_id": command_id,
            "ok": bool(ok),
            "data": data or {},
            "error": str(error or ""),
        }
        _write_json_atomic(self.response_path, payload)


def _bounded_names(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("object_names must be a list")
    names = [str(item or "").strip() for item in value if str(item or "").strip()]
    if len(names) > _MAX_OBJECT_NAMES:
        raise ValueError(f"object_names cannot contain more than {_MAX_OBJECT_NAMES} entries")
    return names


def _bounded_component_probes(value: Any, object_names: list[str]) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise ValueError("component_probes must be a list")
    if len(value) > _MAX_COMPONENT_PROBES:
        raise ValueError(f"component_probes cannot contain more than {_MAX_COMPONENT_PROBES} entries")
    allowed_names = set(object_names)
    probes = []
    for raw in value:
        if not isinstance(raw, dict):
            raise ValueError("component_probes entries must be objects")
        object_name = str(raw.get("object_name", "") or "").strip()
        component_type = str(raw.get("component_type", "") or "").strip()
        fields = [str(field or "").strip() for field in raw.get("fields", [])]
        ordinal = int(raw.get("ordinal", 0) or 0)
        if object_name not in allowed_names:
            raise ValueError("component probe object_name must also be present in object_names")
        if not component_type or ordinal < 0 or not fields or len(fields) > 16:
            raise ValueError("component probes require a public component type, ordinal, and 1-16 fields")
        if any(not field or field.startswith("_") for field in fields):
            raise ValueError("component probe fields must be non-empty public field names")
        probes.append({
            "object_name": object_name,
            "component_type": component_type,
            "fields": fields,
            "ordinal": ordinal,
        })
    return probes


def _bounded_discovery_component_types(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("discovery_component_types must be a list")
    component_types = [str(item or "").strip() for item in value if str(item or "").strip()]
    if len(component_types) > _MAX_DISCOVERY_COMPONENT_TYPES:
        raise ValueError(
            f"discovery_component_types cannot contain more than {_MAX_DISCOVERY_COMPONENT_TYPES} entries"
        )
    if any(component_type.startswith("_") for component_type in component_types):
        raise ValueError("discovery_component_types must contain public component type names")
    return list(dict.fromkeys(component_types))


def _bounded_discovered_object_count(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("max_discovered_objects must be an integer")
    count = int(value)
    if count < 1 or count > _MAX_DISCOVERED_OBJECTS:
        raise ValueError(f"max_discovered_objects must be between 1 and {_MAX_DISCOVERED_OBJECTS}")
    return count


def _active_scene_name() -> str:
    from Infernux.lib import SceneManager

    scene = SceneManager.instance().get_active_scene()
    return str(getattr(scene, "name", "") or "")


def _public_motion_capture(capture: dict[str, Any]) -> dict[str, Any]:
    status = str(capture.get("status") or "")
    trajectory = list(capture.get("trajectory") or [])
    return {
        "capture_id": str(capture.get("capture_id") or ""),
        "status": status,
        "terminal": status in _MOTION_CAPTURE_TERMINAL_STATES,
        "object_names": list(capture.get("object_names") or []),
        "seconds": float(capture.get("seconds") or 0.0),
        "sample_interval": float(capture.get("sample_interval") or 0.0),
        "trigger_scene_name": str(capture.get("trigger_scene_name") or ""),
        "initial_scene_name": str(capture.get("initial_scene_name") or ""),
        "actual_scene_name": str(capture.get("actual_scene_name") or ""),
        "missing_object_names": list(capture.get("missing_object_names") or []),
        "sample_count": len(trajectory),
        "trajectory": trajectory,
        "error": str(capture.get("error") or ""),
    }


def _observe_player(
    engine,
    object_names: list[str],
    component_probes: list[dict[str, Any]] | None = None,
    *,
    include_scene_objects: bool = False,
    discovery_component_types: list[str] | None = None,
    max_discovered_objects: int = 32,
) -> dict[str, Any]:
    from Infernux.input import Input
    from Infernux.components import InxComponent
    from Infernux.lib import SceneManager
    from Infernux.scene import GameObjectQuery

    native = engine.get_native_engine()
    native_scene_manager = SceneManager.instance()
    scene = native_scene_manager.get_active_scene()
    play_manager = engine.get_play_mode_manager()
    state = getattr(getattr(play_manager, "state", None), "name", "unknown")
    objects: dict[str, Any] = {}
    for name in object_names:
        obj = GameObjectQuery.find(name)
        if obj is None:
            continue
        transform = obj.transform
        components = []
        for component in obj.get_py_components() or []:
            component_type = type(component)
            update_method = getattr(component_type, "update", None)
            update_globals = getattr(update_method, "__globals__", {})
            cpp_component = getattr(component, "_cpp_component", None)
            proxy_diagnostics = {}
            if cpp_component is not None:
                for field in (
                    "overrides_update",
                    "has_coroutine_scheduler",
                    "update_dispatch_count",
                    "update_forward_count",
                ):
                    if hasattr(cpp_component, field):
                        proxy_diagnostics[field] = getattr(cpp_component, field)
            components.append({
                "type_name": component_type.__name__,
                "enabled": bool(getattr(component, "enabled", False)),
                "awake_called": bool(getattr(component, "_awake_called", False)),
                "started": bool(getattr(component, "_has_started", False)),
                "update_overridden": bool(update_method is not InxComponent.update),
                "update_module": str(getattr(update_method, "__module__", "") or ""),
                "update_input_is_canonical": update_globals.get("Input") is Input,
                "load_requested": getattr(component, "_load_requested", None),
                "destination_scene": getattr(component, "destination_scene", None),
                "trigger_key": getattr(component, "trigger_key", None),
                "broken_script": bool(getattr(component, "_is_broken", False)),
                "broken_error": str(getattr(component, "_broken_error", "") or ""),
                "proxy": proxy_diagnostics,
            })
        objects[name] = {
            "id": int(obj.id),
            "position": _vec3(transform.position),
            "euler_angles": _vec3(transform.euler_angles),
            "active": bool(getattr(obj, "active", True)),
            "python_components": components,
        }
        component_fields = _observe_component_fields(obj, name, component_probes or [])
        if component_fields:
            objects[name]["component_fields"] = component_fields

    frame = dict(native.renderer_frame_snapshot)
    result = {
        "scene_name": str(getattr(scene, "name", "") or ""),
        "scene_playing": bool(scene is not None and scene.is_playing()),
        "scene_manager_playing": bool(native_scene_manager.is_playing()),
        "scene_manager_paused": bool(native_scene_manager.is_paused()),
        "play_state": str(state).lower(),
        "objects": objects,
        "renderer_frame": frame,
        "gpu_residency": dict(getattr(native, "gpu_residency_snapshot", {}) or {}),
        "submission_ready": bool(
            frame.get("game_camera_available")
            and frame.get("game_target_ready")
            and int(frame.get("game_draw_call_count", 0) or 0) > 0
        ),
        "last_processed_input_sequence": int(native.last_processed_synthetic_input_sequence),
        "pending_input_count": int(native.pending_synthetic_input_count),
        "game_focused": bool(Input.is_game_focused()),
    }
    discovery_types = set(discovery_component_types or [])
    if include_scene_objects or discovery_types:
        discovered = []
        match_count = 0
        for obj in list(scene.get_all_objects() or []) if scene is not None else []:
            component_types = _public_component_type_names(obj)
            if discovery_types and not discovery_types.intersection(component_types):
                continue
            match_count += 1
            if len(discovered) >= max_discovered_objects:
                continue
            discovered.append({
                "id": int(obj.id),
                "name": str(getattr(obj, "name", "") or ""),
                "active": bool(getattr(obj, "active", True)),
                "component_types": component_types,
            })
        result.update({
            "scene_objects": discovered,
            "scene_object_match_count": match_count,
            "scene_objects_truncated": match_count > len(discovered),
        })
    return result


def _public_component_type_names(obj) -> list[str]:
    names = []
    seen = set()
    for getter in ("get_components", "get_py_components"):
        try:
            components = getattr(obj, getter)() or []
        except Exception:
            continue
        for component in components:
            type_name = str(getattr(component, "type_name", type(component).__name__) or "").strip()
            if not type_name or type_name.startswith("_") or type_name in seen:
                continue
            seen.add(type_name)
            names.append(type_name)
    return names


def _observe_motion_state(
    engine,
    object_names: list[str],
    component_probes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Capture a small Player-owned motion sample without a second MCP round trip."""
    from Infernux import Rigidbody
    from Infernux.lib import SceneManager
    from Infernux.scene import GameObjectQuery

    native = engine.get_native_engine()
    scene = SceneManager.instance().get_active_scene()
    objects: dict[str, Any] = {}
    for name in object_names:
        obj = GameObjectQuery.find(name)
        if obj is None:
            continue
        state = {"position": _vec3(obj.transform.position)}
        rigidbody = obj.get_component(Rigidbody)
        if rigidbody is not None:
            state["velocity"] = _vec3(rigidbody.velocity)
        component_fields = _observe_component_fields(obj, name, component_probes or [])
        if component_fields:
            state["component_fields"] = component_fields
        objects[name] = state
    frame = dict(native.renderer_frame_snapshot)
    return {
        "scene_name": str(getattr(scene, "name", "") or ""),
        "renderer_frame": int(frame.get("frame", 0) or 0),
        "objects": objects,
    }


def _vec3(value) -> list[float]:
    return [float(value.x), float(value.y), float(value.z)]


def _observe_component_fields(
    obj,
    object_name: str,
    component_probes: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    observed = {}
    for probe in component_probes:
        if probe["object_name"] != object_name:
            continue
        component_type = probe["component_type"]
        ordinal = probe["ordinal"]
        component = _find_public_component(obj, component_type, ordinal)
        fields = {}
        if component is not None:
            for field in probe["fields"]:
                if hasattr(component, field):
                    fields[field] = _json_public_value(getattr(component, field))
        observed[f"{component_type}[{ordinal}]"] = fields
    return observed


def _find_public_component(obj, component_type: str, ordinal: int):
    matches = []
    seen = set()
    for getter in ("get_components", "get_py_components"):
        try:
            candidates = getattr(obj, getter)() or []
        except Exception:
            continue
        for component in candidates:
            type_name = getattr(component, "type_name", type(component).__name__)
            if type_name != component_type and type(component).__name__ != component_type:
                continue
            public_component = _public_builtin_wrapper(obj, component, type_name)
            component_id = getattr(public_component, "component_id", None)
            key = (type_name, component_id) if component_id is not None else id(public_component)
            if key in seen:
                continue
            seen.add(key)
            matches.append(public_component)
    return matches[ordinal] if 0 <= ordinal < len(matches) else None


def _public_builtin_wrapper(obj, component, type_name: str):
    try:
        from Infernux.components.builtin_component import BuiltinComponent

        if isinstance(component, BuiltinComponent):
            return component
        wrapper_cls = BuiltinComponent._builtin_registry.get(type_name)
        if wrapper_cls is not None:
            return wrapper_cls._get_or_create_wrapper(component, obj)
    except Exception:
        pass
    return component


def _json_public_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_json_public_value(item) for item in value[:64]]
    if isinstance(value, dict):
        return {str(key): _json_public_value(item) for key, item in list(value.items())[:64]}
    if all(hasattr(value, axis) for axis in ("x", "y")):
        axes = ("x", "y", "z", "w")
        return [float(getattr(value, axis)) for axis in axes if hasattr(value, axis)]
    name = getattr(value, "name", None)
    if isinstance(name, str):
        return name
    return str(value)


def _write_json_atomic(path: str, payload: dict[str, Any]) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    descriptor, temporary_path = tempfile.mkstemp(prefix=".player-control-", suffix=".tmp", dir=directory, text=True)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_path, path)
    except Exception:
        try:
            os.remove(temporary_path)
        except OSError:
            pass
        raise


def _append_player_log(message: str) -> None:
    path = os.environ.get("_INFERNUX_PLAYER_LOG", "").strip()
    if not path:
        return
    try:
        with open(path, "a", encoding="utf-8") as stream:
            stream.write(str(message) + "\n")
    except OSError:
        pass

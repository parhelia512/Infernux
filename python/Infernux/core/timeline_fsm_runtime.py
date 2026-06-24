"""TimelineFSMRuntime — a standalone state machine that plays Timeline states.

A Timeline FSM (``.timelinefsm``) is an :class:`AnimStateMachine` whose states
are all timeline nodes (``kind == 'timeline'``).  This runtime advances the
active state's timeline, drives a target transform (additive or absolute), and
evaluates transitions (exit-time + parameter conditions + triggers) — mirroring
the animator FSM semantics but with no dependency on a renderer.

Used by the :class:`TimelineAction` component; kept renderer-agnostic so it can
be reused elsewhere.
"""

from __future__ import annotations

import re
from typing import Dict, Optional

from Infernux.core.anim_state_machine import (
    AnimStateMachine, AnimState, AnimTransition, evaluate_anim_condition,
)
from Infernux.core.animation_timeline import AnimationTimeline
from Infernux.debug import Debug

_DEFAULT_PERIOD = 1.0  # fallback loop period when a timeline has no duration


def _get_asset_database():
    try:
        from Infernux.core.assets import AssetManager
        if AssetManager._asset_database is not None:
            return AssetManager._asset_database
    except ImportError:
        pass
    try:
        from Infernux.engine.play_mode import PlayModeManager
        pm = PlayModeManager.instance()
        if pm and pm._asset_database is not None:
            return pm._asset_database
    except ImportError:
        pass
    return None


def _resolve_timeline_path(state: AnimState) -> Optional[str]:
    guid = getattr(state, "timeline_guid", "") or ""
    path = (getattr(state, "timeline_path", "") or "").strip()
    if guid:
        db = _get_asset_database()
        if db:
            try:
                p = db.get_path_from_guid(guid)
                if p:
                    return p
            except Exception:
                pass
    return path or None


class TimelineFSMRuntime:
    """Plays a Timeline FSM, driving a supplied transform each frame."""

    def __init__(self):
        self._fsm: Optional[AnimStateMachine] = None
        self._params: Dict[str, object] = {}
        self._timeline_cache: Dict[str, Optional[AnimationTimeline]] = {}
        self._state_name: str = ""
        self._timeline: Optional[AnimationTimeline] = None
        self._elapsed: float = 0.0
        self._playing: bool = False
        self._base = None
        self.playback_speed: float = 1.0

    # ── Setup ──────────────────────────────────────────────────────────
    def set_fsm(self, fsm: Optional[AnimStateMachine]):
        self._fsm = fsm
        self._timeline_cache = {}
        self._params = {}
        self._state_name = ""
        self._timeline = None
        self._elapsed = 0.0
        self._playing = False
        self._base = None
        if fsm is not None:
            for p in fsm.parameters:
                if p.kind == "bool":
                    self._params[p.name] = bool(p.default_bool)
                elif p.kind == "int":
                    self._params[p.name] = int(p.default_int)
                else:
                    self._params[p.name] = float(p.default_float)

    @property
    def fsm(self) -> Optional[AnimStateMachine]:
        return self._fsm

    @property
    def current_state(self) -> str:
        return self._state_name

    @property
    def is_playing(self) -> bool:
        return self._playing

    @property
    def normalized_time(self) -> float:
        tl = self._timeline
        if tl is None:
            return 0.0
        dur = max(1e-6, float(tl.duration))
        state = self._get_state()
        if state is not None and bool(state.loop):
            return (self._elapsed % dur) / dur
        return min(self._elapsed / dur, 1.0)

    # ── Parameter API ──────────────────────────────────────────────────
    def set_parameter(self, name: str, value: object):
        self._params[name] = value

    def get_parameter(self, name: str, default: object = None) -> object:
        return self._params.get(name, default)

    def set_bool(self, name: str, value: bool):
        self._params[name] = bool(value)

    def get_bool(self, name: str) -> bool:
        return bool(self._params.get(name, False))

    def set_float(self, name: str, value: float):
        self._params[name] = float(value)

    def get_float(self, name: str) -> float:
        return float(self._params.get(name, 0.0))

    def set_int(self, name: str, value: int):
        self._params[name] = int(value)

    def get_int(self, name: str) -> int:
        return int(self._params.get(name, 0))

    def set_trigger(self, name: str):
        self._params[name] = True

    # ── Playback ───────────────────────────────────────────────────────
    def play(self, state_name: str = "", *, transform=None) -> bool:
        if not self._fsm:
            return False
        name = state_name or self._fsm.default_state
        if not name:
            return False
        return self._enter_state(name, transform)

    def stop(self):
        self._playing = False

    def update(self, delta_time: float, transform=None):
        if self._fsm is None or self._timeline is None:
            return
        tl = self._timeline
        state = self._get_state()
        loop = bool(state.loop) if state is not None else True
        if self._playing:
            speed = self.playback_speed * (state.speed if state else 1.0)
            self._elapsed += delta_time * speed
            dur = max(1e-6, float(tl.duration))
            if self._elapsed >= dur:
                self._apply_timeline(tl, dur, transform)
                self._try_transition(transform)
                if self._timeline is tl and self._playing:
                    if loop:
                        self._elapsed = self._elapsed % dur
                    else:
                        self._elapsed = dur
                        self._playing = False
                    self._apply_timeline(tl, self._elapsed, transform)
                return
        self._apply_timeline(tl, self._elapsed, transform)
        self._try_transition(transform)

    # ── Internals ──────────────────────────────────────────────────────
    def _get_state(self) -> Optional[AnimState]:
        if self._fsm and self._state_name:
            return self._fsm.get_state(self._state_name)
        return None

    def _resolve_timeline(self, state: AnimState) -> Optional[AnimationTimeline]:
        key = state.name
        if key in self._timeline_cache:
            return self._timeline_cache[key]
        tl = None
        path = _resolve_timeline_path(state)
        if path:
            tl = AnimationTimeline.load(path)
            if tl is None:
                Debug.log_warning(f"[TimelineFSM] Failed to load timeline for state '{state.name}': {path}")
        self._timeline_cache[key] = tl
        return tl

    def _enter_state(self, state_name: str, transform) -> bool:
        if not self._fsm:
            return False
        state = self._fsm.get_state(state_name)
        if state is None:
            Debug.log_warning(f"[TimelineFSM] State not found: '{state_name}'")
            return False
        if not getattr(state, "restart_same_clip", False):
            if self._playing and self._state_name == state_name:
                return True
        self._state_name = state_name
        self._timeline = self._resolve_timeline(state)
        self._elapsed = 0.0
        self._playing = True
        self._capture_base(transform)
        if self._timeline is not None:
            self._apply_timeline(self._timeline, 0.0, transform)
        return True

    def _capture_base(self, transform):
        if transform is None:
            self._base = ([0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [1.0, 1.0, 1.0])
            return
        try:
            p, r, s = transform.local_position, transform.local_euler_angles, transform.local_scale
            self._base = (
                [float(p.x), float(p.y), float(p.z)],
                [float(r.x), float(r.y), float(r.z)],
                [float(s.x), float(s.y), float(s.z)],
            )
        except Exception:
            self._base = ([0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [1.0, 1.0, 1.0])

    def _apply_timeline(self, tl: AnimationTimeline, t: float, transform):
        if transform is None:
            return
        sampled = tl.sample(t)
        if sampled is None:
            return
        pos, rot, scl = sampled
        if getattr(tl, "apply_mode", "additive") == "additive":
            bp, br, bs = self._base or ([0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [1.0, 1.0, 1.0])
            pos = [bp[0] + pos[0], bp[1] + pos[1], bp[2] + pos[2]]
            rot = [br[0] + rot[0], br[1] + rot[1], br[2] + rot[2]]
            scl = [bs[0] * scl[0], bs[1] * scl[1], bs[2] * scl[2]]
        try:
            from Infernux.lib import Vector3
            transform.local_position = Vector3(float(pos[0]), float(pos[1]), float(pos[2]))
            transform.local_euler_angles = Vector3(float(rot[0]), float(rot[1]), float(rot[2]))
            transform.local_scale = Vector3(float(scl[0]), float(scl[1]), float(scl[2]))
        except Exception as exc:
            Debug.log_suppressed("TimelineFSMRuntime._apply_timeline", exc)

    def _exit_gate_ok(self, state: AnimState) -> bool:
        tl = self._timeline
        if tl is None:
            return True
        dur = max(1e-6, float(tl.duration))
        thr = max(0.0, min(1.0, float(getattr(state, "exit_time_normalized", 1.0))))
        progress = min(max(self._elapsed / dur, 0.0), 1.0)
        return progress + 1e-7 >= thr

    def _try_transition(self, transform):
        state = self._get_state()
        if not state:
            return
        if not self._exit_gate_ok(state):
            return
        for tr in state.transitions:
            if self._evaluate_condition(tr, state):
                self._consume_triggers(tr.condition)
                self._enter_state(tr.target_state, transform)
                return

    def _evaluate_condition(self, transition: AnimTransition, state: AnimState) -> bool:
        cond = (transition.condition or "").strip()
        if not cond:
            # No explicit condition: advance only when a non-looping timeline ends.
            tl = self._timeline
            if tl is None or bool(state.loop):
                return False
            return self._elapsed >= max(1e-6, float(tl.duration))
        ctx = dict(self._params)
        ctx["time"] = self._elapsed
        ctx["normalized_time"] = self.normalized_time
        ctx["state"] = self._state_name
        try:
            return evaluate_anim_condition(cond, ctx)
        except Exception as exc:
            Debug.log_warning(f"[TimelineFSM] Condition error in '{self._state_name}': '{cond}' -> {exc}")
            return False

    def _consume_triggers(self, condition: str):
        identifiers = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", condition or ""))
        for name, val in list(self._params.items()):
            if val is True and name in identifiers:
                self._params[name] = False

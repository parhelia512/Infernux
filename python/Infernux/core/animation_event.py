"""
AnimationEvent — named callbacks fired at a normalized time within a clip.

Mirrors Godot's animation "Call Method" track in a lightweight, asset-agnostic
way: each event has a normalized time (0..1) inside its clip, a function name,
and optional string / number arguments.  At runtime the animators dispatch each
crossed event to every Python component on the animated GameObject.

Dispatch contract (per fired event):
  * if a component defines ``on_animation_event(function, string_arg, number_arg)``
    it is called (generic sink), and
  * if a component defines a method named ``function`` it is called with a
    best-effort argument arity (``(string_arg, number_arg)`` → ``(string_arg,)`` → ``()``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List


@dataclass
class AnimationEvent:
    """A single animation event keyed by normalized clip time (0..1)."""

    time_normalized: float = 0.0
    function: str = ""
    string_arg: str = ""
    number_arg: float = 0.0

    def to_dict(self) -> dict:
        return {
            "time_normalized": float(self.time_normalized),
            "function": self.function,
            "string_arg": self.string_arg,
            "number_arg": float(self.number_arg),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "AnimationEvent":
        try:
            t = float(d.get("time_normalized", d.get("time", 0.0)))
        except (TypeError, ValueError):
            t = 0.0
        try:
            num = float(d.get("number_arg", 0.0))
        except (TypeError, ValueError):
            num = 0.0
        return cls(
            time_normalized=max(0.0, min(1.0, t)),
            function=str(d.get("function", "")),
            string_arg=str(d.get("string_arg", "")),
            number_arg=num,
        )


def events_from_list(raw: Any) -> List[AnimationEvent]:
    """Build an event list from serialized data (tolerant of malformed entries)."""
    out: List[AnimationEvent] = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict):
                out.append(AnimationEvent.from_dict(item))
    return out


def collect_crossed_events(
    events: List[AnimationEvent], prev_norm: float, curr_norm: float, looped: bool
) -> List[AnimationEvent]:
    """Return events whose normalized time falls in the just-played window.

    Non-looping window is ``(prev_norm, curr_norm]``.  When the clip wrapped this
    frame (``looped``) the window is ``(prev_norm, 1] ∪ [0, curr_norm]``.
    """
    if not events:
        return []
    eps = 1e-6
    fired: List[AnimationEvent] = []
    for ev in events:
        t = ev.time_normalized
        if looped:
            if (prev_norm + eps < t <= 1.0 + eps) or (-eps <= t <= curr_norm + eps):
                fired.append(ev)
        else:
            if prev_norm + eps < t <= curr_norm + eps:
                fired.append(ev)
    return fired


def _invoke_event_method(method, ev: AnimationEvent) -> bool:
    """Call *method* with a best-effort argument arity.  Returns True if invoked."""
    for args in ((ev.string_arg, ev.number_arg), (ev.string_arg,), ()):
        try:
            method(*args)
            return True
        except TypeError:
            continue
        except Exception:
            from Infernux.debug import Debug
            Debug.log_warning(f"[AnimationEvent] handler '{ev.function}' raised")
            return True
    return False


def dispatch_animation_events(
    game_object, events: List[AnimationEvent], prev_norm: float, curr_norm: float, looped: bool
) -> None:
    """Fire all events crossed in the current frame's playback window."""
    fired = collect_crossed_events(events, prev_norm, curr_norm, looped)
    if not fired or game_object is None:
        return
    try:
        comps = list(game_object.get_py_components() or [])
    except Exception:
        return
    if not comps:
        return
    from Infernux.debug import Debug
    for ev in fired:
        for comp in comps:
            sink = getattr(comp, "on_animation_event", None)
            if callable(sink):
                try:
                    sink(ev.function, ev.string_arg, ev.number_arg)
                except Exception:
                    Debug.log_warning(
                        f"[AnimationEvent] on_animation_event raised for '{ev.function}'"
                    )
            if ev.function:
                method = getattr(comp, ev.function, None)
                if callable(method) and method is not sink:
                    _invoke_event_method(method, ev)

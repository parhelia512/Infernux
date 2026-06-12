"""Animation FSM logic tests (pure Python — no GPU sampling needed).

Regression coverage for the animation-audit fixes:
- trigger consumption uses identifier boundaries (not substring matching)
- AnimTransition.duration drives the cross-fade for that transition
- non-looping clips report loop=False to the native pose submission
- empty-condition ("clip finished") transitions
"""
from __future__ import annotations

import pytest

from Infernux.core.anim_state_machine import AnimStateMachine, AnimState, AnimTransition
from Infernux.components.skeletal_animator import SkeletalAnimator
from Infernux.components.spirit_animator import SpiritAnimator


def _make_animator() -> SkeletalAnimator:
    """Bare SkeletalAnimator with a hand-built FSM (no renderer / no scene)."""
    anim = SkeletalAnimator()
    anim._parameters = {}
    anim._duration_cache = {}
    anim._clip_cache = {}
    return anim


class _FakeClip:
    def __init__(self, take_name="Walk", duration_hint=2.0):
        self.take_name = take_name
        self.duration_hint = duration_hint
        self.source_model_guid = ""
        self.source_model_path = ""


class TestTriggerConsumption:
    def test_exact_identifier_consumed(self):
        anim = _make_animator()
        anim._parameters = {"attack": True}
        anim._consume_triggers("attack and speed > 1")
        assert anim._parameters["attack"] is False

    def test_substring_not_consumed(self):
        anim = _make_animator()
        anim._parameters = {"attack": True}
        anim._consume_triggers("is_attacking")
        assert anim._parameters["attack"] is True, \
            "'attack' must NOT be consumed by identifier 'is_attacking'"

    def test_multiple_triggers(self):
        anim = _make_animator()
        anim._parameters = {"jump": True, "fire": True, "idle": True}
        anim._consume_triggers("jump or fire")
        assert anim._parameters["jump"] is False
        assert anim._parameters["fire"] is False
        assert anim._parameters["idle"] is True

    def test_spirit_animator_same_semantics(self):
        sp = SpiritAnimator()
        sp._parameters = {"attack": True}
        sp._consume_triggers("is_attacking")
        assert sp._parameters["attack"] is True


class TestTransitionDuration:
    def test_transition_duration_overrides_component_fade(self):
        anim = _make_animator()
        anim.cross_fade_duration = 0.15
        prev = _FakeClip("A")
        nxt = _FakeClip("B")
        anim._start_blend_if_needed(prev, 0.5, 1.0, nxt, fade_duration=0.6)
        assert anim._blend_duration == pytest.approx(0.6)
        assert anim._blend_from_take_name == "A"

    def test_component_fade_is_fallback(self):
        anim = _make_animator()
        anim.cross_fade_duration = 0.25
        anim._start_blend_if_needed(_FakeClip("A"), 0.0, 1.0, _FakeClip("B"),
                                    fade_duration=None)
        assert anim._blend_duration == pytest.approx(0.25)

    def test_zero_duration_means_hard_cut(self):
        anim = _make_animator()
        anim.cross_fade_duration = 0.25
        anim._start_blend_if_needed(_FakeClip("A"), 0.0, 1.0, _FakeClip("B"),
                                    fade_duration=0.0)
        assert anim._blend_duration == 0.0
        assert anim._blend_from_clip is None

    def test_same_take_fade_allowed(self):
        # Restarting the same take with a fade is valid (sampled at two times).
        anim = _make_animator()
        anim.cross_fade_duration = 0.2
        anim._start_blend_if_needed(_FakeClip("Run"), 1.2, 1.0, _FakeClip("Run"),
                                    fade_duration=None)
        assert anim._blend_duration == pytest.approx(0.2)
        assert anim._blend_from_take_name == "Run"


class TestEmptyConditionTransition:
    def _animator_with_state(self, loop: bool, duration: float):
        anim = _make_animator()
        fsm = AnimStateMachine(name="t", mode="3d")
        state = AnimState(name="S", loop=loop)
        fsm.states.append(state)
        anim._fsm = fsm
        anim._current_state_name = "S"
        anim._current_clip = _FakeClip("S_take", duration_hint=duration)
        return anim, state

    def test_clip_finished_fires_for_non_loop(self):
        anim, _ = self._animator_with_state(loop=False, duration=1.0)
        anim._elapsed = 1.0
        tr = AnimTransition(target_state="Next", condition="")
        assert anim._evaluate_condition(tr) is True

    def test_clip_not_finished_does_not_fire(self):
        anim, _ = self._animator_with_state(loop=False, duration=1.0)
        anim._elapsed = 0.4
        tr = AnimTransition(target_state="Next", condition="")
        assert anim._evaluate_condition(tr) is False

    def test_looping_state_never_fires_empty_condition(self):
        anim, _ = self._animator_with_state(loop=True, duration=1.0)
        anim._elapsed = 5.0
        tr = AnimTransition(target_state="Next", condition="")
        assert anim._evaluate_condition(tr) is False

    def test_parameter_condition(self):
        anim, _ = self._animator_with_state(loop=True, duration=1.0)
        anim._parameters = {"speed": 3.0}
        tr = AnimTransition(target_state="Run", condition="speed > 2.0")
        assert anim._evaluate_condition(tr) is True
        tr2 = AnimTransition(target_state="Run", condition="speed > 5.0")
        assert anim._evaluate_condition(tr2) is False


class TestNormalizedTime:
    def test_normalized_clamps_to_one(self):
        anim = _make_animator()
        anim._current_clip = _FakeClip(duration_hint=2.0)
        anim._elapsed = 5.0
        assert anim.normalized_time == 1.0

    def test_unknown_duration_uses_default_period(self):
        anim = _make_animator()
        anim._current_clip = _FakeClip(duration_hint=0.0)
        anim._elapsed = 0.25
        assert 0.0 <= anim.normalized_time < 1.0

---
title: "Animation Workflow"
description: "Create 2D or 3D animation clips, place them in an .animfsm controller, attach SpiritAnimator or SkeletalAnimator, and verify state, transition, event, and playback behavior."
category: Learn
tags: ["animation", "2d", "3d", "fsm", "animator"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: []
agent_summary: "Create 2D or 3D animation clips, place them in an .animfsm controller, attach SpiritAnimator or SkeletalAnimator, and verify state, transition, event, and playback behavior."
source_paths: ["python/Infernux/engine/ui/animclip2d_editor_panel.py", "python/Infernux/engine/ui/animfsm_editor_panel.py", "python/Infernux/core/animation_clip.py", "python/Infernux/core/animation_clip3d.py", "python/Infernux/core/anim_state_machine.py", "python/Infernux/components/spirit_animator.py", "python/Infernux/components/skeletal_animator.py"]
---

# Animation Workflow

Infernux separates animation data into clips and a state-machine controller. A runtime Animator component reads the controller and drives either sprite frames or a skinned model.

**Estimated time:** 25–35 minutes  
**Completion check:** the default state plays in Game view and a deliberate parameter or trigger changes to a second state.

## Choose the path

| Path | Clip | Renderer | Runtime component |
|---|---|---|---|
| 2D sprite | `.animclip2d` | `SpriteRenderer` | `SpiritAnimator` |
| 3D skeletal | `.animclip3d` or an imported embedded take | `SkinnedMeshRenderer` | `SkeletalAnimator` |

Both use an `.animfsm` controller. `SpiritAnimator` is the current public component name for sprite animation.

## 1. Prepare the renderer

For 2D, complete [2D Foundations](2d-foundations.md) and confirm the SpriteRenderer can display every required sprite-sheet frame manually.

For 3D, import a rigged model and confirm the SkinnedMeshRenderer shows the model in bind pose. Inspect the model's embedded animation takes before creating states; embedded takes may be referenced through the model's virtual sub-animation identity.

Do not diagnose the Animator until the renderer and asset references work on their own.

## 2. Create clips

For 2D, open **Window → 2D Animation Clip Editor**. Choose the sprite-sheet texture, set FPS and frame sequence, preview it, then save as `.animclip2d` inside `Assets`.

For 3D, create or select an `.animclip3d` that identifies the source model and take. Confirm the take duration and bind-pose bone information in the asset details.

Use looping for idle/run cycles. Leave one-shot clips such as hit reactions or a death animation non-looping when the state machine should leave them after completion.

## 3. Build the state machine

Create or open an `.animfsm` in the Animation State Machine Editor. Double-clicking the asset also opens the graph.

1. Select the correct 2D or 3D controller mode.
2. Add at least two states and assign one clip/take to each.
3. Choose an explicit default state.
4. Add one parameter or trigger.
5. Create a transition and keep its first condition simple.
6. Decide whether the transition waits for exit time.
7. Save the asset and check that its `.meta` remains beside it.

A transition with both an unclear condition and exit-time gating is hard to diagnose. Prove one mechanism first, then combine them.

## 4. Attach the Animator

Add `SpiritAnimator` to the same GameObject as SpriteRenderer, or `SkeletalAnimator` to the same object as SkinnedMeshRenderer. The required-renderer relationship is enforced by the component metadata.

Assign the `.animfsm` to `controller`, leave `auto_play` enabled, and use playback speed `1.0` for the first run. `SkeletalAnimator.cross_fade_duration` controls the default blend duration between 3D states.

## 5. Drive a transition

Use the runtime parameter API from a gameplay component:

```python
from Infernux import InxComponent, SpiritAnimator


class AnimationDriver(InxComponent):
    def start(self) -> None:
        self.animator = self.game_object.get_component(SpiritAnimator)

    def begin_move(self) -> None:
        if self.animator is not None:
            self.animator.set_bool("moving", True)

    def react(self) -> None:
        if self.animator is not None:
            self.animator.set_trigger("react")
```

For 3D, replace the component type with `SkeletalAnimator`. Parameters are seeded from the controller and evaluated by transitions every update.

## 6. Verify observable state

- `current_state` matches the expected graph node.
- `is_playing` is true while a clip is advancing.
- `normalized_time` advances from 0 toward 1 and wraps only for looping states.
- A trigger is consumed by the transition rather than firing forever.
- 2D frame indices or the active 3D take visibly change.
- Stopping Play and reopening the scene preserves the controller reference.

## Common failures

### Default animation does not start

Check `auto_play`, the controller reference, an explicit default state, the matching renderer component, and the first Console error.

### State changes but the image or skeleton does not

For 2D, verify clip frame indices exist in the imported sprite metadata. For 3D, verify the take belongs to the assigned model and its skeleton is compatible.

### A transition never fires

Confirm parameter spelling and type, condition direction, exit-time threshold, current normalized time, and whether a trigger was already consumed.

## Current documentation boundary

`SpiritAnimator`, `SkeletalAnimator`, and the clip/FSM data models are public runtime classes, but they do not yet have generated symbol pages in the current API index. This Learn page and the listed source paths are the canonical preview guidance until matching stubs are added.

## Next step

Add animation events sparingly for frame-specific gameplay signals, or continue with [Audio Workflow](audio-workflow.md) to trigger a one-shot sound from the same gameplay action.


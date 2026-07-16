---
title: "Audio Workflow"
description: "Import a WAV clip, configure one AudioListener and a multi-track AudioSource, test looping and one-shot playback, and diagnose lifetime or spatial attenuation issues."
category: Learn
tags: ["audio", "listener", "source", "wav", "sfx"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: ["Infernux.components.builtin.AudioSource","Infernux.components.builtin.AudioListener","Infernux.core.AudioClip"]
agent_summary: "Import a WAV clip, configure one AudioListener and a multi-track AudioSource, test looping and one-shot playback, and diagnose lifetime or spatial attenuation issues."
source_paths: ["python/Infernux/core/audio_clip.pyi", "python/Infernux/core/asset_types.py", "python/Infernux/components/builtin/audio_source.pyi", "python/Infernux/components/builtin/audio_listener.pyi"]
---

# Audio Workflow

Build a minimal audio scene with one listener, one persistent track, and one transient sound effect. The current reliable decode path is WAV; do not assume MP3 or OGG support from older UI text.

**Estimated time:** 15–20 minutes  
**Completion check:** track 0 can loop or stop predictably, and repeated one-shot playback uses the source pool without creating temporary GameObjects.

## Before you start

Prepare short WAV files for a looping ambience and a one-shot effect. Complete [Assets and `.meta` Files](../manual/assets-and-meta.md) so that clip GUIDs remain stable.

## 1. Import and inspect WAV clips

Copy the files into `Assets/Audio`. Select each asset and confirm its metadata.

Audio import settings include:

- `force_mono` for content intended to behave as a single-channel spatial source;
- `load_in_background` for non-blocking load policy;
- `quality` and a declared compression format;
- the `.meta` GUID used by scene references.

At runtime, verify `AudioClip.is_loaded`, duration, sample rate, and channel count when a clip behaves unexpectedly.

## 2. Place one AudioListener

Add an AudioListener to the GameObject representing the listening position, normally the active Camera or player head. Keep one intended active listener in the scene.

Moving the listener changes spatial attenuation. For menu or effectively “2D” audio, place the AudioSource on or near the listener rather than assuming a non-spatial mode that is not exposed.

## 3. Configure an AudioSource

Create an AudioSource GameObject and assign the ambience to track 0. `AudioSource` is multi-track rather than a single `clip` field.

- `track_count` is from 1 to 16.
- `play_on_awake` automatically starts only track 0.
- `loop` applies when tracks reach their end.
- `volume`, `pitch`, and `mute` affect the source.
- `min_distance` and `max_distance` define spatial attenuation range.
- `one_shot_pool_size` limits concurrent transient voices.

Start with volume `1`, pitch `1`, a non-zero distance range, and no mute.

## 4. Control playback from gameplay

```python
from Infernux import AudioSource, InxComponent
from Infernux.core.audio_clip import AudioClip


class AudioDemo(InxComponent):
    def start(self) -> None:
        self.source = self.game_object.get_component(AudioSource)
        self.click = AudioClip.load("Assets/Audio/click.wav")

    def play_click(self) -> None:
        if self.source is not None and self.click is not None:
            self.source.play_one_shot(self.click, volume_scale=0.8)
```

Use `play(track_index)`, `pause`, `un_pause`, and `stop` for persistent tracks. Use `play_one_shot` for overlapping effects; do not create and destroy an AudioSource for every click or impact.

Keep loaded clips alive as long as the source may use them. A context manager or manual `unload()` is unsafe while playback still references the clip.

## 5. Validate behavior

- Exactly one intended listener receives the scene.
- Track 0 starts only when configured to do so.
- Looping has no accidental restart from repeated gameplay calls.
- Walking beyond `max_distance` attenuates the source as expected.
- Several rapid one-shots overlap up to the configured pool limit.
- Stop and scene unload leave no sound continuing unexpectedly.

## Common failures

### The clip does not load

Use WAV, verify the project path and `.meta`, then inspect the first audio/import error. Current runtime documentation only guarantees WAV decoding.

### The sound is silent

Check listener presence, source mute/volume, per-track volume, clip assignment, listener distance, and whether the selected track is actually playing.

### A one-shot stops too early

Keep the `AudioClip` object alive and do not unload it while the source uses it. Also check the one-shot pool size when many sounds overlap.

## Related reference

- [AudioSource](../api/AudioSource.md)
- [AudioListener](../api/AudioListener.md)
- [AudioClip](../api/AudioClip.md)
- [Input and Time](../manual/input-and-time.md)

## Next step

Trigger the one-shot from a `UIButton`, input edge, collision callback, or animation event, then verify the complete interaction in a standalone build.


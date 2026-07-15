---
title: "Debugging and the Console"
description: "A repeatable Infernux debugging workflow using the Console, Debug logging, lifecycle checks, minimal reproduction, and evidence suitable for GitHub Issues."
category: Manual
tags: ["debugging", "console", "logging", "troubleshooting"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: ["Infernux.debug.Debug","Infernux.components.InxComponent"]
agent_summary: "A repeatable Infernux debugging workflow using the Console, Debug logging, lifecycle checks, minimal reproduction, and evidence suitable for GitHub Issues."
source_paths: ["python/Infernux/debug.py", "python/Infernux/engine/ui/console_utils.py", "python/Infernux/components/component.py"]
---

# Debugging and the Console

Debugging is fastest when you separate the **first cause** from the errors it produces later. Infernux combines Python gameplay, native runtime systems, imported assets, and editor state, so one bad input can appear as several downstream failures.

## The first-error rule

When the Console contains many messages:

1. stop Play mode;
2. clear the Console;
3. reproduce the problem once;
4. start with the earliest warning or error;
5. fix or isolate that cause before interpreting later messages.

A script import failure can prevent component discovery, which then causes missing-reference messages, which may finally produce update errors. Debugging the final message first wastes time.

## Logging deliberately

Use the `Debug` class for messages that belong to the engine Console:

```python
from Infernux import Debug, InxComponent


class Door(InxComponent):
    def start(self) -> None:
        Debug.log("Door initialized", self.game_object)

    def open(self) -> None:
        if not self.enabled:
            Debug.log_warning("Ignored open request while disabled", self.game_object)
            return
        Debug.log("Door opened", self.game_object)
```

- `Debug.log(...)` records expected milestones or temporary observations.
- `Debug.log_warning(...)` records a recoverable but suspicious state.
- `Debug.log_error(...)` records a failed operation that should be investigated.
- `Debug.log_exception(...)` preserves exception context.
- Supplying the related object as context makes the report easier to trace.

Do not log a message every frame unless you are investigating a short capture. Per-frame logs can hide the original failure and distort timing.

## Diagnose a component that does not run

Check in this order:

1. **Import:** does the script load without syntax or import errors?
2. **Discovery:** does the class inherit `InxComponent`, and can the Inspector add it?
3. **Ownership:** is it attached to the GameObject you are observing?
4. **Activation:** are the component, GameObject, and parent hierarchy active?
5. **Signature:** does `update` accept `(self, delta_time)` and `fixed_update` accept `(self, fixed_delta_time)`?
6. **Play state:** are you testing behavior that only runs in Play mode?
7. **Early return:** is a guard condition intentionally skipping the work?

Add one log in `start()` and one at the branch you expect to enter. Avoid scattering many logs until you know which lifecycle boundary fails.

## Diagnose references and assets

For a missing component or object reference:

- log the owner and requested type once during setup;
- confirm the object exists in the active scene;
- confirm the component is attached and enabled;
- avoid relying on duplicate names;
- invalidate or reacquire references after a scene transition.

For an asset that works in the editor but not in a standalone build:

- confirm it lives inside the project;
- confirm references are project-relative and survive a moved project directory;
- rebuild into a clean output directory;
- inspect the first copy, import, or load error;
- test the entire packaged directory, not a detached executable.

## Reduce the problem

A useful minimal reproduction has:

- one saved scene;
- the smallest number of GameObjects and components that still fail;
- no unrelated assets or plugins;
- a short deterministic sequence of actions;
- the engine version and platform;
- expected and actual results.

Remove one dependency at a time. If the failure disappears, restore only that dependency and confirm it returns. This turns a vague project failure into a testable engine or usage issue.

## Report evidence

Use GitHub Discussions / Q&A when you are unsure whether behavior is a defect. Use GitHub Issues when you can provide a reproducible failure.

A strong issue includes:

```text
Engine version:
Operating system:
Project type / relevant settings:

Steps to reproduce:
1.
2.
3.

Expected result:
Actual result:
First relevant Console error:
Minimal project or code sample:
```

Remove credentials, local usernames, private paths, and proprietary assets before posting logs or projects publicly.

## Related reference

- [Debug](../api/Debug.md)
- [InxComponent](../api/InxComponent.md)
- [Scenes and Objects](scenes-and-objects.md)
- [Community hub](https://infernux-engine.com/community.html)

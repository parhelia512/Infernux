---
category: Learn
tags: ["beginner", "editor", "installation"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["new-user", "agent"]
agent_summary: "Install an Infernux preview, create or open a project, identify the main editor panels, save a scene, and enter Play mode."
source_paths: ["README.md", "packaging", "python/Infernux/engine/ui"]
---

# Getting Started

This guide gets you from a fresh machine to a running Infernux scene. It targets the **0.2.1 preview** on Windows. Preview builds change quickly, so confirm the version shown by the Hub or release page before diagnosing a mismatch.

## What you will accomplish

By the end, you should be able to:

- install or launch Infernux;
- create or open a project;
- recognize the Scene, Game, Hierarchy, Inspector, Project, and Console areas;
- save a scene and enter Play mode.

## 1. Get the engine

Use one of the supported project entry points:

1. Download the latest preview from the [Infernux releases page](https://github.com/ChenlizheMe/Infernux/releases).
2. Follow the package instructions included with that release.
3. Keep the Hub, editor, and project on a local writable drive while learning the workflow.

If you are developing the engine itself, use the repository build instructions instead of mixing a source build with a packaged preview.

## 2. Create or open a project

Launch the Hub or editor and choose a project location. A healthy project opens without repeated errors in the Console and exposes its files in the Project panel.

Do not store generated engine files beside unrelated source repositories. A dedicated project directory makes asset discovery, import, and troubleshooting much easier.

## 3. Read the editor layout

| Area | Purpose | First check |
|---|---|---|
| Scene | Edit the world and select objects visually | Can you orbit or frame the scene? |
| Game | Preview the active camera output | Does it change when Play mode starts? |
| Hierarchy | Inspect objects in the current scene | Can you select an object by name? |
| Inspector | Edit the selected object's components | Does selection update the Inspector? |
| Project | Browse project assets and scripts | Can you find the project's asset files? |
| Console | Read logs, warnings, and errors | Is it free of repeating exceptions? |

The exact docking arrangement may differ between builds. Use panel names and responsibilities—not a screenshot position—as the stable mental model.

## 4. Save and run a scene

1. Open or create a scene.
2. Add or select a visible object.
3. Save the scene before entering Play mode.
4. Start Play mode and watch the Game panel and Console.
5. Stop Play mode before making structural changes you intend to keep.

### Expected result

The editor enters and exits Play mode cleanly, the Game view updates, and the Console does not accumulate the same error every frame.

## Troubleshooting

### The editor does not launch

- Confirm the package matches your Windows architecture.
- Start from the release-provided launcher rather than moving individual binaries out of the package.
- Check whether security software quarantined a runtime dependency.

### The project opens but assets are missing

- Confirm you opened the project root rather than a nested asset folder.
- Avoid changing project files outside the editor while it is importing them.
- Read the first Console error; later errors may only be consequences.

### Play mode produces a blank Game view

- Confirm the scene contains and enables a Camera.
- Check that the scene you edited is the scene being played.
- Inspect the Console for script or resource-loading errors.

## Next step

Continue with [Your First Component](first-component.md) to add Python gameplay behavior. For a system-oriented overview, use the [Engine Map](../manual/engine-map.md).


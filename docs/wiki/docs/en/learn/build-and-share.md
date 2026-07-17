---
title: "Build and Share a Project"
description: "Add saved scenes to Build Settings, configure a Windows standalone player, build it, and verify the result outside the editor."
category: Learn
tags: ["beginner", "build", "windows", "release"]
status: preview
since: "0.2.1"
last_verified: "2026-07-17"
audience: ["new-user", "agent"]
related_api: []
agent_summary: "Add saved scenes to Build Settings, configure a Windows standalone player, build it, and verify the result outside the editor."
source_paths: ["python/Infernux/engine/ui/build_settings_panel.py", "python/Infernux/engine/game_builder.py"]
---

# Build and Share a Project

This tutorial turns the project you tested in the editor into a Windows standalone build. It targets the **0.2.9 preview** build pipeline.

**Estimated time:** 10–20 minutes after build dependencies are available.

## Before you start

- Your project opens without repeating Console errors.
- At least one scene is saved to the project.
- The scene works in Play mode.
- You have a writable output directory with enough free space.

## 1. Open Build Settings

Open the editor's **Build Settings** window. The window owns the ordered scene list and standalone player configuration.

Add the currently open scene. An unsaved scene cannot be added, because the build needs a stable project-relative path. Add every scene that can be loaded at runtime, then order them deliberately: build index `0` is the initial scene.

### Checkpoint

The scene list contains at least one valid saved scene and shows no missing-path warning.

## 2. Configure the player

Set the fields needed for the first build:

- **Game name:** the executable and product-facing name.
- **Output directory:** a dedicated empty or disposable build folder.
- **Display mode:** windowed or the fullscreen mode appropriate for the project.
- **Window size and resizable state:** the expected first-run window behavior.
- **Icon and splash:** optional for the first validation build.
- **Debug / JIT / LTO options:** keep preview defaults until a basic build succeeds.

Do not choose the project directory itself as the output directory. A build pipeline creates and cleans generated files; keeping output separate protects project assets and makes distribution contents obvious.

## 3. Build

Choose **Build** to produce the standalone output, or **Build and Run** when you also want the editor to launch the result after packaging.

The pipeline validates the project and scene list, compiles the player, copies assets, processes splash content, writes a build manifest, and performs final cleanup. Follow the first reported error if the build stops; later messages may only describe cleanup after the failure.

### Expected result

Build Settings reports success and provides the final output directory. That directory contains the executable plus the runtime files it needs.

## 4. Test outside the editor

Close or minimize the editor, then launch the executable from the output directory.

Verify all of the following:

- the initial scene is correct;
- input works without the editor owning focus;
- scene changes can load every scene included in Build Settings;
- required textures, audio, scripts, and other assets are present;
- window size, fullscreen behavior, title, and icon match the configuration;
- a clean launch does not depend on files outside the output directory.

Testing only through **Build and Run** is insufficient. A shareable build must also work when launched directly from its packaged directory.

## 5. Prepare a shareable archive

Stop the game and archive the **entire output directory**, not only the `.exe`. Keep the directory structure intact. Before publishing:

1. extract the archive to a different local directory;
2. launch the extracted copy;
3. test the start scene and one scene transition;
4. include the engine version and known preview limitations in release notes.

## Common failures

### Build is disabled

- Save the current scene.
- Add at least one scene to Build Settings.
- Choose a valid writable output directory.

### Runtime starts with the wrong scene

Move the desired start scene to build index `0`, save Build Settings, and rebuild.

### Assets work in the editor but are missing in the build

- Confirm assets live inside the project and use project-relative references.
- Read the earliest resource-copy or loading error.
- Rebuild into a clean output directory to avoid stale files.

### The executable works only on the development machine

Test the complete output on a clean Windows environment. Do not distribute a single executable copied out of its runtime directory.

## Completion standard

You are done when a freshly extracted archive launches without the editor, opens the correct scene, accepts input, loads its required assets, and exits cleanly.

Return to the [Engine Map](../manual/engine-map.md) or read [Scenes and Objects](../manual/scenes-and-objects.md) before expanding to multiple levels.


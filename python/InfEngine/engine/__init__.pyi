from __future__ import annotations

from typing import Any, Callable, Optional

from InfEngine.lib import InfGUIRenderable, InfGUIContext, TextureLoader, TextureData
from InfEngine.engine.engine import Engine, LogLevel
from InfEngine.engine.resources_manager import ResourcesManager
from InfEngine.engine.play_mode import PlayModeManager, PlayModeState
from InfEngine.engine.scene_manager import SceneFileManager
from InfEngine.engine.ui import (
    MenuBarPanel,
    FrameSchedulerPanel,
    ToolbarPanel,
    HierarchyPanel,
    InspectorPanel,
    ConsolePanel,
    SceneViewPanel,
    GameViewPanel,
    ProjectPanel,
    WindowManager,
    TagLayerSettingsPanel,
    StatusBarPanel,
    BuildSettingsPanel,
    UIEditorPanel,
    EditorPanel,
    EditorServices,
    EditorEventBus,
    EditorEvent,
    PanelRegistry,
    editor_panel,
)


def release_engine(project_path: str, engine_log_level: LogLevel = ...) -> None:
    """Launch InfEngine with Unity-style editor layout.

    Args:
        project_path: Absolute path to the project directory.
        engine_log_level: Logging verbosity for the native engine.
    """
    ...

def run_player(project_path: str, engine_log_level: LogLevel = ...) -> None:
    """Launch InfEngine in standalone player mode (no editor chrome).

    Opens the project's first scene from BuildSettings.json, applies the
    display mode from BuildManifest.json (fullscreen borderless or windowed
    with a custom resolution), plays the splash sequence if configured, then
    enters play mode and runs until the window is closed.

    Args:
        project_path: Absolute path to the project directory.
        engine_log_level: Logging verbosity for the native engine.
    """
    ...


__all__ = [
    "Engine",
    "LogLevel",
    "InfGUIRenderable",
    "InfGUIContext",
    "MenuBarPanel",
    "ToolbarPanel",
    "HierarchyPanel",
    "InspectorPanel",
    "ConsolePanel",
    "SceneViewPanel",
    "GameViewPanel",
    "UIEditorPanel",
    "ProjectPanel",
    "WindowManager",
    "TagLayerSettingsPanel",
    "StatusBarPanel",
    "PlayModeManager",
    "PlayModeState",
    "SceneFileManager",
    "TextureLoader",
    "TextureData",
    "release_engine",
    "run_player",
    "ResourcesManager",
    "BuildSettingsPanel",
    "EditorPanel",
    "EditorServices",
    "EditorEventBus",
    "EditorEvent",
    "PanelRegistry",
    "editor_panel",
]

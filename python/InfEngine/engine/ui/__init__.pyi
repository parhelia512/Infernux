"""InfEngine Editor UI — panels, managers, and framework.

Re-exports all editor panel classes and the panel framework.
Skipped entirely in standalone player builds.
"""

from __future__ import annotations

from InfEngine.engine.ui.menu_bar import MenuBarPanel as MenuBarPanel
from InfEngine.engine.ui.closable_panel import ClosablePanel as ClosablePanel
from InfEngine.engine.ui.hierarchy_panel import HierarchyPanel as HierarchyPanel
from InfEngine.engine.ui.inspector_panel import InspectorPanel as InspectorPanel
from InfEngine.engine.ui.console_panel import ConsolePanel as ConsolePanel
from InfEngine.engine.ui.scene_view_panel import SceneViewPanel as SceneViewPanel
from InfEngine.engine.ui.game_view_panel import GameViewPanel as GameViewPanel
from InfEngine.engine.ui.project_panel import ProjectPanel as ProjectPanel
from InfEngine.engine.ui.window_manager import WindowManager as WindowManager, WindowInfo as WindowInfo
from InfEngine.engine.ui.toolbar_panel import ToolbarPanel as ToolbarPanel
from InfEngine.engine.ui.frame_scheduler_panel import FrameSchedulerPanel as FrameSchedulerPanel
from InfEngine.engine.ui.tag_layer_settings import TagLayerSettingsPanel as TagLayerSettingsPanel
from InfEngine.engine.ui.status_bar import StatusBarPanel as StatusBarPanel
from InfEngine.engine.ui.engine_status import EngineStatus as EngineStatus
from InfEngine.engine.ui.build_settings_panel import BuildSettingsPanel as BuildSettingsPanel
from InfEngine.engine.ui.viewport_utils import ViewportInfo as ViewportInfo, capture_viewport_info as capture_viewport_info
from InfEngine.engine.ui.ui_editor_panel import UIEditorPanel as UIEditorPanel
from InfEngine.engine.ui.selection_manager import SelectionManager as SelectionManager
from InfEngine.engine.ui.editor_panel import EditorPanel as EditorPanel
from InfEngine.engine.ui.editor_services import EditorServices as EditorServices
from InfEngine.engine.ui.event_bus import EditorEventBus as EditorEventBus, EditorEvent as EditorEvent
from InfEngine.engine.ui.panel_registry import PanelRegistry as PanelRegistry, editor_panel as editor_panel
from InfEngine.engine.ui import panel_state as panel_state

__all__ = [
    "MenuBarPanel",
    "ToolbarPanel",
    "FrameSchedulerPanel",
    "HierarchyPanel",
    "InspectorPanel",
    "ConsolePanel",
    "SceneViewPanel",
    "GameViewPanel",
    "ProjectPanel",
    "ClosablePanel",
    "WindowManager",
    "WindowInfo",
    "TagLayerSettingsPanel",
    "StatusBarPanel",
    "EngineStatus",
    "BuildSettingsPanel",
    "ViewportInfo",
    "capture_viewport_info",
    "UIEditorPanel",
    "SelectionManager",
    "EditorPanel",
    "EditorServices",
    "EditorEventBus",
    "EditorEvent",
    "PanelRegistry",
    "editor_panel",
]

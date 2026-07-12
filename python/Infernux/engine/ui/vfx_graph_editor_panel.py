"""Editor shell for strict ``.vfxsystem`` graph assets."""

from __future__ import annotations

import copy
import json
import os
from typing import Optional

from Infernux.core.vfx_system import VfxEmitter, VfxSchemaError, VfxSystem
from Infernux.debug import Debug
from Infernux.engine.i18n import t
from Infernux.lib import InxGUIContext
from Infernux.vfx.nodes import VFX_NODE_SPECS

from .editor_panel import EditorPanel
from .node_graph_view import NodeGraphView
from .panel_registry import editor_panel


@editor_panel(
    "VFX Graph Editor",
    type_id="vfx_graph_editor",
    title_key="panel.vfx_graph_editor",
    menu_path="Animation",
)
class VfxGraphEditorPanel(EditorPanel):
    window_id = "vfx_graph_editor"

    _IMGUI_MOD_CTRL = 1 << 12
    _IMGUI_KEY_S = 564

    def __init__(self):
        super().__init__(title="VFX Graph Editor", window_id=self.window_id)
        self._system = VfxSystem()
        self._file_path = ""
        self._emitter_index = 0
        self._dirty = False
        self._drag_snapshot: Optional[dict] = None
        self._selected_node_uid = ""

        self._view = NodeGraphView()
        self._view.on_node_add_request = self._on_node_add
        self._view.on_nodes_deleted = self._on_nodes_deleted
        self._view.on_link_created = self._on_link_created
        self._view.on_link_deleted = self._on_link_deleted
        self._view.on_node_drag_start = self._on_node_drag_start
        self._view.on_node_drag_end = self._on_node_drag_end
        self._view.on_node_selected = self._on_node_selected
        self._bind_selected_emitter()

    @property
    def system(self) -> VfxSystem:
        return self._system

    def _selected_emitter(self) -> Optional[VfxEmitter]:
        if 0 <= self._emitter_index < len(self._system.emitters):
            return self._system.emitters[self._emitter_index]
        return None

    def _bind_selected_emitter(self) -> None:
        emitter = self._selected_emitter()
        self._view.graph = emitter.graph if emitter else None
        self._view.selected_nodes.clear()
        self._view.selected_link = ""
        self._selected_node_uid = ""

    def _on_node_selected(self, node_uid: str) -> None:
        self._selected_node_uid = node_uid

    def _open_vfxsystem(self, file_path: str) -> bool:
        try:
            system = VfxSystem.load(file_path)
        except (OSError, json.JSONDecodeError, VfxSchemaError) as exc:
            Debug.log_error(f"Failed to open VFX system '{file_path}': {exc}")
            return False
        self._system = system
        self._file_path = os.path.abspath(file_path)
        self._emitter_index = 0
        self._dirty = False
        self._bind_selected_emitter()
        self._sync_project_dirty_flag()
        return True

    def _do_save(self) -> bool:
        if not self._file_path:
            return False
        try:
            self._system.save(self._file_path)
        except (OSError, RuntimeError, ValueError) as exc:
            Debug.log_error(f"Failed to save VFX system '{self._file_path}': {exc}")
            return False
        self._dirty = False
        self._sync_project_dirty_flag()
        return True

    def _snapshot(self) -> dict:
        return {
            "system": copy.deepcopy(self._system.to_dict()),
            "emitter_index": self._emitter_index,
        }

    def _apply_snapshot(self, snapshot: dict) -> None:
        file_path = self._file_path
        self._system = VfxSystem.from_dict(snapshot["system"])
        self._system.file_path = file_path
        self._emitter_index = min(
            int(snapshot.get("emitter_index", 0)), max(0, len(self._system.emitters) - 1)
        )
        self._dirty = True
        self._bind_selected_emitter()
        self._sync_project_dirty_flag()

    def _record(self, description: str, before: dict) -> None:
        from Infernux.engine.undo import record_node_graph_snapshot

        record_node_graph_snapshot(
            description=description,
            before_snapshot=before,
            after_snapshot=self._snapshot(),
            apply_snapshot=self._apply_snapshot,
        )

    def _mark_changed(self) -> None:
        self._dirty = True
        self._sync_project_dirty_flag()

    def _on_node_add(self, type_id: str, x: float, y: float) -> None:
        emitter = self._selected_emitter()
        if emitter is None or emitter.graph.get_type(type_id) is None:
            return
        before = self._snapshot()
        emitter.graph.add_node(type_id, x, y)
        self._mark_changed()
        self._record("Add VFX node", before)

    def _on_nodes_deleted(self, node_uids) -> None:
        emitter = self._selected_emitter()
        if emitter is None:
            return
        before = self._snapshot()
        changed = any(emitter.graph.remove_node(uid) for uid in node_uids)
        if changed:
            self._mark_changed()
            self._record("Delete VFX nodes", before)

    def _on_link_created(self, src_node, src_pin, dst_node, dst_pin) -> None:
        emitter = self._selected_emitter()
        if emitter is None:
            return
        before = self._snapshot()
        if emitter.graph.add_link(src_node, src_pin, dst_node, dst_pin) is not None:
            self._mark_changed()
            self._record("Connect VFX nodes", before)

    def _on_link_deleted(self, link_uid: str) -> None:
        emitter = self._selected_emitter()
        if emitter is None:
            return
        before = self._snapshot()
        if emitter.graph.remove_link(link_uid):
            self._mark_changed()
            self._record("Disconnect VFX nodes", before)

    def _on_node_drag_start(self, _node_uid: str) -> None:
        self._drag_snapshot = self._snapshot()

    def _on_node_drag_end(self, _node_uid: str) -> None:
        before = self._drag_snapshot
        self._drag_snapshot = None
        if before is not None and before != self._snapshot():
            self._mark_changed()
            self._record("Move VFX node", before)

    def _sync_project_dirty_flag(self) -> None:
        try:
            from Infernux.engine.project_context import set_panel_dirty

            set_panel_dirty(self.window_id, self._dirty)
        except Exception:
            pass

    def _window_title_suffix(self) -> str:
        return " *" if self._dirty else ""

    def _initial_size(self):
        return (960, 640)

    def _empty_state_hint(self) -> str:
        return t("vfx_editor.open_hint")

    def _empty_state_drop_types(self):
        return ["VFXSYSTEM_FILE"]

    def _on_empty_state_drop(self, payload_type, payload):
        if payload_type == "VFXSYSTEM_FILE" and payload:
            self._open_vfxsystem(payload)

    def save_state(self) -> dict:
        return {
            "file_path": self._file_path,
            "emitter_index": self._emitter_index,
            "pan_x": self._view.pan_x,
            "pan_y": self._view.pan_y,
            "zoom": self._view.zoom,
        }

    def load_state(self, data: dict) -> None:
        path = str(data.get("file_path", ""))
        if path and os.path.isfile(path):
            self._open_vfxsystem(path)
        self._emitter_index = min(
            int(data.get("emitter_index", 0)), max(0, len(self._system.emitters) - 1)
        )
        self._view.pan_x = float(data.get("pan_x", self._view.pan_x))
        self._view.pan_y = float(data.get("pan_y", self._view.pan_y))
        self._view.zoom = float(data.get("zoom", self._view.zoom))
        self._bind_selected_emitter()

    def on_disable(self) -> None:
        try:
            from Infernux.engine.project_context import set_panel_dirty

            set_panel_dirty(self.window_id, False)
        except Exception:
            pass

    def on_render_content(self, ctx: InxGUIContext):
        try:
            focused = ctx.is_window_focused(3)
        except Exception:
            focused = True
        if (
            focused
            and ctx.is_key_down(self._IMGUI_MOD_CTRL)
            and ctx.is_key_pressed(self._IMGUI_KEY_S)
        ):
            self._do_save()

        if ctx.button(t("vfx_editor.save")):
            self._do_save()
        ctx.same_line(0, 12)
        ctx.label(self._system.name)
        ctx.separator()

        available_w = ctx.get_content_region_avail_width()
        available_h = ctx.get_content_region_avail_height()
        sidebar_w = min(220.0, max(150.0, available_w * 0.22))
        detail_w = min(240.0, max(180.0, available_w * 0.24))

        if ctx.begin_child("##vfx_emitters", sidebar_w, available_h, True):
            ctx.label(t("vfx_editor.emitters"))
            for index, emitter in enumerate(self._system.emitters):
                if ctx.selectable(f"{emitter.name}##vfx_emitter_{index}", index == self._emitter_index):
                    self._emitter_index = index
                    self._bind_selected_emitter()
            if ctx.button(t("vfx_editor.add_emitter")):
                before = self._snapshot()
                self._system.emitters.append(VfxEmitter(name=f"Emitter {len(self._system.emitters) + 1}"))
                self._emitter_index = len(self._system.emitters) - 1
                self._bind_selected_emitter()
                self._mark_changed()
                self._record("Add VFX emitter", before)
        ctx.end_child()

        ctx.same_line()
        graph_w = max(120.0, available_w - sidebar_w - detail_w - 12.0)
        if ctx.begin_child("##vfx_graph", graph_w, available_h, False):
            self._view.render(ctx)
        ctx.end_child()

        ctx.same_line()
        if ctx.begin_child("##vfx_node_detail", detail_w, available_h, True):
            self._render_node_detail(ctx)
        ctx.end_child()

        payload = ctx.accept_drag_drop_payload("VFXSYSTEM_FILE")
        if payload:
            self._open_vfxsystem(payload)

    def _render_node_detail(self, ctx: InxGUIContext) -> None:
        emitter = self._selected_emitter()
        node = emitter.graph.find_node(self._selected_node_uid) if emitter else None
        if node is None:
            return
        spec = VFX_NODE_SPECS.get(node.type_id)
        if spec is None:
            return
        ctx.label(spec.typedef.label)
        ctx.separator()
        for key, default in spec.defaults.items():
            value = node.data.get(key, default)
            ctx.label(key.replace("_", " ").title())
            new_value = value
            if isinstance(default, bool):
                new_value = bool(ctx.checkbox(f"##vfx_{node.uid}_{key}", bool(value)))
            elif isinstance(default, int):
                new_value = int(ctx.drag_int(f"##vfx_{node.uid}_{key}", int(value), 1.0, 0, 1_000_000))
            elif isinstance(default, float):
                new_value = float(
                    ctx.drag_float(f"##vfx_{node.uid}_{key}", float(value), 0.05, -1.0e6, 1.0e6)
                )
            elif isinstance(default, list):
                components = list(value)
                for index in range(len(default)):
                    components[index] = float(
                        ctx.drag_float(
                            f"{('XYZW'[index] if index < 4 else index)}##vfx_{node.uid}_{key}_{index}",
                            float(components[index]),
                            0.02,
                            -1.0e6,
                            1.0e6,
                        )
                    )
                new_value = components
            if new_value != value:
                before = self._snapshot()
                node.data[key] = new_value
                self._mark_changed()
                self._record("Edit VFX node", before)

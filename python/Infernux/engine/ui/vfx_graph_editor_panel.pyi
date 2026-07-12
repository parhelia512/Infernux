from Infernux.core.vfx_system import VfxSystem
from Infernux.engine.ui.editor_panel import EditorPanel

class VfxGraphEditorPanel(EditorPanel):
    window_id: str
    @property
    def system(self) -> VfxSystem: ...
    def _open_vfxsystem(self, file_path: str) -> bool: ...

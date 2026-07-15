from __future__ import annotations

from Infernux.core.animation_clip import AnimationClip
from Infernux.core.asset_types import SpriteFrame
from Infernux.engine.ui.animclip2d_editor_panel import (
    AnimClip2DEditorPanel,
    _ClipState,
    _TextureState,
)


class _ClipInfoContext:
    def __init__(self) -> None:
        self.semantics = []

    def label(self, _label):
        pass

    def same_line(self, *_args):
        pass

    def set_next_item_width(self, _width):
        pass

    def text_input(self, _label, value, _size):
        return value

    def button(self, _label):
        return False

    def begin_disabled(self, _disabled):
        pass

    def end_disabled(self):
        pass

    def record_semantic_item(self, *args):
        self.semantics.append(args)


class _PaletteContext:
    def __init__(self) -> None:
        self.semantics = []

    def begin_child(self, *_args):
        pass

    def end_child(self):
        pass

    def label(self, _label):
        pass

    def separator(self):
        pass

    def get_content_region_avail_height(self):
        return 180.0

    def get_content_region_avail_width(self):
        return 180.0

    def begin_table(self, *_args):
        return True

    def end_table(self):
        pass

    def table_next_column(self):
        pass

    def get_cursor_pos_x(self):
        return 0.0

    def get_cursor_pos_y(self):
        return 0.0

    def set_cursor_pos_x(self, _value):
        pass

    def set_cursor_pos_y(self, _value):
        pass

    def button(self, _label, **_kwargs):
        return False

    def record_semantic_item(self, *args):
        self.semantics.append(args)

    def is_item_hovered(self):
        return False

    def get_item_rect_min_x(self):
        return 0.0

    def get_item_rect_min_y(self):
        return 0.0

    def image(self, *_args):
        pass

    def draw_text(self, *_args):
        pass


def test_clip_info_publishes_name_and_save_semantics():
    panel = AnimClip2DEditorPanel()
    panel._tex = _TextureState(texture_id=1)
    clip = _ClipState(name="Countdown", frame_indices=[0])
    ctx = _ClipInfoContext()

    panel._render_clip_info(ctx, clip, 500.0)

    by_id = {entry[3]: entry for entry in ctx.semantics}
    assert by_id["animclip2d.clip.name"][1].endswith(": Countdown")
    assert by_id["animclip2d.clip.save"][2] is True
    assert by_id["animclip2d.clip.save_as"][2] is True


def test_frame_palette_publishes_one_stable_target_per_slice():
    panel = AnimClip2DEditorPanel()
    panel._tex = _TextureState(
        texture_id=1,
        tex_w=128,
        tex_h=64,
        frames=[
            SpriteFrame(name="red", x=0, y=0, w=64, h=64),
            SpriteFrame(name="green", x=64, y=0, w=64, h=64),
        ],
    )
    ctx = _PaletteContext()

    panel._render_frame_palette(ctx, 180.0)

    by_id = {entry[3]: entry for entry in ctx.semantics}
    assert by_id["animclip2d.palette.frame.0"][1] == "Frame 0: red"
    assert by_id["animclip2d.palette.frame.1"][1] == "Frame 1: green"


def test_loop_round_trips_panel_state_and_saved_clip(monkeypatch, tmp_path):
    panel = AnimClip2DEditorPanel()
    panel._tex = _TextureState(file_path="Assets/countdown.png", guid="texture-guid")
    clip = _ClipState(name="Countdown", frame_indices=[0, 1, 2], fps=3.0, loop=False)
    panel._clips = [clip]

    state = panel.save_state()
    restored = AnimClip2DEditorPanel()
    restored.load_state(state)
    assert restored._clips[0].loop is False

    captured = {}

    def _capture_save(value):
        captured.update(value.to_dict())
        return True

    monkeypatch.setattr(AnimationClip, "save", _capture_save)
    assert panel._do_save_clip(clip, str(tmp_path / "Countdown.animclip2d")) is True
    assert captured["loop"] is False
    assert captured["frame_indices"] == [0, 1, 2]
    assert captured["fps"] == 3.0

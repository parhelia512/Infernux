---
category: Manual
tags: ["ui", "canvas", "layout", "events", "responsive"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "Explain the screen-space UI hierarchy, Canvas scaling, anchors, text and image layout, button events, hit testing, and current transition limitations."
source_paths: ["python/Infernux/ui", "python/Infernux/renderstack/default_forward_pipeline.pyi", "python/Infernux/renderstack/default_deferred_pipeline.pyi"]
---

# Screen-space UI

Infernux UI is a component hierarchy rooted at `UICanvas`. Child GameObjects carry screen components such as `UIText`, `UIImage`, and `UIButton`. Layout uses canvas design pixels and is converted to the current Game viewport at render and input time.

## Canvas first

Treat the Canvas reference resolution as the coordinate system in which the interface is designed. The default is 1920 × 1080.

| Setting | Purpose |
|---|---|
| `render_mode` | `ScreenOverlay`, or `CameraOverlay` for a selected camera |
| `sort_order` | order between canvases; lower values draw first |
| `ui_scale_mode` | constant pixels or scale from a reference resolution |
| `screen_match_mode` | choose how width and height differences are reconciled |
| `match_width_or_height` | blend from width matching (`0`) to height matching (`1`) |
| `pixel_perfect` | prefer integer scaling when possible |

For a game HUD, start with `ScaleWithScreenSize` and test both the narrowest and widest supported aspect ratios. `ConstantPhysicalSize` is currently a future-facing option and behaves like constant pixels.

Screen UI also depends on the selected render pipeline's `enable_screen_ui` setting.

## Anchors and rectangles

Every `InxUIScreenComponent` has horizontal and vertical alignment anchors plus `x`, `y`, `width`, and `height`. These values are relative to its parent UI element, or the Canvas when there is no parent element.

- Anchor panels to an edge that matches their intent: health to a corner, a dialog to center.
- Keep related elements under a shared parent so they move as one layout unit.
- Use `rotation` for appearance, but remember hit testing uses the rotated rectangle.
- Use `opacity` for element transparency and `raycast_target` to opt into pointer hits.
- Do not make decorative images raycast targets; they can hide buttons behind them.

`UICanvas.raycast()` returns the front-most eligible element, while `raycast_all()` returns the complete front-to-back hit list.

## Text, images, and buttons

`UIText` supports horizontal/vertical alignment, line height, letter spacing, overflow behavior, and three resize modes. Use `AutoWidth` for short labels, `AutoHeight` for wrapped paragraphs, and `FixedSize` when the layout must not move.

`UIImage.texture_path` points to a texture asset. Its color is a multiplicative tint; use `[1, 1, 1, 1]` to preserve the source image.

`UIButton` combines a background, a label, selectable color states, and an `on_click` event:

```python
from Infernux import GameObject, InxComponent
from Infernux.ui import UIButton


class MainMenu(InxComponent):
    def start(self) -> None:
        button_object = GameObject.find("StartButton")
        if button_object is None:
            return

        button = button_object.get_component(UIButton)
        if button is not None:
            button.on_click.add_listener(self.start_game)

    def start_game(self) -> None:
        print("Start requested")
```

Store the callback as a stable method when you will later call `remove_listener`. `ColorTint` is the implemented selectable transition; sprite-swap and animation transitions are marked for future behavior.

## Responsive checklist

1. Test the Canvas at the reference resolution, 16:9, 16:10, ultrawide, and a narrow portrait viewport.
2. Check text at the longest supported translation, not only the shortest English label.
3. Ensure interactive targets remain large enough after scaling.
4. Verify render order, raycast order, and visual order agree.
5. Disable gameplay input while a modal UI owns focus.
6. Confirm UI remains enabled in the active render pipeline.

## Related reference

- [UICanvas](../api/UICanvas.md)
- [UIText](../api/UIText.md)
- [UIImage](../api/UIImage.md)
- [UIButton](../api/UIButton.md)
- [UISelectable](../api/UISelectable.md)
- [Input and Time](input-and-time.md)


# BoxCollider

<div class="class-info">
class in <b>InfEngine.components.builtin</b>
</div>

**Inherits from:** [Collider](Collider.md)

## Description

A box-shaped collider primitive.

<!-- USER CONTENT START --> description

<!-- USER CONTENT END -->

## Properties

| Name | Type | Description |
|------|------|------|
| size | `Any` | The size of the box collider in local space. |

<!-- USER CONTENT START --> properties

<!-- USER CONTENT END -->

## Lifecycle Methods

| Method | Description |
|------|------|
| `on_draw_gizmos_selected() → None` | Draw the collider wireframe when selected in the editor. |

<!-- USER CONTENT START --> lifecycle_methods

<!-- USER CONTENT END -->

## Example

```python
collider = self.game_object.add_component(BoxCollider)
collider.size = vector3(1.0, 2.0, 1.0)
```

<!-- USER CONTENT START --> example

<!-- USER CONTENT END -->

## See Also

<!-- USER CONTENT START --> see_also

<!-- USER CONTENT END -->

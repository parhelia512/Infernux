# Transform

<div class="class-info">
class in <b>Infernux</b>
</div>

**Inherits from:** [Component](Component.md)

## Description

Transform component — position, rotation, scale, hierarchy.

<!-- USER CONTENT START --> description

<!-- USER CONTENT END -->

## Properties

| Name | Type | Description |
|------|------|------|
| position | `Vector3` |  |
| euler_angles | `Vector3` |  |
| rotation | `quatf` |  |
| local_position | `Vector3` |  |
| local_euler_angles | `Vector3` |  |
| local_scale | `Vector3` |  |
| local_rotation | `quatf` |  |
| lossy_scale | `Vector3` |  *(read-only)* |
| forward | `Vector3` |  *(read-only)* |
| right | `Vector3` |  *(read-only)* |
| up | `Vector3` |  *(read-only)* |
| local_forward | `Vector3` |  *(read-only)* |
| local_right | `Vector3` |  *(read-only)* |
| local_up | `Vector3` |  *(read-only)* |
| parent | `Optional[Transform]` |  |
| root | `Transform` |  *(read-only)* |
| child_count | `int` |  *(read-only)* |
| has_changed | `bool` |  |

<!-- USER CONTENT START --> properties

<!-- USER CONTENT END -->

## Public Methods

| Method | Description |
|------|------|
| `set_parent(parent: Optional[Transform], world_position_stays: bool = True) → None` |  |
| `get_child(index: int) → Transform` |  |
| `find(name: str) → Optional[Transform]` |  |
| `detach_children() → None` |  |
| `is_child_of(parent: Transform) → bool` |  |
| `get_sibling_index() → int` |  |
| `set_sibling_index(index: int) → None` |  |
| `set_as_first_sibling() → None` |  |
| `set_as_last_sibling() → None` |  |
| `set_local_trs(px: float, py: float, pz: float, rx: float, ry: float, rz: float, sx: float, sy: float, sz: float) → None` |  |
| `look_at(target: Vector3) → None` |  |
| `translate(delta: Vector3, space: int = ...) → None` |  |
| `translate_local(delta: Vector3) → None` |  |
| `rotate(euler: Vector3, space: int = ...) → None` |  |
| `rotate_around(point: Vector3, axis: Vector3, angle: float) → None` |  |
| `transform_point(point: Vector3) → Vector3` |  |
| `inverse_transform_point(point: Vector3) → Vector3` |  |
| `transform_direction(direction: Vector3) → Vector3` |  |
| `inverse_transform_direction(direction: Vector3) → Vector3` |  |
| `transform_vector(vector: Vector3) → Vector3` |  |
| `inverse_transform_vector(vector: Vector3) → Vector3` |  |
| `local_to_world_matrix() → List[float]` |  |
| `world_to_local_matrix() → List[float]` |  |

<!-- USER CONTENT START --> public_methods

<!-- USER CONTENT END -->

## Example

<!-- USER CONTENT START --> example
> **Example status:** No curated example has been verified for this symbol in 0.2.9. Use the signatures above; do not infer behavior from similarly named APIs in other engines.
<!-- USER CONTENT END -->

## See Also

<!-- USER CONTENT START --> see_also

<!-- USER CONTENT END -->

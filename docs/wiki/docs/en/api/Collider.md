# Collider

<div class="class-info">
class in <b>InfEngine.components.builtin</b>
</div>

**Inherits from:** [BuiltinComponent](Component.md)

## Description

Base class for all collider components.

<!-- USER CONTENT START --> description

<!-- USER CONTENT END -->

## Properties

| Name | Type | Description |
|------|------|------|
| center | `Any` | The center of the collider in local space. |
| is_trigger | `bool` | Whether the collider is a trigger (non-physical). |
| friction | `float` | The friction coefficient of the collider surface. |
| bounciness | `float` | The bounciness of the collider surface. |

<!-- USER CONTENT START --> properties

<!-- USER CONTENT END -->

## Example

```python
hit = Physics.raycast(self.transform.position, vector3(0, 0, 1))
if hit:
	Debug.log("Hit something")
```

<!-- USER CONTENT START --> example

<!-- USER CONTENT END -->

## See Also

<!-- USER CONTENT START --> see_also

<!-- USER CONTENT END -->

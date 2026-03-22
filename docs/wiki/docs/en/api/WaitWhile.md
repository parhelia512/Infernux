# WaitWhile

<div class="class-info">
class in <b>InfEngine.coroutine</b>
</div>

## Description

Suspend a coroutine while the predicate returns True.

<!-- USER CONTENT START --> description

<!-- USER CONTENT END -->

## Constructors

| Signature | Description |
|------|------|
| `WaitWhile.__init__(predicate: Callable[[], bool]) → None` |  |

<!-- USER CONTENT START --> constructors

<!-- USER CONTENT END -->

## Properties

| Name | Type | Description |
|------|------|------|
| predicate | `Callable[[], bool]` |  *(read-only)* |

<!-- USER CONTENT START --> properties

<!-- USER CONTENT END -->

## Example

```python
yield WaitWhile(lambda: self.is_loading)
Debug.log("Loading loop ended")
```

<!-- USER CONTENT START --> example

<!-- USER CONTENT END -->

## See Also

<!-- USER CONTENT START --> see_also

<!-- USER CONTENT END -->

# Coroutine

<div class="class-info">
class in <b>InfEngine.coroutine</b>
</div>

## Description

A handle to a running coroutine.

<!-- USER CONTENT START --> description

<!-- USER CONTENT END -->

## Constructors

| Signature | Description |
|------|------|
| `Coroutine.__init__(generator: Generator, owner: Any = ...) → None` |  |

<!-- USER CONTENT START --> constructors

<!-- USER CONTENT END -->

## Properties

| Name | Type | Description |
|------|------|------|
| is_finished | `bool` | Returns True if the coroutine has completed. *(read-only)* |

<!-- USER CONTENT START --> properties

<!-- USER CONTENT END -->

## Example

```python
def blink(self):
	while True:
		Debug.log("blink")
		yield WaitForSeconds(0.25)

self.start_coroutine(self.blink())
```

<!-- USER CONTENT START --> example

<!-- USER CONTENT END -->

## See Also

<!-- USER CONTENT START --> see_also

<!-- USER CONTENT END -->

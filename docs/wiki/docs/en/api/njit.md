# njit

<div class="class-info">
function in <b>Infernux.jit</b>
</div>

```python
njit() → Any
```

## Description

Numba ``njit`` decorator, or a no-op fallback when Numba is unavailable.

The decorated function gains a ``.py`` attribute pointing to the
original pure-Python source.

Supports ``auto_parallel=True`` as an Infernux extension. In that mode
the wrapper prepares both serial and ``parallel=True`` variants,
conservatively upgrades simple ``for ... in range(...)`` reduction loops
to ``prange`` when possible, defaults to the parallel one, and lets
:func:`warmup` first trigger compilation and then benchmark steady-state
runtime before pinning the faster choice.

<!-- USER CONTENT START --> description

<!-- USER CONTENT END -->

## Example

<!-- USER CONTENT START --> example
> **Example status:** No curated example has been verified for this symbol in 0.2.9. Use the signatures above; do not infer behavior from similarly named APIs in other engines.
<!-- USER CONTENT END -->

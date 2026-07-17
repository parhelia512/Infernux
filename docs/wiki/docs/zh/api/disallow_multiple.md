# disallow_multiple

<div class="class-info">
函数位于 <b>Infernux.components</b>
</div>

```python
disallow_multiple() → Union[Type, Callable]
```

## 描述

Prevent multiple instances of this component on a GameObject.

Usable with or without parentheses::

    @disallow_multiple
    class MySingleton(InxComponent): ...

    @disallow_multiple()
    class MySingleton(InxComponent): ...

<!-- USER CONTENT START --> description

<!-- USER CONTENT END -->

## 示例

<!-- USER CONTENT START --> example
> **示例状态：** 当前尚未为此符号验证 0.2.9 示例。请使用上方签名及相关 Manual/Learn；不要根据其他引擎中的同名 API 推测行为。
<!-- USER CONTENT END -->

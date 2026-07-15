---
category: 学习
tags: ["入门", "python", "组件", "inspector"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["new-user", "agent"]
agent_summary: "创建 InxComponent Python 脚本，暴露可序列化速度字段，把它挂到 GameObject，并在 Play 模式验证生命周期。"
source_paths: ["python/Infernux/components", "python/Infernux/__init__.pyi"]
---

# 第一个组件

Infernux 的玩法脚本是继承 `InxComponent` 的 Python 类。本教程会制作一个持续旋转所属对象的组件，并把旋转速度暴露到 Inspector。

## 开始之前

先完成[快速开始](getting-started.md)，打开一个已保存且包含可见 GameObject 的场景。测试期间保持 Console 可见。

## 1. 创建脚本

在项目的脚本或资源区域创建 `SpinComponent.py`：

```python
from Infernux import Debug, InxComponent, Vector3, serialized_field


class SpinComponent(InxComponent):
    speed: float = serialized_field(
        default=45.0,
        range=(0.0, 360.0),
        tooltip="每秒旋转角度",
    )

    def start(self) -> None:
        Debug.log("SpinComponent started", self.game_object)

    def update(self, delta_time: float) -> None:
        self.transform.rotate(Vector3(0.0, self.speed * delta_time, 0.0))
```

代码含义：

- `InxComponent` 把 Python 类接入引擎组件生命周期。
- `serialized_field` 让 `speed` 能在 Inspector 中编辑并随场景序列化。
- `start()` 在组件激活后的第一次帧更新前执行。
- `update(delta_time)` 每帧执行；乘以 `delta_time` 能避免速度依赖帧率。
- `self.transform` 是所属 GameObject 的 Transform 快捷入口。

## 2. 挂到对象上

1. 保存脚本，等待编辑器发现或重新加载它。
2. 在 Hierarchy 中选择可见的 GameObject。
3. 在 Inspector 中添加 `SpinComponent` 脚本组件。
4. 把 **Speed** 设置成容易观察的值，例如 `90`。
5. 保存场景。

如果组件没有出现，请查看 Console 的第一条错误。语法错误、无效导入或类没有继承 `InxComponent` 都会阻止脚本被发现。

## 3. 验证行为

进入 Play 模式。

### 预期结果

- 对象绕 Y 轴旋转。
- Console 只输出一次 `SpinComponent started`。
- Play 前修改 **Speed** 会改变旋转速度。
- 停止 Play 后更新循环结束，Console 不反复报错。

## 如何选择生命周期

| 方法 | 适合处理 |
|---|---|
| `awake()` | 组件创建时的一次性内部初始化 |
| `start()` | 依赖活动场景或其他已初始化组件的设置 |
| `update(delta_time)` | 每帧玩法与输入 |
| `fixed_update(fixed_delta_time)` | 固定步长的物理决策 |
| `late_update(delta_time)` | 普通更新之后的跟随工作，例如相机跟随 |
| `on_destroy()` | 释放资源或取消回调注册 |

完整生命周期与组件辅助方法见 [InxComponent API](../api/InxComponent.md)。

## 常见错误

### `update` 从不执行

- 确认方法参数包含 `self` 和 `delta_time`。
- 确认组件及其 GameObject 已启用。
- 确认编辑器挂载的类来自你刚编辑的文件。

### Inspector 不显示 `speed`

- 保留 `speed: float` 类型标注。
- 在类作用域调用 `serialized_field(...)`，不要写进 `start()`。
- 先解决脚本重载错误，再重新添加组件。

### 不同机器的旋转速度不同

使用 `speed * delta_time`，不要每帧增加固定角度。

## 下一步

打开[引擎地图](../manual/engine-map.md)，选择输入、物理、场景、UI、协程或渲染等下一个系统，再进入对应的精确 API 页面。


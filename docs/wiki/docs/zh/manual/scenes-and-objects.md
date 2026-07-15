---
title: "场景与对象"
description: "解释 Infernux 的场景所有权、GameObject 身份、Transform 层级、组件查询、激活状态与按构建索引加载场景。"
category: 手册
tags: ["场景", "gameobject", "transform", "层级"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: ["Infernux.GameObject","Infernux.Transform","Infernux.Scene","Infernux.scene.SceneManager","Infernux.components.InxComponent"]
agent_summary: "解释 Infernux 的场景所有权、GameObject 身份、Transform 层级、组件查询、激活状态与按构建索引加载场景。"
source_paths: ["python/Infernux/scene", "python/Infernux/components", "python/Infernux/lib/_Infernux.pyi"]
---

# 场景与对象

Scene、GameObject、Transform 与组件共同构成运行时内容的所有权模型。明确每一层负责什么，可以避免脆弱的全局查找和跨场景悬空引用。

## 所有权模型

```text
[INX-DIAGRAM:hierarchy:场景所有权与组件边界]
Scene
└─ GameObject
   ├─ Transform
   │  └─ 通过 Transform 层级连接的子 GameObject
   ├─ 原生内置 Component
   └─ Python InxComponent 实例
```

- **Scene** 是可加载的对象集合。
- **GameObject** 提供身份、激活、标签、层级与组件所有权。
- **Transform** 提供空间状态和父子关系。
- **Component** 提供行为或数据，但不会成为第二套对象身份。

不要把组件当成独立场景对象。它的生命周期和有效状态受所属 GameObject 约束。

## GameObject 身份与激活

`GameObject.name` 便于人类阅读，但不保证唯一。只有当项目的标签约定足够稳定时，才用 tag 做广义角色查询。逐帧逻辑应保存直接组件引用，不要每帧调用全局查找。

激活状态有两个相关视角：

- `active_self`：对象自身请求的状态；
- `active_in_hierarchy`：考虑父对象之后的实际状态。

子对象可能请求激活，却因为某个祖先未激活而仍然无效。排查组件不更新时，除了组件 `enabled`，还要检查层级中的实际激活状态。

## Transform 层级

Transform 同时暴露世界与局部值：

| 空间 | 位置 | 旋转 | 缩放 |
|---|---|---|---|
| 世界 | `position` | `rotation` / `euler_angles` | `lossy_scale` |
| 局部 | `local_position` | `local_rotation` / `local_euler_angles` | `local_scale` |

重新设置父对象时使用 `set_parent(parent, world_position_stays=True)`。默认值会保持世界位置并重新计算局部值；如果真正需要保留的是局部关系，则传入 `False`。

空间关系优先通过 Transform 的 `parent`、`get_child`、`find` 遍历；行为依赖优先保存组件引用。

## 组件

一个 GameObject 可以同时拥有内置组件与 Python 组件。常见操作包括：

- `add_component(type)` 与 `remove_component(instance)`；
- `get_component(type)` 获取一个兼容组件；
- `get_components(type)` 获取全部兼容组件；
- `get_component_in_children(type)` 与 `get_component_in_parent(type)` 做层级感知查询。

如果引用在组件生命周期内保持有效，可在 `start()` 中缓存：

```python
from Infernux import InxComponent, Rigidbody


class Motor(InxComponent):
    def start(self) -> None:
        self.body = self.game_object.get_component(Rigidbody)

    def fixed_update(self, fixed_delta_time: float) -> None:
        if self.body is None:
            return
        # 在这里执行固定步长的马达逻辑。
```

如果某组件是必需依赖，应在初始化阶段明确失败，而不是每帧静默搜索整个场景。

## 加载场景

`SceneManager.load_scene(...)` 接受构建索引或场景标识。构建索引来自 Build Settings 中的有序场景列表。

```python
from Infernux import InxComponent
from Infernux.scene import SceneManager


class ExitPortal(InxComponent):
    next_scene_index: int = 1

    def travel(self) -> None:
        if not SceneManager.load_scene(self.next_scene_index):
            raise RuntimeError(f"无法加入场景加载请求：{self.next_scene_index}")
```

加载请求可能在引擎安全点处理，而不是在组件回调中途立即替换活动场景。请求切换后，不要继续修改旧场景对象。

只有会明确跨场景存在的对象，例如会话协调器，才使用 `dont_destroy_on_load(game_object)`。持久对象必须能够处理重复进入场景，避免复制自身。

## 实用规则

1. 场景保存后再加入 Build Settings。
2. 不把 GameObject 名称当成唯一持久标识。
3. 缓存频繁使用的组件引用。
4. 赋值前区分 Transform 的局部值与世界值。
5. 把场景加载视为所有权边界；旧引用可能失效。
6. 跨场景持久对象应少而明确。

## 相关参考

- [GameObject](../api/GameObject.md)
- [Transform](../api/Transform.md)
- [Scene](../api/Scene.md)
- [SceneManager](../api/SceneManager.md)
- [InxComponent](../api/InxComponent.md)
- [构建并分享项目](../learn/build-and-share.md)

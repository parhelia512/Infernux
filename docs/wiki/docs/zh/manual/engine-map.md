---
category: 手册
tags: ["总览", "系统", "参考"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "把常见 Infernux 开发任务映射到对应引擎系统与权威 API 页的路由地图。"
source_paths: ["python/Infernux", "docs/wiki/docs/zh/api"]
---

# 引擎地图

当你知道**想完成什么**，却不知道该找哪个 Infernux 类型或模块时，从这里开始。本页是一张路由地图，不替代任务教程或精确 API 签名。

## 核心创作模型

```text
项目 Project
└─ 场景 Scene
   └─ 游戏对象 GameObject
      ├─ Transform
      ├─ 内置 Components
      └─ Python InxComponent 脚本
```

Scene 包含 GameObject。每个 GameObject 通过 Transform 拥有空间状态，通过组件获得行为。Python 玩法行为继承 `InxComponent` 并进入引擎生命周期。

## 按任务寻找系统

| 我想要…… | 从这里开始 | 权威参考 |
|---|---|---|
| 移动、旋转、缩放或设置父子关系 | Transform | [Transform](../api/Transform.md) |
| 编写 Python 玩法行为 | 组件生命周期 | [InxComponent](../api/InxComponent.md) |
| 在 Inspector 暴露数值 | 序列化字段 | [serialized_field](../api/serialized_field.md) |
| 创建、查找、启用或销毁对象 | 对象模型 | [GameObject](../api/GameObject.md) |
| 加载或切换关卡 | 场景管理 | [SceneManager](../api/SceneManager.md) |
| 读取键盘、鼠标或触摸输入 | Input | [Input](../api/Input.md) · [KeyCode](../api/KeyCode.md) |
| 运行固定步长物理行为 | 物理组件与查询 | [Physics](../api/Physics.md) · [Rigidbody](../api/Rigidbody.md) |
| 跨帧等待但不阻塞 | 协程 | [Coroutine](../api/Coroutine.md) · [WaitForSeconds](../api/WaitForSeconds.md) |
| 读取帧与固定步长时间 | Timing | [Time](../api/Time.md) |
| 输出诊断信息 | Debug | [Debug](../api/Debug.md) |
| 构建运行时 UI | UI | [UICanvas](../api/UICanvas.md) · [UIButton](../api/UIButton.md) |
| 配置相机和灯光 | 渲染组件 | [Camera](../api/Camera.md) · [Light](../api/Light.md) |
| 添加后处理 | Render Stack | [RenderStack](../api/RenderStack.md) |
| 构建自定义渲染 Pass | Render Graph | [RenderGraph](../api/RenderGraph.md) |
| 优化数组密集型 Python 循环 | JIT 子系统 | [JIT 指南](../architecture/jit.md) · [njit](../api/njit.md) |

## 组件生命周期速览

```text
创建 → awake → 启用 → start → update / fixed_update / late_update → 禁用 → 销毁
```

- `awake()`：建立组件自身不变量。
- `start()`：处理依赖活动场景的初始化。
- `update(delta_time)`：普通逐帧工作。
- `fixed_update(fixed_delta_time)`：固定步长的物理决策。
- `late_update(delta_time)`：必须在普通更新后完成的工作。
- `on_enable()`、`on_disable()`、`on_destroy()`：管理外部注册与资源。

生命周期细节见 [InxComponent API](../api/InxComponent.md)。

## 文档分层

| 层级 | 最适合 | 稳定性 |
|---|---|---|
| 学习 Learn | 完成一个端到端小任务 | 人工维护并按版本验证 |
| 手册 Manual | 理解概念与系统归属 | 人工维护并按版本验证 |
| API | 查询类、属性、方法和签名 | 从当前绑定与类型存根生成 |
| 架构 Architecture | 理解设计理由与研究背景 | 解释性质，可能包含实验方向 |

如果教程与生成签名不一致，以当前生成 API 作为签名权威来源，并报告教程差异。

## 预览版使用规则

Infernux 仍处于预览阶段。依赖某个行为前：

1. 检查页面的 `since` 与 `last_verified` 元数据；
2. 与实际运行的引擎版本比较；
3. 核对精确 API 签名；
4. 从 Console 第一条相关错误开始排查。

第一次实践请继续阅读[第一个组件](../learn/first-component.md)。


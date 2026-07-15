---
title: "资源与 `.meta` 文件"
description: "解释项目资源、GUID 与路径身份、.meta 边车文件、类型化引用、导入设置、安全移动/删除、缓存和运行时加载。"
category: 手册
tags: ["资源", "GUID", "meta", "导入", "材质", "纹理"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
related_api: ["Infernux.core.Texture","Infernux.core.Material","Infernux.ui.UIImage"]
agent_summary: "解释项目资源、GUID 与路径身份、.meta 边车文件、类型化引用、导入设置、安全移动/删除、缓存和运行时加载。"
source_paths: ["python/Infernux/core/assets.py", "python/Infernux/core/asset_ref.py", "python/Infernux/core/asset_types.py", "python/Infernux/engine/asset_reference_cleanup.py"]
---

# 资源与 `.meta` 文件

一个资源具有两种身份：当前路径，以及通过资源数据库和边车元数据记录的稳定 GUID。路径便于人类理解；GUID 让序列化引用在资源改名或移动后仍可保持。

```text
[INX-DIAGRAM:pipeline:资源从源文件到运行时对象的身份链]
源文件 + 匹配的 .meta
             │ 路径 + 稳定 GUID + 导入设置
             ▼
         导入 / 重新导入
             ▼
        资源数据库 + 缓存
             │
             ├── AssetRef：GUID + path_hint ── resolve ──┐
             └── 项目路径 ── AssetManager.load ──────────┼──▶ 类型化运行时对象

编辑器移动 / 改名 ── 保持 GUID 并更新引用
直接复制 .meta ── 产生重复 GUID ── 破坏身份
```

## 项目工作流

- 把项目内容放在项目的 `Assets` 层级中。
- 通过编辑器或 `AssetManager` 变更 API 导入、移动、改名、重新导入和删除。
- 资源与对应 `.meta` 文件应一同进入版本控制。
- 不要把一个资源的 `.meta` 手工复制给另一个资源；重复 GUID 会破坏身份。
- 提交时同时审查资源与元数据变化。

`AssetManager.move_asset()` 不等同于文件系统移动：它还会更新数据库状态与引用。`delete_asset()` 会清理已加载状态，并清空活动组件中匹配的引用。只有在恢复场景下才应关闭编辑器后直接操作文件，之后必须重新扫描并验证。

## 引用与加载

`AssetRefBase` 保存 `guid` 与便于阅读的 `path_hint`。`TextureRef`、`MaterialRef`、`ShaderRef`、`AudioClipRef` 表达预期类型。`resolve()` 返回当前加载对象；缺失时返回 `None`。

直接加载时使用统一管理器：

```python
from Infernux.core.assets import AssetManager
from Infernux.core.texture import Texture

icon = AssetManager.load("Assets/UI/icon.png", Texture)
if icon is None:
    print("Icon could not be loaded")
```

已有稳定序列化标识时可使用 `load_by_guid()`；`find_assets()` 按文件名模式查找项目资源。加载带缓存，只有工具绕过常规导入流程修改文件时才需要 `invalidate_path`、`invalidate` 或 `flush`。

## 选择引用路径

| 场景 | 使用 | 避免 |
|---|---|---|
| 序列化组件字段 | 类型化 `AssetRef` 与 GUID | 只保存脆弱的绝对路径 |
| 初始化代码中已知的项目资源 | `AssetManager.load(project_path, type)` | 绕过项目身份的底层文件加载 |
| 已有序列化 GUID | `load_by_guid()` 或 `resolve()` | 猜测资源当前路径 |
| 外部工具修改了源文件 | 重新扫描/导入，再做定向失效 | 在正常逐帧逻辑中刷新全部资源 |

## 导入设置

纹理元数据包括类型、寻址/过滤模式、mipmap、sRGB、最大尺寸与各向异性。音频和网格具有各自的类型化设置。

- 颜色纹理通常使用 sRGB；遮罩等数据纹理通常不使用。
- 法线贴图应选择法线纹理类型。
- 远近距离会变化的纹理生成 mipmap；固定分辨率 UI 可考虑关闭。
- UI 边缘使用 Clamp，只在明确平铺时使用 Repeat。
- 通过 Inspector 或类型化设置函数修改，然后重新导入。

## 材质与纹理

`Texture.load()` 是较低层的文件加载器。`AssetManager.load()` 额外提供项目 GUID 解析与缓存，因此项目资源通常使用后者。

`Material` 支持创建 lit/unlit 材质、克隆、Shader 属性、纹理槽、表面类型、Alpha 裁剪、渲染状态、保存和显式 `flush()`。应通过 `set_texture()` 使用 GUID、项目路径、`Texture` 或 `None` 设置纹理，而不是直接操作原生对象。

## 丢失引用排查

1. 确认资源与 `.meta` 文件同时存在。
2. 检查复制或冲突解决后 GUID 是否改变。
3. 重新导入并检查变更结果，不要只反复加载。
4. 确认引用类型与资源类别匹配。
5. 若文件在编辑器外改变，使缓存失效或触发重新扫描。
6. 删除后，匹配的活动 `AssetRefBase` 字段应被清空，而不是静默指向其他资源。

## 相关参考

- [Texture](../api/Texture.md)
- [Material](../api/Material.md)
- [UIImage](../api/UIImage.md)
- [构建并分享](../learn/build-and-share.md)

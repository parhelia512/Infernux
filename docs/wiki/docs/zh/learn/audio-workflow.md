---
category: 学习
tags: ["音频", "Listener", "Source", "WAV", "音效"]
status: preview
since: "0.2.1"
last_verified: "2026-07-15"
audience: ["user", "agent"]
agent_summary: "导入 WAV，配置一个 AudioListener 和多轨 AudioSource，测试循环与 One-shot 播放，并排查生命周期或空间衰减问题。"
source_paths: ["python/Infernux/core/audio_clip.pyi", "python/Infernux/core/asset_types.py", "python/Infernux/components/builtin/audio_source.pyi", "python/Infernux/components/builtin/audio_listener.pyi"]
---

# 音频工作流

构建一个包含单一 Listener、一条持续 Track 和一个瞬时音效的最小音频场景。当前可靠解码路径是 WAV，不要因为旧 UI 文本而假设已支持 MP3 或 OGG。

**预计时间：** 15–20 分钟  
**完成标准：** Track 0 能可预测地循环或停止，反复 One-shot 播放复用 Source Pool，不创建临时 GameObject。

## 开始之前

准备用于循环环境声和一次性音效的短 WAV 文件。先完成[资源与 `.meta` 文件](../manual/assets-and-meta.md)，保证 Clip GUID 稳定。

## 1. 导入并检查 WAV

把文件复制到 `Assets/Audio`，逐一选择并检查元数据。

音频导入设置包括：

- `force_mono`：内容需要作为单声道空间源时使用；
- `load_in_background`：后台加载策略；
- `quality` 与声明的压缩格式；
- 场景引用使用的 `.meta` GUID。

Clip 行为异常时，在运行时检查 `AudioClip.is_loaded`、时长、采样率和声道数。

## 2. 放置一个 AudioListener

把 AudioListener 添加到代表收听位置的 GameObject，通常是活动 Camera 或玩家头部。场景只保留一个预期活动 Listener。

移动 Listener 会改变空间衰减。菜单或近似“2D”的声音应把 AudioSource 放在 Listener 附近，不要假设存在尚未暴露的非空间模式。

## 3. 配置 AudioSource

创建 AudioSource GameObject，把环境声分配给 Track 0。AudioSource 是多轨设计，并不是单一 `clip` 字段。

- `track_count` 范围为 1–16。
- `play_on_awake` 只自动播放 Track 0。
- `loop` 作用于到达末尾的 Track。
- `volume`、`pitch`、`mute` 影响整个 Source。
- `min_distance` 与 `max_distance` 定义空间衰减范围。
- `one_shot_pool_size` 限制并发瞬时 Voice。

第一次测试使用音量 `1`、Pitch `1`、非零距离范围且不静音。

## 4. 从玩法控制播放

```python
from Infernux import AudioSource, InxComponent
from Infernux.core.audio_clip import AudioClip


class AudioDemo(InxComponent):
    def start(self) -> None:
        self.source = self.game_object.get_component(AudioSource)
        self.click = AudioClip.load("Assets/Audio/click.wav")

    def play_click(self) -> None:
        if self.source is not None and self.click is not None:
            self.source.play_one_shot(self.click, volume_scale=0.8)
```

持续 Track 使用 `play(track_index)`、`pause`、`un_pause` 与 `stop`；可重叠音效使用 `play_one_shot`。不要为每次点击或撞击创建再销毁 AudioSource。

只要 Source 仍可能使用 Clip，就保持加载对象存活。播放仍引用 Clip 时，Context Manager 或手动 `unload()` 都不安全。

## 5. 验证行为

- 只有一个预期 Listener 接收场景。
- Track 0 只在配置允许时启动。
- 循环不会因玩法代码反复调用而意外重启。
- 走出 `max_distance` 后 Source 按预期衰减。
- 快速触发多个 One-shot 时，在配置的 Pool 上限内重叠。
- Stop 与场景卸载后没有声音意外继续。

## 常见失败

### Clip 无法加载

使用 WAV，检查项目路径和 `.meta`，然后查看第一条音频/导入错误。当前运行时文档只保证 WAV 解码。

### 没有声音

检查 Listener、Source Mute/Volume、每轨音量、Clip 分配、Listener 距离，以及目标 Track 是否真的在播放。

### One-shot 提前停止

保持 `AudioClip` 对象存活，不要在 Source 使用时卸载；大量声音重叠时还要检查 One-shot Pool 大小。

## 相关参考

- [AudioSource](../api/AudioSource.md)
- [AudioListener](../api/AudioListener.md)
- [AudioClip](../api/AudioClip.md)
- [输入与时间](../manual/input-and-time.md)

## 下一步

从 `UIButton`、输入边沿、碰撞回调或 Animation Event 触发 One-shot，然后在独立构建中验证完整交互。


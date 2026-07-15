import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CHECK = process.argv.includes("--check");

const examples = {
  InxComponent: `\`\`\`python
from Infernux import InxComponent, Vector3, serialized_field


class Patrol(InxComponent):
    speed: float = serialized_field(default=2.0, range=(0.0, 10.0))

    def update(self, delta_time: float) -> None:
        self.transform.translate(Vector3(self.speed * delta_time, 0.0, 0.0))
\`\`\``,
  GameObject: `\`\`\`python
from Infernux import GameObject, Rigidbody

player = GameObject.find("Player")
if player is not None and player.active_in_hierarchy:
    body = player.get_component(Rigidbody)
    if body is not None:
        body.use_gravity = True
\`\`\``,
  serialized_field: `\`\`\`python
from Infernux import InxComponent, serialized_field


class ProjectileSettings(InxComponent):
    speed: float = serialized_field(
        default=20.0,
        range=(0.0, 100.0),
        tooltip="World units per second",
        slider=True,
    )
    notes: str = serialized_field(default="", multiline=True)
\`\`\``,
  Input: `\`\`\`python
from Infernux import InxComponent, Vector3
from Infernux.input import Input, KeyCode


class KeyboardMover(InxComponent):
    speed: float = 4.0

    def update(self, delta_time: float) -> None:
        axis = float(Input.get_key(KeyCode.D)) - float(Input.get_key(KeyCode.A))
        self.transform.translate(Vector3(axis * self.speed * delta_time, 0.0, 0.0))
\`\`\``,
  Time: `\`\`\`python
from Infernux import InxComponent, Time


class PauseClock(InxComponent):
    def update(self, delta_time: float) -> None:
        gameplay_seconds = Time.time
        menu_step = Time.unscaled_delta_time
        print(gameplay_seconds, menu_step)
\`\`\``,
  Rigidbody: `\`\`\`python
from Infernux import InxComponent, Rigidbody, Vector3


class Thruster(InxComponent):
    def start(self) -> None:
        self.body = self.game_object.get_component(Rigidbody)

    def fixed_update(self, fixed_delta_time: float) -> None:
        if self.body is not None:
            self.body.add_force(Vector3(0.0, 12.0, 0.0))
\`\`\``,
  Physics: `\`\`\`python
from Infernux import InxComponent, Vector3
from Infernux.physics import Physics


class GroundProbe(InxComponent):
    def is_grounded(self) -> bool:
        hit = Physics.raycast(
            self.transform.position,
            Vector3(0.0, -1.0, 0.0),
            max_distance=1.1,
        )
        return hit is not None
\`\`\``,
  UICanvas: `\`\`\`python
from Infernux import GameObject
from Infernux.ui import UICanvas, UIScaleMode

ui_root = GameObject.find("UI")
if ui_root is not None:
    canvas = ui_root.get_component(UICanvas)
    if canvas is not None:
        canvas.ui_scale_mode = UIScaleMode.ScaleWithScreenSize
        scale_x, scale_y, text_scale = canvas.compute_scale(1280, 720)
\`\`\``,
  Camera: `\`\`\`python
from Infernux import Camera, CameraProjection, GameObject

camera_object = GameObject.find("Main Camera")
if camera_object is not None:
    camera = camera_object.get_component(Camera)
    if camera is not None:
        camera.projection_mode = CameraProjection.Orthographic
        camera.orthographic_size = 5.0
\`\`\``,
  MeshRenderer: `\`\`\`python
from Infernux import GameObject, MeshRenderer, PrimitiveType

display = GameObject.find("DisplayObject")
if display is not None:
    renderer = display.get_component(MeshRenderer)
    if renderer is not None:
        renderer.set_primitive_mesh(PrimitiveType.Cube)
        renderer.casts_shadows = True
\`\`\``,
  Light: `\`\`\`python
from Infernux import GameObject, Light, LightType

light_object = GameObject.find("Key Light")
if light_object is not None:
    light = light_object.get_component(Light)
    if light is not None:
        light.light_type = LightType.Point
        light.intensity = 2.0
        light.range = 12.0
\`\`\``,
  AudioSource: `\`\`\`python
from Infernux import AudioSource, GameObject
from Infernux.core.audio_clip import AudioClip

audio_object = GameObject.find("Ambience")
clip = AudioClip.load("Assets/Audio/ambience.wav")
if audio_object is not None and clip is not None:
    source = audio_object.get_component(AudioSource)
    if source is not None:
        source.set_track_clip(0, clip)
        source.loop = True
        source.play(0)
\`\`\``,
  AudioListener: `\`\`\`python
from Infernux import AudioListener, GameObject

camera_object = GameObject.find("Main Camera")
if camera_object is not None:
    listener = camera_object.get_component(AudioListener)
    if listener is None:
        listener = camera_object.add_component(AudioListener)
\`\`\``,
  AudioClip: `\`\`\`python
from Infernux.core.audio_clip import AudioClip

clip = AudioClip.load("Assets/Audio/click.wav")
if clip is not None:
    print(clip.name, clip.duration, clip.sample_rate, clip.channels)
\`\`\``,
};

const english = {
  InxComponent: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

Use this base for project gameplay components. Read [Your First Component](../learn/first-component.md) before relying on the lifecycle table alone.`,
    see_also: `- [Your First Component](../learn/first-component.md)
- [Scenes and Objects](../manual/scenes-and-objects.md)
- [GameObject](GameObject.md)
- [serialized_field](serialized_field.md)
- [Time](Time.md)`,
  },
  GameObject: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

A GameObject owns a Transform and a set of components. Distinguish \`active_self\` from the derived \`active_in_hierarchy\`, and prefer component lookup by type.`,
    see_also: `- [Scenes and Objects](../manual/scenes-and-objects.md)
- [Your First Component](../learn/first-component.md)
- [Transform](Transform.md)
- [InxComponent](InxComponent.md)`,
  },
  serialized_field: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

Keep an explicit type annotation beside each serialized field. Metadata controls Inspector presentation and validation; it does not replace runtime checks for missing object or asset references.`,
  },
  Input: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

Use held-state queries for continuous actions and down/up queries for one-frame edges. Gameplay mouse work should use Game viewport coordinates and respect Game focus.`,
    see_also: `- [Input and Time](../manual/input-and-time.md)
- [KeyCode](KeyCode.md)
- [Time](Time.md)
- [Camera](Camera.md)`,
  },
  Time: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

Use scaled time for gameplay and unscaled time for UI or diagnostics that continue while paused. Physics work belongs to fixed updates.`,
    see_also: `- [Input and Time](../manual/input-and-time.md)
- [InxComponent](InxComponent.md)
- [Rigidbody](Rigidbody.md)`,
  },
  Rigidbody: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

For dynamic bodies, use forces or velocity rather than writing Transform every frame. Use move operations for kinematic bodies and issue simulation commands from fixed updates.`,
    see_also: `- [Physics Manual](../manual/physics.md)
- [Physics](Physics.md)
- [Collider](Collider.md)
- [InxComponent](InxComponent.md)`,
  },
  Physics: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

Spatial queries accept layer masks and explicit trigger handling. Keep query volumes and distances bounded, and use the simplest query that answers the gameplay question.`,
    see_also: `- [Physics Manual](../manual/physics.md)
- [Rigidbody](Rigidbody.md)
- [Collider](Collider.md)
- [BoxCollider](BoxCollider.md)`,
  },
  UICanvas: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

Design in reference-resolution pixels, then select a scale and screen-match policy for the supported aspect ratios. Decorative elements should not be raycast targets.`,
    see_also: `- [Screen-space UI Manual](../manual/ui.md)
- [UIText](UIText.md)
- [UIImage](UIImage.md)
- [UIButton](UIButton.md)`,
  },
  Camera: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

Use a perspective Camera for normal 3D depth and an orthographic Camera for scale-stable 2D framing. Keep near/far clipping proportional to scene scale.`,
    see_also: `- [2D Foundations](../learn/2d-foundations.md)
- [3D Foundations](../learn/3d-foundations.md)
- [CameraProjection](CameraProjection.md)
- [Rendering and RenderStack](../manual/rendering-and-renderstack.md)`,
  },
  MeshRenderer: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

A MeshRenderer can use an inline primitive or an imported mesh asset and supports multiple material slots. Prove mesh and material assignment before debugging lighting effects.`,
    see_also: `- [3D Foundations](../learn/3d-foundations.md)
- [Material](Material.md)
- [Light](Light.md)
- [RenderStack](RenderStack.md)`,
  },
  Light: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

Choose light type, range, intensity, color, and shadow settings for the scene scale. Confirm unshadowed lighting first, then enable shadows and tune bias.`,
    see_also: `- [3D Foundations](../learn/3d-foundations.md)
- [LightType](LightType.md)
- [MeshRenderer](MeshRenderer.md)
- [Rendering and RenderStack](../manual/rendering-and-renderstack.md)`,
  },
  AudioSource: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

AudioSource owns 1–16 tracks; \`play_on_awake\` starts only track 0. Use pooled one-shots for transient effects and keep assigned AudioClip objects loaded while playback may use them.`,
    see_also: `- [Audio Workflow](../learn/audio-workflow.md)
- [AudioClip](AudioClip.md)
- [AudioListener](AudioListener.md)
- [Input and Time](../manual/input-and-time.md)`,
  },
  AudioListener: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

Place one intended active listener at the scene's listening position, normally on the active Camera or player head. Source distance is measured relative to it.`,
    see_also: `- [Audio Workflow](../learn/audio-workflow.md)
- [AudioSource](AudioSource.md)
- [Camera](Camera.md)`,
  },
  AudioClip: {
    description: `**Status:** Preview · **Verified with:** 0.2.1

The current reliable decoder supports WAV. Keep a loaded clip alive while an AudioSource track or one-shot may still reference it.`,
    see_also: `- [Audio Workflow](../learn/audio-workflow.md)
- [AudioSource](AudioSource.md)
- [Assets and Meta Files](../manual/assets-and-meta.md)`,
  },
};

const chinese = {
  InxComponent: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

项目玩法组件应继承此基类。不要只阅读生命周期表；请先完成[第一个组件](../learn/first-component.md)。`,
    see_also: `- [第一个组件](../learn/first-component.md)
- [场景与对象](../manual/scenes-and-objects.md)
- [GameObject](GameObject.md)
- [serialized_field](serialized_field.md)
- [Time](Time.md)`,
  },
  GameObject: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

GameObject 拥有 Transform 与一组组件。注意 \`active_self\` 与派生状态 \`active_in_hierarchy\` 的区别，并优先按类型查找组件。`,
    see_also: `- [场景与对象](../manual/scenes-and-objects.md)
- [第一个组件](../learn/first-component.md)
- [Transform](Transform.md)
- [InxComponent](InxComponent.md)`,
  },
  serialized_field: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

每个序列化字段都应保留明确类型标注。元数据用于 Inspector 展示与校验，不能替代对缺失对象或资源引用的运行时检查。`,
  },
  Input: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

连续动作使用按住状态，一帧边沿操作使用 down/up。游戏鼠标逻辑应使用 Game 视口坐标并尊重 Game 焦点。`,
    see_also: `- [输入与时间](../manual/input-and-time.md)
- [KeyCode](KeyCode.md)
- [Time](Time.md)
- [Camera](Camera.md)`,
  },
  Time: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

玩法使用缩放时间；暂停后仍继续的 UI 或诊断使用非缩放时间。物理工作放入固定更新。`,
    see_also: `- [输入与时间](../manual/input-and-time.md)
- [InxComponent](InxComponent.md)
- [Rigidbody](Rigidbody.md)`,
  },
  Rigidbody: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

动态刚体应使用力或速度，不要每帧写 Transform。运动学刚体使用移动操作，仿真命令从固定更新发出。`,
    see_also: `- [物理手册](../manual/physics.md)
- [Physics](Physics.md)
- [Collider](Collider.md)
- [InxComponent](InxComponent.md)`,
  },
  Physics: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

空间查询接受 Layer Mask 和明确的 Trigger 处理。应限制查询体积与距离，并选择能回答玩法问题的最简单查询。`,
    see_also: `- [物理手册](../manual/physics.md)
- [Rigidbody](Rigidbody.md)
- [Collider](Collider.md)
- [BoxCollider](BoxCollider.md)`,
  },
  UICanvas: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

使用参考分辨率像素设计，然后为支持的宽高比选择缩放与屏幕匹配策略。装饰元素不应参与 Raycast。`,
    see_also: `- [屏幕空间 UI 手册](../manual/ui.md)
- [UIText](UIText.md)
- [UIImage](UIImage.md)
- [UIButton](UIButton.md)`,
  },
  Camera: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

普通 3D 深度使用透视 Camera，尺度稳定的 2D 构图使用正交 Camera。Near/Far 裁剪应与场景尺度匹配。`,
    see_also: `- [2D 基础](../learn/2d-foundations.md)
- [3D 基础](../learn/3d-foundations.md)
- [CameraProjection](CameraProjection.md)
- [渲染与 RenderStack](../manual/rendering-and-renderstack.md)`,
  },
  MeshRenderer: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

MeshRenderer 可使用内联基础体或导入网格，并支持多个材质槽。排查光照效果前先证明网格和材质分配正确。`,
    see_also: `- [3D 基础](../learn/3d-foundations.md)
- [Material](Material.md)
- [Light](Light.md)
- [RenderStack](RenderStack.md)`,
  },
  Light: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

根据场景尺度选择 Light 类型、范围、强度、颜色和阴影。先确认无阴影光照，再启用阴影并调整 Bias。`,
    see_also: `- [3D 基础](../learn/3d-foundations.md)
- [LightType](LightType.md)
- [MeshRenderer](MeshRenderer.md)
- [渲染与 RenderStack](../manual/rendering-and-renderstack.md)`,
  },
  AudioSource: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

AudioSource 拥有 1–16 个 Track，\`play_on_awake\` 只启动 Track 0。瞬时效果使用池化 One-shot，并在播放仍可能引用时保持 AudioClip 已加载。`,
    see_also: `- [音频工作流](../learn/audio-workflow.md)
- [AudioClip](AudioClip.md)
- [AudioListener](AudioListener.md)
- [输入与时间](../manual/input-and-time.md)`,
  },
  AudioListener: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

在场景收听位置保留一个预期活动 Listener，通常位于活动 Camera 或玩家头部。Source 距离以它为基准。`,
    see_also: `- [音频工作流](../learn/audio-workflow.md)
- [AudioSource](AudioSource.md)
- [Camera](Camera.md)`,
  },
  AudioClip: {
    description: `**状态：** Preview · **验证版本：** 0.2.1

当前可靠解码器支持 WAV。当 AudioSource Track 或 One-shot 仍可能引用时，应保持 Clip 已加载。`,
    see_also: `- [音频工作流](../learn/audio-workflow.md)
- [AudioSource](AudioSource.md)
- [资源与 Meta 文件](../manual/assets-and-meta.md)`,
  },
};

function replaceSection(text, section, content, file) {
  const pattern = new RegExp(
    `(<!-- USER CONTENT START --> ${section}\\r?\\n)[\\s\\S]*?(\\r?\\n<!-- USER CONTENT END -->)`,
  );
  if (!pattern.test(text)) {
    throw new Error(`${file}: missing user-content section '${section}'`);
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const localized = content.replaceAll("\n", eol);
  return text.replace(pattern, `$1${localized}$2`);
}

const stale = [];

for (const [language, entries] of Object.entries({ en: english, zh: chinese })) {
  for (const [symbol, sections] of Object.entries(entries)) {
    const relative = path.join("docs", "wiki", "docs", language, "api", `${symbol}.md`);
    const file = path.join(ROOT, relative);
    if (!fs.existsSync(file)) {
      throw new Error(`${relative}: curated API page does not exist`);
    }

    const original = fs.readFileSync(file, "utf8");
    let updated = original;
    updated = replaceSection(updated, "description", sections.description, relative);
    updated = replaceSection(updated, "example", examples[symbol], relative);
    if (sections.see_also) {
      updated = replaceSection(updated, "see_also", sections.see_also, relative);
    }

    if (updated !== original) {
      if (CHECK) {
        stale.push(relative);
      } else {
        fs.writeFileSync(file, updated, "utf8");
      }
    }
  }
}

if (stale.length > 0) {
  console.error("Curated API sections are stale:");
  for (const file of stale) console.error(`- ${file}`);
  process.exitCode = 1;
} else if (CHECK) {
  console.log("Curated API sections are current.");
} else {
  console.log("Applied curated status, examples, and related documentation to core API pages.");
}

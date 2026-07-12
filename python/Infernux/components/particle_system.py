"""Graph-authored, vectorized particle-system component."""

from __future__ import annotations

from typing import Optional

from Infernux.core.asset_ref import VfxSystemRef
from Infernux.core.vfx_system import VfxSystem
from Infernux.debug import Debug
from Infernux.vfx import CpuParticleRuntime, VfxCompileError, VfxGraphCompiler

from .component import InxComponent
from .decorators import add_component_menu, disallow_multiple
from .serialized_field import serialized_field


@disallow_multiple
@add_component_menu("VFX/Particle System")
class ParticleSystem(InxComponent):
    system: VfxSystemRef = serialized_field(
        default=None,
        asset_type="VfxSystem",
        tooltip="Graph-authored VFX system asset",
    )
    emitter_index: int = serialized_field(default=0, range=(0, 1024))
    simulation_speed: float = serialized_field(default=1.0, range=(0.0, 10.0))
    play_on_awake: bool = serialized_field(default=True)

    _runtime: Optional[CpuParticleRuntime] = None
    _material_guid: str = ""
    _batch_id: int = 0
    _playing: bool = False

    def awake(self):
        self._runtime = None
        self._material_guid = ""
        self._batch_id = (int(self.game_object.id) << 16) ^ int(self.component_id)
        if self._batch_id == 0:
            self._batch_id = int(self.component_id) or 1
        self._playing = bool(self.play_on_awake)

    def start(self):
        self._compile_asset()

    def play(self) -> None:
        self._playing = True

    def pause(self) -> None:
        self._playing = False

    def restart(self) -> None:
        if self._runtime is not None:
            self._runtime.reset()
        self._playing = True

    def update(self, delta_time: float):
        if not self._playing:
            return
        if self._runtime is None and not self._compile_asset():
            return
        scaled_delta_time = float(delta_time) * float(self.simulation_speed)
        if scaled_delta_time <= 0.0:
            return
        instances = self._runtime.tick(scaled_delta_time)
        native = self._native_engine()
        if native is None:
            return
        position = self.transform.position
        native.submit_particle_instances(
            self._batch_id,
            instances,
            self._material_guid,
            float(position.x),
            float(position.y),
            float(position.z),
        )

    def on_disable(self):
        self._remove_native_batch()

    def on_destroy(self):
        self._remove_native_batch()

    def on_validate(self):
        self._remove_native_batch()
        self._runtime = None

    def _compile_asset(self) -> bool:
        system = self.system
        if system is None or not isinstance(system, VfxSystem):
            return False
        index = int(self.emitter_index)
        if index < 0 or index >= len(system.emitters):
            Debug.log_error(f"[ParticleSystem] Emitter index {index} is out of range")
            return False
        emitter = system.emitters[index]
        try:
            artifact = VfxGraphCompiler().compile(emitter)
        except VfxCompileError as exc:
            Debug.log_error(f"[ParticleSystem] VFX compile failed: {exc}")
            return False
        self._runtime = CpuParticleRuntime(artifact)
        self._material_guid = emitter.renderer.material
        return True

    @staticmethod
    def _native_engine():
        try:
            from Infernux.engine.play_mode import PlayModeManager

            manager = PlayModeManager.instance()
            return getattr(manager, "_native_engine", None) if manager else None
        except Exception:
            return None

    def _remove_native_batch(self) -> None:
        native = self._native_engine()
        if native is not None and self._batch_id:
            native.remove_particle_batch(self._batch_id)


__all__ = ["ParticleSystem"]

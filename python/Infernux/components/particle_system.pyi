from Infernux.components.component import InxComponent
from Infernux.core.asset_ref import VfxSystemRef

class ParticleSystem(InxComponent):
    system: VfxSystemRef
    emitter_index: int
    simulation_speed: float
    play_on_awake: bool
    def play(self) -> None: ...
    def pause(self) -> None: ...
    def restart(self) -> None: ...

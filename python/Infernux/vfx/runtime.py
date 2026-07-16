"""Vectorized CPU particle simulation for compiled VFX emitter IR."""

from __future__ import annotations

import numpy as np

from .compiler import CompiledVfxEmitter


PARTICLE_INSTANCE_FLOATS = 9


class CpuParticleRuntime:
    def __init__(self, artifact: CompiledVfxEmitter):
        self.artifact = artifact
        capacity = artifact.capacity
        self.position = np.zeros((capacity, 3), dtype=np.float32)
        self.velocity = np.zeros((capacity, 3), dtype=np.float32)
        self.color = np.ones((capacity, 4), dtype=np.float32)
        self.size = np.ones(capacity, dtype=np.float32)
        self.initial_size = np.ones(capacity, dtype=np.float32)
        self.age = np.zeros(capacity, dtype=np.float32)
        self.lifetime = np.full(capacity, 5.0, dtype=np.float32)
        self.rotation = np.zeros(capacity, dtype=np.float32)
        self.alive = np.zeros(capacity, dtype=np.bool_)
        self._spawn_accumulator = 0.0
        self._burst_pending = True
        self._instance_buffer = np.empty((capacity, PARTICLE_INSTANCE_FLOATS), dtype=np.float32)

    @property
    def particle_count(self) -> int:
        return int(np.count_nonzero(self.alive))

    def reset(self) -> None:
        self.alive.fill(False)
        self.age.fill(0.0)
        self._spawn_accumulator = 0.0
        self._burst_pending = True

    def tick(self, delta_time: float) -> np.ndarray:
        delta_time = float(delta_time)
        if not np.isfinite(delta_time) or delta_time < 0.0:
            raise ValueError("particle delta_time must be finite and non-negative")

        spawn_count = 0
        for instruction in self.artifact.spawn:
            parameters = instruction.parameter_dict()
            if instruction.opcode == "spawn_rate":
                self._spawn_accumulator += max(0.0, float(parameters["rate"])) * delta_time
                whole = int(self._spawn_accumulator)
                spawn_count += whole
                self._spawn_accumulator -= whole
            elif instruction.opcode == "burst" and self._burst_pending:
                spawn_count += max(0, int(parameters["count"]))
        self._burst_pending = False

        if spawn_count:
            dead = np.flatnonzero(~self.alive)[:spawn_count]
            self._initialize(dead)

        active = np.flatnonzero(self.alive)
        if active.size:
            self.age[active] += delta_time
            for instruction in self.artifact.update:
                parameters = instruction.parameter_dict()
                if instruction.opcode == "add_force":
                    self.velocity[active] += np.asarray(parameters["force"], dtype=np.float32) * delta_time
                elif instruction.opcode == "gravity":
                    self.velocity[active, 1] += float(parameters["strength"]) * delta_time
                elif instruction.opcode == "noise":
                    amplitude = float(parameters["amplitude"])
                    phase = self.age[active, None] + active[:, None] * np.array([0.17, 0.31, 0.47])
                    self.velocity[active] += np.sin(phase).astype(np.float32) * amplitude * delta_time
                elif instruction.opcode == "size_over_life":
                    life_fraction = np.clip(self.age[active] / np.maximum(self.lifetime[active], 1e-6), 0.0, 1.0)
                    self.size[active] = self.initial_size[active] * (1.0 - life_fraction)
                elif instruction.opcode == "kill":
                    self.alive[active[self.age[active] >= float(parameters["age"])]] = False
            active = np.flatnonzero(self.alive)
            self.position[active] += self.velocity[active] * delta_time
            self.alive[active[self.age[active] >= self.lifetime[active]]] = False

        return self.instance_buffer()

    def _initialize(self, indices: np.ndarray) -> None:
        if indices.size == 0:
            return
        self.alive[indices] = True
        self.position[indices] = 0.0
        self.velocity[indices] = 0.0
        self.color[indices] = 1.0
        self.size[indices] = 1.0
        self.initial_size[indices] = 1.0
        self.age[indices] = 0.0
        self.lifetime[indices] = 5.0
        self.rotation[indices] = 0.0
        for instruction in self.artifact.initialize:
            parameters = instruction.parameter_dict()
            if instruction.opcode == "set_position":
                self.position[indices] = parameters["value"]
            elif instruction.opcode == "set_velocity":
                self.velocity[indices] = parameters["value"]
            elif instruction.opcode == "set_color":
                self.color[indices] = parameters["value"]
            elif instruction.opcode == "set_size":
                self.size[indices] = float(parameters["value"])
                self.initial_size[indices] = float(parameters["value"])
            elif instruction.opcode == "set_lifetime":
                self.lifetime[indices] = max(float(parameters["value"]), 1e-6)

    def instance_buffer(self) -> np.ndarray:
        active = np.flatnonzero(self.alive)
        output = self._instance_buffer[: active.size]
        output[:, 0:3] = self.position[active]
        output[:, 3] = self.size[active]
        output[:, 4:8] = self.color[active]
        output[:, 8] = self.rotation[active]
        return output


__all__ = ["CpuParticleRuntime", "PARTICLE_INSTANCE_FLOATS"]

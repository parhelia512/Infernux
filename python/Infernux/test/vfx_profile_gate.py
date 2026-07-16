"""Reproducible CPU VFX performance and load/unload stability gate."""

from __future__ import annotations

import ctypes
import gc
import json
import os
import statistics
import sys
import tempfile
import time
import weakref
from pathlib import Path

from Infernux.core.vfx_system import VfxEmitter, VfxSystem
from Infernux.vfx import CpuParticleRuntime, VfxGraphCompiler


FRAME_SAMPLES = 120
SOAK_CYCLES = 50
SOAK_WARMUP_CYCLES = 10
MIB = 1024 * 1024
P95_LIMIT_MS = {1_000: 5.0, 10_000: 20.0}


if sys.platform == "win32":
    class _ProcessMemoryCountersEx(ctypes.Structure):
        _fields_ = [
            ("cb", ctypes.c_ulong),
            ("page_fault_count", ctypes.c_ulong),
            ("peak_working_set_size", ctypes.c_size_t),
            ("working_set_size", ctypes.c_size_t),
            ("quota_peak_paged_pool_usage", ctypes.c_size_t),
            ("quota_paged_pool_usage", ctypes.c_size_t),
            ("quota_peak_non_paged_pool_usage", ctypes.c_size_t),
            ("quota_non_paged_pool_usage", ctypes.c_size_t),
            ("pagefile_usage", ctypes.c_size_t),
            ("peak_pagefile_usage", ctypes.c_size_t),
            ("private_usage", ctypes.c_size_t),
        ]

    _GET_CURRENT_PROCESS = ctypes.windll.kernel32.GetCurrentProcess
    _GET_CURRENT_PROCESS.restype = ctypes.c_void_p
    _GET_PROCESS_MEMORY_INFO = ctypes.windll.psapi.GetProcessMemoryInfo
    _GET_PROCESS_MEMORY_INFO.argtypes = [
        ctypes.c_void_p,
        ctypes.POINTER(_ProcessMemoryCountersEx),
        ctypes.c_ulong,
    ]
    _GET_PROCESS_MEMORY_INFO.restype = ctypes.c_int


def _private_memory_bytes() -> int:
    if sys.platform == "win32":
        counters = _ProcessMemoryCountersEx()
        counters.cb = ctypes.sizeof(counters)
        if not _GET_PROCESS_MEMORY_INFO(
            _GET_CURRENT_PROCESS(), ctypes.byref(counters), counters.cb
        ):
            raise OSError("GetProcessMemoryInfo failed")
        return int(counters.private_usage)

    statm = Path("/proc/self/statm")
    if statm.is_file():
        fields = statm.read_text(encoding="ascii").split()
        return int(fields[5]) * os.sysconf("SC_PAGE_SIZE")

    import resource

    resident = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(resident if sys.platform == "darwin" else resident * 1024)


def _make_system(capacity: int) -> VfxSystem:
    emitter = VfxEmitter(capacity=capacity)
    burst = emitter.graph.add_node("vfx_burst", uid="burst", count=capacity)
    velocity = emitter.graph.add_node(
        "vfx_set_velocity", uid="velocity", value=[1.0, 2.0, 3.0]
    )
    lifetime = emitter.graph.add_node("vfx_set_lifetime", uid="lifetime", value=20.0)
    gravity = emitter.graph.add_node("vfx_gravity", uid="gravity", strength=-9.81)
    noise = emitter.graph.add_node("vfx_noise", uid="noise", amplitude=0.2)
    size = emitter.graph.add_node("vfx_size_over_life", uid="size")
    output = emitter.graph.add_node("vfx_billboard_output", uid="output")
    chain = (burst, velocity, lifetime, gravity, noise, size, output)
    for source, target in zip(chain, chain[1:]):
        if emitter.graph.add_link(source.uid, "exec_out", target.uid, "exec_in") is None:
            raise AssertionError(f"failed to link {source.uid} to {target.uid}")
    return VfxSystem(name=f"VFX {capacity}", emitters=[emitter])


def _profile_runtime(capacity: int) -> dict[str, float | int]:
    artifact = VfxGraphCompiler().compile(_make_system(capacity).emitters[0])
    runtime = CpuParticleRuntime(artifact)
    instances = runtime.tick(0.0)
    if instances.shape != (capacity, 9):
        raise AssertionError(f"{capacity} particle burst produced {instances.shape}")

    elapsed_ms: list[float] = []
    for _ in range(FRAME_SAMPLES):
        started = time.perf_counter()
        instances = runtime.tick(1.0 / 120.0)
        elapsed_ms.append((time.perf_counter() - started) * 1000.0)
    if not instances.flags.c_contiguous:
        raise AssertionError("particle instance output is not C-contiguous")

    ordered = sorted(elapsed_ms)
    p95_ms = ordered[max(0, int(len(ordered) * 0.95) - 1)]
    limit_ms = P95_LIMIT_MS[capacity]
    if p95_ms > limit_ms:
        raise AssertionError(
            f"{capacity} particle p95 exceeded {limit_ms:.1f} ms: {p95_ms:.3f} ms"
        )
    return {
        "particles": capacity,
        "median_ms": statistics.median(elapsed_ms),
        "p95_ms": p95_ms,
        "limit_ms": limit_ms,
    }


def _run_load_unload_soak(path: Path) -> dict[str, int]:
    private_samples: list[int] = []
    for cycle in range(SOAK_CYCLES):
        system = VfxSystem.load(str(path))
        artifact = VfxGraphCompiler().compile(system.emitters[0])
        runtime = CpuParticleRuntime(artifact)
        instances = runtime.tick(0.0)
        for _ in range(4):
            instances = runtime.tick(1.0 / 60.0)
        if instances.shape != (10_000, 9):
            raise AssertionError(f"soak cycle {cycle} produced {instances.shape}")

        system_ref = weakref.ref(system)
        runtime_ref = weakref.ref(runtime)
        del instances, runtime, artifact, system
        gc.collect()
        if system_ref() is not None or runtime_ref() is not None:
            raise AssertionError(f"VFX objects survived unload cycle {cycle}")
        private_samples.append(_private_memory_bytes())

    tail = private_samples[SOAK_WARMUP_CYCLES:]
    first_window_peak = max(tail[:10])
    final_window_peak = max(tail[-10:])
    tolerance = 16 * MIB
    if final_window_peak > first_window_peak + tolerance:
        raise AssertionError(
            "VFX load/unload private memory kept growing: "
            f"{first_window_peak} -> {final_window_peak} bytes"
        )
    if max(tail[-10:]) - min(tail[-10:]) > tolerance:
        raise AssertionError(f"VFX load/unload final memory window did not stabilize: {tail[-10:]}")
    return {
        "cycles": SOAK_CYCLES,
        "first_window_peak_bytes": first_window_peak,
        "final_window_peak_bytes": final_window_peak,
        "tolerance_bytes": tolerance,
    }


def main() -> int:
    profiles = [_profile_runtime(capacity) for capacity in P95_LIMIT_MS]
    with tempfile.TemporaryDirectory(prefix="infernux-vfx-profile-") as root:
        asset_path = Path(root) / "Profile.vfxsystem"
        _make_system(10_000).save(str(asset_path))
        soak = _run_load_unload_soak(asset_path)
    print(json.dumps({"profiles": profiles, "soak": soak}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

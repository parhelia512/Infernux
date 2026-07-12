#pragma once

#include <core/types/InxFwdType.h>

#include <cstddef>
#include <cstdint>
#include <string>

namespace infernux
{

struct AssetRuntimeRecord
{
    std::string guid;
    ResourceType type = ResourceType::DefaultBinary;
    std::string runtimeTypeName;
    uint64_t runtimeVersion = 0;

    bool cpuResident = false;
    size_t cpuBytes = 0;
    uint32_t explicitCpuPinCount = 0;
    size_t externalCpuReferenceCount = 0;
    bool cpuEvictable = false;

    uint64_t gpuResidentBytes = 0;
    uint64_t gpuPendingBytes = 0;
    uint64_t staleGpuBytes = 0;
    size_t gpuAllocationCount = 0;
    size_t staleGpuAllocationCount = 0;
    bool gpuPinned = false;
    bool gpuVersionSynchronized = true;
};

} // namespace infernux

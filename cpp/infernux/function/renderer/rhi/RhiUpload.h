#pragma once

#include <cstddef>
#include <cstdint>

namespace infernux::rhi
{

enum class BufferUsage : uint8_t
{
    Vertex,
    Index,
    Storage,
};

struct BufferUploadRequest
{
    const void *data = nullptr;
    size_t byteSize = 0;
    BufferUsage usage = BufferUsage::Storage;
};

} // namespace infernux::rhi

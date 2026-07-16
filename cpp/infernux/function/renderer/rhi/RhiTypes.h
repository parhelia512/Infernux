#pragma once

#include <cstdint>

namespace infernux::rhi
{

enum class PixelFormat : uint8_t
{
    Undefined = 0,
    R8UNorm,
    RG8UNorm,
    RGBA8UNorm,
    RGBA8Srgb,
    BGRA8UNorm,
    R16SFloat,
    RG16SFloat,
    RGBA16SFloat,
    R32SFloat,
    RGBA32SFloat,
    RGB10A2UNorm,
    D32SFloat,
    D24UNormS8UInt,
};

enum class SampleCount : uint8_t
{
    One = 1,
    Two = 2,
    Four = 4,
    Eight = 8,
};

[[nodiscard]] constexpr bool IsDepthFormat(PixelFormat format) noexcept
{
    return format == PixelFormat::D32SFloat || format == PixelFormat::D24UNormS8UInt;
}

[[nodiscard]] constexpr bool IsValidPixelFormat(PixelFormat format) noexcept
{
    return format > PixelFormat::Undefined && format <= PixelFormat::D24UNormS8UInt;
}

} // namespace infernux::rhi

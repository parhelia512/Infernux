#pragma once

#include <cstdint>

namespace infernux
{

/// Stable, non-owning identity for an object inside one Scene world.
///
/// Serialized IDs may be reused when a scene graph is rebuilt. The lifetime
/// generation prevents an old handle from resolving to the replacement object,
/// while worldId prevents cross-Scene resolution.
struct ObjectHandle
{
    uint64_t id = 0;
    uint64_t generation = 0;
    uint64_t worldId = 0;

    [[nodiscard]] bool IsValid() const
    {
        return id != 0 && generation != 0 && worldId != 0;
    }

    bool operator==(const ObjectHandle &rhs) const
    {
        return id == rhs.id && generation == rhs.generation && worldId == rhs.worldId;
    }

    bool operator!=(const ObjectHandle &rhs) const
    {
        return !(*this == rhs);
    }
};

} // namespace infernux

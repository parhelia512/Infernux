#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <string_view>

namespace infernux
{

class InxMesh;

class MeshArtifact final
{
  public:
    static constexpr uint32_t FormatVersion = 1;

    [[nodiscard]] static std::string Serialize(const InxMesh &mesh, std::string_view sourceContentHash);
    [[nodiscard]] static std::shared_ptr<InxMesh> Deserialize(std::string_view bytes,
                                                              std::string_view expectedSourceContentHash);
};

} // namespace infernux

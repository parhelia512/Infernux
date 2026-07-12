#include <function/resources/InxMesh/InxMesh.h>
#include <function/resources/InxMesh/MeshArtifact.h>

#include <cassert>
#include <cmath>
#include <iostream>
#include <stdexcept>

namespace
{
template <typename Callback> void RequireInvalid(Callback callback)
{
    bool rejected = false;
    try {
        callback();
    } catch (const std::invalid_argument &) {
        rejected = true;
    }
    assert(rejected);
}

bool NearlyEqual(float left, float right)
{
    return std::abs(left - right) < 1.0e-6f;
}
} // namespace

int main()
{
    infernux::InxMesh source("artifact-probe");
    infernux::Vertex vertex{};
    vertex.pos = {1.0f, 2.0f, 3.0f};
    vertex.normal = {0.0f, 1.0f, 0.0f};
    vertex.tangent = {1.0f, 0.0f, 0.0f, -1.0f};
    vertex.color = {0.25f, 0.5f, 0.75f};
    vertex.texCoord = {0.125f, 0.875f};
    vertex.boneIndices = {1, 2, 3, 4};
    vertex.boneWeights = {0.4f, 0.3f, 0.2f, 0.1f};

    infernux::SubMesh subMesh;
    subMesh.indexCount = 3;
    subMesh.vertexCount = 1;
    subMesh.materialSlot = 2;
    subMesh.nodeGroup = 1;
    subMesh.boundsMin = vertex.pos;
    subMesh.boundsMax = vertex.pos;
    subMesh.name = "triangle";
    source.SetData({vertex}, {0, 0, 0}, {subMesh});
    source.SetMaterialSlotNames({"surface"});
    infernux::MaterialSlotData material;
    material.baseColor = {0.1f, 0.2f, 0.3f, 0.4f};
    material.emissionColor = {0.5f, 0.6f, 0.7f, 0.8f};
    material.metallic = 0.9f;
    material.smoothness = 0.65f;
    material.opacity = 0.4f;
    source.SetMaterialSlotData({material});
    source.SetNodeNames({"root", "child"});

    constexpr const char *SourceHash = "0123456789abcdef";
    const std::string bytes = infernux::MeshArtifact::Serialize(source, SourceHash);
    auto restored = infernux::MeshArtifact::Deserialize(bytes, SourceHash);
    assert(restored->GetName() == "artifact-probe");
    assert(restored->GetVertexCount() == 1);
    assert(restored->GetIndexCount() == 3);
    assert(restored->GetSubMeshCount() == 1);
    assert(restored->GetSubMesh(0).name == "triangle");
    assert(restored->GetMaterialSlotNames() == std::vector<std::string>{"surface"});
    assert(restored->GetNodeNames() == std::vector<std::string>({"root", "child"}));
    const auto &restoredVertex = restored->GetVertices().front();
    assert(NearlyEqual(restoredVertex.pos.x, 1.0f));
    assert(restoredVertex.boneIndices == glm::uvec4(1, 2, 3, 4));
    assert(NearlyEqual(restoredVertex.boneWeights.w, 0.1f));
    assert(NearlyEqual(restored->GetMaterialSlotData().front().metallic, 0.9f));

    RequireInvalid([&] { (void)infernux::MeshArtifact::Deserialize(bytes, "different-source"); });

    std::string corrupted = bytes;
    corrupted[corrupted.size() / 2] ^= 0x5a;
    RequireInvalid([&] { (void)infernux::MeshArtifact::Deserialize(corrupted, SourceHash); });
    RequireInvalid([&] { (void)infernux::MeshArtifact::Deserialize(bytes.substr(0, bytes.size() - 1), SourceHash); });
    RequireInvalid([&] { (void)infernux::MeshArtifact::Serialize(source, {}); });

    std::cout << "Mesh artifact tests passed\n";
    return 0;
}

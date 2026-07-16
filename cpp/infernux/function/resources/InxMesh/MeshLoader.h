#pragma once

#include <function/resources/AssetRegistry/AssetRegistry.h>

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace infernux
{

class InxMesh;
class InxSkinnedMesh;

struct MeshSourceImportResult
{
    std::shared_ptr<InxMesh> mesh;
    std::shared_ptr<InxSkinnedMesh> skinnedMesh;
    uint64_t meshCount = 0;
    uint64_t vertexCount = 0;
    uint64_t indexCount = 0;
    std::vector<std::string> materialSlots;
    std::vector<std::string> boneNames;
    std::vector<std::string> animationNames;
};

/**
 * @brief IAssetLoader implementation for 3D model assets (.fbx, .obj, .gltf, …).
 *
 * Uses Assimp to parse the source model file and builds an InxMesh instance
 * containing all submeshes, vertices, and indices ready for GPU upload.
 *
 * The source file (.fbx etc.) is the single source of truth — no intermediate
 * binary format is written.  Import settings (scale, normals, tangents) are
 * read from the .meta file at load time.
 *
 * Key design points:
 *   - Load() produces a new shared_ptr<InxMesh> with combined vertex/index
 *     arrays and one SubMesh per aiMesh in the Assimp scene.
 *   - Reload() replaces the geometry data in-place so all AssetRef holders
 *     see updated data without re-resolving.
 *   - ScanDependencies() returns {} — mesh assets do not reference other
 *     assets (material bindings are on the MeshRenderer, not the mesh).
 */
class MeshLoader final : public IAssetLoader
{
  public:
    [[nodiscard]] static MeshSourceImportResult
    ImportSourceDetailed(const std::string &filePath, const std::string &guid, const InxResourceMeta &metadata);
    [[nodiscard]] static std::shared_ptr<InxMesh> ImportSource(const std::string &filePath, const std::string &guid,
                                                               const InxResourceMeta &metadata);

    RuntimeAssetPayload Load(const std::string &filePath, const std::string &guid, AssetDatabase *adb) override;
    [[nodiscard]] bool SupportsWorkerLoad() const noexcept override
    {
        return true;
    }

    bool Reload(const RuntimeAssetPayload &existing, const std::string &filePath, const std::string &guid,
                AssetDatabase *adb) override;
    [[nodiscard]] size_t EstimateRuntimeBytes(const RuntimeAssetPayload &payload) const override;

    std::set<std::string> ScanDependencies(const std::string &filePath, AssetDatabase *adb) override;

    void CreateMeta(const char *content, size_t contentSize, const std::string &filePath,
                    InxResourceMeta &metaData) const override;
};

} // namespace infernux

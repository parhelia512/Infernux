#pragma once

#include <function/resources/InxMesh/InxMesh.h>

#include <glm/glm.hpp>
#include <glm/gtc/quaternion.hpp>

#include <array>
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace infernux
{

constexpr uint32_t kMaxSkinInfluences = 4;

struct SkinInfluence
{
    std::array<uint32_t, kMaxSkinInfluences> boneIndex{0, 0, 0, 0};
    std::array<float, kMaxSkinInfluences> weight{0.0f, 0.0f, 0.0f, 0.0f};
};

struct SkinnedRuntimeBone
{
    std::string name;
    int nodeIndex = -1;
    glm::mat4 inverseBind{1.0f};
};

struct SkinnedRuntimeNode
{
    std::string name;
    int parent = -1;
    glm::mat4 bindLocal{1.0f};
    glm::mat4 bindGlobal{1.0f};
};

struct SkinnedRuntimeTrack
{
    std::string nodeName;
    std::vector<std::pair<double, glm::vec3>> positions;
    std::vector<std::pair<double, glm::quat>> rotations;
    std::vector<std::pair<double, glm::vec3>> scales;
};

struct SkinnedRuntimeAnimation
{
    std::string name;
    double durationTicks = 0.0;
    double ticksPerSecond = 25.0;
    std::vector<SkinnedRuntimeTrack> tracks;
    std::unordered_map<std::string, size_t> trackByNode;

    [[nodiscard]] float DurationSeconds() const;
};

struct SkinnedNodePose
{
    glm::vec3 translation{0.0f};
    glm::quat rotation{1.0f, 0.0f, 0.0f, 0.0f};
    glm::vec3 scale{1.0f};
};

struct SkinnedSampleRequest
{
    std::string takeName; ///< Empty = bind pose (no animation applied)
    float timeSeconds = 0.0f;
    bool loop = true; ///< Loop wraps time (fmod); non-loop clamps so the end pose holds
    std::string blendTakeName;
    float blendTimeSeconds = 0.0f;
    float blendWeight = 0.0f;
};

/// One weighted contribution to a multi-layer pose blend (AnimationTree output).
/// Non-additive layers are combined as a coverage-normalized weighted average
/// toward bind pose; additive layers add their (sample − bind) delta on top.
/// An empty boneMask affects all nodes; otherwise only nodes whose name matches.
struct PoseStackLayer
{
    std::string takeName;
    float timeSeconds = 0.0f;
    float weight = 1.0f;
    bool additive = false;
    bool loop = true;
    std::vector<std::string> boneMask;
};

class InxSkinnedMesh
{
  public:
    std::string sourcePath;
    std::string guid;
    float scaleFactor = 0.01f;

    std::vector<Vertex> baseVertices;
    std::vector<SkinInfluence> influences;
    std::vector<uint32_t> indices;
    std::vector<SubMesh> subMeshes;
    std::vector<SkinnedRuntimeNode> nodes;
    std::unordered_map<std::string, int> nodeByName;
    std::vector<SkinnedRuntimeBone> bones;
    std::unordered_map<std::string, uint32_t> boneByName;
    std::vector<SkinnedRuntimeAnimation> animations;

    [[nodiscard]] bool IsValid() const
    {
        return !baseVertices.empty() && !indices.empty();
    }

    [[nodiscard]] const SkinnedRuntimeAnimation *FindAnimation(const std::string &takeName) const;
    [[nodiscard]] float GetAnimationDurationSeconds(const std::string &takeName) const;
    [[nodiscard]] std::vector<glm::mat4> BuildGpuBonePalette(const SkinnedSampleRequest &request) const;
    [[nodiscard]] std::shared_ptr<const std::vector<glm::mat4>>
    GetOrBuildGpuBonePalette(const SkinnedSampleRequest &request) const;
    [[nodiscard]] std::vector<Vertex> SampleVertices(const SkinnedSampleRequest &request) const;

    /// Build bone matrices from a multi-layer pose stack (N-way weighted +
    /// additive blending with optional per-layer bone masks). Used by the
    /// Python AnimationTree runtime. Not cached (the stack is dynamic).
    [[nodiscard]] std::vector<glm::mat4> BuildBoneMatricesFromPoseStack(const std::vector<PoseStackLayer> &layers) const;
    [[nodiscard]] std::vector<glm::mat4>
    BuildGpuBonePaletteFromPoseStack(const std::vector<PoseStackLayer> &layers) const;

    void NormalizeInfluences();

  private:
    struct PaletteCacheKey
    {
        std::string takeName;
        int64_t timeMicros = 0;
        bool loop = true;
        std::string blendTakeName;
        int64_t blendTimeMicros = 0;
        int32_t blendWeightMicros = 0;

        bool operator==(const PaletteCacheKey &rhs) const
        {
            return takeName == rhs.takeName && timeMicros == rhs.timeMicros && loop == rhs.loop &&
                   blendTakeName == rhs.blendTakeName && blendTimeMicros == rhs.blendTimeMicros &&
                   blendWeightMicros == rhs.blendWeightMicros;
        }
    };

    struct PaletteCacheKeyHash
    {
        size_t operator()(const PaletteCacheKey &key) const;
    };

    [[nodiscard]] SkinnedNodePose SampleNodePose(const SkinnedRuntimeAnimation *anim, const SkinnedRuntimeNode &node,
                                                 double tTicks) const;
    [[nodiscard]] std::vector<glm::mat4> BuildBoneMatrices(const SkinnedSampleRequest &request) const;
    [[nodiscard]] static PaletteCacheKey MakePaletteCacheKey(const SkinnedSampleRequest &request);

    mutable std::unordered_map<PaletteCacheKey, std::shared_ptr<const std::vector<glm::mat4>>, PaletteCacheKeyHash>
        m_gpuPaletteCache;
    mutable std::vector<PaletteCacheKey> m_gpuPaletteCacheOrder;
};

} // namespace infernux

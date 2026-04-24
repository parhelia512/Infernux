#pragma once

#include "MeshRenderer.h"

#include <string>
#include <vector>

namespace infernux
{

/**
 * @brief SkinnedMeshRenderer — structural placeholder for animated model instances.
 *
 * This currently reuses MeshRenderer's static draw path so animated FBX models
 * can already be distinguished in scene data, inspector UI, and future runtime
 * animation plumbing. A dedicated skinned render path will be added later.
 */
class SkinnedMeshRenderer : public MeshRenderer
{
  public:
    SkinnedMeshRenderer() = default;

    [[nodiscard]] const char *GetTypeName() const override
    {
        return "SkinnedMeshRenderer";
    }

    void SetSourceModelGuid(const std::string &guid);
    [[nodiscard]] const std::string &GetSourceModelGuid() const
    {
        return m_sourceModelGuid;
    }

    void SetSourceModelPath(const std::string &path);
    [[nodiscard]] const std::string &GetSourceModelPath() const
    {
        return m_sourceModelPath;
    }

    void SetAnimationTakeNames(std::vector<std::string> names)
    {
        m_animationTakeNames = std::move(names);
    }
    [[nodiscard]] const std::vector<std::string> &GetAnimationTakeNames() const
    {
        return m_animationTakeNames;
    }

    void SetActiveTakeName(const std::string &name);
    [[nodiscard]] const std::string &GetActiveTakeName() const
    {
        return m_activeTakeName;
    }

    /// Elapsed time in the current clip (seconds). Runtime-only, not serialized — fed by SkeletalAnimator.
    void SetRuntimeAnimationTime(float t);
    [[nodiscard]] float GetRuntimeAnimationTime() const
    {
        return m_runtimeAnimationTime;
    }

    /// Normalized clip progress [0,1] when a duration is known. Runtime-only.
    void SetRuntimeAnimationNormalizedTime(float n)
    {
        m_runtimeAnimationNormalized = n;
    }
    [[nodiscard]] float GetRuntimeAnimationNormalizedTime() const
    {
        return m_runtimeAnimationNormalized;
    }

    [[nodiscard]] bool HasAnimationTakes() const
    {
        return !m_animationTakeNames.empty();
    }

    [[nodiscard]] bool HasRuntimeSkinnedMesh() const
    {
        return !m_runtimeSkinnedVertices.empty() && !m_runtimeSkinnedIndices.empty();
    }
    [[nodiscard]] const std::vector<Vertex> &GetRuntimeSkinnedVertices() const
    {
        return m_runtimeSkinnedVertices;
    }
    [[nodiscard]] const std::vector<uint32_t> &GetRuntimeSkinnedIndices() const
    {
        return m_runtimeSkinnedIndices;
    }
    [[nodiscard]] const std::vector<SubMesh> &GetRuntimeSkinnedSubMeshes() const
    {
        return m_runtimeSkinnedSubMeshes;
    }

    [[nodiscard]] std::string Serialize() const override;
    bool Deserialize(const std::string &jsonStr) override;
    [[nodiscard]] std::unique_ptr<Component> Clone() const override;

  private:
    void RefreshRuntimeSkinnedMesh();

    std::string m_sourceModelGuid;
    std::string m_sourceModelPath;
    std::vector<std::string> m_animationTakeNames;
    std::string m_activeTakeName;
    float m_runtimeAnimationTime = 0.0f;
    float m_runtimeAnimationNormalized = 0.0f;
    std::vector<Vertex> m_runtimeSkinnedVertices;
    std::vector<uint32_t> m_runtimeSkinnedIndices;
    std::vector<SubMesh> m_runtimeSkinnedSubMeshes;
};

} // namespace infernux

#pragma once

#include <core/types/InfFwdType.h>

#include <functional>
#include <mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace infengine
{

/**
 * @brief Notification types for asset lifecycle events.
 */
enum class AssetEvent
{
    Deleted,  ///< Asset file was deleted — dependents should null out / fallback
    Modified, ///< Asset file was modified — dependents should re-resolve
    Moved     ///< Asset was moved/renamed — GUID is stable, path changed
};

/**
 * @brief Callback invoked when a dependency is affected.
 *
 * @param dependentGuid  GUID of the asset that holds the reference
 * @param dependencyGuid GUID of the asset that was affected
 * @param event          What happened to the dependency
 */
using AssetEventCallback =
    std::function<void(const std::string &dependentGuid, const std::string &dependencyGuid, AssetEvent event)>;

/**
 * @brief Central, type-agnostic asset dependency graph.
 *
 * Replaces the scattered dependency maps that were previously maintained
 * independently by AssetRegistry (material ↔ MeshRenderer),
 * MaterialPipelineManager (texture ↔ material), and ad-hoc Python code.
 *
 * Two kinds of relationships are tracked:
 *
 * 1. **Asset → Asset dependencies** (GUID-based):
 *    A material depends on textures, shaders.
 *    Registered during import/deserialization by scanning the asset's content.
 *
 * 2. **Runtime object → Asset usage** (pointer-based):
 *    A MeshRenderer uses a Material, an AudioSource uses an AudioClip.
 *    Registered when a component binds to an asset.
 *
 * When an asset is deleted/modified, the graph notifies all dependents
 * through registered callbacks per resource type.
 */
class AssetDependencyGraph
{
  public:
    static AssetDependencyGraph &Instance();

    // Non-copyable
    AssetDependencyGraph(const AssetDependencyGraph &) = delete;
    AssetDependencyGraph &operator=(const AssetDependencyGraph &) = delete;

    // ========================================================================
    // Asset → Asset dependencies (GUID-based)
    // ========================================================================

    /// @brief Register that `userGuid` depends on `dependencyGuid`.
    void AddDependency(const std::string &userGuid, const std::string &dependencyGuid);

    /// @brief Remove a single dependency edge.
    void RemoveDependency(const std::string &userGuid, const std::string &dependencyGuid);

    /// @brief Remove ALL dependencies declared by `userGuid`.
    /// Call before re-scanning (import/deserialize) to rebuild fresh.
    void ClearDependenciesOf(const std::string &userGuid);

    /// @brief Remove ALL records for an asset (both as user and dependency).
    /// Call when the asset is permanently deleted.
    void RemoveAsset(const std::string &guid);

    /// @brief Bulk-set dependencies for `userGuid` (replaces any previous).
    void SetDependencies(const std::string &userGuid, const std::unordered_set<std::string> &dependencyGuids);

    /// @brief Get all GUIDs that `guid` depends on (forward lookup).
    [[nodiscard]] std::unordered_set<std::string> GetDependencies(const std::string &guid) const;

    /// @brief Get all GUIDs that depend on `guid` (reverse lookup).
    [[nodiscard]] std::unordered_set<std::string> GetDependents(const std::string &guid) const;

    /// @brief Check if `userGuid` depends on `dependencyGuid`.
    [[nodiscard]] bool HasDependency(const std::string &userGuid, const std::string &dependencyGuid) const;

    // ========================================================================
    // Event dispatch
    // ========================================================================

    /// @brief Register a callback for a specific resource type.
    /// When an asset of that type is deleted/modified, all dependents are
    /// notified through this callback.
    void RegisterCallback(ResourceType type, AssetEventCallback callback);

    /// @brief Notify all dependents that `guid` (of `type`) had an event.
    /// Iterates GetDependents(guid) and invokes matching callbacks.
    void NotifyEvent(const std::string &guid, ResourceType type, AssetEvent event);

    // ========================================================================
    // Diagnostics
    // ========================================================================

    /// @brief Total number of dependency edges.
    [[nodiscard]] size_t GetEdgeCount() const;

    /// @brief Total number of tracked assets (as user or dependency).
    [[nodiscard]] size_t GetNodeCount() const;

    /// @brief Clear the entire graph.
    void Clear();

  private:
    AssetDependencyGraph() = default;
    ~AssetDependencyGraph() = default;

    // Forward: userGuid → set of dependencyGuids
    std::unordered_map<std::string, std::unordered_set<std::string>> m_dependencies;
    // Reverse: dependencyGuid → set of userGuids
    std::unordered_map<std::string, std::unordered_set<std::string>> m_dependents;

    // Event callbacks per resource type
    std::unordered_map<ResourceType, std::vector<AssetEventCallback>> m_callbacks;

    mutable std::mutex m_mutex;
};

} // namespace infengine

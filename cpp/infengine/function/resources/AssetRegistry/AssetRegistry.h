#pragma once

#include <core/types/InfFwdType.h>
#include <function/resources/AssetDatabase/AssetDatabase.h>
#include <function/resources/AssetRef.h>
#include <function/resources/AssetRegistry/IAssetLoader.h>

#include <functional>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>

namespace infengine
{

// Forward declarations — avoid pulling in heavy headers
class InfMaterial;
class InfTexture;

// =============================================================================
// AssetRegistry — the single source of truth for loaded asset instances
// =============================================================================

/**
 * @brief Unified asset registry — owns all loaded C++ asset instances.
 *
 * Design principles (Unity / UE5 alignment):
 *   1. **GUID-first** — all lookups and cache keys use GUIDs.
 *   2. **Single cache** — one map for all resource types (no per-type Manager singletons).
 *   3. **Loader plug-ins** — type-specific logic (deserialization, dependency scanning)
 *      is isolated in IAssetLoader implementations registered at startup.
 *   4. **Pointer stability** — Reload() updates the *existing* instance in-place
 *      so all shared_ptr holders (MeshRenderers, inspectors, Python wrappers)
 *      see changes without re-resolving.
 *   5. **Built-in assets** — engine-internal materials (grid, gizmo, error …)
 *      live in a separate map keyed by a stable name (no GUID required).
 *
 * Ownership: InfEngine creates AssetDatabase and hands it to AssetRegistry
 * via Initialize(). AssetRegistry becomes the sole owner of the AssetDatabase.
 */
class AssetRegistry
{
  public:
    static AssetRegistry &Instance();

    // Non-copyable, non-moveable
    AssetRegistry(const AssetRegistry &) = delete;
    AssetRegistry &operator=(const AssetRegistry &) = delete;

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /// Take ownership of the AssetDatabase and prepare the registry.
    void Initialize(std::unique_ptr<AssetDatabase> adb);

    /// Release all loaded assets and loaders.  Called during engine shutdown.
    void Shutdown();

    [[nodiscard]] bool IsInitialized() const
    {
        return m_initialized;
    }

    // ── AssetDatabase access ─────────────────────────────────────────────────

    [[nodiscard]] AssetDatabase *GetAssetDatabase() const
    {
        return m_assetDb.get();
    }

    // ── Loader registration ──────────────────────────────────────────────────

    void RegisterLoader(ResourceType type, std::unique_ptr<IAssetLoader> loader);

    [[nodiscard]] IAssetLoader *GetLoader(ResourceType type) const;

    /// @brief Populate AssetDatabase's meta-loader table from the registered loaders.
    /// Must be called after all RegisterLoader() calls and before AssetDatabase::Refresh().
    void PopulateAssetDatabaseLoaders();

    // ── Load / Get API (GUID-first) ──────────────────────────────────────────

    /// Return a cached instance if already loaded, or nullptr.
    template <typename T> std::shared_ptr<T> GetAsset(const std::string &guid) const;

    /// Load by GUID: cache hit → return, miss → GUID→path → Loader.
    template <typename T> std::shared_ptr<T> LoadAsset(const std::string &guid, ResourceType type);

    /// Load by path: path→GUID→LoadAsset.  Convenience for callers that only have a path.
    template <typename T> std::shared_ptr<T> LoadAssetByPath(const std::string &path, ResourceType type);

    // ── Hot-reload / invalidation ────────────────────────────────────────────

    /// Reload an already-loaded asset in-place from disk.
    bool ReloadAsset(const std::string &guid);

    /// Evict the instance from cache (next Load will re-read from disk).
    void InvalidateAsset(const std::string &guid);

    /// Fully remove the record (e.g. when the file is deleted).
    void RemoveAsset(const std::string &guid);

    // ── File-event hooks (called from Python file watcher / AssetDatabase) ───

    void OnAssetModified(const std::string &path);
    void OnAssetMoved(const std::string &oldPath, const std::string &newPath);
    void OnAssetDeleted(const std::string &path);

    // ── Built-in material helpers (named, no GUID) ───────────────────────────

    /// Create and register all engine built-in materials (DefaultLit, Error, Gizmo, etc.).
    /// Populates builtin material pointers from registered loaders.
    void InitializeBuiltinMaterials();

    void RegisterBuiltinMaterial(const std::string &key, std::shared_ptr<InfMaterial> mat);
    [[nodiscard]] std::shared_ptr<InfMaterial> GetBuiltinMaterial(const std::string &key) const;

    /// @brief Load a builtin material from a .mat file, replacing the existing
    /// entry for the given key.  Used at startup to override DefaultLit etc.
    bool LoadBuiltinMaterialFromFile(const std::string &key, const std::string &matFilePath);

    // ── Queries ──────────────────────────────────────────────────────────────

    [[nodiscard]] bool IsLoaded(const std::string &guid) const;
    [[nodiscard]] ResourceType GetAssetType(const std::string &guid) const;
    [[nodiscard]] std::vector<std::string> GetAllLoadedGuids() const;

    /// Collect all loaded assets of a given ResourceType.
    [[nodiscard]] std::vector<std::shared_ptr<void>> GetAllAssetsOfType(ResourceType type) const;

    /// Return all known materials — builtin + loaded from disk.
    [[nodiscard]] std::vector<std::shared_ptr<InfMaterial>> GetAllMaterials() const;

    // ── AssetRef resolution ──────────────────────────────────────────────────

    /// Resolve an AssetRef<T> in-place: if the GUID is set but the cached pointer
    /// is null, load the asset via the registered loader and cache it in the ref.
    /// @return true if the ref now holds a valid pointer.
    template <typename T> bool Resolve(AssetRef<T> &ref, ResourceType type);

  private:
    AssetRegistry() = default;
    ~AssetRegistry() = default;

    /// Internal load helper — assumes GUID / path are valid.
    std::shared_ptr<void> LoadAssetInternal(const std::string &filePath, const std::string &guid, ResourceType type);

    struct AssetEntry
    {
        std::shared_ptr<void> instance;
        ResourceType type = ResourceType::DefaultBinary;
    };

    bool m_initialized = false;
    std::unique_ptr<AssetDatabase> m_assetDb;
    std::unordered_map<std::string, AssetEntry> m_loadedAssets;                       // GUID → live instance
    std::unordered_map<ResourceType, std::unique_ptr<IAssetLoader>> m_loaders;        // type → loader
    std::unordered_map<std::string, std::shared_ptr<InfMaterial>> m_builtinMaterials; // name → builtin mat
};

// =============================================================================
// Template implementations (must be in header)
// =============================================================================

template <typename T> std::shared_ptr<T> AssetRegistry::GetAsset(const std::string &guid) const
{
    auto it = m_loadedAssets.find(guid);
    if (it != m_loadedAssets.end())
        return std::static_pointer_cast<T>(it->second.instance);
    return nullptr;
}

template <typename T> std::shared_ptr<T> AssetRegistry::LoadAsset(const std::string &guid, ResourceType type)
{
    // 1. Cache hit
    if (auto cached = GetAsset<T>(guid))
        return cached;

    // 2. GUID → path via AssetDatabase
    if (!m_assetDb)
        return nullptr;
    std::string path = m_assetDb->GetPathFromGuid(guid);
    if (path.empty())
        return nullptr;

    // 3. Delegate to loader
    auto inst = LoadAssetInternal(path, guid, type);
    return inst ? std::static_pointer_cast<T>(inst) : nullptr;
}

template <typename T> std::shared_ptr<T> AssetRegistry::LoadAssetByPath(const std::string &path, ResourceType type)
{
    if (!m_assetDb)
        return nullptr;
    std::string guid = m_assetDb->GetGuidFromPath(path);
    if (guid.empty())
        return nullptr;

    // Cache hit
    if (auto cached = GetAsset<T>(guid))
        return cached;

    auto inst = LoadAssetInternal(path, guid, type);
    return inst ? std::static_pointer_cast<T>(inst) : nullptr;
}

template <typename T> bool AssetRegistry::Resolve(AssetRef<T> &ref, ResourceType type)
{
    if (!ref.HasGuid())
        return false;
    if (ref.Get())
        return true; // already resolved
    auto asset = LoadAsset<T>(ref.GetGuid(), type);
    if (asset) {
        ref.SetCached(std::move(asset));
        return true;
    }
    return false;
}

} // namespace infengine

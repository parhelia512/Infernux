#pragma once

#include <core/types/InxFwdType.h>

#include <functional>
#include <memory>
#include <stdexcept>
#include <string>

namespace infernux
{

/**
 * @brief A lightweight, serializable reference to an asset identified by GUID.
 *
 * AssetRef<T> stores only a GUID string and an optional cached pointer.
 * Resolution is explicit — call Resolve() with a resolver callback or
 * set the cached pointer directly after loading.
 *
 * Serialization: serialize/deserialize the GUID string via GetGuid()/SetGuid().
 *
 * @tparam T The asset type (e.g. InxMaterial, InxTextureData, etc.)
 */
template <typename T> class AssetRef
{
  public:
    AssetRef() = default;

    /// @brief Construct with a GUID
    explicit AssetRef(const std::string &guid) : m_guid(guid)
    {
    }

    /// @brief Construct with a pre-resolved pointer and its published runtime version.
    AssetRef(const std::string &guid, std::shared_ptr<T> asset, uint64_t runtimeVersion)
        : m_guid(guid), m_cached(std::move(asset)), m_cachedVersion(runtimeVersion), m_resolved(true)
    {
        if (m_guid.empty() != (m_cachedVersion == 0))
            throw std::invalid_argument("GUID-backed AssetRef requires a non-zero runtime version");
        if (m_cachedVersion != 0 && !m_cached)
            throw std::invalid_argument("Published AssetRef requires a payload");
    }

    // ---- GUID accessors ----

    [[nodiscard]] const std::string &GetGuid() const
    {
        return m_guid;
    }

    void SetGuid(const std::string &guid)
    {
        if (m_guid != guid) {
            m_guid = guid;
            m_cached.reset(); // invalidate cache on GUID change
            m_cachedVersion = 0;
            m_resolved = false;
        }
    }

    /// @brief Check whether a GUID is assigned (may or may not be resolved)
    [[nodiscard]] bool HasGuid() const
    {
        return !m_guid.empty();
    }

    // ---- Cache accessors ----

    /// @brief Get the cached asset pointer (may be nullptr if not yet resolved)
    [[nodiscard]] std::shared_ptr<T> Get() const
    {
        return m_cached;
    }

    /// @brief Arrow operator for convenient access (caller must ensure resolved)
    T *operator->() const
    {
        return m_cached.get();
    }

    /// @brief Dereference (caller must ensure resolved)
    T &operator*() const
    {
        return *m_cached;
    }

    /// @brief Bool conversion — true if resolved and non-null
    explicit operator bool() const
    {
        return m_cached != nullptr;
    }

    /// @brief Set the cached pointer directly (e.g. after loading)
    void SetCached(std::shared_ptr<T> asset, uint64_t runtimeVersion)
    {
        if (m_guid.empty() || !asset || runtimeVersion == 0)
            throw std::invalid_argument("AssetRef cached publication requires GUID, payload and runtime version");
        m_cached = std::move(asset);
        m_cachedVersion = runtimeVersion;
        m_resolved = true;
    }

    [[nodiscard]] uint64_t GetCachedVersion() const noexcept
    {
        return m_cachedVersion;
    }

    /// @brief Invalidate the cached pointer without clearing the GUID
    void Invalidate()
    {
        m_cached.reset();
        m_cachedVersion = 0;
        m_resolved = false;
    }

    // ---- Missing / deleted state ----

    /// @brief True if a GUID is set but resolution returned nullptr (asset was deleted or missing).
    [[nodiscard]] bool IsMissing() const
    {
        return !m_guid.empty() && m_cached == nullptr && m_resolved;
    }

    /// @brief True if Resolve() was attempted at least once.
    [[nodiscard]] bool WasResolved() const
    {
        return m_resolved;
    }

    /// @brief Mark this reference as needing re-resolution (e.g. after asset modified).
    void MarkStale()
    {
        m_cached.reset();
        m_cachedVersion = 0;
        m_resolved = false;
    }

    /// @brief Clear both GUID and cached pointer (set to "no reference").
    void Clear()
    {
        m_guid.clear();
        m_cached.reset();
        m_cachedVersion = 0;
        m_resolved = false;
    }

    // ---- Equality ----

    bool operator==(const AssetRef &other) const
    {
        return m_guid == other.m_guid;
    }

    bool operator!=(const AssetRef &other) const
    {
        return m_guid != other.m_guid;
    }

  private:
    std::string m_guid;
    std::shared_ptr<T> m_cached;
    uint64_t m_cachedVersion = 0;
    bool m_resolved = false; ///< true after at least one Resolve() attempt
};

} // namespace infernux

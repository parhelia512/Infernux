#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace infernux
{

class InxResourceMeta;

enum class TexturePixelStorage : uint32_t
{
    Rgba8 = 1,
    Rgba32Float = 2,
};

struct TextureMipLevel
{
    uint32_t width = 0;
    uint32_t height = 0;
    uint64_t byteOffset = 0;
    uint64_t byteSize = 0;
};

struct TextureCpuData
{
    TexturePixelStorage storage = TexturePixelStorage::Rgba8;
    std::vector<TextureMipLevel> mipLevels;
    std::vector<uint8_t> bytes;

    [[nodiscard]] bool IsValid() const noexcept
    {
        return !mipLevels.empty() && !bytes.empty();
    }
};

/**
 * @brief Lightweight C++ asset representing a texture's import settings.
 *
 * InxTexture does NOT hold GPU resources (VkImage, VkImageView, etc.).
 * Those remain owned by the renderer's GPU texture cache (InxVkCoreModular).
 *
 * InxTexture is managed by AssetRegistry and provides:
 *   - Cached import settings from the .meta file (sRGB, mipmaps, texture_type)
 *   - GUID / file-path identity
 *   - In-place reload so all holders see updated metadata
 *
 * This decouples metadata reading from the per-frame render path,
 * avoiding repeated .meta file I/O in ResolveTextureForMaterial().
 */
class InxTexture
{
  public:
    InxTexture() = default;

    // ── Identity ────────────────────────────────────────────────────────────

    [[nodiscard]] const std::string &GetGuid() const
    {
        return m_guid;
    }
    void SetGuid(const std::string &guid)
    {
        m_guid = guid;
    }

    [[nodiscard]] const std::string &GetFilePath() const
    {
        return m_filePath;
    }
    void SetFilePath(const std::string &path)
    {
        m_filePath = path;
    }

    [[nodiscard]] const std::string &GetName() const
    {
        return m_name;
    }
    void SetName(const std::string &name)
    {
        m_name = name;
    }

    // ── Import settings (from .meta) ────────────────────────────────────────

    [[nodiscard]] const std::string &GetTextureType() const
    {
        return m_textureType;
    }
    void SetTextureType(const std::string &type)
    {
        m_textureType = type;
    }

    [[nodiscard]] bool IsSrgb() const
    {
        return m_srgb;
    }
    void SetSrgb(bool srgb)
    {
        m_srgb = srgb;
    }

    [[nodiscard]] bool GenerateMipmaps() const
    {
        return m_generateMipmaps;
    }
    void SetGenerateMipmaps(bool gen)
    {
        m_generateMipmaps = gen;
    }

    [[nodiscard]] int GetMaxSize() const
    {
        return m_maxSize;
    }
    void SetMaxSize(int size)
    {
        m_maxSize = size;
    }

    [[nodiscard]] const std::string &GetFilterMode() const
    {
        return m_filterMode;
    }
    void SetFilterMode(const std::string &mode)
    {
        m_filterMode = mode;
    }

    [[nodiscard]] const std::string &GetWrapMode() const
    {
        return m_wrapMode;
    }
    void SetWrapMode(const std::string &mode)
    {
        m_wrapMode = mode;
    }

    [[nodiscard]] int GetAnisoLevel() const
    {
        return m_anisoLevel;
    }
    void SetAnisoLevel(int level)
    {
        m_anisoLevel = level;
    }

    [[nodiscard]] bool IsNormalMapMode() const
    {
        return m_textureType == "normal_map";
    }

    /// Determine whether this texture should use linear format (UNORM).
    /// Solely based on the srgb import setting — no hardcoded texture_type logic.
    [[nodiscard]] bool IsLinear() const
    {
        return !m_srgb;
    }

    void ApplyImportSettings(const InxResourceMeta &metadata);

    [[nodiscard]] const std::shared_ptr<const TextureCpuData> &GetCpuData() const noexcept
    {
        return m_cpuData;
    }
    void SetCpuData(std::shared_ptr<const TextureCpuData> cpuData)
    {
        m_cpuData = std::move(cpuData);
    }

    // ── Clone (Unity-style Object.Instantiate) ─────────────────────────────

    /// @brief Create a copy of this texture metadata (import settings).
    /// GPU pixel data is NOT duplicated — the clone references the same
    /// underlying image file.  Matches Unity behavior where Instantiate
    /// on a Texture2D copies the CPU-side metadata.
    [[nodiscard]] std::shared_ptr<InxTexture> Clone() const;
    [[nodiscard]] size_t GetRuntimeMemoryBytes() const noexcept;

  private:
    std::string m_guid;
    std::string m_filePath;
    std::string m_name;

    // Import settings — defaults match the engine convention (sRGB, mipmaps on)
    std::string m_textureType; // "normal_map", "mask", etc.  Empty = default (color)
    bool m_srgb = true;
    bool m_generateMipmaps = true;
    int m_maxSize = 2048;
    std::string m_filterMode = "bilinear"; // "point", "bilinear", "trilinear"
    std::string m_wrapMode = "repeat";     // "repeat", "clamp", "mirror"
    int m_anisoLevel = -1;                 // -1 = device max, 0 = off, 1-16 = explicit
    std::shared_ptr<const TextureCpuData> m_cpuData;
};

} // namespace infernux

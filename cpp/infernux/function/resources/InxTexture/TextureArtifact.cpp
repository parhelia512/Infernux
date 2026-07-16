#include "TextureArtifact.h"

#include <algorithm>
#include <limits>
#include <stdexcept>

namespace infernux
{
namespace
{
constexpr std::string_view Magic = "INXTEX";
constexpr uint32_t EndianMarker = 0x01020304U;
constexpr uint32_t MaximumDimension = 65'536;
constexpr uint32_t MaximumMipLevels = 32;
constexpr uint64_t MaximumPayloadBytes = 1ULL << 30;
constexpr uint32_t MaximumHashBytes = 1024;

uint64_t Fnv1a64(std::string_view bytes)
{
    uint64_t hash = 14695981039346656037ULL;
    for (const unsigned char byte : bytes) {
        hash ^= byte;
        hash *= 1099511628211ULL;
    }
    return hash;
}

void AppendU32(std::string &out, uint32_t value)
{
    for (unsigned shift = 0; shift < 32; shift += 8)
        out.push_back(static_cast<char>((value >> shift) & 0xffU));
}

void AppendU64(std::string &out, uint64_t value)
{
    for (unsigned shift = 0; shift < 64; shift += 8)
        out.push_back(static_cast<char>((value >> shift) & 0xffU));
}

void AppendString(std::string &out, std::string_view value)
{
    if (value.empty() || value.size() > MaximumHashBytes)
        throw std::invalid_argument("texture artifact requires a bounded source content hash");
    AppendU32(out, static_cast<uint32_t>(value.size()));
    out.append(value);
}

class Reader final
{
  public:
    explicit Reader(std::string_view bytes) : m_bytes(bytes)
    {
    }

    uint32_t ReadU32()
    {
        Require(sizeof(uint32_t));
        uint32_t value = 0;
        for (unsigned shift = 0; shift < 32; shift += 8)
            value |= static_cast<uint32_t>(static_cast<unsigned char>(m_bytes[m_cursor++])) << shift;
        return value;
    }

    uint64_t ReadU64()
    {
        Require(sizeof(uint64_t));
        uint64_t value = 0;
        for (unsigned shift = 0; shift < 64; shift += 8)
            value |= static_cast<uint64_t>(static_cast<unsigned char>(m_bytes[m_cursor++])) << shift;
        return value;
    }

    std::string ReadString()
    {
        const uint32_t size = ReadU32();
        if (size == 0 || size > MaximumHashBytes)
            throw std::invalid_argument("texture artifact has an invalid source hash size");
        Require(size);
        std::string value(m_bytes.substr(m_cursor, size));
        m_cursor += size;
        return value;
    }

    std::string_view ReadBytes(uint64_t size)
    {
        if (size > std::numeric_limits<size_t>::max())
            throw std::invalid_argument("texture artifact payload exceeds addressable memory");
        Require(static_cast<size_t>(size));
        const auto value = m_bytes.substr(m_cursor, static_cast<size_t>(size));
        m_cursor += static_cast<size_t>(size);
        return value;
    }

    bool AtEnd() const noexcept
    {
        return m_cursor == m_bytes.size();
    }

  private:
    void Require(size_t size) const
    {
        if (size > m_bytes.size() - m_cursor)
            throw std::invalid_argument("texture artifact is truncated");
    }

    std::string_view m_bytes;
    size_t m_cursor = 0;
};

uint32_t BytesPerPixel(TexturePixelStorage storage)
{
    switch (storage) {
    case TexturePixelStorage::Rgba8:
        return 4;
    case TexturePixelStorage::Rgba32Float:
        return 16;
    }
    throw std::invalid_argument("texture artifact has an unsupported pixel storage");
}

void ValidateTexture(const TextureCpuData &texture)
{
    if (!texture.IsValid() || texture.mipLevels.size() > MaximumMipLevels || texture.bytes.size() > MaximumPayloadBytes)
        throw std::invalid_argument("texture artifact has invalid payload dimensions");
    const uint32_t bytesPerPixel = BytesPerPixel(texture.storage);
    uint64_t expectedOffset = 0;
    uint32_t previousWidth = 0;
    uint32_t previousHeight = 0;
    for (size_t index = 0; index < texture.mipLevels.size(); ++index) {
        const auto &mip = texture.mipLevels[index];
        if (mip.width == 0 || mip.height == 0 || mip.width > MaximumDimension || mip.height > MaximumDimension)
            throw std::invalid_argument("texture artifact has an invalid mip dimension");
        if (index > 0 &&
            (mip.width != (std::max)(1U, previousWidth / 2U) || mip.height != (std::max)(1U, previousHeight / 2U)))
            throw std::invalid_argument("texture artifact has a non-contiguous mip chain");
        const uint64_t expectedSize = static_cast<uint64_t>(mip.width) * mip.height * bytesPerPixel;
        if (mip.byteOffset != expectedOffset || mip.byteSize != expectedSize ||
            expectedSize > MaximumPayloadBytes - expectedOffset)
            throw std::invalid_argument("texture artifact has an invalid mip byte range");
        expectedOffset += expectedSize;
        previousWidth = mip.width;
        previousHeight = mip.height;
    }
    if (expectedOffset != texture.bytes.size())
        throw std::invalid_argument("texture artifact payload size does not match its mip chain");
}
} // namespace

std::string TextureArtifact::Serialize(const TextureCpuData &texture, std::string_view sourceContentHash)
{
    ValidateTexture(texture);
    std::string bytes(Magic);
    AppendU32(bytes, FormatVersion);
    AppendU32(bytes, EndianMarker);
    AppendString(bytes, sourceContentHash);
    AppendU32(bytes, static_cast<uint32_t>(texture.storage));
    AppendU32(bytes, static_cast<uint32_t>(texture.mipLevels.size()));
    for (const auto &mip : texture.mipLevels) {
        AppendU32(bytes, mip.width);
        AppendU32(bytes, mip.height);
        AppendU64(bytes, mip.byteSize);
    }
    AppendU64(bytes, texture.bytes.size());
    bytes.append(reinterpret_cast<const char *>(texture.bytes.data()), texture.bytes.size());
    AppendU64(bytes, Fnv1a64(bytes));
    return bytes;
}

std::shared_ptr<const TextureCpuData> TextureArtifact::Deserialize(std::string_view bytes,
                                                                   std::string_view expectedSourceContentHash)
{
    if (bytes.size() < Magic.size() + sizeof(uint32_t) * 4 + sizeof(uint64_t) * 2 ||
        bytes.substr(0, Magic.size()) != Magic)
        throw std::invalid_argument("texture artifact has an invalid header");
    const size_t checksumOffset = bytes.size() - sizeof(uint64_t);
    Reader checksumReader(bytes.substr(checksumOffset));
    if (checksumReader.ReadU64() != Fnv1a64(bytes.substr(0, checksumOffset)))
        throw std::invalid_argument("texture artifact checksum mismatch");

    Reader reader(bytes.substr(Magic.size(), checksumOffset - Magic.size()));
    if (reader.ReadU32() != FormatVersion)
        throw std::invalid_argument("texture artifact uses an unsupported format version");
    if (reader.ReadU32() != EndianMarker)
        throw std::invalid_argument("texture artifact has an invalid endian marker");
    if (reader.ReadString() != expectedSourceContentHash)
        throw std::invalid_argument("texture artifact does not match the imported source content");

    auto texture = std::make_shared<TextureCpuData>();
    texture->storage = static_cast<TexturePixelStorage>(reader.ReadU32());
    (void)BytesPerPixel(texture->storage);
    const uint32_t mipCount = reader.ReadU32();
    if (mipCount == 0 || mipCount > MaximumMipLevels)
        throw std::invalid_argument("texture artifact has an invalid mip count");
    texture->mipLevels.reserve(mipCount);
    uint64_t offset = 0;
    for (uint32_t index = 0; index < mipCount; ++index) {
        TextureMipLevel mip;
        mip.width = reader.ReadU32();
        mip.height = reader.ReadU32();
        mip.byteOffset = offset;
        mip.byteSize = reader.ReadU64();
        if (mip.byteSize > MaximumPayloadBytes - offset)
            throw std::invalid_argument("texture artifact mip payload exceeds the format limit");
        offset += mip.byteSize;
        texture->mipLevels.push_back(mip);
    }
    const uint64_t payloadSize = reader.ReadU64();
    if (payloadSize != offset || payloadSize > MaximumPayloadBytes)
        throw std::invalid_argument("texture artifact has an invalid payload size");
    const auto payload = reader.ReadBytes(payloadSize);
    texture->bytes.assign(payload.begin(), payload.end());
    if (!reader.AtEnd())
        throw std::invalid_argument("texture artifact contains trailing data");
    ValidateTexture(*texture);
    return texture;
}

} // namespace infernux

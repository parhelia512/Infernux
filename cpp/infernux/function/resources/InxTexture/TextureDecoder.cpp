#include "TextureDecoder.h"

#include <function/resources/InxFileLoader/InxTextureLoader.hpp>
#include <function/resources/InxResource/InxResourceMeta.h>
#include <platform/filesystem/InxPath.h>

#include <stb_image.h>
#include <stb_image_resize2.h>

#include <algorithm>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <limits>
#include <stdexcept>
#include <vector>

namespace infernux
{
namespace
{
constexpr uint32_t MaximumDimension = 65'536;
constexpr uint64_t MaximumDecodedBytes = 1ULL << 30;

uint32_t ReadMaxSize(const InxResourceMeta &metadata)
{
    const int maxSize = metadata.HasKey("max_size") ? metadata.GetDataAs<int>("max_size") : 2048;
    if (maxSize <= 0 || maxSize > static_cast<int>(MaximumDimension))
        throw std::invalid_argument("texture max_size is outside the supported range");
    return static_cast<uint32_t>(maxSize);
}

bool ReadGenerateMipmaps(const InxResourceMeta &metadata)
{
    return metadata.HasKey("generate_mipmaps") ? metadata.GetDataAs<bool>("generate_mipmaps") : true;
}

std::vector<unsigned char> ReadSourceBytes(const std::string &path)
{
    std::ifstream file(ToFsPath(path), std::ios::binary | std::ios::ate);
    if (!file.is_open())
        throw std::runtime_error("failed to open texture source: " + path);
    const auto size = file.tellg();
    if (size <= 0 || static_cast<uint64_t>(size) > static_cast<uint64_t>(std::numeric_limits<int>::max()))
        throw std::runtime_error("texture source is empty or exceeds decoder limits: " + path);
    std::vector<unsigned char> bytes(static_cast<size_t>(size));
    file.seekg(0);
    file.read(reinterpret_cast<char *>(bytes.data()), size);
    if (!file)
        throw std::runtime_error("failed to read texture source: " + path);
    return bytes;
}

uint64_t LevelByteSize(uint32_t width, uint32_t height, TexturePixelStorage storage)
{
    const uint64_t bytesPerPixel = storage == TexturePixelStorage::Rgba8 ? 4ULL : 16ULL;
    const uint64_t pixels = static_cast<uint64_t>(width) * height;
    if (pixels == 0 || pixels > MaximumDecodedBytes / bytesPerPixel)
        throw std::overflow_error("decoded texture exceeds the CPU artifact size limit");
    return pixels * bytesPerPixel;
}

void AppendLevel(TextureCpuData &texture, uint32_t width, uint32_t height, const void *pixels, uint64_t byteSize)
{
    if (!pixels || byteSize != LevelByteSize(width, height, texture.storage) ||
        byteSize > MaximumDecodedBytes - texture.bytes.size())
        throw std::invalid_argument("decoded texture level has an invalid payload");
    TextureMipLevel level;
    level.width = width;
    level.height = height;
    level.byteOffset = texture.bytes.size();
    level.byteSize = byteSize;
    const auto *begin = static_cast<const uint8_t *>(pixels);
    texture.bytes.insert(texture.bytes.end(), begin, begin + static_cast<size_t>(byteSize));
    texture.mipLevels.push_back(level);
}

void GenerateMipChain(TextureCpuData &texture, bool generateMipmaps)
{
    if (!generateMipmaps)
        return;
    while (texture.mipLevels.back().width > 1 || texture.mipLevels.back().height > 1) {
        const TextureMipLevel previous = texture.mipLevels.back();
        const uint32_t width = (std::max)(1U, previous.width / 2U);
        const uint32_t height = (std::max)(1U, previous.height / 2U);
        const uint64_t byteSize = LevelByteSize(width, height, texture.storage);
        std::vector<uint8_t> resized(static_cast<size_t>(byteSize));
        const uint8_t *source = texture.bytes.data() + previous.byteOffset;
        if (texture.storage == TexturePixelStorage::Rgba8) {
            if (!stbir_resize_uint8_linear(source, static_cast<int>(previous.width), static_cast<int>(previous.height),
                                           0, resized.data(), static_cast<int>(width), static_cast<int>(height), 0,
                                           STBIR_RGBA))
                throw std::runtime_error("failed to generate an RGBA8 texture mip level");
        } else {
            if (!stbir_resize_float_linear(reinterpret_cast<const float *>(source), static_cast<int>(previous.width),
                                           static_cast<int>(previous.height), 0,
                                           reinterpret_cast<float *>(resized.data()), static_cast<int>(width),
                                           static_cast<int>(height), 0, STBIR_RGBA))
                throw std::runtime_error("failed to generate an RGBA32F texture mip level");
        }
        AppendLevel(texture, width, height, resized.data(), byteSize);
    }
}
} // namespace

std::shared_ptr<const TextureCpuData> TextureDecoder::Decode(const std::string &sourcePath,
                                                             const InxResourceMeta &metadata)
{
    const auto source = ReadSourceBytes(sourcePath);
    const uint32_t maxSize = ReadMaxSize(metadata);
    const bool generateMipmaps = ReadGenerateMipmaps(metadata);
    int sourceWidth = 0;
    int sourceHeight = 0;
    int sourceChannels = 0;

    auto texture = std::make_shared<TextureCpuData>();
    if (stbi_is_hdr_from_memory(source.data(), static_cast<int>(source.size())) != 0) {
        texture->storage = TexturePixelStorage::Rgba32Float;
        float *decoded = stbi_loadf_from_memory(source.data(), static_cast<int>(source.size()), &sourceWidth,
                                                &sourceHeight, &sourceChannels, STBI_rgb_alpha);
        if (!decoded)
            throw std::runtime_error("failed to decode HDR texture: " + sourcePath);
        auto release = std::unique_ptr<float, decltype(&stbi_image_free)>(decoded, &stbi_image_free);
        const float scale = static_cast<float>(maxSize) / static_cast<float>((std::max)(sourceWidth, sourceHeight));
        const uint32_t width = scale < 1.0f ? (std::max)(1U, static_cast<uint32_t>(sourceWidth * scale))
                                            : static_cast<uint32_t>(sourceWidth);
        const uint32_t height = scale < 1.0f ? (std::max)(1U, static_cast<uint32_t>(sourceHeight * scale))
                                             : static_cast<uint32_t>(sourceHeight);
        if (width != static_cast<uint32_t>(sourceWidth) || height != static_cast<uint32_t>(sourceHeight)) {
            std::vector<float> resized(static_cast<size_t>(width) * height * 4);
            if (!stbir_resize_float_linear(decoded, sourceWidth, sourceHeight, 0, resized.data(),
                                           static_cast<int>(width), static_cast<int>(height), 0, STBIR_RGBA))
                throw std::runtime_error("failed to resize HDR texture: " + sourcePath);
            AppendLevel(*texture, width, height, resized.data(), resized.size() * sizeof(float));
        } else {
            AppendLevel(*texture, width, height, decoded, static_cast<uint64_t>(width) * height * 4 * sizeof(float));
        }
    } else {
        texture->storage = TexturePixelStorage::Rgba8;
        stbi_uc *decoded = stbi_load_from_memory(source.data(), static_cast<int>(source.size()), &sourceWidth,
                                                 &sourceHeight, &sourceChannels, STBI_rgb_alpha);
        std::vector<unsigned char> pnmPixels;
        if (!decoded) {
            InxTextureData pnm = InxTextureLoader::LoadFromMemory(source.data(), source.size(), sourcePath);
            if (!pnm.IsValid())
                throw std::runtime_error("failed to decode texture: " + sourcePath);
            sourceWidth = pnm.width;
            sourceHeight = pnm.height;
            pnmPixels = std::move(pnm.pixels);
        }
        auto release = std::unique_ptr<stbi_uc, decltype(&stbi_image_free)>(decoded, &stbi_image_free);
        const unsigned char *base = decoded ? decoded : pnmPixels.data();
        const float scale = static_cast<float>(maxSize) / static_cast<float>((std::max)(sourceWidth, sourceHeight));
        const uint32_t width = scale < 1.0f ? (std::max)(1U, static_cast<uint32_t>(sourceWidth * scale))
                                            : static_cast<uint32_t>(sourceWidth);
        const uint32_t height = scale < 1.0f ? (std::max)(1U, static_cast<uint32_t>(sourceHeight * scale))
                                             : static_cast<uint32_t>(sourceHeight);
        if (width != static_cast<uint32_t>(sourceWidth) || height != static_cast<uint32_t>(sourceHeight)) {
            std::vector<uint8_t> resized(static_cast<size_t>(width) * height * 4);
            if (!stbir_resize_uint8_linear(base, sourceWidth, sourceHeight, 0, resized.data(), static_cast<int>(width),
                                           static_cast<int>(height), 0, STBIR_RGBA))
                throw std::runtime_error("failed to resize texture: " + sourcePath);
            AppendLevel(*texture, width, height, resized.data(), resized.size());
        } else {
            AppendLevel(*texture, width, height, base, static_cast<uint64_t>(width) * height * 4);
        }
    }

    GenerateMipChain(*texture, generateMipmaps);
    return texture;
}

std::shared_ptr<const TextureCpuData> TextureDecoder::CreateRgba8(const uint8_t *pixels, size_t byteCount,
                                                                  uint32_t width, uint32_t height, bool generateMipmaps)
{
    if (!pixels)
        throw std::invalid_argument("RGBA8 texture payload has no pixels");
    const uint64_t expectedSize = LevelByteSize(width, height, TexturePixelStorage::Rgba8);
    if (expectedSize != byteCount)
        throw std::invalid_argument("RGBA8 texture payload byte count does not match its dimensions");

    auto texture = std::make_shared<TextureCpuData>();
    texture->storage = TexturePixelStorage::Rgba8;
    AppendLevel(*texture, width, height, pixels, expectedSize);
    GenerateMipChain(*texture, generateMipmaps);
    return texture;
}

} // namespace infernux

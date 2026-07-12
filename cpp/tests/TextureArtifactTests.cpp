#include <function/resources/InxTexture/TextureArtifact.h>

#include <cassert>
#include <cstdint>
#include <iostream>
#include <stdexcept>
#include <string>

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

uint64_t Fnv1a64(const std::string &bytes)
{
    uint64_t hash = 14695981039346656037ULL;
    for (const unsigned char byte : bytes) {
        hash ^= byte;
        hash *= 1099511628211ULL;
    }
    return hash;
}

void AppendU64(std::string &bytes, uint64_t value)
{
    for (unsigned shift = 0; shift < 64; shift += 8)
        bytes.push_back(static_cast<char>((value >> shift) & 0xffU));
}
} // namespace

int main()
{
    infernux::TextureCpuData source;
    source.storage = infernux::TexturePixelStorage::Rgba8;
    source.mipLevels = {
        {4, 2, 0, 32},
        {2, 1, 32, 8},
        {1, 1, 40, 4},
    };
    source.bytes.resize(44);
    for (size_t index = 0; index < source.bytes.size(); ++index)
        source.bytes[index] = static_cast<uint8_t>((index * 17U) & 0xffU);

    constexpr const char *SourceHash = "0123456789abcdef";
    const std::string bytes = infernux::TextureArtifact::Serialize(source, SourceHash);
    const auto restored = infernux::TextureArtifact::Deserialize(bytes, SourceHash);
    assert(restored->storage == infernux::TexturePixelStorage::Rgba8);
    assert(restored->mipLevels.size() == 3);
    assert(restored->mipLevels[0].width == 4);
    assert(restored->mipLevels[1].byteOffset == 32);
    assert(restored->mipLevels[2].byteSize == 4);
    assert(restored->bytes == source.bytes);

    RequireInvalid([&] { (void)infernux::TextureArtifact::Deserialize(bytes, "different-source"); });

    std::string corrupted = bytes;
    corrupted[corrupted.size() / 2] ^= 0x5a;
    RequireInvalid([&] { (void)infernux::TextureArtifact::Deserialize(corrupted, SourceHash); });
    RequireInvalid(
        [&] { (void)infernux::TextureArtifact::Deserialize(bytes.substr(0, bytes.size() - 1), SourceHash); });

    std::string trailing = bytes.substr(0, bytes.size() - sizeof(uint64_t));
    trailing.push_back('\0');
    AppendU64(trailing, Fnv1a64(trailing));
    RequireInvalid([&] { (void)infernux::TextureArtifact::Deserialize(trailing, SourceHash); });

    auto invalidChain = source;
    invalidChain.mipLevels[1].width = 3;
    RequireInvalid([&] { (void)infernux::TextureArtifact::Serialize(invalidChain, SourceHash); });
    RequireInvalid([&] { (void)infernux::TextureArtifact::Serialize(source, {}); });

    std::cout << "Texture artifact tests passed\n";
    return 0;
}

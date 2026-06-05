#include "AudioClipLoader.h"

#include <core/log/InxLog.h>
#include <function/audio/AudioClip.h>

#include <platform/filesystem/InxPath.h>

#include <filesystem>

namespace infernux
{

// =============================================================================
// Load — decode audio file and create a new AudioClip
// =============================================================================

std::shared_ptr<void> AudioClipLoader::Load(const std::string &filePath, const std::string &guid,
                                            AssetDatabase * /*adb*/)
{
    if (filePath.empty() || guid.empty()) {
        INXLOG_WARN("AudioClipLoader::Load: empty filePath or guid");
        return nullptr;
    }

    auto fsPath = ToFsPath(filePath);
    if (!std::filesystem::exists(fsPath)) {
        INXLOG_ERROR("AudioClipLoader::Load: file not found: ", filePath);
        return nullptr;
    }

    auto clip = std::make_shared<AudioClip>();
    if (!clip->LoadFromFile(filePath)) {
        INXLOG_ERROR("AudioClipLoader::Load: failed to decode: ", filePath);
        return nullptr;
    }

    clip->SetGuid(guid);

    INXLOG_INFO("AudioClipLoader: loaded '", clip->GetName(), "' (GUID: ", guid, ", ", clip->GetDuration(), "s, ",
                clip->GetSampleRate(), " Hz, ", clip->GetChannels(), " ch)");
    return clip;
}

// =============================================================================
// Reload — re-decode audio and replace PCM data in-place
// =============================================================================

bool AudioClipLoader::Reload(std::shared_ptr<void> existing, const std::string &filePath, const std::string &guid,
                             AssetDatabase * /*adb*/)
{
    auto clip = std::static_pointer_cast<AudioClip>(existing);
    if (!clip) {
        INXLOG_WARN("AudioClipLoader::Reload: null existing instance");
        return false;
    }

    // Unload current data and reload from file
    clip->Unload();
    if (!clip->LoadFromFile(filePath)) {
        INXLOG_ERROR("AudioClipLoader::Reload: failed to decode: ", filePath);
        return false;
    }

    // Restore authoritative GUID
    clip->SetGuid(guid);

    INXLOG_INFO("AudioClipLoader: reloaded '", clip->GetName(), "' in-place (GUID: ", guid, ")");
    return true;
}

// =============================================================================
// ScanDependencies — audio clips have no outgoing asset dependencies
// =============================================================================

std::set<std::string> AudioClipLoader::ScanDependencies(const std::string & /*filePath*/, AssetDatabase * /*adb*/)
{
    return {};
}

// =============================================================================
// LoadMeta — try to load existing .meta from disk
// =============================================================================

bool AudioClipLoader::LoadMeta(const char * /*content*/, const std::string &filePath, InxResourceMeta &metaData)
{
    std::string metaFilePath = InxResourceMeta::GetMetaFilePath(filePath);
    if (metaData.LoadFromFile(metaFilePath)) {
        return true;
    }
    return false;
}

// =============================================================================
// CreateMeta — audio-specific .meta creation
// =============================================================================

void AudioClipLoader::CreateMeta(const char *content, size_t contentSize, const std::string &filePath,
                                 InxResourceMeta &metaData)
{
    metaData.Init(content, contentSize, filePath, ResourceType::Audio);

    std::filesystem::path path = ToFsPath(filePath);
    std::string resourceName = FromFsPath(path.stem());

    metaData.AddMetadata("resource_name", resourceName);
    metaData.AddMetadata("file_size", static_cast<int>(contentSize));
    metaData.AddMetadata("file_type", std::string("audio"));
    metaData.AddMetadata("extension", FromFsPath(path.extension()));
}

} // namespace infernux

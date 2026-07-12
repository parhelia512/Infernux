#include "AtomicFile.h"

#include "InxPath.h"

#include <atomic>
#include <cerrno>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <system_error>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

namespace infernux
{
namespace
{

std::filesystem::path MakeTemporaryPath(const std::filesystem::path &target)
{
    static std::atomic<uint64_t> sequence{0};
    std::filesystem::path temporary = target;
    const auto timestamp = std::chrono::steady_clock::now().time_since_epoch().count();
    temporary += std::filesystem::path(".tmp." + std::to_string(timestamp) + "." +
                                       std::to_string(sequence.fetch_add(1, std::memory_order_relaxed)));
    return temporary;
}

bool ReplaceFile(const std::filesystem::path &source, const std::filesystem::path &target, std::error_code &error)
{
#ifdef _WIN32
    if (::MoveFileExW(source.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
        error.clear();
        return true;
    }
    error = std::error_code(static_cast<int>(::GetLastError()), std::system_category());
    return false;
#else
    std::filesystem::rename(source, target, error);
    return !error;
#endif
}

bool FlushFileToDisk(const std::filesystem::path &path, std::error_code &error)
{
#ifdef _WIN32
    HANDLE handle = ::CreateFileW(path.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                                  FILE_ATTRIBUTE_NORMAL, nullptr);
    if (handle == INVALID_HANDLE_VALUE) {
        error = std::error_code(static_cast<int>(::GetLastError()), std::system_category());
        return false;
    }
    const bool flushed = ::FlushFileBuffers(handle) != 0;
    const DWORD flushError = flushed ? ERROR_SUCCESS : ::GetLastError();
    ::CloseHandle(handle);
    if (!flushed) {
        error = std::error_code(static_cast<int>(flushError), std::system_category());
        return false;
    }
#else
    const int descriptor = ::open(path.c_str(), O_RDONLY);
    if (descriptor < 0) {
        error = std::error_code(errno, std::generic_category());
        return false;
    }
    const bool flushed = ::fsync(descriptor) == 0;
    const int flushError = flushed ? 0 : errno;
    ::close(descriptor);
    if (!flushed) {
        error = std::error_code(flushError, std::generic_category());
        return false;
    }
#endif
    error.clear();
    return true;
}

bool FlushParentDirectory(const std::filesystem::path &target, std::error_code &error)
{
#ifdef _WIN32
    error.clear();
    return true;
#else
    const std::filesystem::path parent =
        target.parent_path().empty() ? std::filesystem::path(".") : target.parent_path();
    const int descriptor = ::open(parent.c_str(), O_RDONLY | O_DIRECTORY);
    if (descriptor < 0) {
        error = std::error_code(errno, std::generic_category());
        return false;
    }
    const bool flushed = ::fsync(descriptor) == 0;
    const int flushError = flushed ? 0 : errno;
    ::close(descriptor);
    if (!flushed) {
        error = std::error_code(flushError, std::generic_category());
        return false;
    }
    error.clear();
    return true;
#endif
}

} // namespace

bool WriteTextFileAtomically(const std::string &path, std::string_view content, std::string &error)
{
    const std::filesystem::path target = ToFsPath(path);
    const std::filesystem::path temporary = MakeTemporaryPath(target);
    try {
        std::ofstream file(temporary, std::ios::out | std::ios::trunc | std::ios::binary);
        if (!file.is_open()) {
            error = "cannot open temporary file";
            return false;
        }
        file.write(content.data(), static_cast<std::streamsize>(content.size()));
        file.flush();
        if (!file.good()) {
            file.close();
            std::error_code ignored;
            std::filesystem::remove(temporary, ignored);
            error = "failed while writing temporary file";
            return false;
        }
        file.close();

        std::error_code flushError;
        if (!FlushFileToDisk(temporary, flushError)) {
            std::error_code ignored;
            std::filesystem::remove(temporary, ignored);
            error = "failed to flush temporary file: " + flushError.message();
            return false;
        }

        std::error_code replaceError;
        if (!ReplaceFile(temporary, target, replaceError)) {
            std::error_code ignored;
            std::filesystem::remove(temporary, ignored);
            error = replaceError.message();
            return false;
        }
        std::error_code directoryFlushError;
        if (!FlushParentDirectory(target, directoryFlushError)) {
            error = "file replaced but parent directory flush failed: " + directoryFlushError.message();
            return false;
        }
        error.clear();
        return true;
    } catch (const std::exception &exception) {
        std::error_code ignored;
        std::filesystem::remove(temporary, ignored);
        error = exception.what();
        return false;
    }
}

bool RemoveFileDurably(const std::string &path, std::string &error)
{
    const std::filesystem::path target = ToFsPath(path);
    std::error_code removeError;
    const bool removed = std::filesystem::remove(target, removeError);
    if (removeError) {
        error = "failed to remove file: " + removeError.message();
        return false;
    }
    if (!removed) {
        error.clear();
        return true;
    }

    std::error_code directoryFlushError;
    if (!FlushParentDirectory(target, directoryFlushError)) {
        error = "file removed but parent directory flush failed: " + directoryFlushError.message();
        return false;
    }
    error.clear();
    return true;
}

} // namespace infernux

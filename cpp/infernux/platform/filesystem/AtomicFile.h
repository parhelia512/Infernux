#pragma once

#include <string>
#include <string_view>

namespace infernux
{

/// Write UTF-8 text through a unique same-directory temporary file and atomically replace the target.
bool WriteTextFileAtomically(const std::string &path, std::string_view content, std::string &error);

/// Remove a file and persist the directory update where the platform exposes directory fsync.
/// Missing files are treated as already removed.
bool RemoveFileDurably(const std::string &path, std::string &error);

} // namespace infernux

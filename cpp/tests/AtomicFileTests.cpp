#include <platform/filesystem/AtomicFile.h>

#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>

namespace
{

bool Expect(bool condition, const char *message)
{
    if (!condition) {
        std::cerr << message << '\n';
        return false;
    }
    return true;
}

std::string ReadText(const std::filesystem::path &path)
{
    std::ifstream file(path, std::ios::binary);
    return std::string(std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>());
}

} // namespace

int main()
{
    const auto suffix = std::chrono::steady_clock::now().time_since_epoch().count();
    const std::filesystem::path directory =
        std::filesystem::temp_directory_path() / ("infernux_atomic_file_" + std::to_string(suffix));
    std::filesystem::create_directory(directory);

    const std::filesystem::path target = directory / std::filesystem::path(u8"可靠写入.txt");
    std::string error;
    bool passed = true;

    passed &= Expect(infernux::WriteTextFileAtomically(target.u8string(), "first", error), error.c_str());
    passed &= Expect(ReadText(target) == "first", "initial atomic write content mismatch");
    passed &= Expect(infernux::WriteTextFileAtomically(target.u8string(), "second", error), error.c_str());
    passed &= Expect(ReadText(target) == "second", "replacement atomic write content mismatch");
    passed &= Expect(infernux::RemoveFileDurably(target.u8string(), error), error.c_str());
    passed &= Expect(!std::filesystem::exists(target), "durable removal left the target behind");
    passed &= Expect(infernux::RemoveFileDurably(target.u8string(), error), "durable removal rejected a missing file");

    size_t temporaryCount = 0;
    for (const auto &entry : std::filesystem::directory_iterator(directory)) {
        if (entry.path().filename().u8string().find(".tmp.") != std::string::npos)
            ++temporaryCount;
    }
    passed &= Expect(temporaryCount == 0, "successful writes left temporary files behind");

    const std::filesystem::path missingTarget = directory / "missing" / "failure.txt";
    passed &= Expect(!infernux::WriteTextFileAtomically(missingTarget.u8string(), "failure", error),
                     "write to missing parent unexpectedly succeeded");

    std::filesystem::remove(directory);
    return passed ? 0 : 1;
}

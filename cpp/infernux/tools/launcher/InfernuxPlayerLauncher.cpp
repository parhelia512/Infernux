#ifdef _WIN32

#include <windows.h>

#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace
{
std::wstring Quote(const fs::path &path)
{
    return L"\"" + path.wstring() + L"\"";
}

void ShowLaunchError(const std::wstring &message)
{
    MessageBoxW(nullptr, message.c_str(), L"Infernux Player", MB_OK | MB_ICONERROR);
}
} // namespace

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR arguments, int)
{
    std::vector<wchar_t> executableBuffer(32768, L'\0');
    const DWORD length =
        GetModuleFileNameW(nullptr, executableBuffer.data(), static_cast<DWORD>(executableBuffer.size()));
    if (length == 0 || length >= executableBuffer.size()) {
        ShowLaunchError(L"Unable to resolve the Player executable path.");
        return 2;
    }

    const fs::path launcherPath(std::wstring(executableBuffer.data(), length));
    const fs::path installRoot = launcherPath.parent_path();
    const fs::path dataRoot = installRoot / (launcherPath.stem().wstring() + L"_Data");
    const fs::path runtimeRoot = dataRoot / L"Runtime";
    const fs::path moduleRoot = dataRoot / L"RuntimeModules";
    const fs::path runtimeExecutable = runtimeRoot / L"InfernuxPlayer.exe";

    if (!fs::is_regular_file(runtimeExecutable)) {
        ShowLaunchError(L"The Infernux Player runtime is missing:\n" + runtimeExecutable.wstring());
        return 3;
    }

    SetEnvironmentVariableW(L"_INFERNUX_PLAYER_INSTALL_ROOT", installRoot.c_str());
    SetEnvironmentVariableW(L"_INFERNUX_PLAYER_DATA_ROOT", dataRoot.c_str());
    SetEnvironmentVariableW(L"_INFERNUX_PLAYER_RUNTIME_ROOT", runtimeRoot.c_str());
    SetEnvironmentVariableW(L"_INFERNUX_PLAYER_MODULE_ROOT", moduleRoot.c_str());

    const DWORD pathLength = GetEnvironmentVariableW(L"PATH", nullptr, 0);
    std::wstring searchPath = runtimeRoot.wstring();
    if (pathLength > 1) {
        std::vector<wchar_t> pathBuffer(pathLength, L'\0');
        GetEnvironmentVariableW(L"PATH", pathBuffer.data(), pathLength);
        searchPath += L";";
        searchPath += pathBuffer.data();
    }
    SetEnvironmentVariableW(L"PATH", searchPath.c_str());

    std::wstring commandLine = Quote(runtimeExecutable);
    if (arguments != nullptr && arguments[0] != L'\0') {
        commandLine += L" ";
        commandLine += arguments;
    }
    std::vector<wchar_t> commandBuffer(commandLine.begin(), commandLine.end());
    commandBuffer.push_back(L'\0');

    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process{};
    if (!CreateProcessW(runtimeExecutable.c_str(), commandBuffer.data(), nullptr, nullptr, FALSE,
                        CREATE_UNICODE_ENVIRONMENT, nullptr, installRoot.c_str(), &startup, &process)) {
        ShowLaunchError(L"Unable to start the Infernux Player runtime. Windows error: " +
                        std::to_wstring(GetLastError()));
        return 4;
    }

    CloseHandle(process.hThread);
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD exitCode = 1;
    GetExitCodeProcess(process.hProcess, &exitCode);
    CloseHandle(process.hProcess);
    return static_cast<int>(exitCode);
}

#endif

#pragma once

/**
 * @file EditorThemeRegistry.h
 * @brief Single source of truth for editor theme values shared C++ ↔ Python.
 *
 * Values live in EditorThemeTable.inl (X-macro list). C++ panels may keep
 * using the constexpr constants in EditorTheme.h for hot paths; Python's
 * Theme class overrides its class attributes from this registry at import,
 * so editing Python code can never drift the engine's look — restyling
 * happens in EditorThemeTable.inl only.
 */

#include <imgui.h>
#include <string>
#include <unordered_map>

namespace infernux
{

class EditorThemeRegistry
{
  public:
    static const std::unordered_map<std::string, ImVec4> &Colors();
    static const std::unordered_map<std::string, ImVec2> &Vec2s();
    static const std::unordered_map<std::string, float> &Floats();
};

} // namespace infernux

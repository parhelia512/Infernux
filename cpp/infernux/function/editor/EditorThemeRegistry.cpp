#include "EditorThemeRegistry.h"

namespace infernux
{

const std::unordered_map<std::string, ImVec4> &EditorThemeRegistry::Colors()
{
    // Intentionally leaked (engine-lifetime, see SceneManager::Instance).
    static const auto *colors = [] {
        auto *m = new std::unordered_map<std::string, ImVec4>();
#define INX_THEME_COLOR(name, r, g, b, a) m->emplace(#name, ImVec4(r, g, b, a));
#define INX_THEME_VEC2(name, x, y)
#define INX_THEME_FLOAT(name, v)
#include "EditorThemeTable.inl"
#undef INX_THEME_COLOR
#undef INX_THEME_VEC2
#undef INX_THEME_FLOAT
        return m;
    }();
    return *colors;
}

const std::unordered_map<std::string, ImVec2> &EditorThemeRegistry::Vec2s()
{
    static const auto *vec2s = [] {
        auto *m = new std::unordered_map<std::string, ImVec2>();
#define INX_THEME_COLOR(name, r, g, b, a)
#define INX_THEME_VEC2(name, x, y) m->emplace(#name, ImVec2(x, y));
#define INX_THEME_FLOAT(name, v)
#include "EditorThemeTable.inl"
#undef INX_THEME_COLOR
#undef INX_THEME_VEC2
#undef INX_THEME_FLOAT
        return m;
    }();
    return *vec2s;
}

const std::unordered_map<std::string, float> &EditorThemeRegistry::Floats()
{
    static const auto *floats = [] {
        auto *m = new std::unordered_map<std::string, float>();
#define INX_THEME_COLOR(name, r, g, b, a)
#define INX_THEME_VEC2(name, x, y)
#define INX_THEME_FLOAT(name, v) m->emplace(#name, v);
#include "EditorThemeTable.inl"
#undef INX_THEME_COLOR
#undef INX_THEME_VEC2
#undef INX_THEME_FLOAT
        return m;
    }();
    return *floats;
}

} // namespace infernux

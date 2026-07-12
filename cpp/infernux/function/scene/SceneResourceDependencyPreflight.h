#pragma once

#include <nlohmann/json.hpp>

namespace infernux
{

void PreflightSceneResourceDependencies(const nlohmann::json &document);

} // namespace infernux

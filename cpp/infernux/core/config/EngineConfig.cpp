#include "EngineConfig.h"

namespace infernux
{

EngineConfig &EngineConfig::Get()
{
    static EngineConfig instance;
    return instance;
}

} // namespace infernux

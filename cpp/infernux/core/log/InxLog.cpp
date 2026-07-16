#include "InxLog.h"

namespace infernux
{

InxLog &InxLog::GetInstance()
{
    static InxLog instance;
    return instance;
}

} // namespace infernux

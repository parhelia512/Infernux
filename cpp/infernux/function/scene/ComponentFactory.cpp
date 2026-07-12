#include "ComponentFactory.h"
#include "Component.h"
#include <stdexcept>
#include <unordered_map>

namespace infernux
{
namespace
{
struct ComponentRegistration
{
    ComponentFactory::Creator creator;
    ComponentFactory::DocumentValidator validator;
};

std::unordered_map<std::string, ComponentRegistration> &GetRegistry()
{
    static std::unordered_map<std::string, ComponentRegistration> registry;
    return registry;
}
} // namespace

bool ComponentFactory::Register(const std::string &typeName, Creator creator, DocumentValidator validator)
{
    if (typeName.empty() || !creator || !validator)
        throw std::invalid_argument("component registration requires type name, creator, and document validator");
    auto &registry = GetRegistry();
    const bool inserted =
        registry.emplace(typeName, ComponentRegistration{std::move(creator), std::move(validator)}).second;
    if (!inserted)
        throw std::logic_error("duplicate component registration: " + typeName);
    return true;
}

std::unique_ptr<Component> ComponentFactory::Create(const std::string &typeName)
{
    auto &registry = GetRegistry();
    auto it = registry.find(typeName);
    if (it == registry.end())
        return nullptr;
    return it->second.creator();
}

void ComponentFactory::ValidateDocument(const std::string &typeName, const nlohmann::json &document)
{
    const auto &registry = GetRegistry();
    const auto iterator = registry.find(typeName);
    if (iterator == registry.end())
        throw std::invalid_argument("unregistered component type: " + typeName);
    iterator->second.validator(document);
}

bool ComponentFactory::IsRegistered(const std::string &typeName)
{
    auto &registry = GetRegistry();
    return registry.find(typeName) != registry.end();
}

std::vector<std::string> ComponentFactory::GetRegisteredTypeNames()
{
    auto &registry = GetRegistry();
    std::vector<std::string> names;
    names.reserve(registry.size());
    for (const auto &pair : registry)
        names.push_back(pair.first);
    return names;
}

} // namespace infernux

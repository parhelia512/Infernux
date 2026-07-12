#pragma once

#include <functional>
#include <memory>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace infernux
{
class Component;

class ComponentFactory
{
  public:
    using Creator = std::function<std::unique_ptr<Component>()>;
    using DocumentValidator = std::function<void(const nlohmann::json &)>;

    /// @brief Register a component creator by type name
    /// @return true if registered, false if already exists
    static bool Register(const std::string &typeName, Creator creator, DocumentValidator validator);

    /// @brief Create a component by type name
    /// @return unique_ptr to component or nullptr if not registered
    static std::unique_ptr<Component> Create(const std::string &typeName);

    /// @brief Check if a component type is registered
    static bool IsRegistered(const std::string &typeName);

    static void ValidateDocument(const std::string &typeName, const nlohmann::json &document);

    /// @brief Get all registered component type names
    static std::vector<std::string> GetRegisteredTypeNames();
};

} // namespace infernux

#define INFERNUX_REGISTER_VALIDATED_COMPONENT(TYPE_STR, CLASS_TYPE)                                                    \
    namespace                                                                                                          \
    {                                                                                                                  \
    const bool s_infernux_component_registered_##CLASS_TYPE = infernux::ComponentFactory::Register(                    \
        TYPE_STR, []() { return std::make_unique<CLASS_TYPE>(); },                                                     \
        [](const nlohmann::json &document) { CLASS_TYPE::ValidateSerializedDocument(document); });                     \
    }

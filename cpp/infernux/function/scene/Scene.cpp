#include "Scene.h"
#include "ComponentFactory.h"
#include "MeshRenderer.h"
#include "SceneManager.h"
#include "TransformECSStore.h"
#include "platform/filesystem/DocumentStore.h"
#include <SDL3/SDL.h>
#include <algorithm>
#include <core/log/InxLog.h>
#include <fstream>
#include <limits>
#include <nlohmann/json.hpp>
#include <numeric>
#include <type_traits>

using json = nlohmann::json;

namespace infernux
{

Scene::~Scene()
{
    // Explicitly clear root objects to ensure destructors run while Scene members are valid
    m_rootObjects.clear();
}

GameObject *Scene::CreateGameObject(const std::string &name)
{
    auto gameObject = std::make_unique<GameObject>(name);
    gameObject->m_scene = this;

    GameObject *ptr = gameObject.get();
    m_objectsById[ptr->GetID()] = ptr;
    m_rootObjects.push_back(std::move(gameObject));
    ++m_structureVersion;

    return ptr;
}

void Scene::ReserveCapacity(size_t count)
{
    m_rootObjects.reserve(m_rootObjects.size() + count);
    m_objectsById.reserve(m_objectsById.size() + count);
    // Each GO gets ~2-3 components that queue for Start()
    m_pendingStartComponentIds.reserve(m_pendingStartComponentIds.size() + count * 3);
}

void Scene::AddGameObject(std::unique_ptr<GameObject> gameObject)
{
    if (!gameObject)
        return;

    gameObject->m_scene = this;

    GameObject *ptr = gameObject.get();
    m_objectsById[ptr->GetID()] = ptr;

    // If it has no parent, add to root objects
    if (gameObject->GetParent() == nullptr) {
        m_rootObjects.push_back(std::move(gameObject));
    }
}

void Scene::RemoveGameObject(GameObject *gameObject)
{
    if (!gameObject)
        return;

    // 1. Locate and Detach ownership
    std::unique_ptr<GameObject> ownedPtr;

    if (gameObject->GetParent()) {
        ownedPtr = gameObject->GetParent()->DetachChild(gameObject);
    } else {
        ownedPtr = DetachRootObject(gameObject);
    }
    ++m_structureVersion;

    // 2. ownedPtr goes out of scope -> deleted.
}

void Scene::DestroyGameObject(GameObject *gameObject)
{
    if (!gameObject)
        return;

    // Queue for removal at frame-end, not immediate
    const uint64_t id = gameObject->GetID();
    if (m_pendingDestroySet.insert(id).second) {
        m_pendingDestroy.push_back(id);

        // Unity-like behavior: once Destroy() is requested, object is treated as
        // inactive for this frame's remaining callbacks.  This triggers OnDisable
        // immediately for active components; OnDestroy still runs at frame-end.
        if (gameObject->IsActiveInHierarchy()) {
            gameObject->SetActive(false);
        }
    }
    ++m_structureVersion;
}

std::unique_ptr<GameObject> Scene::DetachRootObject(GameObject *gameObject)
{
    auto it = std::find_if(m_rootObjects.begin(), m_rootObjects.end(),
                           [gameObject](const std::unique_ptr<GameObject> &obj) { return obj.get() == gameObject; });

    if (it != m_rootObjects.end()) {
        std::unique_ptr<GameObject> ret = std::move(*it);
        m_rootObjects.erase(it);
        ++m_structureVersion;
        return ret;
    }
    return nullptr;
}

void Scene::AttachRootObject(std::unique_ptr<GameObject> gameObject)
{
    if (!gameObject)
        return;
    gameObject->SetScene(this); // Ensure scene is set
    m_rootObjects.push_back(std::move(gameObject));
    ++m_structureVersion;
}

void Scene::SetRootObjectSiblingIndex(GameObject *gameObject, int newIndex)
{
    int currentIndex = -1;
    for (size_t i = 0; i < m_rootObjects.size(); ++i) {
        if (m_rootObjects[i].get() == gameObject) {
            currentIndex = static_cast<int>(i);
            break;
        }
    }
    if (currentIndex < 0)
        return;
    newIndex = std::max(0, std::min(newIndex, static_cast<int>(m_rootObjects.size()) - 1));
    if (currentIndex == newIndex)
        return;
    auto ptr = std::move(m_rootObjects[currentIndex]);
    m_rootObjects.erase(m_rootObjects.begin() + currentIndex);
    m_rootObjects.insert(m_rootObjects.begin() + newIndex, std::move(ptr));
    ++m_structureVersion;
}

void Scene::UnregisterGameObject(uint64_t id)
{
    m_objectsById.erase(id);
}

void Scene::RegisterGameObject(GameObject *gameObject)
{
    if (!gameObject)
        return;
    m_objectsById[gameObject->GetID()] = gameObject;
}

std::vector<GameObject *> Scene::GetAllObjects() const
{
    std::vector<GameObject *> result;
    result.reserve(m_objectsById.size());

    for (const auto &root : m_rootObjects) {
        CollectAllObjects(root.get(), result);
    }

    return result;
}

void Scene::CollectAllObjects(GameObject *obj, std::vector<GameObject *> &result) const
{
    if (!obj)
        return;

    result.push_back(obj);

    for (const auto &child : obj->GetChildren()) {
        CollectAllObjects(child.get(), result);
    }
}

GameObject *Scene::Find(const std::string &name) const
{
    for (const auto &root : m_rootObjects) {
        if (root->GetName() == name) {
            return root.get();
        }

        // Search in children recursively
        GameObject *found = root->FindDescendant(name);
        if (found)
            return found;
    }
    return nullptr;
}

std::vector<GameObject *> Scene::FindAll(const std::string &name) const
{
    std::vector<GameObject *> result;
    std::vector<GameObject *> allObjects = GetAllObjects();

    for (GameObject *obj : allObjects) {
        if (obj->GetName() == name) {
            result.push_back(obj);
        }
    }

    return result;
}

GameObject *Scene::FindByID(uint64_t id) const
{
    auto it = m_objectsById.find(id);
    if (it != m_objectsById.end()) {
        return it->second;
    }
    return nullptr;
}

GameObject *Scene::FindWithTag(const std::string &tag) const
{
    for (const auto &[id, obj] : m_objectsById) {
        if (obj && obj->GetTag() == tag) {
            return obj;
        }
    }
    return nullptr;
}

std::vector<GameObject *> Scene::FindGameObjectsWithTag(const std::string &tag) const
{
    std::vector<GameObject *> result;
    for (const auto &[id, obj] : m_objectsById) {
        if (obj && obj->GetTag() == tag) {
            result.push_back(obj);
        }
    }
    return result;
}

std::vector<GameObject *> Scene::FindGameObjectsInLayer(int layer) const
{
    std::vector<GameObject *> result;
    for (const auto &[id, obj] : m_objectsById) {
        if (obj && obj->GetLayer() == layer) {
            result.push_back(obj);
        }
    }
    return result;
}

void Scene::Start()
{
    if (m_hasStarted)
        return;

    m_isLoaded = true;
    m_hasStarted = true;

    // ---- Unity-correct 2-pass lifecycle ----
    // Pass 1: Awake + OnEnable on every object/component
    for (size_t i = 0; i < m_rootObjects.size(); ++i) {
        AwakeObject(m_rootObjects[i].get());
    }
    // Pass 2: Start on every enabled component (all Awake calls finished)
    for (size_t i = 0; i < m_rootObjects.size(); ++i) {
        StartObject(m_rootObjects[i].get());
    }
}

void Scene::AwakeObject(GameObject *obj)
{
    if (!obj)
        return;

    // Unity: Awake is only called on GameObjects that are active in the hierarchy.
    // Inactive objects will have Awake deferred until they are first activated
    // (handled by GameObject::HandleActiveStateChanged).
    if (!obj->IsActiveInHierarchy())
        return;

    std::vector<Component *> components = obj->GetComponentsInExecutionOrder();
    for (Component *component : components) {
        if (component) {
            component->CallAwake();
        }
    }

    const auto &children = obj->GetChildren();
    for (size_t i = 0; i < children.size(); ++i) {
        AwakeObject(children[i].get());
    }
}

void Scene::StartObject(GameObject *obj)
{
    if (!obj)
        return;

    const bool activeInHierarchy = obj->IsActiveInHierarchy();

    std::vector<Component *> components = obj->GetComponentsInExecutionOrder();
    for (Component *component : components) {
        if (component && activeInHierarchy && component->IsEnabled()) {
            component->CallStart();
        }
    }

    const auto &children = obj->GetChildren();
    for (size_t i = 0; i < children.size(); ++i) {
        StartObject(children[i].get());
    }
}

void Scene::Update(float deltaTime)
{
    if (!m_isPlaying)
        return;

    TransformECSStore::Instance().SyncSceneWorldMatrices(this);

    // Flush deferred Start() calls for components that were added/enabled
    // during previous callbacks.
    ProcessPendingStarts();

    // Snapshot root count so objects instantiated mid-frame are not updated
    // until the next frame (Unity-style frame consistency).
    const size_t rootCount = m_rootObjects.size();
    for (size_t i = 0; i < rootCount && i < m_rootObjects.size(); ++i) {
        UpdateObject(m_rootObjects[i].get(), deltaTime);
    }
}

void Scene::FixedUpdate(float fixedDeltaTime)
{
    if (!m_isPlaying)
        return;

    TransformECSStore::Instance().SyncSceneWorldMatrices(this);

    const size_t rootCount = m_rootObjects.size();
    for (size_t i = 0; i < rootCount && i < m_rootObjects.size(); ++i) {
        FixedUpdateObject(m_rootObjects[i].get(), fixedDeltaTime);
    }
}

void Scene::TraverseActiveObjects(GameObject *obj, float dt, void (GameObject::*updateMethod)(float))
{
    if (!obj || !obj->IsActiveInHierarchy() || IsPendingDestroy(obj))
        return;

    (obj->*updateMethod)(dt);

    const auto &children = obj->GetChildren();
    const size_t childCount = children.size();
    for (size_t i = 0; i < childCount && i < children.size(); ++i) {
        TraverseActiveObjects(children[i].get(), dt, updateMethod);
    }
}

void Scene::FixedUpdateObject(GameObject *obj, float fixedDeltaTime)
{
    TraverseActiveObjects(obj, fixedDeltaTime, &GameObject::FixedUpdate);
}

void Scene::UpdateObject(GameObject *obj, float deltaTime)
{
    TraverseActiveObjects(obj, deltaTime, &GameObject::Update);
}

void Scene::LateUpdate(float deltaTime)
{
    if (!m_isPlaying)
        return;

    TransformECSStore::Instance().SyncSceneWorldMatrices(this);

    const size_t rootCount = m_rootObjects.size();
    for (size_t i = 0; i < rootCount && i < m_rootObjects.size(); ++i) {
        LateUpdateObject(m_rootObjects[i].get(), deltaTime);
    }
}

void Scene::EditorUpdate(float deltaTime)
{
    if (m_isPlaying)
        return;

    TransformECSStore::Instance().SyncSceneWorldMatrices(this);

    const size_t rootCount = m_rootObjects.size();
    for (size_t i = 0; i < rootCount && i < m_rootObjects.size(); ++i) {
        EditorUpdateObject(m_rootObjects[i].get(), deltaTime);
    }
}

void Scene::LateUpdateObject(GameObject *obj, float deltaTime)
{
    TraverseActiveObjects(obj, deltaTime, &GameObject::LateUpdate);
}

void Scene::EditorUpdateObject(GameObject *obj, float deltaTime)
{
    TraverseActiveObjects(obj, deltaTime, &GameObject::EditorUpdate);
}

// ============================================================================
// Shared JSON → GameObject builder (used by both Deserialize and InstantiateFromJson)
// ============================================================================

// Internal overload operating directly on a parsed json value.
std::unique_ptr<GameObject> Scene::BuildGameObjectFromJsonImpl(const json &objJson, bool preserveIds)
{
    const size_t pendingPyStart = m_pendingPyComponents.size();
    const auto fail = [&]() -> std::unique_ptr<GameObject> {
        m_pendingPyComponents.resize(pendingPyStart);
        return nullptr;
    };

    if (!objJson.is_object() || !objJson.contains("schema_version") || !objJson["schema_version"].is_number_integer() ||
        objJson["schema_version"].get<int>() != 1) {
        INXLOG_ERROR("Scene object must use schema_version 1");
        return fail();
    }

    static const std::unordered_set<std::string> allowedObjectFields = {
        "schema_version", "name",        "id",        "active",     "is_static",     "tag",      "layer",
        "prefab_guid",    "prefab_root", "transform", "components", "py_components", "children",
    };
    for (const auto &[key, value] : objJson.items()) {
        (void)value;
        if (allowedObjectFields.find(key) == allowedObjectFields.end()) {
            INXLOG_ERROR("Scene object contains unknown field '", key, "'");
            return fail();
        }
    }
    if (!objJson.contains("name") || !objJson["name"].is_string() || !objJson.contains("active") ||
        !objJson["active"].is_boolean() || !objJson.contains("is_static") || !objJson["is_static"].is_boolean() ||
        !objJson.contains("tag") || !objJson["tag"].is_string() || !objJson.contains("layer") ||
        !objJson["layer"].is_number_integer() || !objJson.contains("py_components") ||
        !objJson["py_components"].is_array()) {
        INXLOG_ERROR("Scene object is missing required typed fields");
        return fail();
    }
    if (preserveIds &&
        (!objJson.contains("id") || !objJson["id"].is_number_unsigned() || objJson["id"].get<uint64_t>() == 0)) {
        INXLOG_ERROR("Scene object must contain a non-zero unsigned id");
        return fail();
    }
    if (objJson.contains("id") && (!objJson["id"].is_number_unsigned() || objJson["id"].get<uint64_t>() == 0)) {
        INXLOG_ERROR("Scene object id must be a non-zero unsigned integer");
        return fail();
    }
    const int layer = objJson["layer"].get<int>();
    if (layer < 0 || layer >= 32) {
        INXLOG_ERROR("Scene object layer must be in [0, 31]");
        return fail();
    }
    if (objJson.contains("prefab_guid") && !objJson["prefab_guid"].is_string()) {
        INXLOG_ERROR("Scene object prefab_guid must be a string");
        return fail();
    }
    if (objJson.contains("prefab_root") && !objJson["prefab_root"].is_boolean()) {
        INXLOG_ERROR("Scene object prefab_root must be a boolean");
        return fail();
    }

    std::string name = objJson["name"].get<std::string>();
    auto obj = std::make_unique<GameObject>(name);
    obj->m_scene = this;

    // Restore original ID only when deserializing (not cloning)
    if (preserveIds && objJson.contains("id")) {
        obj->m_id = objJson["id"].get<uint64_t>();
        GameObject::EnsureNextID(obj->m_id);
    }

    obj->m_active = objJson["active"].get<bool>();
    obj->m_isStatic = objJson["is_static"].get<bool>();
    obj->m_tag = objJson["tag"].get<std::string>();
    obj->m_layer = layer;
    if (objJson.contains("prefab_guid"))
        obj->m_prefabGuid = objJson["prefab_guid"].get<std::string>();
    obj->m_prefabRoot = objJson.value("prefab_root", false);

    // Transform
    if (!objJson.contains("transform") || !objJson["transform"].is_object()) {
        INXLOG_ERROR("Scene object '", name, "' is missing a valid transform document");
        return fail();
    }
    json tJson = objJson["transform"];
    if (!preserveIds)
        tJson.erase("component_id");
    if (!obj->m_transform.DeserializeDocument(tJson)) {
        INXLOG_ERROR("Failed to deserialize transform on scene object '", name, "'");
        return fail();
    }

    // C++ components (factory-based)
    if (!objJson.contains("components") || !objJson["components"].is_array()) {
        INXLOG_ERROR("Scene object '", name, "' is missing its components array");
        return fail();
    }
    {
        for (const auto &compJson : objJson["components"]) {
            std::string typeName = compJson.value("type", std::string());
            if (typeName.empty() || typeName == "Transform") {
                INXLOG_ERROR("Scene object '", name, "' contains an invalid component type");
                return fail();
            }
            std::unique_ptr<Component> comp = ComponentFactory::Create(typeName);
            if (!comp) {
                INXLOG_ERROR("Scene object '", name, "' references unknown component type '", typeName, "'");
                return fail();
            }
            json cJson = compJson;
            if (!preserveIds) {
                cJson.erase("component_id");
            }
            comp->SetGameObject(obj.get());
            if (!comp->DeserializeDocument(cJson)) {
                INXLOG_ERROR("Failed to deserialize component '", typeName, "' on scene object '", name, "'");
                return fail();
            }
            obj->m_components.push_back(std::move(comp));
        }
    }

    // Python components — store as pending for Python-side reconstruction
    {
        static const std::unordered_set<std::string> allowedPyComponentFields = {
            "schema_version", "type",      "enabled",     "execution_order", "component_id",
            "py_type_name",   "type_guid", "script_guid", "py_fields",
        };
        uint64_t objId = obj->m_id ? obj->m_id : obj->GetID();
        for (const auto &pyCompJson : objJson["py_components"]) {
            if (!pyCompJson.is_object()) {
                INXLOG_ERROR("Python component descriptor must be an object");
                return fail();
            }
            for (const auto &[key, value] : pyCompJson.items()) {
                (void)value;
                if (allowedPyComponentFields.find(key) == allowedPyComponentFields.end()) {
                    INXLOG_ERROR("Python component descriptor contains unknown field '", key, "'");
                    return fail();
                }
            }
            if (!pyCompJson.contains("schema_version") || !pyCompJson["schema_version"].is_number_integer() ||
                pyCompJson["schema_version"].get<int>() != 1 || !pyCompJson.contains("type") ||
                !pyCompJson["type"].is_string() || !pyCompJson.contains("enabled") ||
                !pyCompJson["enabled"].is_boolean() || !pyCompJson.contains("execution_order") ||
                !pyCompJson["execution_order"].is_number_integer() || !pyCompJson.contains("py_type_name") ||
                !pyCompJson["py_type_name"].is_string() || !pyCompJson.contains("type_guid") ||
                !pyCompJson["type_guid"].is_string() || !pyCompJson.contains("script_guid") ||
                !pyCompJson["script_guid"].is_string() || !pyCompJson.contains("py_fields") ||
                !pyCompJson["py_fields"].is_object()) {
                INXLOG_ERROR("Python component descriptor is missing required typed fields");
                return fail();
            }
            const std::string pyTypeName = pyCompJson["py_type_name"].get<std::string>();
            if (pyTypeName.empty() || pyCompJson["type"].get<std::string>() != pyTypeName) {
                INXLOG_ERROR("Python component type and py_type_name must be the same non-empty string");
                return fail();
            }
            if (pyCompJson["script_guid"].get_ref<const std::string &>().empty() ||
                pyCompJson["type_guid"].get_ref<const std::string &>().empty()) {
                INXLOG_ERROR("Python component script_guid and type_guid must be non-empty");
                return fail();
            }
            if (preserveIds &&
                (!pyCompJson.contains("component_id") || !pyCompJson["component_id"].is_number_unsigned() ||
                 pyCompJson["component_id"].get<uint64_t>() == 0)) {
                INXLOG_ERROR("Python component must contain a non-zero unsigned component_id");
                return fail();
            }
            if (pyCompJson.contains("component_id") &&
                (!pyCompJson["component_id"].is_number_unsigned() || pyCompJson["component_id"].get<uint64_t>() == 0)) {
                INXLOG_ERROR("Python component component_id must be a non-zero unsigned integer");
                return fail();
            }
            const auto &fields = pyCompJson["py_fields"];
            if (!fields.contains("__schema_version__") || !fields["__schema_version__"].is_number_integer() ||
                fields["__schema_version__"].get<int>() <= 0 || !fields.contains("__type_name__") ||
                !fields["__type_name__"].is_string() || fields["__type_name__"].get<std::string>() != pyTypeName) {
                INXLOG_ERROR("Python component py_fields schema/type metadata is invalid");
                return fail();
            }
            const bool hasComponentId = pyCompJson.contains("component_id");
            const bool fieldsHaveComponentId = fields.contains("__component_id__");
            if (hasComponentId != fieldsHaveComponentId ||
                (hasComponentId &&
                 (!fields["__component_id__"].is_number_unsigned() || fields["__component_id__"].get<uint64_t>() == 0 ||
                  fields["__component_id__"].get<uint64_t>() != pyCompJson["component_id"].get<uint64_t>()))) {
                INXLOG_ERROR("Python component component_id metadata is inconsistent");
                return fail();
            }
            PendingPyComponent pending;
            pending.gameObjectId = objId;
            pending.typeName = pyTypeName;
            pending.scriptGuid = pyCompJson["script_guid"].get<std::string>();
            pending.typeGuid = pyCompJson["type_guid"].get<std::string>();
            pending.enabled = pyCompJson["enabled"].get<bool>();
            pending.fieldsDocument = fields;
            m_pendingPyComponents.push_back(pending);
        }
    }

    // Recurse children
    if (!objJson.contains("children") || !objJson["children"].is_array()) {
        INXLOG_ERROR("Scene object '", name, "' is missing its children array");
        return fail();
    }
    {
        for (const auto &childJson : objJson["children"]) {
            auto child = BuildGameObjectFromJsonImpl(childJson, preserveIds);
            if (!child)
                return fail();
            obj->AttachChild(std::move(child));
        }
    }

    return obj;
}

std::unique_ptr<GameObject> Scene::BuildGameObjectFromJson(const std::string &jsonStr, bool preserveIds)
{
    json objJson = json::parse(jsonStr);
    return BuildGameObjectFromJsonImpl(objJson, preserveIds);
}

void Scene::RegisterObjectSubtree(GameObject *root)
{
    if (!root)
        return;
    RegisterGameObject(root);
    for (const auto &child : root->GetChildren())
        RegisterObjectSubtree(child.get());
}

void Scene::ProcessPendingDestroys()
{
    std::vector<uint64_t> currentPending;
    currentPending.swap(m_pendingDestroy); // To ensure we don't loop forever if destroy triggers destroy

    for (uint64_t id : currentPending) {
        m_pendingDestroySet.erase(id);
        GameObject *obj = FindByID(id);
        if (obj) {
            RemoveGameObject(obj);
        }
    }
}

bool Scene::IsPendingDestroy(const GameObject *obj) const
{
    if (!obj)
        return false;

    const GameObject *current = obj;
    while (current) {
        if (m_pendingDestroySet.find(current->GetID()) != m_pendingDestroySet.end()) {
            return true;
        }
        current = current->GetParent();
    }
    return false;
}

void Scene::QueueComponentStart(Component *component)
{
    if (!component)
        return;

    const uint64_t id = component->GetComponentID();
    if (id == 0)
        return;

    if (m_pendingStartComponentIdSet.insert(id).second) {
        m_pendingStartComponentIds.push_back(id);
    }
}

void Scene::ProcessPendingStarts()
{
    if (m_pendingStartComponentIds.empty())
        return;

    std::vector<uint64_t> pending;
    pending.swap(m_pendingStartComponentIds);
    m_pendingStartComponentIdSet.clear();

    // Build a component-pointer cache so the sort and dispatch each do O(1) lookups.
    std::vector<Component *> comps;
    comps.reserve(pending.size());
    for (uint64_t id : pending) {
        comps.push_back(Component::FindByComponentId(id));
    }

    // Stable-sort by execution order, then by component ID.
    std::vector<size_t> indices(pending.size());
    std::iota(indices.begin(), indices.end(), size_t(0));
    std::stable_sort(indices.begin(), indices.end(), [&](size_t i, size_t j) {
        Component *a = comps[i];
        Component *b = comps[j];
        if (!a || !b)
            return pending[i] < pending[j];
        if (a->GetExecutionOrder() != b->GetExecutionOrder())
            return a->GetExecutionOrder() < b->GetExecutionOrder();
        return a->GetComponentID() < b->GetComponentID();
    });

    for (size_t idx : indices) {
        Component *component = comps[idx];
        if (!component)
            continue;

        GameObject *go = component->GetGameObject();
        if (!go)
            continue;

        if (!m_isPlaying || !m_hasStarted)
            continue;

        if (component->IsEnabled() && go->IsActiveInHierarchy() && component->HasAwake()) {
            component->CallStart();
        }
    }
}

void Scene::QueueStartObject(GameObject *obj)
{
    if (!obj || !obj->IsActiveInHierarchy())
        return;

    std::vector<Component *> components = obj->GetComponentsInExecutionOrder();
    for (Component *component : components) {
        if (component && component->IsEnabled() && component->HasAwake()) {
            QueueComponentStart(component);
        }
    }

    const auto &children = obj->GetChildren();
    for (size_t i = 0; i < children.size(); ++i) {
        QueueStartObject(children[i].get());
    }
}

Component *Scene::FindComponentByID(uint64_t componentId) const
{
    if (componentId == 0)
        return nullptr;

    return Component::FindByComponentId(componentId);
}

// ============================================================================
// Instantiate (deep clone) — Unity: Object.Instantiate()
// ============================================================================

GameObject *Scene::InstantiateGameObject(GameObject *source, GameObject *parent)
{
    if (!source)
        return nullptr;

    // Native deep clone — no JSON serialization round-trip.
    auto clone = source->Clone(this);
    if (!clone)
        return nullptr;

    // Unity: cloned root object gets " (Clone)" suffix
    clone->SetName(source->GetName() + " (Clone)");

    // Register all cloned objects in scene lookup
    GameObject *ptr = clone.get();
    auto registerAll = [&](auto &&self, GameObject *go) -> void {
        if (!go)
            return;
        RegisterGameObject(go);
        for (const auto &child : go->GetChildren()) {
            self(self, child.get());
        }
    };
    registerAll(registerAll, ptr);

    // Attach to scene hierarchy
    if (parent) {
        parent->AttachChild(std::move(clone));
    } else {
        m_rootObjects.push_back(std::move(clone));
    }

    // Awake C++ components so they register with subsystems
    AwakeObject(ptr);
    if (m_isPlaying && m_hasStarted) {
        QueueStartObject(ptr);
    }

    ++m_structureVersion;

    return ptr;
}

// ============================================================================
// Instantiate from JSON (prefab) — clone from raw JSON string (prefab file)
// ============================================================================

GameObject *Scene::InstantiateFromJson(const std::string &jsonStr, GameObject *parent)
{
    try {
        return InstantiateFromDocument(json::parse(jsonStr), parent);
    } catch (const std::exception &e) {
        INXLOG_ERROR("Scene::InstantiateFromJson: JSON parse error: ", e.what());
        return nullptr;
    }
}

GameObject *Scene::InstantiateFromDocument(const nlohmann::json &document, GameObject *parent)
{
    auto clone = BuildGameObjectFromJsonImpl(document, /*preserveIds=*/false);
    if (!clone)
        return nullptr;

    GameObject *ptr = clone.get();
    RegisterObjectSubtree(ptr);

    if (parent) {
        parent->AttachChild(std::move(clone));
    } else {
        m_rootObjects.push_back(std::move(clone));
    }

    AwakeObject(ptr);
    if (m_isPlaying && m_hasStarted) {
        QueueStartObject(ptr);
    }

    ++m_structureVersion;

    return ptr;
}

nlohmann::json Scene::SerializeDocument() const
{
    json j;
    j["schema_version"] = 1;
    j["name"] = m_name;
    j["isPlaying"] = m_isPlaying;

    // Serialize main camera reference via component_id (survives deserialization)
    if (m_mainCamera) {
        j["mainCameraComponentId"] = m_mainCamera->GetComponentID();
    }

    // Serialize all root objects
    json objectsArray = json::array();
    for (const auto &obj : m_rootObjects) {
        objectsArray.push_back(obj->SerializeDocument());
    }
    j["objects"] = objectsArray;

    return j;
}

std::string Scene::Serialize() const
{
    return SerializeDocument().dump(2);
}

bool Scene::DeserializeDocument(const nlohmann::json &j)
{
    try {
        if (!j.is_object() || !j.contains("schema_version") || !j["schema_version"].is_number_integer() ||
            j["schema_version"].get<int>() != 1) {
            INXLOG_ERROR("Scene::Deserialize: expected schema_version 1");
            return false;
        }
        if (!j.contains("name") || !j["name"].is_string() || !j.contains("isPlaying") || !j["isPlaying"].is_boolean() ||
            !j.contains("objects") || !j["objects"].is_array()) {
            throw std::invalid_argument("scene document is missing required fields");
        }
        static const std::unordered_set<std::string> allowedSceneFields = {
            "schema_version", "name", "isPlaying", "objects", "mainCameraComponentId",
        };
        for (const auto &[key, value] : j.items()) {
            (void)value;
            if (allowedSceneFields.find(key) == allowedSceneFields.end())
                throw std::invalid_argument("scene document contains unknown field: " + key);
        }

        // Build the complete graph with temporary IDs in an isolated Scene.
        // Transform/physics stores can hold both graphs, while temporary component
        // IDs avoid publishing over live registry entries before validation succeeds.
        Scene staging(j["name"].get<std::string>());
        staging.m_isPlaying = j["isPlaying"].get<bool>();
        staging.m_rootObjects.reserve(j["objects"].size());
        for (const auto &objJson : j["objects"]) {
            auto obj = staging.BuildGameObjectFromJsonImpl(objJson, /*preserveIds=*/false);
            if (!obj)
                throw std::invalid_argument("scene object graph validation failed");
            staging.m_rootObjects.push_back(std::move(obj));
        }

        std::unordered_set<uint64_t> objectIds;
        std::unordered_set<uint64_t> componentIds;
        std::unordered_map<uint64_t, Component *> componentsByDocumentId;
        std::unordered_map<uint64_t, uint64_t> stagedToDocumentObjectId;
        std::vector<std::pair<Component *, uint64_t>> componentIdAssignments;
        std::vector<uint64_t> pythonComponentIds;
        std::function<void(GameObject *, const json &)> collectIds;
        collectIds = [&](GameObject *obj, const json &objJson) {
            if (!objJson.contains("id") || !objJson["id"].is_number_unsigned())
                throw std::invalid_argument("scene GameObject is missing an unsigned id");
            const uint64_t objectId = objJson["id"].get<uint64_t>();
            if (objectId == 0 || !objectIds.insert(objectId).second)
                throw std::invalid_argument("scene contains a zero or duplicate GameObject id");
            stagedToDocumentObjectId.emplace(obj->m_id, objectId);
            obj->m_id = objectId;

            const auto collectComponentId = [&](Component *component, const json &componentJson) {
                if (!componentJson.contains("component_id") || !componentJson["component_id"].is_number_unsigned())
                    throw std::invalid_argument("scene component is missing an unsigned component_id");
                const uint64_t componentId = componentJson["component_id"].get<uint64_t>();
                if (componentId == 0 || !componentIds.insert(componentId).second)
                    throw std::invalid_argument("scene contains a zero or duplicate component_id");
                componentIdAssignments.emplace_back(component, componentId);
                componentsByDocumentId.emplace(componentId, component);
            };

            collectComponentId(&obj->m_transform, objJson.at("transform"));
            const auto &componentDocuments = objJson.at("components");
            if (componentDocuments.size() != obj->m_components.size())
                throw std::invalid_argument("scene component count changed during staging");
            for (size_t i = 0; i < obj->m_components.size(); ++i)
                collectComponentId(obj->m_components[i].get(), componentDocuments[i]);

            for (const auto &pythonComponentDocument : objJson.at("py_components")) {
                if (!pythonComponentDocument.contains("component_id") ||
                    !pythonComponentDocument["component_id"].is_number_unsigned()) {
                    throw std::invalid_argument("scene Python component is missing an unsigned component_id");
                }
                const uint64_t componentId = pythonComponentDocument["component_id"].get<uint64_t>();
                if (componentId == 0 || !componentIds.insert(componentId).second)
                    throw std::invalid_argument("scene contains a zero or duplicate component_id");
                pythonComponentIds.push_back(componentId);
            }

            const auto &childDocuments = objJson.at("children");
            if (childDocuments.size() != obj->m_children.size())
                throw std::invalid_argument("scene child count changed during staging");
            for (size_t i = 0; i < obj->m_children.size(); ++i)
                collectIds(obj->m_children[i].get(), childDocuments[i]);
        };
        for (size_t i = 0; i < staging.m_rootObjects.size(); ++i)
            collectIds(staging.m_rootObjects[i].get(), j["objects"][i]);
        staging.m_objectsById.reserve(objectIds.size());
        for (const auto &root : staging.m_rootObjects)
            staging.RegisterObjectSubtree(root.get());

        bool requiresFreshComponentIds = false;
        for (const auto &[component, componentId] : componentIdAssignments) {
            Component *occupant = Component::FindByComponentId(componentId);
            if (!occupant || occupant == component)
                continue;
            GameObject *owner = occupant->GetGameObject();
            Scene *ownerScene = owner ? owner->GetScene() : nullptr;
            if (ownerScene != this && ownerScene != &staging) {
                requiresFreshComponentIds = true;
                break;
            }
        }
        for (const uint64_t componentId : pythonComponentIds) {
            Component *occupant = Component::FindByComponentId(componentId);
            if (!occupant)
                continue;
            GameObject *owner = occupant->GetGameObject();
            Scene *ownerScene = owner ? owner->GetScene() : nullptr;
            if (ownerScene != this && ownerScene != &staging) {
                throw std::invalid_argument(
                    "scene Python component_id collides with a component owned by another live Scene");
            }
        }

        for (auto &pending : staging.m_pendingPyComponents) {
            const auto it = stagedToDocumentObjectId.find(pending.gameObjectId);
            if (it == stagedToDocumentObjectId.end())
                throw std::invalid_argument("pending Python component references an unknown staged object");
            pending.gameObjectId = it->second;
        }

        Component *stagedMainCamera = nullptr;
        if (j.contains("mainCameraComponentId")) {
            if (!j["mainCameraComponentId"].is_number_unsigned())
                throw std::invalid_argument("mainCameraComponentId must be unsigned");
            const uint64_t mainCameraComponentId = j["mainCameraComponentId"].get<uint64_t>();
            const auto cameraIt = componentsByDocumentId.find(mainCameraComponentId);
            if (cameraIt == componentsByDocumentId.end() || cameraIt->second->GetTypeName() != "Camera")
                throw std::invalid_argument("mainCameraComponentId does not reference a Camera");
            stagedMainCamera = cameraIt->second;
        }

        // Loading a copy while its source Scene is still alive cannot preserve
        // globally unique component IDs. Keep every staging ID in that case so
        // the copied graph is internally consistent and no live registry entry
        // is overwritten.
        if (requiresFreshComponentIds) {
            for (auto &[component, componentId] : componentIdAssignments)
                componentId = component->GetComponentID();
        }

        auto &componentRegistry = Component::GetInstanceRegistry();
        componentRegistry.reserve(componentRegistry.size() + componentIdAssignments.size());
        using ComponentRegistry = std::remove_reference_t<decltype(componentRegistry)>;
        std::vector<ComponentRegistry::node_type> stagedRegistryNodes;
        stagedRegistryNodes.reserve(componentIdAssignments.size());
        for (const auto &[component, componentId] : componentIdAssignments) {
            (void)componentId;
            auto node = componentRegistry.extract(component->m_componentId);
            if (node.empty())
                throw std::logic_error("staging component was not present in the instance registry");
            stagedRegistryNodes.push_back(std::move(node));
        }

        // Commit starts here. All schema/factory/component validation has completed.
        m_mainCamera = nullptr;
        SceneManager::Instance().ClearComponentRegistries();
        m_rootObjects.clear();
        m_objectsById.clear();
        m_pendingDestroy.clear();
        m_pendingDestroySet.clear();
        m_pendingStartComponentIds.clear();
        m_pendingPyComponents.clear();
        m_hasStarted = false;

        m_name = std::move(staging.m_name);
        m_isPlaying = staging.m_isPlaying;
        m_pendingPyComponents = std::move(staging.m_pendingPyComponents);
        for (size_t i = 0; i < componentIdAssignments.size(); ++i) {
            auto &[component, componentId] = componentIdAssignments[i];
            component->m_componentId = componentId;
            Component::EnsureNextComponentID(componentId);
            auto &node = stagedRegistryNodes[i];
            node.key() = componentId;
            node.mapped() = component;
            componentRegistry.insert(std::move(node));
        }
        m_objectsById = std::move(staging.m_objectsById);
        for (auto &root : staging.m_rootObjects) {
            root->SetScene(this);
            m_rootObjects.push_back(std::move(root));
        }

        // ── Step 5: native Awake pass. ──
        // PyComponentProxy instances are NOT in m_rootObjects yet — they live
        // in m_pendingPyComponents and the Python side restores them after we
        // return.  This loop touches C++ components only and re-populates the
        // MeshRenderer/Rigidbody/Collider registries that the renderer and
        // physics step rely on.
        for (const auto &root : m_rootObjects) {
            AwakeObject(root.get());
        }

        // Restore main camera reference from component ID
        if (stagedMainCamera)
            m_mainCamera = static_cast<Camera *>(stagedMainCamera);

        ++m_structureVersion; // Scene was fully rebuilt

        return true;
    } catch (const std::exception &e) {
        INXLOG_ERROR("Scene::Deserialize failed for scene '", m_name, "': ", e.what());
        return false;
    }
}

bool Scene::SaveToFile(const std::string &path) const
{
    try {
        const std::string jsonStr = SerializeDocument().dump(2);
        DocumentStore::Instance().WriteAndWait(path, jsonStr);
        return true;
    } catch (const std::exception &e) {
        INXLOG_ERROR("Scene::SaveToFile failed for '", path, "': ", e.what());
        return false;
    }
}

Camera *Scene::FindGameCamera(Camera *editorCam)
{
    // Fast path: cached main camera is still valid and active
    if (m_mainCamera && m_mainCamera != editorCam) {
        // Verify the camera's GameObject is still active and the component is enabled
        GameObject *go = m_mainCamera->GetGameObject();
        if (go && go->IsActiveInHierarchy() && m_mainCamera->IsEnabled()) {
            return m_mainCamera;
        }
        // Cached main camera is no longer valid — clear and re-discover
        m_mainCamera = nullptr;
    }

    // Auto-discover: find highest-priority (lowest depth) active Camera component
    auto objects = FindObjectsWithComponent<Camera>();
    Camera *bestCam = nullptr;
    float bestDepth = std::numeric_limits<float>::max();

    for (auto *obj : objects) {
        if (!obj->IsActiveInHierarchy())
            continue;

        Camera *c = obj->GetComponent<Camera>();
        if (!c || !c->IsEnabled() || c == editorCam)
            continue;

        if (c->GetDepth() < bestDepth) {
            bestDepth = c->GetDepth();
            bestCam = c;
        }
    }

    if (bestCam) {
        m_mainCamera = bestCam;
        INXLOG_DEBUG("Game camera auto-assigned from GameObject '", bestCam->GetGameObject()->GetName(),
                     "' (depth=", bestDepth, ")");
    }

    return bestCam;
}

} // namespace infernux

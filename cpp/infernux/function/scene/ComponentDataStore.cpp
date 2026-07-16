#include "ComponentDataStore.h"

#include <algorithm>
#include <cstring>
#include <stdexcept>

namespace infernux
{

ComponentDataStore &ComponentDataStore::Instance()
{
    // Intentionally leaked until EngineServices owns subsystem shutdown order.
    static ComponentDataStore *instance = new ComponentDataStore();
    return *instance;
}

size_t ComponentDataStore::ElementSize(DataType type)
{
    switch (type) {
    case DataType::Float64:
        return sizeof(double);
    case DataType::Int64:
        return sizeof(int64_t);
    case DataType::Bool:
        return sizeof(uint8_t);
    case DataType::Vec2:
        return sizeof(float) * 2;
    case DataType::Vec3:
        return sizeof(float) * 3;
    case DataType::Vec4:
        return sizeof(float) * 4;
    }
    throw std::invalid_argument("ComponentDataStore: invalid field data type");
}

std::byte *ComponentDataStore::FieldStorage::Bytes()
{
    return reinterpret_cast<std::byte *>(data.data());
}

const std::byte *ComponentDataStore::FieldStorage::Bytes() const
{
    return reinterpret_cast<const std::byte *>(data.data());
}

void ComponentDataStore::FieldStorage::Grow(size_t newCapacity)
{
    const size_t byteCount = newCapacity * elementSize;
    const size_t wordCount = (byteCount + sizeof(std::max_align_t) - 1) / sizeof(std::max_align_t);
    data.resize(wordCount);
}

void ComponentDataStore::FieldStorage::ResetSlot(size_t slot)
{
    std::memset(Bytes() + slot * elementSize, 0, elementSize);
}

void ComponentDataStore::ClassStorage::GrowTo(size_t newCapacity)
{
    if (newCapacity <= capacity)
        return;
    for (auto &field : fields) {
        field.Grow(newCapacity);
    }
    alive.resize(newCapacity, 0);
    generations.resize(newCapacity, 1);
    nextFree.resize(newCapacity, UINT32_MAX);
    capacity = newCapacity;
}

ComponentDataStore::ClassStorage &ComponentDataStore::RequireClass(uint32_t classId)
{
    if (classId >= m_classes.size())
        throw std::out_of_range("ComponentDataStore: invalid class id");
    return m_classes[classId];
}

const ComponentDataStore::ClassStorage &ComponentDataStore::RequireClass(uint32_t classId) const
{
    if (classId >= m_classes.size())
        throw std::out_of_range("ComponentDataStore: invalid class id");
    return m_classes[classId];
}

ComponentDataStore::FieldStorage &ComponentDataStore::RequireField(uint32_t classId, uint32_t fieldId,
                                                                   DataType expectedType)
{
    auto &storage = RequireClass(classId);
    if (fieldId >= storage.fields.size())
        throw std::out_of_range("ComponentDataStore: invalid field id");
    auto &field = storage.fields[fieldId];
    if (field.type != expectedType)
        throw std::invalid_argument("ComponentDataStore: field type mismatch");
    return field;
}

const ComponentDataStore::FieldStorage &ComponentDataStore::RequireField(uint32_t classId, uint32_t fieldId,
                                                                         DataType expectedType) const
{
    const auto &storage = RequireClass(classId);
    if (fieldId >= storage.fields.size())
        throw std::out_of_range("ComponentDataStore: invalid field id");
    const auto &field = storage.fields[fieldId];
    if (field.type != expectedType)
        throw std::invalid_argument("ComponentDataStore: field type mismatch");
    return field;
}

void ComponentDataStore::RequireAlive(const ClassStorage &storage, SlotHandle handle)
{
    if (!handle.IsValid() || handle.index >= storage.slotCount || !storage.alive[handle.index] ||
        storage.generations[handle.index] != handle.generation) {
        throw std::runtime_error("ComponentDataStore: stale or invalid slot handle");
    }
}

void ComponentDataStore::RequireAllAlive(const ClassStorage &storage, const SlotHandle *handles, size_t count)
{
    for (size_t i = 0; i < count; ++i)
        RequireAlive(storage, handles[i]);
}

uint32_t ComponentDataStore::RegisterClass(const std::string &className)
{
    if (className.empty())
        throw std::invalid_argument("ComponentDataStore: class name cannot be empty");
    const auto it = m_classNameToId.find(className);
    if (it != m_classNameToId.end())
        return it->second;

    const uint32_t id = static_cast<uint32_t>(m_classes.size());
    m_classes.emplace_back();
    m_classNameToId.emplace(className, id);
    return id;
}

uint32_t ComponentDataStore::RegisterField(uint32_t classId, const std::string &fieldName, DataType type)
{
    if (fieldName.empty())
        throw std::invalid_argument("ComponentDataStore: field name cannot be empty");
    auto &storage = RequireClass(classId);
    const auto existing = storage.fieldNameToId.find(fieldName);
    if (existing != storage.fieldNameToId.end()) {
        if (storage.fields[existing->second].type != type)
            throw std::invalid_argument("ComponentDataStore: field re-registered with a different type");
        return existing->second;
    }

    FieldStorage field;
    field.type = type;
    field.elementSize = ElementSize(type);
    field.Grow(storage.capacity);
    const uint32_t fieldId = static_cast<uint32_t>(storage.fields.size());
    storage.fields.push_back(std::move(field));
    storage.fieldNameToId.emplace(fieldName, fieldId);
    return fieldId;
}

uint32_t ComponentDataStore::GetClassId(const std::string &className) const
{
    const auto it = m_classNameToId.find(className);
    return it != m_classNameToId.end() ? it->second : UINT32_MAX;
}

uint32_t ComponentDataStore::GetFieldId(uint32_t classId, const std::string &fieldName) const
{
    if (classId >= m_classes.size())
        return UINT32_MAX;
    const auto &storage = m_classes[classId];
    const auto it = storage.fieldNameToId.find(fieldName);
    return it != storage.fieldNameToId.end() ? it->second : UINT32_MAX;
}

ComponentDataStore::SlotHandle ComponentDataStore::AllocateSlot(uint32_t classId)
{
    auto &storage = RequireClass(classId);
    uint32_t index = UINT32_MAX;
    if (storage.freeHead != UINT32_MAX) {
        index = storage.freeHead;
        storage.freeHead = storage.nextFree[index];
    } else {
        if (storage.slotCount == storage.capacity) {
            const size_t newCapacity = storage.capacity == 0 ? 16 : storage.capacity * 2;
            storage.GrowTo(newCapacity);
        }
        index = static_cast<uint32_t>(storage.slotCount++);
    }

    storage.alive[index] = 1;
    storage.nextFree[index] = UINT32_MAX;
    for (auto &field : storage.fields) {
        field.ResetSlot(index);
    }
    ++storage.aliveCount;
    return SlotHandle{index, storage.generations[index]};
}

void ComponentDataStore::ReleaseSlot(uint32_t classId, SlotHandle handle)
{
    auto &storage = RequireClass(classId);
    RequireAlive(storage, handle);
    storage.alive[handle.index] = 0;
    uint32_t &generation = storage.generations[handle.index];
    if (++generation == 0)
        generation = 1;
    storage.nextFree[handle.index] = storage.freeHead;
    storage.freeHead = handle.index;
    --storage.aliveCount;
}

void ComponentDataStore::ReserveClass(uint32_t classId, size_t capacity)
{
    RequireClass(classId).GrowTo(capacity);
}

size_t ComponentDataStore::GetClassCapacity(uint32_t classId) const
{
    return RequireClass(classId).capacity;
}

size_t ComponentDataStore::GetClassAliveCount(uint32_t classId) const
{
    return RequireClass(classId).aliveCount;
}

bool ComponentDataStore::IsAlive(uint32_t classId, SlotHandle handle) const
{
    const auto &storage = RequireClass(classId);
    return handle.IsValid() && handle.index < storage.slotCount && storage.alive[handle.index] &&
           storage.generations[handle.index] == handle.generation;
}

#define INX_CDS_SCALAR_ACCESSORS(Name, CppType, StoreType)                                                             \
    CppType ComponentDataStore::Get##Name(uint32_t classId, uint32_t fieldId, SlotHandle handle) const                 \
    {                                                                                                                  \
        const auto &storage = RequireClass(classId);                                                                   \
        RequireAlive(storage, handle);                                                                                 \
        return RequireField(classId, fieldId, DataType::StoreType).At<CppType>(handle.index);                          \
    }                                                                                                                  \
    void ComponentDataStore::Set##Name(uint32_t classId, uint32_t fieldId, SlotHandle handle, CppType value)           \
    {                                                                                                                  \
        auto &storage = RequireClass(classId);                                                                         \
        RequireAlive(storage, handle);                                                                                 \
        RequireField(classId, fieldId, DataType::StoreType).At<CppType>(handle.index) = value;                         \
    }

INX_CDS_SCALAR_ACCESSORS(Float, double, Float64)
INX_CDS_SCALAR_ACCESSORS(Int, int64_t, Int64)

bool ComponentDataStore::GetBool(uint32_t classId, uint32_t fieldId, SlotHandle handle) const
{
    const auto &storage = RequireClass(classId);
    RequireAlive(storage, handle);
    return RequireField(classId, fieldId, DataType::Bool).At<uint8_t>(handle.index) != 0;
}

void ComponentDataStore::SetBool(uint32_t classId, uint32_t fieldId, SlotHandle handle, bool value)
{
    auto &storage = RequireClass(classId);
    RequireAlive(storage, handle);
    RequireField(classId, fieldId, DataType::Bool).At<uint8_t>(handle.index) = value ? 1 : 0;
}

#undef INX_CDS_SCALAR_ACCESSORS

#define INX_CDS_VECTOR_ACCESSORS(Dim, StoreType)                                                                       \
    void ComponentDataStore::GetVec##Dim(uint32_t classId, uint32_t fieldId, SlotHandle handle, float out[Dim]) const  \
    {                                                                                                                  \
        const auto &storage = RequireClass(classId);                                                                   \
        RequireAlive(storage, handle);                                                                                 \
        const float *source = RequireField(classId, fieldId, DataType::StoreType).FloatsAt(handle.index);              \
        std::copy_n(source, Dim, out);                                                                                 \
    }                                                                                                                  \
    void ComponentDataStore::SetVec##Dim(uint32_t classId, uint32_t fieldId, SlotHandle handle, const float in[Dim])   \
    {                                                                                                                  \
        auto &storage = RequireClass(classId);                                                                         \
        RequireAlive(storage, handle);                                                                                 \
        float *destination = RequireField(classId, fieldId, DataType::StoreType).FloatsAt(handle.index);               \
        std::copy_n(in, Dim, destination);                                                                             \
    }

INX_CDS_VECTOR_ACCESSORS(2, Vec2)
INX_CDS_VECTOR_ACCESSORS(3, Vec3)
INX_CDS_VECTOR_ACCESSORS(4, Vec4)

#undef INX_CDS_VECTOR_ACCESSORS

#define INX_CDS_SCALAR_BATCH(Name, CppType, StoreType)                                                                 \
    void ComponentDataStore::Gather##Name(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, \
                                          CppType *out) const                                                          \
    {                                                                                                                  \
        const auto &storage = RequireClass(classId);                                                                   \
        const auto &field = RequireField(classId, fieldId, DataType::StoreType);                                       \
        RequireAllAlive(storage, handles, count);                                                                      \
        for (size_t i = 0; i < count; ++i) {                                                                           \
            out[i] = field.At<CppType>(handles[i].index);                                                              \
        }                                                                                                              \
    }                                                                                                                  \
    void ComponentDataStore::Scatter##Name(uint32_t classId, uint32_t fieldId, const SlotHandle *handles,              \
                                           size_t count, const CppType *in)                                            \
    {                                                                                                                  \
        auto &storage = RequireClass(classId);                                                                         \
        auto &field = RequireField(classId, fieldId, DataType::StoreType);                                             \
        RequireAllAlive(storage, handles, count);                                                                      \
        for (size_t i = 0; i < count; ++i) {                                                                           \
            field.At<CppType>(handles[i].index) = in[i];                                                               \
        }                                                                                                              \
    }

INX_CDS_SCALAR_BATCH(Float, double, Float64)
INX_CDS_SCALAR_BATCH(Int, int64_t, Int64)
INX_CDS_SCALAR_BATCH(Bool, uint8_t, Bool)

#undef INX_CDS_SCALAR_BATCH

#define INX_CDS_VECTOR_BATCH(Dim, StoreType)                                                                           \
    void ComponentDataStore::GatherVec##Dim(uint32_t classId, uint32_t fieldId, const SlotHandle *handles,             \
                                            size_t count, float *out) const                                            \
    {                                                                                                                  \
        const auto &storage = RequireClass(classId);                                                                   \
        const auto &field = RequireField(classId, fieldId, DataType::StoreType);                                       \
        RequireAllAlive(storage, handles, count);                                                                      \
        for (size_t i = 0; i < count; ++i) {                                                                           \
            std::copy_n(field.FloatsAt(handles[i].index), Dim, out + i * Dim);                                         \
        }                                                                                                              \
    }                                                                                                                  \
    void ComponentDataStore::ScatterVec##Dim(uint32_t classId, uint32_t fieldId, const SlotHandle *handles,            \
                                             size_t count, const float *in)                                            \
    {                                                                                                                  \
        auto &storage = RequireClass(classId);                                                                         \
        auto &field = RequireField(classId, fieldId, DataType::StoreType);                                             \
        RequireAllAlive(storage, handles, count);                                                                      \
        for (size_t i = 0; i < count; ++i) {                                                                           \
            std::copy_n(in + i * Dim, Dim, field.FloatsAt(handles[i].index));                                          \
        }                                                                                                              \
    }

INX_CDS_VECTOR_BATCH(2, Vec2)
INX_CDS_VECTOR_BATCH(3, Vec3)
INX_CDS_VECTOR_BATCH(4, Vec4)

#undef INX_CDS_VECTOR_BATCH

void ComponentDataStore::Clear()
{
    m_classes.clear();
    m_classNameToId.clear();
}

} // namespace infernux

#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace infernux
{

/// SoA data store for Python InxComponent numeric fields.
///
/// Each registered component class gets its own set of parallel arrays
/// (one per numeric field).  Per-element access is O(1) via slot index.
/// Batch gather/scatter enables efficient numpy ↔ engine data transfer.
class ComponentDataStore
{
  public:
    struct SlotHandle
    {
        uint32_t index = UINT32_MAX;
        uint32_t generation = 0;

        [[nodiscard]] bool IsValid() const noexcept
        {
            return index != UINT32_MAX && generation != 0;
        }
    };

    enum class DataType : uint8_t
    {
        Float64, // Python float → double
        Int64,   // Python int → int64_t
        Bool,    // Python bool → uint8_t
        Vec2,    // Vector2 → 2 × float
        Vec3,    // Vector3 → 3 × float
        Vec4,    // vec4f   → 4 × float
    };

    static ComponentDataStore &Instance();

    // ── class / field registration ──

    uint32_t RegisterClass(const std::string &className);
    uint32_t RegisterField(uint32_t classId, const std::string &fieldName, DataType type);
    uint32_t GetClassId(const std::string &className) const;
    uint32_t GetFieldId(uint32_t classId, const std::string &fieldName) const;

    // ── slot lifecycle ──

    SlotHandle AllocateSlot(uint32_t classId);
    void ReleaseSlot(uint32_t classId, SlotHandle handle);
    void ReserveClass(uint32_t classId, size_t capacity);
    [[nodiscard]] size_t GetClassCapacity(uint32_t classId) const;
    [[nodiscard]] size_t GetClassAliveCount(uint32_t classId) const;
    [[nodiscard]] bool IsAlive(uint32_t classId, SlotHandle handle) const;

    // ── per-element scalar access ──

    double GetFloat(uint32_t classId, uint32_t fieldId, SlotHandle handle) const;
    void SetFloat(uint32_t classId, uint32_t fieldId, SlotHandle handle, double value);

    int64_t GetInt(uint32_t classId, uint32_t fieldId, SlotHandle handle) const;
    void SetInt(uint32_t classId, uint32_t fieldId, SlotHandle handle, int64_t value);

    bool GetBool(uint32_t classId, uint32_t fieldId, SlotHandle handle) const;
    void SetBool(uint32_t classId, uint32_t fieldId, SlotHandle handle, bool value);

    // ── per-element vector access ──

    void GetVec2(uint32_t classId, uint32_t fieldId, SlotHandle handle, float out[2]) const;
    void SetVec2(uint32_t classId, uint32_t fieldId, SlotHandle handle, const float in[2]);

    void GetVec3(uint32_t classId, uint32_t fieldId, SlotHandle handle, float out[3]) const;
    void SetVec3(uint32_t classId, uint32_t fieldId, SlotHandle handle, const float in[3]);

    void GetVec4(uint32_t classId, uint32_t fieldId, SlotHandle handle, float out[4]) const;
    void SetVec4(uint32_t classId, uint32_t fieldId, SlotHandle handle, const float in[4]);

    // ── batch gather/scatter ──

    void GatherFloat(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, double *out) const;
    void ScatterFloat(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, const double *in);

    void GatherInt(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, int64_t *out) const;
    void ScatterInt(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, const int64_t *in);

    void GatherBool(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, uint8_t *out) const;
    void ScatterBool(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, const uint8_t *in);

    void GatherVec3(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, float *out) const;
    void ScatterVec3(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, const float *in);

    void GatherVec2(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, float *out) const;
    void ScatterVec2(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, const float *in);

    void GatherVec4(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, float *out) const;
    void ScatterVec4(uint32_t classId, uint32_t fieldId, const SlotHandle *handles, size_t count, const float *in);

    /// Reset everything (e.g. scene unload).
    void Clear();

  private:
    ComponentDataStore() = default;

    static size_t ElementSize(DataType type);

    struct FieldStorage
    {
        DataType type{};
        std::vector<std::max_align_t> data;
        size_t elementSize = 0;

        void Grow(size_t newCapacity);
        void ResetSlot(size_t slot);

        template <typename T> T &At(size_t slot)
        {
            return *reinterpret_cast<T *>(Bytes() + slot * elementSize);
        }
        template <typename T> const T &At(size_t slot) const
        {
            return *reinterpret_cast<const T *>(Bytes() + slot * elementSize);
        }
        float *FloatsAt(size_t slot)
        {
            return reinterpret_cast<float *>(Bytes() + slot * elementSize);
        }
        const float *FloatsAt(size_t slot) const
        {
            return reinterpret_cast<const float *>(Bytes() + slot * elementSize);
        }

      private:
        std::byte *Bytes();
        const std::byte *Bytes() const;
    };

    struct ClassStorage
    {
        std::vector<FieldStorage> fields;
        std::unordered_map<std::string, uint32_t> fieldNameToId;
        std::vector<uint8_t> alive;
        std::vector<uint32_t> generations;
        std::vector<uint32_t> nextFree;
        uint32_t freeHead = UINT32_MAX;
        size_t capacity = 0;
        size_t slotCount = 0;
        size_t aliveCount = 0;

        void GrowTo(size_t newCapacity);
    };

    std::vector<ClassStorage> m_classes;
    std::unordered_map<std::string, uint32_t> m_classNameToId;

    ClassStorage &RequireClass(uint32_t classId);
    const ClassStorage &RequireClass(uint32_t classId) const;
    FieldStorage &RequireField(uint32_t classId, uint32_t fieldId, DataType expectedType);
    const FieldStorage &RequireField(uint32_t classId, uint32_t fieldId, DataType expectedType) const;
    static void RequireAlive(const ClassStorage &storage, SlotHandle handle);
    static void RequireAllAlive(const ClassStorage &storage, const SlotHandle *handles, size_t count);
};

} // namespace infernux

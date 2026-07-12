#include <function/scene/ComponentDataStore.h>

#include <cassert>
#include <cstdint>
#include <stdexcept>
#include <vector>

using infernux::ComponentDataStore;

template <typename Fn> void ExpectFailure(Fn &&fn)
{
    bool failed = false;
    try {
        fn();
    } catch (const std::exception &) {
        failed = true;
    }
    assert(failed);
}

int main()
{
    auto &store = ComponentDataStore::Instance();
    store.Clear();

    const uint32_t classId = store.RegisterClass("tests:Motion");
    const uint32_t speedField = store.RegisterField(classId, "speed", ComponentDataStore::DataType::Float64);
    const uint32_t countField = store.RegisterField(classId, "count", ComponentDataStore::DataType::Int64);
    const uint32_t positionField = store.RegisterField(classId, "position", ComponentDataStore::DataType::Vec3);
    assert(store.RegisterField(classId, "speed", ComponentDataStore::DataType::Float64) == speedField);
    ExpectFailure([&] { store.RegisterField(classId, "speed", ComponentDataStore::DataType::Int64); });

    store.ReserveClass(classId, 128);
    std::vector<ComponentDataStore::SlotHandle> handles;
    handles.reserve(100);
    for (int64_t i = 0; i < 100; ++i) {
        const auto handle = store.AllocateSlot(classId);
        handles.push_back(handle);
        store.SetFloat(classId, speedField, handle, static_cast<double>(i) + 0.5);
        store.SetInt(classId, countField, handle, i);
        const float position[3] = {static_cast<float>(i), 2.0F, 3.0F};
        store.SetVec3(classId, positionField, handle, position);
    }
    assert(store.GetFloat(classId, speedField, handles[77]) == 77.5);
    assert(store.GetInt(classId, countField, handles[77]) == 77);

    const auto stale = handles[12];
    store.ReleaseSlot(classId, stale);
    assert(!store.IsAlive(classId, stale));
    const auto replacement = store.AllocateSlot(classId);
    assert(replacement.index == stale.index);
    assert(replacement.generation != stale.generation);
    ExpectFailure([&] { store.GetFloat(classId, speedField, stale); });
    ExpectFailure([&] { store.ReleaseSlot(classId, stale); });
    ExpectFailure([&] { store.GetInt(classId, speedField, replacement); });

    const ComponentDataStore::SlotHandle batchHandles[] = {handles[0], replacement, handles[99]};
    const double input[] = {10.0, 20.0, 30.0};
    double output[3] = {};
    store.ScatterFloat(classId, speedField, batchHandles, 3, input);
    store.GatherFloat(classId, speedField, batchHandles, 3, output);
    assert(output[0] == 10.0 && output[1] == 20.0 && output[2] == 30.0);

    const ComponentDataStore::SlotHandle invalidBatch[] = {handles[0], stale};
    ExpectFailure([&] { store.GatherFloat(classId, speedField, invalidBatch, 2, output); });
    const double beforeFailedScatter = store.GetFloat(classId, speedField, handles[0]);
    const double invalidInput[] = {111.0, 222.0};
    ExpectFailure([&] { store.ScatterFloat(classId, speedField, invalidBatch, 2, invalidInput); });
    assert(store.GetFloat(classId, speedField, handles[0]) == beforeFailedScatter);

    store.Clear();
    return 0;
}

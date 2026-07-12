#include <atomic>
#include <chrono>
#include <core/threading/JobSystem.h>
#include <iostream>
#include <stdexcept>
#include <thread>

namespace
{

void Require(bool condition, const char *message)
{
    if (!condition) {
        throw std::runtime_error(message);
    }
}

void TestSchedulingAndBatchWait()
{
    infernux::JobSystem::Initialize(2);
    auto &jobs = infernux::JobSystem::Get();

    std::atomic<int> total{0};
    auto single = jobs.Schedule([&total] { total.fetch_add(1, std::memory_order_relaxed); });
    jobs.Wait(single);
    Require(single.IsComplete(), "single job did not complete");

    auto batch = jobs.ScheduleBatch(64, [&total](uint32_t index) {
        return [&total, index] { total.fetch_add(static_cast<int>(index), std::memory_order_relaxed); };
    });
    jobs.Wait(batch);
    Require(total.load(std::memory_order_relaxed) == 2017, "batch result was incomplete");

    infernux::JobSystem::Shutdown();
}

void TestExceptionPropagationKeepsPoolAlive()
{
    infernux::JobSystem::Initialize(2);
    auto &jobs = infernux::JobSystem::Get();

    auto failing = jobs.Schedule([] { throw std::runtime_error("expected failure"); });
    bool propagated = false;
    try {
        jobs.Wait(failing);
    } catch (const std::runtime_error &error) {
        propagated = std::string(error.what()) == "expected failure";
    }
    Require(propagated, "worker exception was not propagated by Wait");

    std::atomic<bool> ran{false};
    auto followUp = jobs.Schedule([&ran] { ran.store(true, std::memory_order_release); });
    jobs.Wait(followUp);
    Require(ran.load(std::memory_order_acquire), "worker pool stopped after a job exception");

    infernux::JobSystem::Shutdown();
}

void TestPassiveWaitPreservesCallerThreadAffinity()
{
    infernux::JobSystem::Initialize(1);
    auto &jobs = infernux::JobSystem::Get();
    const std::thread::id caller = std::this_thread::get_id();
    std::thread::id producer;

    auto handle = jobs.Schedule([&producer] { producer = std::this_thread::get_id(); });
    jobs.WaitPassive(handle);
    Require(producer != caller, "WaitPassive executed thread-affine work on the caller");

    infernux::JobSystem::Shutdown();
}

void TestShutdownDrainsQueue()
{
    infernux::JobSystem::Initialize(2);
    std::atomic<int> completed{0};

    infernux::JobSystem::Get().ScheduleBatch(96, [&completed](uint32_t) {
        return [&completed] {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            completed.fetch_add(1, std::memory_order_relaxed);
        };
    });

    infernux::JobSystem::Shutdown();
    Require(completed.load(std::memory_order_relaxed) == 96, "Shutdown dropped queued jobs");
}

void TestInvalidWorkIsRejected()
{
    infernux::JobSystem::Initialize(1);
    auto &jobs = infernux::JobSystem::Get();

    bool emptyRejected = false;
    try {
        jobs.Schedule({});
    } catch (const std::invalid_argument &) {
        emptyRejected = true;
    }
    Require(emptyRejected, "empty job was accepted");

    std::atomic<int> executed{0};
    bool factoryFailure = false;
    try {
        jobs.ScheduleBatch(8, [&executed](uint32_t index) -> infernux::JobSystem::JobFn {
            if (index == 3) {
                throw std::runtime_error("factory failure");
            }
            return [&executed] { executed.fetch_add(1, std::memory_order_relaxed); };
        });
    } catch (const std::runtime_error &) {
        factoryFailure = true;
    }
    Require(factoryFailure, "factory exception was not propagated");
    Require(executed.load(std::memory_order_relaxed) == 0, "partially-created batch was submitted");

    infernux::JobSystem::Shutdown();
}

} // namespace

int main()
{
    try {
        TestSchedulingAndBatchWait();
        TestExceptionPropagationKeepsPoolAlive();
        TestPassiveWaitPreservesCallerThreadAffinity();
        TestShutdownDrainsQueue();
        TestInvalidWorkIsRejected();
    } catch (const std::exception &error) {
        std::cerr << "JobSystem test failed: " << error.what() << '\n';
        infernux::JobSystem::Shutdown();
        return 1;
    }

    std::cout << "JobSystem tests passed\n";
    return 0;
}

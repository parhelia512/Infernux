/**
 * @file JobSystem.cpp
 * @brief Implementation of the engine-wide C++ worker thread pool.
 */

#include "JobSystem.h"
#include <algorithm>
#include <cassert>
#include <core/log/InxLog.h>
#include <stdexcept>

namespace infernux
{

namespace
{

std::atomic<JobSystem *> g_instance{nullptr};
std::mutex g_singletonMutex;

uint32_t ResolveWorkerCount(uint32_t requested) noexcept
{
    if (requested != 0) {
        return std::clamp<uint32_t>(requested, 1u, 32u);
    }
    const auto detected = std::thread::hardware_concurrency();
    if (detected <= 1) {
        // Single-core or hardware_concurrency() returned 0 (allowed by the
        // standard) → still spin up one worker so call sites have a thread
        // to dispatch to without having to special-case JobSystem absence.
        return 1u;
    }
    return std::clamp<uint32_t>(detected - 1, 1u, 32u);
}

} // namespace

void JobSystem::Initialize(uint32_t workerCount)
{
    std::lock_guard<std::mutex> guard(g_singletonMutex);
    if (g_instance.load(std::memory_order_acquire) != nullptr) {
        throw std::logic_error("JobSystem::Initialize called twice");
    }

    auto *instance = new JobSystem();
    g_instance.store(instance, std::memory_order_release);

    const uint32_t resolved = ResolveWorkerCount(workerCount);
    instance->m_workers.reserve(resolved);
    for (uint32_t i = 0; i < resolved; ++i) {
        instance->m_workers.emplace_back([instance] { instance->WorkerLoop(); });
    }

    INXLOG_INFO("JobSystem online with ", resolved,
                " worker thread(s) (hw_concurrency=", std::thread::hardware_concurrency(), ")");
}

void JobSystem::Shutdown()
{
    JobSystem *toDestroy = nullptr;
    {
        std::lock_guard<std::mutex> guard(g_singletonMutex);
        toDestroy = g_instance.exchange(nullptr, std::memory_order_acq_rel);
    }

    if (toDestroy == nullptr) {
        return;
    }

    toDestroy->StopAndJoin();
    delete toDestroy;
}

JobSystem &JobSystem::Get()
{
    auto *instance = g_instance.load(std::memory_order_acquire);
    if (instance == nullptr) {
        throw std::logic_error("JobSystem::Get called outside its lifetime");
    }
    return *instance;
}

bool JobSystem::IsAvailable() noexcept
{
    return g_instance.load(std::memory_order_acquire) != nullptr;
}

JobSystem::~JobSystem()
{
    StopAndJoin();
}

JobHandle JobSystem::Schedule(JobFn job)
{
    if (!job) {
        throw std::invalid_argument("JobSystem::Schedule requires a callable");
    }

    auto state = std::make_shared<JobHandle::State>(1);
    {
        std::lock_guard<std::mutex> guard(m_queueMutex);
        if (!m_accepting) {
            throw std::runtime_error("JobSystem is shutting down");
        }
        m_queue.push(Task{std::move(job), state});
    }
    m_queueCv.notify_one();
    return JobHandle(std::move(state));
}

JobHandle JobSystem::ScheduleBatch(uint32_t count, std::function<JobFn(uint32_t)> factory)
{
    if (count == 0) {
        return JobHandle();
    }

    std::vector<JobFn> jobs;
    jobs.reserve(count);
    for (uint32_t i = 0; i < count; ++i) {
        auto job = factory(i);
        if (!job) {
            throw std::invalid_argument("JobSystem::ScheduleBatch factory returned an empty job");
        }
        jobs.push_back(std::move(job));
    }

    auto state = std::make_shared<JobHandle::State>(count);
    {
        std::lock_guard<std::mutex> guard(m_queueMutex);
        if (!m_accepting) {
            throw std::runtime_error("JobSystem is shutting down");
        }
        for (auto &job : jobs) {
            m_queue.push(Task{std::move(job), state});
        }
    }
    m_queueCv.notify_all();
    return JobHandle(std::move(state));
}

void JobSystem::ParallelFor(uint32_t count, std::function<void(uint32_t)> body)
{
    if (count == 0) {
        return;
    }
    auto handle = ScheduleBatch(count, [body](uint32_t i) -> JobFn { return [body, i] { body(i); }; });
    Wait(handle);
}

void JobSystem::Wait(const JobHandle &handle)
{
    if (!handle.IsValid()) {
        return;
    }

    // Opportunistic helper-thread participation: instead of a passive
    // condition_variable wait, the joining thread runs queued tasks itself
    // until the counter zeroes out. This protects against priority inversion
    // when the main render thread joins on jobs scheduled by helpers.
    while (!handle.IsComplete()) {
        if (!TryRunOne()) {
            std::unique_lock<std::mutex> lock(handle.m_state->completionMutex);
            handle.m_state->completionCv.wait(lock, [&handle] { return handle.IsComplete(); });
        }
    }

    std::exception_ptr failure;
    {
        std::lock_guard<std::mutex> lock(handle.m_state->completionMutex);
        failure = handle.m_state->failure;
    }
    if (failure) {
        std::rethrow_exception(failure);
    }
}

void JobSystem::WaitPassive(const JobHandle &handle)
{
    if (!handle.IsValid())
        return;

    std::exception_ptr failure;
    {
        std::unique_lock<std::mutex> lock(handle.m_state->completionMutex);
        handle.m_state->completionCv.wait(lock, [&handle] { return handle.IsComplete(); });
        failure = handle.m_state->failure;
    }
    if (failure)
        std::rethrow_exception(failure);
}

bool JobSystem::TryRunOne()
{
    Task task;
    {
        std::lock_guard<std::mutex> guard(m_queueMutex);
        if (m_queue.empty()) {
            return false;
        }
        task = std::move(m_queue.front());
        m_queue.pop();
    }

    Execute(std::move(task));
    return true;
}

void JobSystem::WorkerLoop()
{
    for (;;) {
        Task task;
        {
            std::unique_lock<std::mutex> guard(m_queueMutex);
            m_queueCv.wait(guard, [this] { return !m_queue.empty() || m_stopRequested; });

            if (m_queue.empty() && m_stopRequested) {
                return;
            }

            task = std::move(m_queue.front());
            m_queue.pop();
        }

        Execute(std::move(task));
    }
}

void JobSystem::Execute(Task task) noexcept
{
    try {
        task.fn();
    } catch (...) {
        std::lock_guard<std::mutex> lock(task.state->completionMutex);
        if (!task.state->failure) {
            task.state->failure = std::current_exception();
        }
    }

    if (task.state->remaining.fetch_sub(1, std::memory_order_acq_rel) == 1) {
        task.state->completionCv.notify_all();
    }
}

void JobSystem::StopAndJoin() noexcept
{
    {
        std::lock_guard<std::mutex> guard(m_queueMutex);
        m_accepting = false;
        m_stopRequested = true;
    }
    m_queueCv.notify_all();

    for (auto &worker : m_workers) {
        if (worker.joinable()) {
            worker.join();
        }
    }
    m_workers.clear();
}

} // namespace infernux

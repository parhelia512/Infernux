#include "platform/filesystem/DocumentStore.h"

#include <condition_variable>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

using infernux::DocumentStore;
using infernux::DocumentWriteSuperseded;

namespace
{

void Require(bool condition, const char *message)
{
    if (!condition)
        throw std::runtime_error(message);
}

void TestCoalescesQueuedGenerations()
{
    std::mutex mutex;
    std::condition_variable condition;
    bool firstStarted = false;
    bool releaseFirst = false;
    std::vector<std::string> writes;

    DocumentStore store([&](const std::string &, const std::string &content) {
        std::unique_lock lock(mutex);
        writes.push_back(content);
        if (content == "first") {
            firstStarted = true;
            condition.notify_all();
            condition.wait(lock, [&] { return releaseFirst; });
        }
    });

    auto first = store.Submit("coalesced.scene", "first");
    {
        std::unique_lock lock(mutex);
        Require(condition.wait_for(lock, std::chrono::seconds(2), [&] { return firstStarted; }),
                "first generation did not start");
    }
    auto second = store.Submit("coalesced.scene", "second");
    auto third = store.Submit("coalesced.scene", "third");

    bool superseded = false;
    try {
        second->Wait();
    } catch (const DocumentWriteSuperseded &) {
        superseded = true;
    }
    Require(superseded, "intermediate generation was not marked superseded");

    {
        std::lock_guard lock(mutex);
        releaseFirst = true;
    }
    condition.notify_all();
    first->Wait();
    third->Wait();
    store.Flush();
    store.Shutdown();

    Require(writes.size() == 2, "coalesced store performed an extra write");
    Require(writes[0] == "first" && writes[1] == "third", "coalesced store wrote the wrong generations");
    Require(first->GetGeneration() + 2 == third->GetGeneration(), "generation sequence is not monotonic");
}

void TestShutdownDrainsAndRestarts()
{
    std::vector<std::string> writes;
    DocumentStore store([&](const std::string &, const std::string &content) { writes.push_back(content); });
    auto accepted = store.Submit("drain.scene", "accepted");
    store.Shutdown();
    accepted->Wait();
    Require(writes == std::vector<std::string>{"accepted"}, "shutdown did not drain accepted work");

    auto restarted = store.Submit("drain.scene", "next lifetime");
    restarted->Wait();
    store.Shutdown();
    Require(writes == std::vector<std::string>({"accepted", "next lifetime"}), "store did not restart cleanly");
}

void TestDifferentPathsRunConcurrently()
{
    std::mutex mutex;
    std::condition_variable condition;
    int started = 0;
    bool release = false;
    DocumentStore store(
        [&](const std::string &, const std::string &) {
            std::unique_lock lock(mutex);
            ++started;
            condition.notify_all();
            condition.wait(lock, [&] { return release; });
        },
        2);

    auto first = store.Submit("parallel-a.scene", "a");
    auto second = store.Submit("parallel-b.scene", "b");
    {
        std::unique_lock lock(mutex);
        Require(condition.wait_for(lock, std::chrono::seconds(2), [&] { return started == 2; }),
                "different paths did not execute concurrently");
        release = true;
    }
    condition.notify_all();
    first->Wait();
    second->Wait();
    store.Shutdown();
}

void TestWriterFailurePropagates()
{
    DocumentStore store([](const std::string &, const std::string &) { throw std::runtime_error("disk full"); });
    auto failed = store.Submit("failed.scene", "content");
    bool propagated = false;
    try {
        failed->Wait();
    } catch (const std::runtime_error &error) {
        propagated = std::string(error.what()) == "disk full";
    }
    store.Shutdown();
    Require(propagated, "writer failure was not propagated through the ticket");
}

} // namespace

int main()
{
    try {
        TestCoalescesQueuedGenerations();
        TestShutdownDrainsAndRestarts();
        TestDifferentPathsRunConcurrently();
        TestWriterFailurePropagates();
        std::cout << "DocumentStore tests passed\n";
        return 0;
    } catch (const std::exception &error) {
        std::cerr << "DocumentStore test failure: " << error.what() << '\n';
        return 1;
    }
}

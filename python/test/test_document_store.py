import pytest

from Infernux.core.document_store import DocumentStore


@pytest.fixture(autouse=True)
def _fresh_document_store():
    DocumentStore.shutdown()
    yield
    DocumentStore.shutdown()


def test_native_store_writes_ordered_generations(tmp_path):
    path = tmp_path / "scene.json"
    store = DocumentStore.instance()

    first = store.submit(str(path), "first")
    first.wait()
    second = store.submit(str(path), "second")
    second.wait()

    assert first.generation + 1 == second.generation
    assert path.read_text(encoding="utf-8") == "second"


def test_shutdown_drains_accepted_write_and_store_can_restart(tmp_path):
    first_path = tmp_path / "first.json"
    store = DocumentStore.instance()
    ticket = store.submit(str(first_path), "accepted")

    store.shutdown()

    ticket.wait()
    assert first_path.read_text(encoding="utf-8") == "accepted"

    second_path = tmp_path / "second.json"
    restarted = DocumentStore.instance()
    restarted.write_and_wait(str(second_path), "new lifetime")
    assert second_path.read_text(encoding="utf-8") == "new lifetime"


def test_native_write_failure_reaches_ticket(tmp_path):
    missing_parent = tmp_path / "missing" / "failed.json"
    ticket = DocumentStore.instance().submit(str(missing_parent), "data")

    with pytest.raises(RuntimeError, match="atomic write failed"):
        ticket.wait()

"""Thin Python access to the native cross-language DocumentStore."""
from __future__ import annotations

from typing import Optional

from Infernux.lib import (
    DocumentWriteSuperseded,
    DocumentWriteTicket,
    NativeDocumentStore,
)


class DocumentStore:
    """Access the C++-owned generation/coalescing write service."""

    @classmethod
    def instance(cls) -> NativeDocumentStore:
        return NativeDocumentStore.instance()

    @classmethod
    def shutdown(cls) -> None:
        NativeDocumentStore.instance().shutdown()

    @classmethod
    def flush(cls, path: Optional[str] = None) -> None:
        store = NativeDocumentStore.instance()
        if path is None:
            store.flush_all()
        else:
            store.flush_path(path)


def write_document_text(path: str, content: str) -> int:
    """Write one UTF-8 document and return its path generation."""
    return NativeDocumentStore.instance().write_and_wait(path, content)


__all__ = [
    "DocumentStore",
    "DocumentWriteSuperseded",
    "DocumentWriteTicket",
    "write_document_text",
]

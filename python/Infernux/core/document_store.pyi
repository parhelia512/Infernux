from typing import Optional

from Infernux.lib import (
    DocumentWriteSuperseded,
    DocumentWriteTicket,
    NativeDocumentStore,
)


class DocumentStore:
    @classmethod
    def instance(cls) -> NativeDocumentStore: ...
    @classmethod
    def shutdown(cls) -> None: ...
    @classmethod
    def flush(cls, path: Optional[str] = ...) -> None: ...


def write_document_text(path: str, content: str) -> int: ...


__all__: list[str]

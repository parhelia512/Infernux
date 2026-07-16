"""Type stubs for Infernux.components.registry.

Uses ``InxComponent.__subclasses__()`` recursively — no manual registration needed.
"""

from __future__ import annotations

from typing import Dict, Optional, Type, TYPE_CHECKING

if TYPE_CHECKING:
    from .component import InxComponent


def get_type(name: str) -> Optional[Type[InxComponent]]:
    """Get a component class by its name (recursive ``__subclasses__()`` scan).

    Example::

        TestCache = get_type("testcache")
        if TestCache:
            comp = self.get_component(TestCache)
    """
    ...


def get_type_by_identity(
    name: str,
    script_guid: str,
    type_guid: str,
) -> Optional[Type[InxComponent]]: ...


def get_all_types() -> Dict[str, Type[InxComponent]]:
    """Get all known InxComponent subclass types as ``{name: class}``."""
    ...


class _TypeAccessor:
    """Dynamic attribute accessor for component types.

    Example::

        T.TestCache   # -> get_type("TestCache")
        T.Movement    # -> get_type("Movement")
    """
    def __getattr__(self, name: str) -> Optional[Type[InxComponent]]: ...
    def __repr__(self) -> str: ...


T: _TypeAccessor

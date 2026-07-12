"""
Component Type Lookup for Infernux.

Uses Python's built-in ``__subclasses__()`` to discover all InxComponent
subclasses at runtime — no manual registration needed.

Usage:
    from Infernux.components import get_type, T

    # Get component type by name
    TestCache = get_type("testcache")
    comp = self.game_object.get_component(TestCache)

    # Or use the T shorthand
    comp = self.game_object.get_component(T.testcache)
"""

from typing import Dict, Type, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .component import InxComponent


def _find_subclass(base: type, name: str) -> Optional[Type['InxComponent']]:
    """Recursively search *base*.__subclasses__() for a class whose __name__ == *name*."""
    for cls in base.__subclasses__():
        if cls.__name__ == name:
            return cls
        found = _find_subclass(cls, name)
        if found is not None:
            return found
    return None


def get_type(name: str) -> Optional[Type['InxComponent']]:
    """
    Get a component class by its name.

    Walks the full InxComponent subclass tree via ``__subclasses__()``.

    Args:
        name: The class name (e.g., "testcache", "PlayerController")

    Returns:
        The component class, or None if not found
    """
    from .component import InxComponent
    return _find_subclass(InxComponent, name)


def get_type_by_identity(
    name: str,
    script_guid: str,
    type_guid: str,
) -> Optional[Type['InxComponent']]:
    """Resolve exactly one component class by its complete stable identity."""
    from .component import InxComponent

    matches = []

    def collect(base: type) -> None:
        for component_type in base.__subclasses__():
            known_script_guids = {
                component_type._get_intrinsic_script_guid(),
                getattr(component_type, "_asset_script_guid_", ""),
            }
            if (
                component_type.__name__ == name
                and type_guid == component_type._get_type_guid()
                and script_guid in known_script_guids
            ):
                matches.append(component_type)
            collect(component_type)

    collect(InxComponent)
    return matches[0] if len(matches) == 1 else None


def get_all_types() -> Dict[str, Type['InxComponent']]:
    """
    Get all known InxComponent subclass types.

    Returns:
        Dictionary of class_name -> class_type
    """
    from .component import InxComponent
    result: Dict[str, Type['InxComponent']] = {}

    def _collect(base: type) -> None:
        for cls in base.__subclasses__():
            result[cls.__name__] = cls
            _collect(cls)

    _collect(InxComponent)
    return result


class _TypeAccessor:
    """
    Dynamic attribute accessor for component types.

    Allows accessing component types as attributes:
        T.testcache  -> get_type("testcache")
        T.Movement   -> get_type("Movement")
    """

    def __getattr__(self, name: str) -> Optional[Type['InxComponent']]:
        """Get component type by attribute access."""
        result = get_type(name)
        if result is None:
            return None
        return result

    def __repr__(self) -> str:
        types = list(get_all_types().keys())
        return f"<ComponentTypes: {types}>"


# Global instance for easy access: T.MyComponent
T = _TypeAccessor()

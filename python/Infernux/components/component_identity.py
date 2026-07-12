"""Deterministic identities for Python component scripts and concrete types."""
from __future__ import annotations

import uuid


_SCRIPT_NAMESPACE = uuid.UUID("594f85cc-9c3a-4ea9-93ed-65a26f77e3a4")
_TYPE_NAMESPACE = uuid.UUID("41934666-ab60-4a29-b7ae-c8e15faf83c2")


def intrinsic_script_guid(module_name: str) -> str:
    if not isinstance(module_name, str) or not module_name:
        raise ValueError("Python component module name must be non-empty")
    return uuid.uuid5(_SCRIPT_NAMESPACE, module_name).hex


def component_type_guid(module_name: str, qualified_name: str) -> str:
    if not isinstance(qualified_name, str) or not qualified_name:
        raise ValueError("Python component qualified name must be non-empty")
    return uuid.uuid5(_TYPE_NAMESPACE, f"{module_name}:{qualified_name}").hex

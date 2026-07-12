from __future__ import annotations

from Infernux.components.script_loader import load_component_class_from_file
from Infernux.components import InxComponent
from Infernux.components.registry import get_type_by_identity
from Infernux.engine.component_restore import create_component_instance


def test_script_loader_does_not_substitute_a_renamed_component(tmp_path):
    script = tmp_path / "strict_component.py"
    script.write_text(
        "from Infernux.components import InxComponent\n"
        "class CurrentComponent(InxComponent):\n"
        "    speed: float = 1.0\n",
        encoding="utf-8",
    )

    assert load_component_class_from_file(str(script), "RemovedComponent") is None
    current = load_component_class_from_file(str(script), "CurrentComponent")
    assert current is not None
    assert current.__name__ == "CurrentComponent"


def test_component_identity_distinguishes_same_named_classes():
    first = type("IdentityTwin", (InxComponent,), {"__module__": "identity_module_a"})
    second = type("IdentityTwin", (InxComponent,), {"__module__": "identity_module_b"})

    assert first._get_intrinsic_script_guid() != second._get_intrinsic_script_guid()
    assert first._get_type_guid() != second._get_type_guid()
    assert len(first._get_intrinsic_script_guid()) == 32
    assert len(first._get_type_guid()) == 32

    assert get_type_by_identity(
        "IdentityTwin",
        first._get_intrinsic_script_guid(),
        first._get_type_guid(),
    ) is first
    assert get_type_by_identity(
        "IdentityTwin",
        first._get_intrinsic_script_guid(),
        second._get_type_guid(),
    ) is None

    instance, path = create_component_instance(
        first._get_intrinsic_script_guid(),
        first._get_type_guid(),
        "IdentityTwin",
    )
    assert type(instance) is first
    assert path is None

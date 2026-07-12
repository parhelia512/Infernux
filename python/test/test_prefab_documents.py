"""Strict prefab documents and typed pybind serialization boundaries."""

from __future__ import annotations

import json

import pytest

from Infernux.components import FieldType, InxComponent, serialized_field
from Infernux.components.ref_wrappers import ComponentRef, GameObjectRef
from Infernux.components.value_document import make_game_object_ref
from Infernux.engine.prefab_manager import (
    PREFAB_VERSION,
    PrefabDocumentError,
    _PREFAB_TEMPLATE_CACHE,
    _read_prefab_document,
    instantiate_prefab,
    save_prefab,
)
from Infernux.engine.prefab_overrides import (
    apply_overrides_to_prefab,
    compute_overrides,
    revert_overrides,
)


class _PrefabTargetComponent(InxComponent):
    value: int = 19


class _PrefabReferenceComponent(InxComponent):
    target_object = serialized_field(default=None, field_type=FieldType.GAME_OBJECT)
    target_component = serialized_field(default=None, field_type=FieldType.COMPONENT)


def _assert_runtime_ids_removed(document: dict) -> None:
    assert "id" not in document
    assert type(document["local_id"]) is int and document["local_id"] > 0
    assert "component_id" not in document["transform"]
    assert "instance_guid" not in document["transform"]
    for component in document["components"]:
        assert type(component["component_id"]) is int and component["component_id"] > 0
        assert "instance_guid" not in component
    for child in document["children"]:
        _assert_runtime_ids_removed(child)


def test_typed_scene_document_bridge_and_instantiation(scene):
    root = scene.create_game_object("DocumentRoot")
    root.add_component("Rigidbody")
    child = scene.create_game_object("DocumentChild")
    child.set_parent(root)

    document = root.serialize_document()
    assert isinstance(document, dict)
    assert isinstance(document["children"], list)
    assert document["children"][0]["name"] == "DocumentChild"

    clone = scene._instantiate_document(document)
    assert clone is not None
    assert clone.id != root.id
    assert clone.get_child(0).id != child.id


def test_prefab_save_is_strict_typed_and_atomic(scene, tmp_path):
    _PREFAB_TEMPLATE_CACHE.clear()
    root = scene.create_game_object("PrefabRoot")
    root.add_component("BoxCollider")
    child = scene.create_game_object("PrefabChild")
    child.add_component("Rigidbody")
    child.set_parent(root)

    path = tmp_path / "nested" / "typed.prefab"
    assert save_prefab(root, str(path), source_canvas_name="HUD") is True

    envelope = json.loads(path.read_text(encoding="utf-8"))
    assert envelope["prefab_version"] == PREFAB_VERSION
    assert envelope["source_canvas_name"] == "HUD"
    _assert_runtime_ids_removed(envelope["root_object"])
    assert list(path.parent.glob("typed.prefab.tmp.*")) == []

    instance = instantiate_prefab(file_path=str(path), scene=scene)
    assert instance is not None
    assert instance.id != root.id
    assert instance.get_child(0).id != child.id


def test_prefab_remaps_internal_python_references(scene, tmp_path):
    _PREFAB_TEMPLATE_CACHE.clear()
    root = scene.create_game_object("ReferencePrefabRoot")
    child = scene.create_game_object("ReferencePrefabChild")
    child.set_parent(root)
    child.add_py_component(_PrefabTargetComponent())
    references = _PrefabReferenceComponent()
    references.target_object = GameObjectRef(child)
    references.target_component = ComponentRef(
        go_id=child.id,
        component_type="_PrefabTargetComponent",
    )
    root.add_py_component(references)
    path = tmp_path / "reference.prefab"

    assert save_prefab(root, str(path)) is True
    document = json.loads(path.read_text(encoding="utf-8"))["root_object"]
    reference_record = next(
        record for record in document["components"]
        if record["type_id"].endswith(":_PrefabReferenceComponent")
    )
    assert reference_record["data"]["target_object"] == make_game_object_ref(
        document["children"][0]["local_id"]
    )

    instance = instantiate_prefab(file_path=str(path), scene=scene)
    instance_child = instance.get_child(0)
    restored = instance.get_py_component(_PrefabReferenceComponent)
    assert restored.target_object is instance_child
    assert restored.target_component is instance_child.get_py_component(_PrefabTargetComponent)


def test_prefab_overrides_use_typed_documents(scene, tmp_path):
    _PREFAB_TEMPLATE_CACHE.clear()
    source = scene.create_game_object("OverridePrefab")
    path = tmp_path / "override.prefab"
    assert save_prefab(source, str(path)) is True

    instance = instantiate_prefab(file_path=str(path), scene=scene)
    instance.active = False
    assert any(override.key == "active" for override in compute_overrides(instance, str(path)))

    assert revert_overrides(instance, str(path)) is True
    assert instance.active is True

    instance.active = False
    assert apply_overrides_to_prefab(instance, str(path)) is True
    assert _read_prefab_document(str(path))["root_object"]["active"] is False


@pytest.mark.parametrize(
    "mutation",
    [
        lambda document: document.pop("prefab_version"),
        lambda document: document.__setitem__("prefab_version", 0),
        lambda document: document.__setitem__("prefab_version", 2),
        lambda document: document.__setitem__("unknown", True),
        lambda document: document["root_object"].__setitem__("unknown", True),
    ],
)
def test_prefab_reader_rejects_non_current_documents(scene, tmp_path, mutation):
    root = scene.create_game_object("StrictPrefab")
    valid_path = tmp_path / "valid.prefab"
    assert save_prefab(root, str(valid_path)) is True
    document = json.loads(valid_path.read_text(encoding="utf-8"))
    mutation(document)

    invalid_path = tmp_path / "invalid.prefab"
    invalid_path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(PrefabDocumentError):
        _read_prefab_document(str(invalid_path))

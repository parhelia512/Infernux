"""Integration tests — Scene management and GameObject hierarchy (real engine)."""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

import pytest

from Infernux.lib import AssetRegistry, InxMaterial, SceneManager, Vector3, PrimitiveType, quatf
from Infernux.components import InxComponent, FieldType, serialized_field
from Infernux.components._cds_bridge import get_class_info
from Infernux.components.decorators import disallow_multiple, require_component
from Infernux.components.ref_wrappers import ComponentRef, GameObjectRef
from Infernux.engine.component_restore import (
    PythonComponentRestoreError,
    deserialize_scene_document_transactionally,
    deserialize_game_object_document_transactionally,
    instantiate_game_object_document_transactionally,
)
from Infernux.engine.scene_document_transaction import (
    SceneDocumentTransaction,
    SceneDocumentTransactionState,
)
from Infernux.engine.scene_manager import SceneFileManager
from Infernux.engine.prefab_manager import PrefabDocumentError, _strip_prefab_runtime_fields


class _ExplodingSerializationComponent(InxComponent):
    def _serialize_fields_document(self) -> dict:
        raise RuntimeError("intentional serialization failure")


class _StrictSceneComponent(InxComponent):
    value: int = 7


class _ExplodingAfterDeserializeComponent(InxComponent):
    value: int = 11

    def on_after_deserialize(self):
        raise RuntimeError("intentional on_after_deserialize failure")


class _PublishBarrierComponent(InxComponent):
    value: int = 0
    _events = []

    def on_after_deserialize(self):
        if self._awake_called:
            raise RuntimeError("Awake ran before on_after_deserialize")
        if self._cpp_component.component_id != self.component_id:
            raise RuntimeError("stable component ID was not installed before callback")
        scene = self.game_object.scene
        published_count = sum(
            len(obj.get_py_components())
            for obj in scene.get_all_objects()
        )
        if published_count != 2:
            raise RuntimeError("Python graph was not fully attached before callback")
        type(self)._events.append(("after", self.value))

    def awake(self):
        type(self)._events.append(("awake", self.value))

    def reset(self):
        type(self)._events.append(("reset", self.value))


@require_component("Rigidbody")
class _RequiresRigidbodyComponent(InxComponent):
    value: int = 1


@disallow_multiple
class _SingleInstanceSceneComponent(InxComponent):
    value: int = 1


def _cds_alive_count(component_type) -> int:
    class_info = get_class_info(component_type)
    assert class_info is not None
    from Infernux import lib
    return lib._cds_alive_count(class_info[0])


class _ObjectRefSceneComponent(InxComponent):
    target = serialized_field(default=None, field_type=FieldType.GAME_OBJECT)


class _ObjectGraphRefsComponent(InxComponent):
    target_object = serialized_field(default=None, field_type=FieldType.GAME_OBJECT)
    target_component = serialized_field(default=None, field_type=FieldType.COMPONENT)


def _capture_exception(callback, errors):
    try:
        callback()
    except Exception as exc:
        errors.append(exc)


# ═══════════════════════════════════════════════════════════════════════════
# Scene creation & querying
# ═══════════════════════════════════════════════════════════════════════════

class TestSceneLifecycle:
    def test_create_scene(self, scene):
        assert scene is not None
        assert scene.name == "pytest_scene"

    def test_active_scene(self, scene):
        sm = SceneManager.instance()
        assert sm.get_active_scene() is scene

    def test_scene_starts_empty(self, scene):
        assert len(scene.get_root_objects()) == 0
        assert len(scene.get_all_objects()) == 0


# ═══════════════════════════════════════════════════════════════════════════
# GameObject CRUD
# ═══════════════════════════════════════════════════════════════════════════

class TestGameObject:
    def test_python_component_serialization_failure_aborts_entire_document(self, scene):
        game_object = scene.create_game_object("BrokenWriter")
        game_object.add_py_component(_ExplodingSerializationComponent())

        with pytest.raises(RuntimeError, match="intentional serialization failure"):
            game_object.serialize_document()
        with pytest.raises(RuntimeError, match="intentional serialization failure"):
            scene.serialize_document()

    def test_create_game_object(self, scene):
        go = scene.create_game_object("TestObj")
        assert go.name == "TestObj"
        assert go.active is True

    def test_unique_ids(self, scene):
        a = scene.create_game_object("A")
        b = scene.create_game_object("B")
        assert a.id != b.id

    def test_find_by_name(self, scene):
        go = scene.create_game_object("Searchable")
        found = scene.find("Searchable")
        assert found is not None
        assert found.id == go.id

    def test_find_by_id(self, scene):
        go = scene.create_game_object("ById")
        found = scene.find_by_id(go.id)
        assert found is not None
        assert found.name == "ById"

    def test_find_nonexistent_returns_none(self, scene):
        assert scene.find("$$$nonexistent$$$") is None

    def test_get_all_objects(self, scene):
        scene.create_game_object("X")
        scene.create_game_object("Y")
        assert len(scene.get_all_objects()) == 2

    def test_destroy_game_object(self, scene):
        go = scene.create_game_object("Temp")
        scene.destroy_game_object(go)
        scene.process_pending_destroys()
        assert scene.find("Temp") is None

    def test_deactivate_game_object(self, scene):
        go = scene.create_game_object("Toggle")
        go.active = False
        assert go.active is False
        go.active = True
        assert go.active is True


# ═══════════════════════════════════════════════════════════════════════════
# Hierarchy (parent / child)
# ═══════════════════════════════════════════════════════════════════════════

class TestHierarchy:
    def test_set_parent(self, scene):
        parent = scene.create_game_object("Parent")
        child = scene.create_game_object("Child")
        child.set_parent(parent)
        assert child.get_parent().id == parent.id
        assert len(parent.get_children()) == 1

    def test_unparent(self, scene):
        parent = scene.create_game_object("P")
        child = scene.create_game_object("C")
        child.set_parent(parent)
        child.set_parent(None)
        assert child.get_parent() is None

    def test_root_objects_exclude_children(self, scene):
        parent = scene.create_game_object("Root")
        child = scene.create_game_object("Leaf")
        child.set_parent(parent)
        roots = scene.get_root_objects()
        root_ids = {o.id for o in roots}
        assert parent.id in root_ids
        assert child.id not in root_ids

    def test_multiple_children(self, scene):
        parent = scene.create_game_object("P")
        for i in range(5):
            c = scene.create_game_object(f"C{i}")
            c.set_parent(parent)
        assert len(parent.get_children()) == 5


# ═══════════════════════════════════════════════════════════════════════════
# Transform
# ═══════════════════════════════════════════════════════════════════════════

class TestTransform:
    def test_default_position_is_origin(self, scene):
        go = scene.create_game_object("T")
        pos = go.transform.position
        assert (pos.x, pos.y, pos.z) == pytest.approx((0, 0, 0))

    def test_set_position(self, scene):
        go = scene.create_game_object("T")
        go.transform.position = Vector3(1, 2, 3)
        pos = go.transform.position
        assert (pos.x, pos.y, pos.z) == pytest.approx((1, 2, 3))

    def test_local_vs_world_position(self, scene):
        parent = scene.create_game_object("P")
        parent.transform.position = Vector3(10, 0, 0)
        child = scene.create_game_object("C")
        child.set_parent(parent)
        child.transform.local_position = Vector3(0, 5, 0)
        world = child.transform.position
        assert world.x == pytest.approx(10)
        assert world.y == pytest.approx(5)

    def test_scale(self, scene):
        go = scene.create_game_object("S")
        go.transform.local_scale = Vector3(2, 3, 4)
        s = go.transform.local_scale
        assert (s.x, s.y, s.z) == pytest.approx((2, 3, 4))

    def test_rotation_euler(self, scene):
        go = scene.create_game_object("R")
        go.transform.euler_angles = Vector3(0, 90, 0)
        angles = go.transform.euler_angles
        assert angles.y == pytest.approx(90, abs=0.5)


# ═══════════════════════════════════════════════════════════════════════════
# Primitives
# ═══════════════════════════════════════════════════════════════════════════

class TestPrimitives:
    @pytest.mark.parametrize("ptype", [
        PrimitiveType.Cube,
        PrimitiveType.Sphere,
        PrimitiveType.Plane,
        PrimitiveType.Cylinder,
        PrimitiveType.Capsule,
    ])
    def test_create_primitive(self, scene, ptype):
        go = scene.create_primitive(ptype, f"Prim_{ptype.name}")
        assert go is not None
        comps = [c.type_name for c in go.get_components()]
        assert "Transform" in comps
        assert "MeshRenderer" in comps

    def test_primitive_has_mesh_data(self, scene):
        cube = scene.create_primitive(PrimitiveType.Cube, "Cube")
        mr = cube.get_component("MeshRenderer")
        positions = mr.get_positions()
        indices = mr.get_indices()
        assert len(positions) > 0
        assert len(indices) > 0


# ═══════════════════════════════════════════════════════════════════════════
# Instantiate (clone)
# ═══════════════════════════════════════════════════════════════════════════

class TestInstantiate:
    def test_clone_game_object(self, scene):
        original = scene.create_game_object("Original")
        original.transform.position = Vector3(5, 5, 5)
        clone = scene._clone_game_object(original)
        assert clone is not None
        assert "Clone" in clone.name
        pos = clone.transform.position
        assert pos.x == pytest.approx(5)

    def test_clone_with_components(self, scene):
        go = scene.create_game_object("WithRB")
        rb = go.add_component("Rigidbody")
        rb.mass = 7.5
        clone = scene._clone_game_object(go)
        clone_rb = clone.get_component("Rigidbody")
        assert clone_rb is not None
        assert clone_rb.mass == pytest.approx(7.5)


# ═══════════════════════════════════════════════════════════════════════════
# Scene serialization
# ═══════════════════════════════════════════════════════════════════════════

class TestSceneSerialization:
    def test_scene_document_transaction_has_explicit_owner_thread_phases(self, scene):
        existing = scene.create_game_object("TransactionPhaseSource")
        document = scene.serialize_document()
        document["objects"][0]["name"] = "TransactionPhaseTarget"
        transaction = SceneDocumentTransaction(scene, document=document)

        transaction.start()
        assert transaction.state is SceneDocumentTransactionState.DOCUMENT_READY
        assert transaction.poll() is False
        assert transaction.state is SceneDocumentTransactionState.RESOURCES_READY
        assert scene.find("TransactionPhaseSource") is existing
        assert transaction.poll() is False
        assert transaction.state is SceneDocumentTransactionState.READY_TO_COMMIT
        assert scene.find("TransactionPhaseSource") is existing

        assert transaction.poll() is True
        assert transaction.state is SceneDocumentTransactionState.COMPLETED
        assert scene.find("TransactionPhaseSource") is None
        assert scene.find("TransactionPhaseTarget") is not existing

    def test_path_scene_transaction_reads_and_validates_on_worker(self, scene, tmp_path):
        scene.create_game_object("WorkerReadSource")
        document = scene.serialize_document()
        document["objects"][0]["name"] = "WorkerReadTarget"
        path = tmp_path / "worker-read.scene"
        path.write_text(json.dumps(document), encoding="utf-8")
        transaction = SceneDocumentTransaction(scene, path=path)

        assert transaction.run_to_completion(raise_on_failure=False) is True
        assert transaction.ran_on_worker is True
        assert transaction.state is SceneDocumentTransactionState.COMPLETED
        assert scene.find("WorkerReadTarget") is not None

    def test_worker_structural_failure_preserves_live_scene(self, scene, tmp_path):
        existing = scene.create_game_object("WorkerFailureExisting")
        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        candidate["legacy"] = True
        path = tmp_path / "invalid-worker.scene"
        path.write_text(json.dumps(candidate), encoding="utf-8")
        transaction = SceneDocumentTransaction(scene, path=path)

        assert transaction.run_to_completion(raise_on_failure=False) is False
        assert transaction.ran_on_worker is True
        assert transaction.state is SceneDocumentTransactionState.FAILED
        assert "unknown field 'legacy'" in transaction.error
        assert scene.serialize_document() == original_document
        assert scene.find("WorkerFailureExisting") is existing

    @pytest.mark.parametrize(
        "corruption",
        [
            "transform_missing_scale",
            "rigidbody_mass",
            "box_size",
            "sphere_radius",
            "capsule_direction",
            "mesh_convex",
        ],
    )
    def test_worker_type_validator_rejects_physics_document_before_publish(
        self,
        scene,
        tmp_path,
        corruption,
    ):
        existing = scene.create_game_object("WorkerTypedValidationExisting")
        component_type = None
        if corruption == "rigidbody_mass":
            component_type = "Rigidbody"
        elif corruption == "box_size":
            component_type = "BoxCollider"
        elif corruption == "sphere_radius":
            component_type = "SphereCollider"
        elif corruption == "capsule_direction":
            component_type = "CapsuleCollider"
        elif corruption == "mesh_convex":
            component_type = "MeshCollider"
        component = existing.transform if component_type is None else existing.add_component(component_type)
        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        object_document = candidate["objects"][0]

        if corruption == "transform_missing_scale":
            object_document["transform"].pop("scale")
            expected_path = "Scene.objects[0].transform"
        else:
            component_document = object_document["components"][0]
            expected_path = "Scene.objects[0].components[0]"
            if corruption == "rigidbody_mass":
                component_document["mass"] = "heavy"
            elif corruption == "box_size":
                component_document["size"] = [1.0, 0.0, 1.0]
            elif corruption == "sphere_radius":
                component_document["radius"] = 0.0
            elif corruption == "capsule_direction":
                component_document["direction"] = 9
            else:
                component_document["convex"] = "yes"

        path = tmp_path / f"invalid-{corruption}.scene"
        path.write_text(json.dumps(candidate), encoding="utf-8")
        transaction = SceneDocumentTransaction(scene, path=path)

        assert transaction.run_to_completion(raise_on_failure=False) is False
        assert transaction.ran_on_worker is True
        assert transaction.state is SceneDocumentTransactionState.FAILED
        assert transaction.document is None
        assert expected_path in transaction.error
        assert scene.serialize_document() == original_document
        assert scene.find("WorkerTypedValidationExisting") is existing
        if component_type is None:
            assert existing.transform is component
        else:
            assert existing.get_component(component_type) is component

    def test_worker_accepts_current_schema_for_every_registered_native_component(self, scene, tmp_path):
        component_types = [
            "Camera",
            "Light",
            "AudioListener",
            "AudioSource",
            "BoxCollider",
            "SphereCollider",
            "CapsuleCollider",
            "MeshCollider",
            "MeshRenderer",
            "SkinnedMeshRenderer",
            "SpriteRenderer",
        ]
        for component_type in component_types:
            owner = scene.create_game_object(f"Validated{component_type}")
            owner.add_component(component_type)
        rigidbody_owner = scene.create_game_object("ValidatedRigidbody")
        rigidbody_owner.add_component("BoxCollider")
        rigidbody_owner.add_component("Rigidbody")

        document = scene.serialize_document()
        path = tmp_path / "all-native-component-schemas.scene"
        path.write_text(json.dumps(document), encoding="utf-8")
        transaction = SceneDocumentTransaction(scene, path=path)

        assert transaction.run_to_completion(raise_on_failure=False) is True
        assert transaction.ran_on_worker is True
        assert transaction.state is SceneDocumentTransactionState.COMPLETED
        for component_type in component_types:
            assert scene.find(f"Validated{component_type}").get_component(component_type) is not None
        assert scene.find("ValidatedRigidbody").get_component("Rigidbody") is not None

    @pytest.mark.parametrize(
        "component_type,corruption",
        [
            ("Camera", "camera_clips"),
            ("Light", "light_type"),
            ("AudioSource", "audio_tracks"),
            ("MeshRenderer", "mesh_material"),
            ("SkinnedMeshRenderer", "skinned_legacy"),
            ("SpriteRenderer", "sprite_color"),
        ],
    )
    def test_worker_type_validator_rejects_render_and_audio_documents(
        self,
        scene,
        tmp_path,
        component_type,
        corruption,
    ):
        existing = scene.create_game_object("WorkerRenderAudioExisting")
        component = existing.add_component(component_type)
        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        component_document = candidate["objects"][0]["components"][0]

        if corruption == "camera_clips":
            component_document["farClip"] = component_document["nearClip"]
        elif corruption == "light_type":
            component_document["lightType"] = 99
        elif corruption == "audio_tracks":
            component_document["track_count"] = 2
        elif corruption == "mesh_material":
            component_document["materials"] = [{"material": "not-a-document"}]
        elif corruption == "skinned_legacy":
            component_document["sourceModelGuid"] = "removed"
        else:
            component_document["spriteColor"] = [1.0, 1.0, 1.0]

        path = tmp_path / f"invalid-{corruption}.scene"
        path.write_text(json.dumps(candidate), encoding="utf-8")
        transaction = SceneDocumentTransaction(scene, path=path)

        assert transaction.run_to_completion(raise_on_failure=False) is False
        assert transaction.ran_on_worker is True
        assert transaction.state is SceneDocumentTransactionState.FAILED
        assert transaction.document is None
        assert "Scene.objects[0].components[0]" in transaction.error
        assert scene.serialize_document() == original_document
        assert scene.find("WorkerRenderAudioExisting") is existing
        assert existing.get_component(component_type) is component

    @pytest.mark.parametrize("failure", ["missing_guid", "wrong_type", "embedded_material"])
    def test_resource_preflight_failure_preserves_live_scene(self, scene, tmp_path, failure):
        existing = scene.create_game_object("ResourcePreflightExisting")
        renderer = existing.add_component("MeshRenderer")
        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        renderer_document = candidate["objects"][0]["components"][0]

        if failure == "missing_guid":
            renderer_document["meshAssetGuid"] = "missing-scene-resource-guid"
        elif failure == "wrong_type":
            asset_database = AssetRegistry.instance().get_asset_database()
            asset_path = Path(asset_database.assets_root) / f"{tmp_path.name}-wrong-type.physicMaterial"
            asset_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "friction": 0.5,
                        "bounciness": 0.0,
                        "friction_combine": 0,
                        "bounce_combine": 0,
                    }
                ),
                encoding="utf-8",
            )
            renderer_document["meshAssetGuid"] = asset_database.import_asset(str(asset_path))
        else:
            renderer_document["materials"] = [{"material": {}}]

        path = tmp_path / f"resource-{failure}.scene"
        path.write_text(json.dumps(candidate), encoding="utf-8")
        transaction = SceneDocumentTransaction(scene, path=path)

        assert transaction.run_to_completion(raise_on_failure=False) is False
        assert transaction.ran_on_worker is True
        assert transaction.state is SceneDocumentTransactionState.FAILED
        if failure == "embedded_material":
            assert transaction.document is None
        else:
            assert transaction.document is not None
        assert "Scene.objects[0].components[0]" in transaction.error
        assert scene.serialize_document() == original_document
        assert scene.find("ResourcePreflightExisting") is existing
        assert existing.get_component("MeshRenderer") is renderer

    def test_resource_preflight_accepts_matching_asset_type(self, scene, tmp_path):
        existing = scene.create_game_object("ResourcePreflightSuccess")
        existing.add_component("BoxCollider")
        asset_database = AssetRegistry.instance().get_asset_database()
        asset_path = Path(asset_database.assets_root) / f"{tmp_path.name}-valid.physicMaterial"
        asset_path.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "friction": 0.65,
                    "bounciness": 0.1,
                    "friction_combine": 2,
                    "bounce_combine": 3,
                }
            ),
            encoding="utf-8",
        )
        material_guid = asset_database.import_asset(str(asset_path))
        document = scene.serialize_document()
        document["objects"][0]["components"][0]["physic_material_guid"] = material_guid
        path = tmp_path / "valid-resource.scene"
        path.write_text(json.dumps(document), encoding="utf-8")
        transaction = SceneDocumentTransaction(scene, path=path)

        assert transaction.run_to_completion(raise_on_failure=False) is True
        assert transaction.state is SceneDocumentTransactionState.COMPLETED
        restored = scene.find("ResourcePreflightSuccess").get_component("BoxCollider")
        assert restored.serialize_document()["physic_material_guid"] == material_guid

    def test_resource_preflight_accepts_explicitly_cleared_embedded_texture(self, scene):
        owner = scene.create_game_object("ClearedEmbeddedTexture")
        renderer = owner.add_component("MeshRenderer")
        material = InxMaterial.create_default_unlit()
        material.set_texture("texSampler", "white")
        material.clear_texture("texSampler")
        renderer.material = material

        transaction = SceneDocumentTransaction(scene, document=scene.serialize_document())

        assert transaction.run_to_completion(raise_on_failure=False) is True
        restored = scene.find("ClearedEmbeddedTexture").get_component("MeshRenderer").material
        assert restored.get_texture("texSampler") == ""

    def test_scene_file_manager_polls_path_transaction_across_frames(
        self,
        scene,
        tmp_path,
        monkeypatch,
    ):
        from Infernux.engine.project_context import get_project_root, set_project_root

        previous_root = get_project_root()
        previous_manager = SceneFileManager._instance
        project_root = tmp_path / "Project"
        assets = project_root / "Assets"
        assets.mkdir(parents=True)
        scene.create_game_object("DeferredManagerSource")
        document = scene.serialize_document()
        document["objects"][0]["name"] = "DeferredManagerTarget"
        path = assets / "deferred.scene"
        path.write_text(json.dumps(document), encoding="utf-8")

        try:
            set_project_root(str(project_root))
            manager = SceneFileManager()
            monkeypatch.setattr(manager, "_prepare_native_scene_swap", lambda: None)
            monkeypatch.setattr(manager, "_reset_undo_history", lambda **_kwargs: None)
            monkeypatch.setattr(manager, "_restore_camera_state", lambda _path: None)
            monkeypatch.setattr(manager, "_remember_last_scene", lambda _path: None)
            monkeypatch.setattr(manager, "sync_all_prefab_instances", lambda _scene: None)

            manager._begin_deferred_open(str(path))
            manager.poll_deferred_load()
            assert manager.is_loading is True
            assert manager.current_scene_path is None

            deadline = time.monotonic() + 2.0
            while manager.is_loading and time.monotonic() < deadline:
                manager.poll_deferred_load()
                time.sleep(0.001)

            assert manager.is_loading is False
            assert manager.current_scene_path == os.path.abspath(path)
            assert scene.find("DeferredManagerTarget") is not None
        finally:
            SceneFileManager._instance = previous_manager
            set_project_root(previous_root)

    def test_runtime_scene_manager_retains_pending_transaction_until_commit(
        self,
        scene,
        tmp_path,
        monkeypatch,
    ):
        from Infernux.engine.project_context import get_project_root, set_project_root
        from Infernux.scene import SceneManager as RuntimeSceneManager

        previous_root = get_project_root()
        previous_manager = SceneFileManager._instance
        project_root = tmp_path / "RuntimeProject"
        assets = project_root / "Assets"
        assets.mkdir(parents=True)
        scene.create_game_object("RuntimeDeferredSource")
        document = scene.serialize_document()
        document["objects"][0]["name"] = "RuntimeDeferredTarget"
        path = assets / "runtime-deferred.scene"
        path.write_text(json.dumps(document), encoding="utf-8")

        try:
            set_project_root(str(project_root))
            manager = SceneFileManager()
            monkeypatch.setattr(manager, "_prepare_native_scene_swap", lambda: None)
            monkeypatch.setattr(manager, "_reset_undo_history", lambda **_kwargs: None)
            monkeypatch.setattr(manager, "_restore_camera_state", lambda _path: None)
            monkeypatch.setattr(manager, "_remember_last_scene", lambda _path: None)
            monkeypatch.setattr(manager, "sync_all_prefab_instances", lambda _scene: None)

            RuntimeSceneManager._pending_scene_load = str(path)
            RuntimeSceneManager.process_pending_load()
            assert RuntimeSceneManager._active_scene_transaction is not None
            assert manager.current_scene_path is None

            deadline = time.monotonic() + 2.0
            while (
                RuntimeSceneManager._active_scene_transaction is not None
                and time.monotonic() < deadline
            ):
                RuntimeSceneManager.process_pending_load()
                time.sleep(0.001)

            assert RuntimeSceneManager._active_scene_transaction is None
            assert manager.current_scene_path == os.path.abspath(path)
            assert scene.find("RuntimeDeferredTarget") is not None
            assert scene.is_playing() is True
        finally:
            transaction = RuntimeSceneManager._active_scene_transaction
            if transaction is not None and not transaction.is_complete:
                transaction.cancel()
            RuntimeSceneManager._pending_scene_load = None
            RuntimeSceneManager._active_scene_transaction = None
            RuntimeSceneManager._active_scene_load_path = None
            RuntimeSceneManager._active_scene_file_manager = None
            SceneFileManager._instance = previous_manager
            set_project_root(previous_root)

    def test_scene_transaction_cancel_and_owner_thread_guard(self, scene):
        existing = scene.create_game_object("CancelledTransactionExisting")
        transaction = SceneDocumentTransaction(scene, document=scene.serialize_document())
        transaction.start()
        errors = []

        thread = threading.Thread(target=lambda: _capture_exception(transaction.poll, errors))
        thread.start()
        thread.join(timeout=2.0)

        assert len(errors) == 1
        assert "owner thread" in str(errors[0])
        assert transaction.cancel() is True
        assert transaction.state is SceneDocumentTransactionState.CANCELLED
        assert transaction.poll() is True
        assert scene.find("CancelledTransactionExisting") is existing

    def test_scene_transaction_cancel_discards_prepared_component_slots(self, scene):
        owner = scene.create_game_object("CancelPreparedGraph")
        owner.add_py_component(_StrictSceneComponent())
        alive_before = _cds_alive_count(_StrictSceneComponent)
        transaction = SceneDocumentTransaction(scene, document=scene.serialize_document())

        transaction.start()
        assert transaction.poll() is False
        assert transaction.state is SceneDocumentTransactionState.RESOURCES_READY
        assert transaction.poll() is False
        assert transaction.state is SceneDocumentTransactionState.READY_TO_COMMIT
        assert _cds_alive_count(_StrictSceneComponent) == alive_before + 1

        assert transaction.cancel() is True
        assert transaction.state is SceneDocumentTransactionState.CANCELLED
        assert _cds_alive_count(_StrictSceneComponent) == alive_before

    def test_serialize_produces_json(self, scene):
        scene.create_game_object("SerObj")
        json_str = scene.serialize()
        assert len(json_str) > 0
        assert "SerObj" in json_str

    def test_save_and_load(self, scene):
        go = scene.create_game_object("Persistent")
        go.transform.position = Vector3(42, 0, 0)
        json_str = scene.serialize()

        # Create a new scene and deserialize
        sm = SceneManager.instance()
        scene2 = sm.create_scene("loaded_scene")
        sm.set_active_scene(scene2)
        assert deserialize_scene_document_transactionally(scene2, json.loads(json_str)) is True
        assert not hasattr(scene2, "deserialize")
        assert not hasattr(scene2, "load_from_file")
        found = scene2.find("Persistent")
        assert found is not None
        assert found.transform.position.x == pytest.approx(42)

    def test_save_to_file_atomically_replaces_existing_content(self, scene, tmp_path):
        scene.create_game_object("AtomicSceneObject")
        scene_path = tmp_path / "atomic.scene"
        scene_path.write_text("old scene content", encoding="utf-8")

        assert scene.save_to_file(str(scene_path)) is True

        document = json.loads(scene_path.read_text(encoding="utf-8"))
        assert document["schema_version"] == 1
        assert document["objects"][0]["name"] == "AtomicSceneObject"
        assert list(tmp_path.glob("atomic.scene.tmp.*")) == []

    @pytest.mark.parametrize("schema_version", [0, 2, "1"])
    def test_deserialize_rejects_non_current_schema(self, scene, schema_version):
        original_name = scene.name
        document = json.loads(scene.serialize())
        document["schema_version"] = schema_version

        assert scene._commit_document(document) is False
        assert scene.name == original_name

    def test_deserialize_rejects_invalid_component_without_partial_scene(self, scene):
        existing = scene.create_game_object("ExistingSceneState")
        existing.transform.position = Vector3(17, 3, -2)
        valid_object = json.loads(scene.create_game_object("Valid").serialize())
        invalid_object = json.loads(scene.create_game_object("Invalid").serialize())
        original_document = scene.serialize_document()
        document = dict(original_document)
        invalid_object["components"].append(
            {"schema_version": 1, "type": "MissingNativeComponent"}
        )
        document["objects"] = [valid_object, invalid_object]

        assert scene._commit_document(document) is False
        assert scene.serialize_document() == original_document
        restored_existing = scene.find("ExistingSceneState")
        assert restored_existing is existing
        assert restored_existing.transform.position.x == pytest.approx(17)

    @pytest.mark.parametrize(
        "corruption",
        [
            "duplicate_object_id",
            "duplicate_component_id",
            "invalid_component_field",
            "invalid_main_camera",
            "unknown_scene_field",
            "unknown_object_field",
            "invalid_layer",
            "invalid_python_descriptor",
            "old_python_field_schema",
            "empty_python_script_guid",
        ],
    )
    def test_transactional_deserialize_preserves_live_graph(self, scene, corruption):
        first = scene.create_game_object("TransactionFirst")
        second = scene.create_game_object("TransactionSecond")
        first_rb = first.add_component("Rigidbody")
        first.add_py_component(_StrictSceneComponent())
        second.add_component("Rigidbody")
        first_rb.mass = 6.5

        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        first_doc, second_doc = candidate["objects"]

        if corruption == "duplicate_object_id":
            second_doc["id"] = first_doc["id"]
        elif corruption == "duplicate_component_id":
            second_doc["transform"]["component_id"] = first_doc["transform"]["component_id"]
        elif corruption == "invalid_component_field":
            first_doc["components"][0]["mass"] = "heavy"
        elif corruption == "invalid_main_camera":
            candidate["mainCameraComponentId"] = first_doc["components"][0]["component_id"]
        elif corruption == "unknown_scene_field":
            candidate["legacy"] = True
        elif corruption == "unknown_object_field":
            first_doc["legacy"] = True
        elif corruption == "invalid_layer":
            first_doc["layer"] = 32
        elif corruption == "invalid_python_descriptor":
            first_doc["py_components"][0]["legacy"] = True
        elif corruption == "empty_python_script_guid":
            first_doc["py_components"][0]["script_guid"] = ""
        else:
            first_doc["py_components"][0]["py_fields"]["__schema_version__"] = 0

        assert scene._commit_document(candidate) is False
        assert scene.serialize_document() == original_document
        assert scene.find("TransactionFirst") is first
        assert scene.find("TransactionSecond") is second
        assert first.get_component("Rigidbody") is first_rb
        assert first_rb.mass == pytest.approx(6.5)

    def test_python_field_preflight_runs_before_native_scene_commit(self, scene):
        existing = scene.create_game_object("PythonPreflightExisting")
        existing.add_py_component(_StrictSceneComponent())
        alive_before = _cds_alive_count(_StrictSceneComponent)
        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        candidate["objects"][0]["py_components"][0]["py_fields"]["value"] = "not-an-int"

        with pytest.raises(PythonComponentRestoreError, match="INT field requires an integer"):
            deserialize_scene_document_transactionally(scene, candidate)

        assert scene.serialize_document() == original_document
        assert scene.find("PythonPreflightExisting") is existing
        assert _cds_alive_count(_StrictSceneComponent) == alive_before

    def test_python_publish_callback_failure_rolls_back_committed_native_scene(self, scene):
        existing = scene.create_game_object("RollbackSource")
        original_component = _StrictSceneComponent()
        original_component.value = 29
        existing.add_py_component(original_component)
        original_document = scene.serialize_document()
        original_component_id = original_component.component_id
        strict_alive_before = _cds_alive_count(_StrictSceneComponent)

        candidate = json.loads(json.dumps(original_document))
        candidate["objects"][0]["name"] = "RollbackCandidate"
        descriptor = candidate["objects"][0]["py_components"][0]
        exploding = _ExplodingAfterDeserializeComponent()
        exploding._component_id = original_component_id
        descriptor["type"] = type(exploding).__name__
        descriptor["py_type_name"] = type(exploding).__name__
        descriptor["script_guid"] = exploding._script_guid
        descriptor["type_guid"] = type(exploding)._get_type_guid()
        descriptor["py_fields"] = exploding._serialize_fields_document()
        exploding._call_on_destroy()
        assert _cds_alive_count(_ExplodingAfterDeserializeComponent) == 0

        transaction = SceneDocumentTransaction(scene, document=candidate)

        assert transaction.run_to_completion(raise_on_failure=False) is False
        assert transaction.state is SceneDocumentTransactionState.FAILED
        assert transaction.rolled_back is True
        assert transaction.rollback_error == ""
        assert "intentional on_after_deserialize failure" in transaction.error
        assert scene.serialize_document() == original_document
        restored_object = scene.find("RollbackSource")
        restored_component = restored_object.get_py_component(_StrictSceneComponent)
        assert restored_component.component_id == original_component_id
        assert restored_component.value == 29
        assert scene.find("RollbackCandidate") is None
        assert scene.has_pending_py_components() is False
        assert _cds_alive_count(_StrictSceneComponent) == strict_alive_before
        assert _cds_alive_count(_ExplodingAfterDeserializeComponent) == 0

    def test_after_publish_hook_failure_rolls_back_complete_candidate_graph(self, scene):
        existing = scene.create_game_object("AfterPublishSource")
        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        candidate["objects"][0]["name"] = "AfterPublishCandidate"

        def fail_after_publish():
            raise RuntimeError("intentional after_publish failure")

        transaction = SceneDocumentTransaction(
            scene,
            document=candidate,
            after_publish=fail_after_publish,
        )

        assert transaction.run_to_completion(raise_on_failure=False) is False
        assert transaction.rolled_back is True
        assert "intentional after_publish failure" in transaction.error
        assert scene.serialize_document() == original_document
        assert scene.find("AfterPublishSource") is not None
        assert scene.find("AfterPublishCandidate") is None
        assert scene.find("AfterPublishSource") is not existing

    def test_python_publish_uses_attach_callback_activate_barrier(self, scene):
        first = scene.create_game_object("PublishBarrierFirst")
        second = scene.create_game_object("PublishBarrierSecond")
        first_component = _PublishBarrierComponent()
        first_component.value = 1
        second_component = _PublishBarrierComponent()
        second_component.value = 2
        first.add_py_component(first_component)
        second.add_py_component(second_component)
        document = scene.serialize_document()
        _PublishBarrierComponent._events.clear()

        transaction = SceneDocumentTransaction(scene, document=document)

        assert transaction.run_to_completion(raise_on_failure=False) is True
        assert _PublishBarrierComponent._events == [
            ("after", 1),
            ("after", 2),
            ("awake", 1),
            ("awake", 2),
        ]

    def test_python_preflight_rejects_missing_required_component_without_auto_add(self, scene):
        owner = scene.create_game_object("StrictRequiredComponent")
        owner.add_component("Rigidbody")
        owner.add_py_component(_RequiresRigidbodyComponent())
        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        candidate["objects"][0]["components"] = [
            component
            for component in candidate["objects"][0]["components"]
            if component["type"] != "Rigidbody"
        ]

        transaction = SceneDocumentTransaction(scene, document=candidate)

        assert transaction.run_to_completion(raise_on_failure=False) is False
        assert "requires missing component 'Rigidbody'" in transaction.error
        assert scene.serialize_document() == original_document
        assert scene.find("StrictRequiredComponent") is owner

    def test_python_preflight_rejects_duplicate_disallow_multiple_component(self, scene):
        owner = scene.create_game_object("StrictDisallowMultiple")
        owner.add_py_component(_SingleInstanceSceneComponent())
        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        duplicate = json.loads(json.dumps(candidate["objects"][0]["py_components"][0]))
        duplicate_id = duplicate["component_id"] + 100000
        duplicate["component_id"] = duplicate_id
        duplicate["py_fields"]["__component_id__"] = duplicate_id
        candidate["objects"][0]["py_components"].append(duplicate)

        transaction = SceneDocumentTransaction(scene, document=candidate)

        assert transaction.run_to_completion(raise_on_failure=False) is False
        assert "disallows multiple instances" in transaction.error
        assert scene.serialize_document() == original_document
        assert scene.find("StrictDisallowMultiple") is owner

    def test_preflighted_python_graph_is_published_after_native_commit(self, scene):
        existing = scene.create_game_object("PythonPreflightSuccess")
        original_component = _StrictSceneComponent()
        original_component.value = 19
        existing.add_py_component(original_component)
        original_component_id = original_component.component_id
        candidate = json.loads(json.dumps(scene.serialize_document()))

        assert deserialize_scene_document_transactionally(scene, candidate) is True

        restored_object = scene.find("PythonPreflightSuccess")
        restored_component = restored_object.get_py_component(_StrictSceneComponent)
        assert restored_object is not existing
        assert restored_component is not original_component
        assert restored_component.component_id == original_component_id
        assert restored_component.value == 19
        assert scene.has_pending_py_components() is False

    def test_python_component_document_uses_stable_script_and_type_guids(self, scene):
        root = scene.create_game_object("StablePythonIdentity")
        component = _StrictSceneComponent()
        root.add_py_component(component)

        descriptor = root.serialize_document()["py_components"][0]

        assert descriptor["script_guid"] == component._script_guid
        assert descriptor["type_guid"] == component.__class__._get_type_guid()
        assert len(descriptor["script_guid"]) == 32
        assert len(descriptor["type_guid"]) == 32

    def test_python_preflight_rejects_mismatched_type_guid_transactionally(self, scene):
        root = scene.create_game_object("MismatchedPythonIdentity")
        component = _StrictSceneComponent()
        root.add_py_component(component)
        original_document = root.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        candidate["py_components"][0]["type_guid"] = "f" * 32

        with pytest.raises(PythonComponentRestoreError, match="cannot resolve"):
            deserialize_game_object_document_transactionally(root, candidate)

        assert root.serialize_document() == original_document
        assert root.get_py_component(_StrictSceneComponent) is component

    def test_native_pending_python_record_uses_structured_fields_document(self, scene):
        root = scene.create_game_object("StructuredPendingRecord")
        component = _StrictSceneComponent()
        component.value = 23
        root.add_py_component(component)
        document = json.loads(json.dumps(scene.serialize_document()))

        assert scene._commit_document(document) is True

        pending = scene.get_pending_py_components()
        assert len(pending) == 1
        assert pending[0].fields_document == document["objects"][0]["py_components"][0]["py_fields"]
        assert pending[0].type_guid == document["objects"][0]["py_components"][0]["type_guid"]
        assert not hasattr(pending[0], "fields_json")
        scene.take_pending_py_components()

    def test_scene_restore_rejects_python_component_id_owned_by_another_scene(self, scene):
        source = scene.create_game_object("LiveSourceSceneObject")
        source_component = _StrictSceneComponent()
        source.add_py_component(source_component)
        document = json.loads(json.dumps(scene.serialize_document()))
        manager = SceneManager.instance()
        target = manager.create_scene("PythonIdCollisionTarget")
        target.create_game_object("TargetState")
        original_target_document = target.serialize_document()

        assert deserialize_scene_document_transactionally(target, document) is False

        assert target.serialize_document() == original_target_document
        assert source.get_py_component(_StrictSceneComponent) is source_component

    def test_scene_preflight_rejects_duplicate_python_component_id(self, scene):
        first = scene.create_game_object("FirstPythonId")
        second = scene.create_game_object("SecondPythonId")
        first_component = _StrictSceneComponent()
        second_component = _StrictSceneComponent()
        first.add_py_component(first_component)
        second.add_py_component(second_component)
        original_document = scene.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        first_descriptor = candidate["objects"][0]["py_components"][0]
        second_descriptor = candidate["objects"][1]["py_components"][0]
        second_descriptor["component_id"] = first_descriptor["component_id"]
        second_descriptor["py_fields"]["__component_id__"] = first_descriptor["component_id"]

        with pytest.raises(PythonComponentRestoreError, match="duplicate component_id"):
            deserialize_scene_document_transactionally(scene, candidate)

        assert scene.serialize_document() == original_document

    def test_game_object_python_preflight_preserves_live_subtree(self, scene):
        root = scene.create_game_object("ObjectPreflightExisting")
        component = _StrictSceneComponent()
        root.add_py_component(component)
        original_document = root.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        candidate["py_components"][0]["py_fields"]["value"] = "not-an-int"

        with pytest.raises(PythonComponentRestoreError, match="INT field requires an integer"):
            deserialize_game_object_document_transactionally(root, candidate)

        assert scene.find("ObjectPreflightExisting") is root
        assert root.serialize_document() == original_document
        assert root.get_py_component(_StrictSceneComponent) is component

    def test_prefab_conversion_rejects_reference_outside_subtree(self, scene):
        external = scene.create_game_object("ExternalReferenceTarget")
        source = scene.create_game_object("IdlessReferenceSource")
        component = _ObjectRefSceneComponent()
        component.target = GameObjectRef(persistent_id=external.id)
        source.add_py_component(component)
        document = json.loads(json.dumps(source.serialize_document()))
        before_ids = {obj.id for obj in scene.get_all_objects()}

        with pytest.raises(PrefabDocumentError, match="outside its subtree"):
            _strip_prefab_runtime_fields(document)

        assert {obj.id for obj in scene.get_all_objects()} == before_ids

    def test_idless_object_graph_publishes_prepared_component(self, scene):
        source = scene.create_game_object("IdlessPreparedSource")
        component = _StrictSceneComponent()
        component.value = 31
        source.add_py_component(component)
        document = json.loads(json.dumps(source.serialize_document()))
        _strip_prefab_runtime_fields(document)

        created = instantiate_game_object_document_transactionally(scene, document)

        restored = created.get_py_component(_StrictSceneComponent)
        assert created is not source
        assert restored.component_id != component.component_id
        assert restored.value == 31
        assert scene.has_pending_py_components() is False

    def test_game_object_restore_preserves_python_component_id(self, scene):
        root = scene.create_game_object("StablePythonComponent")
        original = _StrictSceneComponent()
        root.add_py_component(original)
        original_id = original.component_id
        candidate = json.loads(json.dumps(root.serialize_document()))

        assert deserialize_game_object_document_transactionally(root, candidate) is True

        restored = root.get_py_component(_StrictSceneComponent)
        assert restored is not original
        assert restored.component_id == original_id

    def test_game_object_restore_rejects_mismatched_python_component_id(self, scene):
        root = scene.create_game_object("MismatchedPythonComponent")
        original = _StrictSceneComponent()
        root.add_py_component(original)
        original_document = root.serialize_document()
        candidate = json.loads(json.dumps(original_document))
        candidate["py_components"][0]["component_id"] += 1

        with pytest.raises(PythonComponentRestoreError, match="metadata does not match"):
            deserialize_game_object_document_transactionally(root, candidate)

        assert root.serialize_document() == original_document
        assert root.get_py_component(_StrictSceneComponent) is original

    def test_idless_object_graph_remaps_internal_python_references(self, scene):
        source = scene.create_game_object("LocalReferenceRoot")
        child = scene.create_game_object("LocalReferenceChild")
        child.set_parent(source)
        child.add_py_component(_StrictSceneComponent())
        refs = _ObjectGraphRefsComponent()
        refs.target_object = GameObjectRef(child)
        refs.target_component = ComponentRef(
            go_id=child.id,
            component_type="_StrictSceneComponent",
        )
        source.add_py_component(refs)
        document = json.loads(json.dumps(source.serialize_document()))
        _strip_prefab_runtime_fields(document)

        created = instantiate_game_object_document_transactionally(scene, document)

        created_child = created.get_child(0)
        restored = created.get_py_component(_ObjectGraphRefsComponent)
        assert restored.target_object is created_child
        assert restored.target_component is created_child.get_py_component(_StrictSceneComponent)

    @pytest.mark.parametrize(
        "corruption",
        ["unknown_component", "invalid_component_field", "missing_name", "unknown_field", "invalid_layer"],
    )
    def test_game_object_preflight_preserves_live_subtree(self, scene, corruption):
        root = scene.create_game_object("LiveObject")
        child = scene.create_game_object("DetachedChild")
        child.set_parent(root)
        rigidbody = root.add_component("Rigidbody")
        rigidbody.mass = 4.25
        original_document = root.serialize_document()
        candidate = json.loads(json.dumps(original_document))

        if corruption == "unknown_component":
            candidate["components"].append(
                {"schema_version": 1, "type": "RemovedNativeComponent"}
            )
        elif corruption == "invalid_component_field":
            candidate["components"][0]["mass"] = "not-a-number"
        elif corruption == "missing_name":
            candidate.pop("name")
        elif corruption == "unknown_field":
            candidate["legacy"] = True
        else:
            candidate["layer"] = -1

        assert root._commit_document(candidate) is False
        assert root.serialize_document() == original_document
        assert scene.find("LiveObject") is root
        assert root.get_children()[0] is child
        assert root.get_component("Rigidbody") is rigidbody
        assert rigidbody.mass == pytest.approx(4.25)

    @pytest.mark.parametrize("collision", ["game_object_id", "component_id", "python_component_id"])
    def test_game_object_commit_rejects_ids_owned_outside_subtree(self, scene, collision):
        root = scene.create_game_object("CollisionCheckedRoot")
        rigidbody = root.add_component("Rigidbody")
        outside = scene.create_game_object("OutsideOwner")
        outside_collider = outside.add_component("BoxCollider")
        root_python = _StrictSceneComponent()
        outside_python = _StrictSceneComponent()
        root.add_py_component(root_python)
        outside.add_py_component(outside_python)
        original_document = root.serialize_document()
        candidate = json.loads(json.dumps(original_document))

        if collision == "game_object_id":
            candidate["id"] = outside.id
        elif collision == "component_id":
            candidate["components"][0]["component_id"] = outside_collider.component_id
        else:
            candidate["py_components"][0]["component_id"] = outside_python.component_id
            candidate["py_components"][0]["py_fields"]["__component_id__"] = outside_python.component_id

        if collision == "python_component_id":
            assert deserialize_game_object_document_transactionally(root, candidate) is False
        else:
            assert root._commit_document(candidate) is False
        assert root.serialize_document() == original_document
        assert scene.find("CollisionCheckedRoot") is root
        assert root.get_component("Rigidbody") is rigidbody
        assert scene.find("OutsideOwner") is outside
        assert outside.get_component("BoxCollider") is outside_collider

    def test_game_object_commit_adopts_staged_native_graph_once(self, scene):
        root = scene.create_game_object("StagedRoot")
        old_child = scene.create_game_object("OldChild")
        old_child.set_parent(root)
        old_rigidbody = root.add_component("Rigidbody")
        old_child_id = old_child.id
        old_rigidbody_id = old_rigidbody.component_id
        candidate = json.loads(json.dumps(root.serialize_document()))
        candidate["name"] = "CommittedRoot"
        candidate["components"][0]["mass"] = 7.5
        candidate["children"][0]["name"] = "CommittedChild"
        structure_version = scene.structure_version

        assert deserialize_game_object_document_transactionally(root, candidate) is True

        assert scene.find("CommittedRoot") is root
        assert scene.find_by_id(old_child_id) is root.get_child(0)
        assert root.get_child(0).name == "CommittedChild"
        assert root.serialize_document()["components"][0]["mass"] == pytest.approx(7.5)
        restored_rigidbody = root.get_component("Rigidbody")
        assert restored_rigidbody is not old_rigidbody
        assert old_rigidbody.is_valid is False
        assert restored_rigidbody.component_id == old_rigidbody_id
        assert restored_rigidbody.mass == pytest.approx(7.5)
        assert scene.structure_version == structure_version + 1

    def test_game_object_commit_clears_removed_main_camera(self, scene):
        root = scene.create_game_object("CameraOwner")
        camera = root.add_component("Camera")
        scene.main_camera = camera
        candidate = json.loads(json.dumps(root.serialize_document()))
        candidate["components"] = []

        assert root._commit_document(candidate) is True
        assert scene.main_camera is None

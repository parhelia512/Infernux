"""Tests for Infernux.engine.play_mode — PlayModeState, PlayModeEvent, PlayModeManager."""

from Infernux.engine.play_mode import PlayModeState, PlayModeEvent, PlayModeManager


class _FakeRuntimeGameObject:
    def __init__(self, object_id: int, name: str):
        self.id = object_id
        self.name = name
        self.transform = object()


# ══════════════════════════════════════════════════════════════════════
# PlayModeState enum
# ══════════════════════════════════════════════════════════════════════

class TestPlayModeState:
    def test_members_exist(self):
        assert PlayModeState.EDIT is not None
        assert PlayModeState.PLAYING is not None
        assert PlayModeState.PAUSED is not None

    def test_distinct_values(self):
        values = {PlayModeState.EDIT, PlayModeState.PLAYING, PlayModeState.PAUSED}
        assert len(values) == 3


# ══════════════════════════════════════════════════════════════════════
# PlayModeEvent
# ══════════════════════════════════════════════════════════════════════

class TestPlayModeEvent:
    def test_fields(self):
        evt = PlayModeEvent(
            old_state=PlayModeState.EDIT,
            new_state=PlayModeState.PLAYING,
            timestamp=1.0,
        )
        assert evt.old_state is PlayModeState.EDIT
        assert evt.new_state is PlayModeState.PLAYING
        assert evt.timestamp == 1.0


# ══════════════════════════════════════════════════════════════════════
# PlayModeManager
# ══════════════════════════════════════════════════════════════════════

class TestPlayModeManager:
    def test_initial_state_is_edit(self):
        mgr = PlayModeManager()
        assert mgr._state is PlayModeState.EDIT

    def test_singleton_instance(self):
        mgr = PlayModeManager()
        assert PlayModeManager.instance() is mgr

    def test_timing_defaults(self):
        mgr = PlayModeManager()
        assert mgr._delta_time == 0.0
        assert mgr._time_scale == 1.0
        assert mgr._total_play_time == 0.0

    def test_scene_backup_none_initially(self):
        mgr = PlayModeManager()
        assert mgr._scene_backup is None
        assert mgr._scene_path_backup is None

    def test_listener_list_empty(self):
        mgr = PlayModeManager()
        assert mgr._state_change_listeners == []

    def test_set_asset_database(self):
        mgr = PlayModeManager()
        mgr.set_asset_database("fake_db")
        assert mgr._asset_database == "fake_db"

    def test_register_runtime_hidden_object_tracks_ids(self):
        mgr = PlayModeManager()
        obj = _FakeRuntimeGameObject(404, "HiddenClone")

        mgr.register_runtime_hidden_object(obj)

        assert mgr.is_runtime_hidden_object_id(404)

    def test_rebuild_scene_failure_preserves_runtime_hidden_ids(self):
        mgr = PlayModeManager()
        mgr._runtime_hidden_object_ids = {1, 2, 3}

        assert not mgr._rebuild_active_scene(None, for_play=False)
        assert mgr._runtime_hidden_object_ids == {1, 2, 3}

    def test_rejected_document_preserves_runtime_hidden_ids(self, monkeypatch):
        class _RejectingScene:
            def _commit_document(self, snapshot):
                return False

        class _FakeSceneManager:
            def get_active_scene(self):
                return _RejectingScene()

        mgr = PlayModeManager()
        mgr._runtime_hidden_object_ids = {77}
        monkeypatch.setattr(mgr, "_get_scene_manager", lambda: _FakeSceneManager())

        assert not mgr._rebuild_active_scene({"invalid": True}, for_play=False)
        assert mgr._runtime_hidden_object_ids == {77}

    def test_rebuild_scene_does_not_materialize_prefab_refs_for_play(self, monkeypatch):
        class _FakeScene:
            def __init__(self):
                self.playing = None
                self.document = {
                    "schema_version": 1,
                    "name": "FakeLiveScene",
                    "isPlaying": False,
                    "objects": [],
                }

            def serialize_document(self):
                return dict(self.document)

            def _commit_document(self, snapshot):
                self.document = dict(snapshot)
                return True

            def set_playing(self, playing):
                self.playing = playing

        class _FakeSceneManager:
            def __init__(self, scene):
                self._scene = scene

            def get_active_scene(self):
                return self._scene

        mgr = PlayModeManager()
        scene = _FakeScene()
        scene_manager = _FakeSceneManager(scene)
        materialized = False

        monkeypatch.setattr(mgr, "_get_scene_manager", lambda: scene_manager)
        from Infernux.engine import component_restore
        monkeypatch.setattr(
            component_restore,
            "preflight_scene_python_components",
            lambda snapshot, asset_database=None: component_restore.PreparedPythonComponentGraph([]),
        )
        monkeypatch.setattr(
            component_restore,
            "publish_prepared_scene_python_components",
            lambda scene, prepared, clear_registries=True: prepared.consume(),
        )

        def _unexpected_materialize():
            nonlocal materialized
            materialized = True

        monkeypatch.setattr(mgr, "_materialize_prefab_references_for_play", _unexpected_materialize)

        snapshot = {
            "schema_version": 1,
            "name": "PlayModeRebuild",
            "isPlaying": False,
            "objects": [],
        }
        assert mgr._rebuild_active_scene(snapshot, for_play=True)
        assert scene.playing is True
        assert not materialized

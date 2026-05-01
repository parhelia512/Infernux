from __future__ import annotations

import importlib.util
import json

import pytest

from Infernux.engine.game_builder import BuildOutputDirectoryError, GameBuilder
from Infernux.engine.nuitka_builder import NuitkaBuilder


def _make_project(tmp_path):
    project_root = tmp_path / "project"
    settings_dir = project_root / "ProjectSettings"
    settings_dir.mkdir(parents=True)
    scene_path = project_root / "main.scene"
    scene_path.write_text("scene", encoding="utf-8")
    (settings_dir / "BuildSettings.json").write_text(
        json.dumps({"scenes": [str(scene_path)]}, ensure_ascii=False),
        encoding="utf-8",
    )
    return project_root


def _make_builder(tmp_path, output_dir):
    project_root = _make_project(tmp_path)
    return GameBuilder(str(project_root), str(output_dir), game_name="TestGame")


def _write_asset_script(project_root, relative_path: str, source: str) -> None:
    script_path = project_root / "Assets" / relative_path
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_text(source, encoding="utf-8")


class TestGameBuilderOutputSafety:
    def test_validate_rejects_non_empty_unmarked_output_dir(self, tmp_path):
        output_dir = tmp_path / "build_output"
        output_dir.mkdir()
        keep_file = output_dir / "keep.txt"
        keep_file.write_text("keep", encoding="utf-8")
        builder = _make_builder(tmp_path, output_dir)

        with pytest.raises(BuildOutputDirectoryError) as exc_info:
            builder._validate()

        assert exc_info.value.reason == "not-empty-unmarked"
        assert exc_info.value.entries == ["keep.txt"]

        assert keep_file.read_text(encoding="utf-8") == "keep"

    def test_clean_output_allows_marked_build_directory(self, tmp_path):
        output_dir = tmp_path / "build_output"
        output_dir.mkdir()
        old_file = output_dir / "old.bin"
        old_file.write_text("old", encoding="utf-8")
        nested_dir = output_dir / "Data"
        nested_dir.mkdir()
        (nested_dir / "stale.txt").write_text("stale", encoding="utf-8")

        builder = _make_builder(tmp_path, output_dir)
        builder._write_output_marker(str(output_dir))

        builder._validate()
        builder._clean_output()

        assert output_dir.is_dir()
        assert list(output_dir.iterdir()) == []

    def test_write_output_marker_creates_reusable_build_marker(self, tmp_path):
        output_dir = tmp_path / "build_output"
        output_dir.mkdir()
        builder = _make_builder(tmp_path, output_dir)

        builder._write_output_marker(str(output_dir))

        marker_path = output_dir / GameBuilder.OUTPUT_MARKER_FILENAME
        assert marker_path.is_file()
        payload = json.loads(marker_path.read_text(encoding="utf-8"))
        assert payload["tool"] == "Infernux"
        assert payload["kind"] == "build-output"
        assert payload["project_name"] == "TestGame"


class TestGameBuilderDependencyCollection:
    def test_collect_user_dependencies_excludes_mcp_packages_from_requirements(self, tmp_path, monkeypatch):
        project_root = _make_project(tmp_path)
        (project_root / "requirements.txt").write_text(
            "mcp>=1.24,<2\nfastmcp\n",
            encoding="utf-8",
        )
        builder = GameBuilder(str(project_root), str(tmp_path / "build_output"), game_name="TestGame")

        def fake_find_spec(name):
            assert name not in {"mcp", "fastmcp"}
            return None

        monkeypatch.setattr(importlib.util, "find_spec", fake_find_spec)

        assert builder._collect_user_dependencies() == []

    def test_collect_user_dependencies_excludes_mcp_packages_from_asset_imports(self, tmp_path, monkeypatch):
        project_root = _make_project(tmp_path)
        _write_asset_script(project_root, "tooling.py", "import mcp\nimport fastmcp\n")
        builder = GameBuilder(str(project_root), str(tmp_path / "build_output"), game_name="TestGame")

        def fake_find_spec(name):
            assert name not in {"mcp", "fastmcp"}
            return None

        monkeypatch.setattr(importlib.util, "find_spec", fake_find_spec)

        assert builder._collect_user_dependencies() == []

    def test_project_requirement_files_filters_mcp_for_game_build(self, tmp_path):
        project_root = _make_project(tmp_path)
        req_path = project_root / "requirements.txt"
        req_path.write_text(
            "# keep comments\n"
            "mcp>=1.24,<2\n"
            "requests>=2\n"
            "fastmcp\n",
            encoding="utf-8",
        )
        builder = GameBuilder(str(project_root), str(tmp_path / "build_output"), game_name="TestGame")

        filtered_files = builder._project_requirement_files()

        assert len(filtered_files) == 1
        filtered_text = open(filtered_files[0], "r", encoding="utf-8").read()
        assert "requests>=2" in filtered_text
        assert "mcp" not in filtered_text.lower()
        assert "fastmcp" not in filtered_text.lower()
        assert "mcp>=1.24,<2" in req_path.read_text(encoding="utf-8")

    def test_filter_shipped_requirements_removes_mcp_and_disabled_jit(self, tmp_path):
        data_dir = tmp_path / "build_output" / "Data"
        settings_dir = data_dir / "ProjectSettings"
        settings_dir.mkdir(parents=True)
        req_path = settings_dir / "requirements.txt"
        req_path.write_text(
            "numba>=0.61.0\n"
            "mcp>=1.24,<2\n"
            "fastmcp\n"
            "requests>=2\n",
            encoding="utf-8",
        )
        builder = _make_builder(tmp_path, tmp_path / "build_output")

        builder._filter_shipped_requirements(str(data_dir))

        filtered_text = req_path.read_text(encoding="utf-8")
        assert "requests>=2" in filtered_text
        assert "numba" not in filtered_text.lower()
        assert "mcp" not in filtered_text.lower()
        assert "fastmcp" not in filtered_text.lower()

    def test_nuitka_builder_treats_mcp_as_game_build_excluded(self):
        assert NuitkaBuilder._is_game_build_excluded_package("mcp")
        assert NuitkaBuilder._is_game_build_excluded_package("fastmcp.server")
        assert not NuitkaBuilder._is_game_build_excluded_package("requests")

    def test_collect_user_dependencies_adds_llvmlite_for_numba_import(self, tmp_path, monkeypatch):
        project_root = _make_project(tmp_path)
        _write_asset_script(project_root, "stress.py", "import numba\n")
        builder = GameBuilder(str(project_root), str(tmp_path / "build_output"), game_name="TestGame")

        original_find_spec = importlib.util.find_spec

        def fake_find_spec(name):
            if name in {"numba", "llvmlite", "numpy"}:
                return object()
            return original_find_spec(name)

        monkeypatch.setattr(importlib.util, "find_spec", fake_find_spec)

        deps = builder._collect_user_dependencies()

        assert deps == ["llvmlite", "numba", "numpy"]


class TestGameBuilderAutoParallelExport:
    def test_compile_user_scripts_emits_auto_parallel_sidecar_pyc(self, tmp_path):
        output_dir = tmp_path / "build_output"
        assets_dir = output_dir / "Data" / "Assets"
        assets_dir.mkdir(parents=True)

        script_path = assets_dir / "stress.py"
        script_path.write_text(
            "from Infernux.jit import njit\n"
            "@njit(cache=True, auto_parallel=True)\n"
            "def burn(n):\n"
            "    acc = 0\n"
            "    for i in range(n):\n"
            "        acc += i\n"
            "    return acc\n",
            encoding="utf-8",
        )

        builder = _make_builder(tmp_path, output_dir)
        builder._compile_user_scripts(str(output_dir))

        assert not script_path.exists()
        assert (assets_dir / "stress.pyc").is_file()
        assert (assets_dir / "stress.autop.pyc").is_file()

    def test_compile_user_scripts_skips_sidecar_for_non_auto_parallel_script(self, tmp_path):
        output_dir = tmp_path / "build_output"
        assets_dir = output_dir / "Data" / "Assets"
        assets_dir.mkdir(parents=True)

        script_path = assets_dir / "plain.py"
        script_path.write_text(
            "from Infernux.jit import njit\n"
            "@njit(cache=True)\n"
            "def burn(n):\n"
            "    acc = 0\n"
            "    for i in range(n):\n"
            "        acc += i\n"
            "    return acc\n",
            encoding="utf-8",
        )

        builder = _make_builder(tmp_path, output_dir)
        builder._compile_user_scripts(str(output_dir))

        assert not script_path.exists()
        assert (assets_dir / "plain.pyc").is_file()
        assert not (assets_dir / "plain.autop.pyc").exists()

    def test_collect_user_dependencies_detects_public_infernux_jit_api(self, tmp_path, monkeypatch):
        project_root = _make_project(tmp_path)
        _write_asset_script(project_root, "jit_user.py", "from Infernux.jit import njit\n")
        builder = GameBuilder(str(project_root), str(tmp_path / "build_output"), game_name="TestGame")

        original_find_spec = importlib.util.find_spec

        def fake_find_spec(name):
            if name in {"numba", "llvmlite", "numpy"}:
                return object()
            return original_find_spec(name)

        monkeypatch.setattr(importlib.util, "find_spec", fake_find_spec)

        deps = builder._collect_user_dependencies()

        assert deps == ["llvmlite", "numba", "numpy"]
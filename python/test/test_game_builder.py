from __future__ import annotations

import importlib.util
import json
import os
import sys
import threading
import time
from types import SimpleNamespace

import pytest

from Infernux.engine.build_cancellation import BuildCancelled
from Infernux.engine.game_builder import BuildOutputDirectoryError, GameBuilder
from Infernux.engine import nuitka_builder as nuitka_builder_module
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


def test_build_cancellation_is_not_reported_as_a_build_failure(tmp_path, monkeypatch):
    builder = _make_builder(tmp_path, tmp_path / "build_output")
    error_messages: list[str] = []
    monkeypatch.setattr(builder, "_build_inner", lambda *_args, **_kwargs: (_ for _ in ()).throw(BuildCancelled()))
    monkeypatch.setattr("Infernux.engine.game_builder.Debug.log_error", error_messages.append)

    with pytest.raises(BuildCancelled):
        builder.build()

    build_log = (tmp_path / "project" / "Logs" / "build.log").read_text(encoding="utf-8")
    assert "Build cancelled by user." in build_log
    assert "BUILD FAILED" not in build_log
    assert error_messages == []


def test_nuitka_cancellation_does_not_wait_for_the_next_stdout_line(tmp_path, monkeypatch):
    monkeypatch.setattr(nuitka_builder_module, "_ensure_windows_msvc_environment", lambda env: env)
    builder = object.__new__(NuitkaBuilder)
    builder._staging_dir = str(tmp_path)
    cancelled = threading.Event()
    cancelled.set()

    started = time.perf_counter()
    with pytest.raises(BuildCancelled):
        builder._run_nuitka(
            [sys.executable, "-u", "-c", "import time; time.sleep(30)"],
            on_progress=None,
            cancel_event=cancelled,
        )

    assert time.perf_counter() - started < 2.5


def test_player_always_raw_copies_numpy_when_jit_is_disabled(tmp_path, monkeypatch):
    captured: dict = {}

    class _FakeNuitkaBuilder:
        _JIT_NOFOLLOW_PACKAGES = NuitkaBuilder._JIT_NOFOLLOW_PACKAGES

        def __init__(self, **kwargs):
            captured.update(kwargs)

        def build(self, **_kwargs):
            return str(tmp_path / "dist")

    monkeypatch.setattr("Infernux.engine.game_builder.NuitkaBuilder", _FakeNuitkaBuilder)
    builder = _make_builder(tmp_path, tmp_path / "build_output")
    builder.enable_jit = False

    result = builder._run_nuitka(
        str(tmp_path / "boot.py"),
        on_progress=None,
        user_packages=[],
    )

    assert result == str(tmp_path / "dist")
    assert captured["raw_copy_packages"] == ["numpy"]
    assert captured["runtime_pack_cache"] is False
    assert captured["output_filename"] == "TestGame.exe"


def test_debug_player_uses_generic_reusable_runtime_pack(tmp_path, monkeypatch):
    captured: dict = {}

    class _FakeNuitkaBuilder:
        _JIT_NOFOLLOW_PACKAGES = NuitkaBuilder._JIT_NOFOLLOW_PACKAGES

        def __init__(self, **kwargs):
            captured.update(kwargs)

        def build(self, **_kwargs):
            return str(tmp_path / "dist")

    monkeypatch.setattr("Infernux.engine.game_builder.NuitkaBuilder", _FakeNuitkaBuilder)
    builder = _make_builder(tmp_path, tmp_path / "build_output")
    builder.debug_mode = True

    builder._run_nuitka(str(tmp_path / "boot.py"), on_progress=None, user_packages=[])

    assert captured["runtime_pack_cache"] is True
    assert captured["output_filename"] == ("InfernuxPlayer.exe" if sys.platform == "win32" else "InfernuxPlayer")
    assert captured["product_name"] == "Infernux Player"
    assert captured["icon_path"] is None


def test_runtime_pack_cache_round_trip(tmp_path, monkeypatch):
    cache_root = tmp_path / "runtime-packs"
    monkeypatch.setattr(nuitka_builder_module, "_RUNTIME_PACK_DIR", str(cache_root))
    builder = object.__new__(NuitkaBuilder)
    builder._staging_dir = str(tmp_path / "staging")
    os.makedirs(builder._staging_dir)
    dist = tmp_path / "original.dist"
    dist.mkdir()
    (dist / "InfernuxPlayer.exe").write_bytes(b"runtime")

    builder._store_runtime_pack("a" * 64, str(dist))
    restored = builder._restore_runtime_pack("a" * 64)

    assert restored == os.path.join(builder._staging_dir, "boot.dist")
    assert (tmp_path / "staging" / "boot.dist" / "InfernuxPlayer.exe").read_bytes() == b"runtime"
    marker = json.loads((tmp_path / "staging" / "boot.dist" / "_infernux_runtime_pack.json").read_text())
    assert marker["fingerprint"] == "a" * 64


def test_requirements_install_is_skipped_when_content_is_unchanged(tmp_path, monkeypatch):
    state_root = tmp_path / "requirements-state"
    monkeypatch.setattr(nuitka_builder_module, "_REQUIREMENTS_STATE_DIR", str(state_root))
    requirements = tmp_path / "requirements.txt"
    requirements.write_text("requests==2.32.0\n", encoding="utf-8")
    calls: list[list[str]] = []
    monkeypatch.setattr(nuitka_builder_module.subprocess, "check_call", lambda command: calls.append(command))

    nuitka_builder_module._install_requirements_files(sys.executable, [str(requirements)])
    nuitka_builder_module._install_requirements_files(sys.executable, [str(requirements)])

    assert len(calls) == 1


def test_player_cleanup_preserves_engine_icon_resources(tmp_path):
    builder = _make_builder(tmp_path, tmp_path / "build_output")
    final_dir = tmp_path / "dist"
    icons = final_dir / "Infernux" / "resources" / "icons"
    icons.mkdir(parents=True)
    camera_icon = icons / "gizmo_camera.png"
    light_icon = icons / "gizmo_light.png"
    camera_icon.write_bytes(b"camera")
    light_icon.write_bytes(b"light")

    builder._cleanup_dist(str(final_dir))

    assert camera_icon.read_bytes() == b"camera"
    assert light_icon.read_bytes() == b"light"


def test_code_signing_isolates_windows_powershell_modules(tmp_path, monkeypatch):
    system_root = tmp_path / "Windows"
    powershell_root = system_root / "System32" / "WindowsPowerShell" / "v1.0"
    powershell_exe = powershell_root / "powershell.exe"
    powershell_exe.parent.mkdir(parents=True)
    powershell_exe.write_bytes(b"")
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    (dist_dir / "Game.exe").write_bytes(b"exe")

    monkeypatch.setenv("SystemRoot", str(system_root))
    monkeypatch.setenv("PSModulePath", "C:/Program Files/PowerShell/7/Modules")
    observed: dict = {}
    internal_messages: list[str] = []
    warnings: list[str] = []

    def _run(command, **kwargs):
        observed["command"] = command
        observed.update(kwargs)
        return SimpleNamespace(
            returncode=0,
            stdout=(
                "STATUS:UnknownError\n"
                "MESSAGE:A certificate chain terminated in an untrusted root\n"
                "SIGNER:AABBCC\n"
                "CERT:AABBCC\n"
            ),
            stderr="",
        )

    monkeypatch.setattr(nuitka_builder_module.subprocess, "run", _run)
    monkeypatch.setattr(nuitka_builder_module.Debug, "log_internal", internal_messages.append)
    monkeypatch.setattr(nuitka_builder_module.Debug, "log_warning", warnings.append)
    builder = object.__new__(NuitkaBuilder)
    builder.output_filename = "Game.exe"

    builder._sign_executable(str(dist_dir))

    assert observed["command"][0] == str(powershell_exe)
    assert "-NoProfile" in observed["command"]
    assert "-NonInteractive" in observed["command"]
    assert observed["env"]["PSModulePath"] == str(powershell_root / "Modules")
    assert "PowerShell/7/Modules" not in observed["env"]["PSModulePath"]
    assert "Microsoft.PowerShell.Security.psd1" in observed["command"][-1]
    assert any("local root is not trusted" in message for message in internal_messages)
    assert warnings == []


class TestGameBuilderOutputSafety:
    def test_debug_player_boot_and_manifest_mark_validation_capability(self, tmp_path):
        output_dir = tmp_path / "build_output"
        builder = GameBuilder(
            str(_make_project(tmp_path)),
            str(output_dir),
            game_name="TestGame",
            debug_mode=True,
        )

        boot_path = builder._generate_boot_script()
        boot_source = open(boot_path, "r", encoding="utf-8").read()
        compile(boot_source, boot_path, "exec")
        assert 'os.environ["_INFERNUX_PLAYER_DEBUG_BUILD"] = "1" if _DEBUG_MODE else "0"' in boot_source
        assert '_BUILD_MANIFEST.get("game_name", "InfernuxPlayer")' in boot_source
        assert 'if os.environ.get("_INFERNUX_PLAYER_CONTROL_FILE"):' in boot_source

        settings = output_dir / "Data" / "ProjectSettings"
        settings.mkdir(parents=True)
        (settings / "BuildSettings.json").write_text(json.dumps({"scenes": ["Assets/Main.scene"]}), encoding="utf-8")
        builder._generate_manifest(str(output_dir))
        manifest = json.loads((output_dir / "Data" / "BuildManifest.json").read_text(encoding="utf-8"))
        assert manifest["debug_build"] is True
        assert manifest["game_name"] == "TestGame"

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

    def test_validate_allows_only_build_temp_output_dir(self, tmp_path):
        output_dir = tmp_path / "build_output"
        temp_dir = output_dir / "_build_temp"
        nested_dir = temp_dir / "nested"
        nested_dir.mkdir(parents=True)
        (nested_dir / "stale.bin").write_bytes(b"stale")
        builder = _make_builder(tmp_path, output_dir)

        builder._validate()

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


class TestNuitkaWindowsSdkEnvironment:
    def test_augment_windows_sdk_environment_adds_kits_tools_and_paths(self, tmp_path, monkeypatch):
        monkeypatch.setattr(nuitka_builder_module.sys, "platform", "win32")

        sdk_root = tmp_path / "Windows Kits" / "10"
        sdk_version = "10.0.22621.0"
        for relative_dir in (
            f"Include/{sdk_version}/ucrt",
            f"Include/{sdk_version}/shared",
            f"Include/{sdk_version}/um",
            f"Include/{sdk_version}/winrt",
            f"Lib/{sdk_version}/ucrt/x64",
            f"Lib/{sdk_version}/um/x64",
            f"bin/{sdk_version}/x64",
        ):
            (sdk_root / relative_dir).mkdir(parents=True, exist_ok=True)
        (sdk_root / "Include" / sdk_version / "um" / "Windows.h").write_text("", encoding="utf-8")

        for tool_name in ("rc.exe", "mt.exe"):
            tool_path = sdk_root / "bin" / sdk_version / "x64" / tool_name
            tool_path.write_text("", encoding="utf-8")
            tool_path.chmod(0o755)

        msvc_bin = tmp_path / "msvc" / "bin"
        msvc_bin.mkdir(parents=True)
        for tool_name in ("cl.exe", "link.exe"):
            tool_path = msvc_bin / tool_name
            tool_path.write_text("", encoding="utf-8")
            tool_path.chmod(0o755)
        msvc_include = tmp_path / "msvc" / "include"
        msvc_lib = tmp_path / "msvc" / "lib" / "x64"
        msvc_include.mkdir(parents=True)
        msvc_lib.mkdir(parents=True)
        (msvc_include / "excpt.h").write_text("", encoding="utf-8")
        (msvc_lib / "vcruntime.lib").write_text("", encoding="utf-8")

        monkeypatch.setattr(nuitka_builder_module, "_windows_sdk_roots_from_registry", lambda: [str(sdk_root)])
        env = {
            "PATH": str(msvc_bin),
            "INCLUDE": str(msvc_include),
            "LIB": str(msvc_lib),
        }

        augmented = nuitka_builder_module._augment_windows_sdk_environment(env)
        forced = nuitka_builder_module._force_msvc_tool_variables(augmented)

        assert nuitka_builder_module._msvc_env_ready(forced)
        assert str(sdk_root / "bin" / sdk_version / "x64") in forced["PATH"]
        assert str(sdk_root / "Include" / sdk_version / "um") in forced["INCLUDE"]
        assert str(sdk_root / "Lib" / sdk_version / "um" / "x64") in forced["LIB"]
        assert str(sdk_root / "Lib" / sdk_version / "um" / "x64") in forced["LIBPATH"]
        assert forced["WindowsSdkBinPath"].rstrip("\\/").endswith(str(sdk_root / "bin" / sdk_version / "x64"))
        assert forced["UniversalCRTSdkDir"].rstrip("\\/").endswith(str(sdk_root))
        assert forced["MSSDK_DIR"].rstrip("\\/").endswith(str(sdk_root))
        assert forced["WindowsSDKVersion"] == sdk_version
        assert forced["CC"].endswith("cl.exe")
        assert forced["CXX"].endswith("cl.exe")
        assert "LINK" not in forced
        assert forced["RC"].endswith("rc.exe")
        assert forced["MT"].endswith("mt.exe")

    def test_force_msvc_tool_variables_removes_link_environment_options(self, tmp_path):
        tool_dir = tmp_path / "Program Files" / "MSVC" / "bin"
        tool_dir.mkdir(parents=True)
        for tool_name in ("cl.exe", "link.exe", "rc.exe", "mt.exe"):
            tool_path = tool_dir / tool_name
            tool_path.write_text("", encoding="utf-8")
            tool_path.chmod(0o755)

        forced = nuitka_builder_module._force_msvc_tool_variables({
            "PATH": str(tool_dir),
            "LINK": str(tool_dir / "link.exe"),
            "_LINK_": str(tool_dir / "link.exe"),
        })

        assert forced["CC"].endswith("cl.exe")
        assert forced["CXX"].endswith("cl.exe")
        assert "LINK" not in forced
        assert "_LINK_" not in forced
        assert forced["RC"].endswith("rc.exe")
        assert forced["MT"].endswith("mt.exe")

    def test_sdk_only_environment_is_not_ready_without_msvc_headers_and_libs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(nuitka_builder_module.sys, "platform", "win32")

        sdk_root = tmp_path / "Windows Kits" / "10"
        sdk_version = "10.0.26100.0"
        for relative_dir in (
            f"Include/{sdk_version}/ucrt",
            f"Include/{sdk_version}/shared",
            f"Include/{sdk_version}/um",
            f"Lib/{sdk_version}/ucrt/x64",
            f"Lib/{sdk_version}/um/x64",
            f"bin/{sdk_version}/x64",
        ):
            (sdk_root / relative_dir).mkdir(parents=True, exist_ok=True)
        (sdk_root / "Include" / sdk_version / "um" / "Windows.h").write_text("", encoding="utf-8")
        for tool_name in ("rc.exe", "mt.exe"):
            tool_path = sdk_root / "bin" / sdk_version / "x64" / tool_name
            tool_path.write_text("", encoding="utf-8")
            tool_path.chmod(0o755)

        msvc_bin = tmp_path / "msvc" / "bin"
        msvc_bin.mkdir(parents=True)
        for tool_name in ("cl.exe", "link.exe"):
            tool_path = msvc_bin / tool_name
            tool_path.write_text("", encoding="utf-8")
            tool_path.chmod(0o755)

        monkeypatch.setattr(nuitka_builder_module, "_windows_sdk_roots_from_registry", lambda: [str(sdk_root)])
        env = nuitka_builder_module._augment_windows_sdk_environment({"PATH": str(msvc_bin)})

        missing = nuitka_builder_module._msvc_env_missing_parts(env)
        assert "MSVC INCLUDE (excpt.h)" in missing
        assert "MSVC LIB (vcruntime.lib)" in missing
        assert not nuitka_builder_module._msvc_env_ready(env)

    def test_windows_sdk_roots_include_explicit_override(self, tmp_path, monkeypatch):
        monkeypatch.setattr(nuitka_builder_module.sys, "platform", "win32")
        sdk_root = tmp_path / "custom-sdk"
        sdk_root.mkdir()
        monkeypatch.setenv("INFERNUX_WINDOWS_SDK_DIR", str(sdk_root))
        monkeypatch.setattr(nuitka_builder_module, "_windows_sdk_roots_from_registry", lambda: [])

        assert str(sdk_root) in nuitka_builder_module._windows_sdk_roots({})

    def test_msvc_environment_scripts_include_explicit_vs_root(self, tmp_path, monkeypatch):
        vs_root = tmp_path / "VS"
        script_path = vs_root / "Common7" / "Tools" / "VsDevCmd.bat"
        script_path.parent.mkdir(parents=True)
        script_path.write_text("", encoding="utf-8")
        monkeypatch.setenv("INFERNUX_VSINSTALLDIR", str(vs_root))
        monkeypatch.delenv("INFERNUX_VCVARSALL", raising=False)
        monkeypatch.setattr(nuitka_builder_module, "_visual_studio_roots_from_vswhere", lambda: [])
        monkeypatch.setattr(nuitka_builder_module, "_visual_studio_roots_from_registry", lambda: [])

        assert (str(script_path), ["-arch=x64", "-host_arch=x64"]) in nuitka_builder_module._find_msvc_environment_scripts()

    def test_windows_nuitka_command_does_not_force_msvc_latest(self, tmp_path, monkeypatch):
        monkeypatch.setattr(nuitka_builder_module.sys, "platform", "win32")
        monkeypatch.setattr(nuitka_builder_module, "_has_msvc_toolchain", lambda: True)

        builder = object.__new__(NuitkaBuilder)
        builder._builder_python = "python"
        builder.console_mode = "disable"
        builder._staging_dir = str(tmp_path / "stage")
        builder.output_filename = "Game.exe"
        builder.lto = False
        builder.extra_include_packages = []
        builder.extra_include_data = []
        builder.raw_copy_packages = []
        builder.product_name = "Game"
        builder.file_version = "1.0.0.0"
        builder.icon_path = None
        builder._staged_entry = str(tmp_path / "boot.py")

        cmd = builder._build_command()

        assert "--msvc=latest" not in cmd

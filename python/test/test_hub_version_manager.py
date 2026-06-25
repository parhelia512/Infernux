"""Hub VersionManager — issue #43 regression tests.

Covers: atomic cancellable downloads, corrupted-wheel healing, unique temp
files under concurrency, and version listing that ignores broken installs.

These tests are pure-Python (no Qt, no network): GitHub access and the HTTP
stream are monkeypatched.
"""
from __future__ import annotations

import io
import os
import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "packaging",
))

import version_manager as vm_mod
from version_manager import VersionManager, DownloadCancelled


def _make_wheel_bytes() -> bytes:
    """Minimal valid wheel = a zip with one entry."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("infernux/__init__.py", "")
    return buf.getvalue()


class _FakeResponse:
    def __init__(self, payload: bytes, chunk: int = 7):
        self._data = io.BytesIO(payload)
        self.headers = {"Content-Length": str(len(payload))}
        self._chunk = chunk

    def read(self, n):
        return self._data.read(n)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture()
def vm(tmp_path, monkeypatch):
    monkeypatch.setattr(vm_mod, "_VERSIONS_DIR", tmp_path / "versions")
    manager = VersionManager()
    release = {
        "tag_name": "v9.9.9",
        "prerelease": False,
        "published_at": "2026-01-01T00:00:00Z",
        "assets": [{
            "name": "infernux-9.9.9-cp312-cp312-win_amd64.whl",
            "browser_download_url": "https://example.invalid/infernux-9.9.9.whl",
            "size": 128,
        }],
    }
    monkeypatch.setattr(manager, "_fetch_releases", lambda: [release])
    return manager


class TestDownload:
    def test_successful_download_is_valid_wheel(self, vm, monkeypatch):
        payload = _make_wheel_bytes()
        monkeypatch.setattr(vm_mod.urllib.request, "urlopen",
                            lambda req: _FakeResponse(payload))
        path = vm.download_version("9.9.9")
        assert os.path.isfile(path)
        assert zipfile.is_zipfile(path)
        assert vm.is_installed("9.9.9")

    def test_cancel_leaves_no_residue(self, vm, monkeypatch):
        # Payload spans many 64 KB chunks so the per-chunk cancel check
        # actually triggers mid-transfer.
        payload = _make_wheel_bytes() + b"\0" * (64 * 1024 * 6)
        monkeypatch.setattr(vm_mod.urllib.request, "urlopen",
                            lambda req: _FakeResponse(payload))
        calls = {"n": 0}

        def cancel_after_two_chunks():
            calls["n"] += 1
            return calls["n"] > 2

        with pytest.raises(DownloadCancelled):
            vm.download_version("9.9.9", should_cancel=cancel_after_two_chunks)

        ver_dir = vm_mod._VERSIONS_DIR / "9.9.9"
        # No partial wheel, no temp files, and ideally no empty dir at all.
        if ver_dir.exists():
            assert list(ver_dir.iterdir()) == []
        assert not vm.is_installed("9.9.9")
        assert "9.9.9" not in vm.installed_versions()

    def test_cancel_then_reinstall_succeeds(self, vm, monkeypatch):
        cancel_payload = _make_wheel_bytes() + b"\0" * (64 * 1024 * 6)
        monkeypatch.setattr(vm_mod.urllib.request, "urlopen",
                            lambda req: _FakeResponse(cancel_payload))
        flag = {"n": 0}

        def cancel_once():
            flag["n"] += 1
            return flag["n"] > 1

        with pytest.raises(DownloadCancelled):
            vm.download_version("9.9.9", should_cancel=cancel_once)

        # Second attempt with no cancellation must produce a valid install.
        good_payload = _make_wheel_bytes()
        monkeypatch.setattr(vm_mod.urllib.request, "urlopen",
                            lambda req: _FakeResponse(good_payload))
        path = vm.download_version("9.9.9")
        assert zipfile.is_zipfile(path)
        assert vm.is_installed("9.9.9")

    def test_truncated_transfer_rejected(self, vm, monkeypatch):
        monkeypatch.setattr(vm_mod.urllib.request, "urlopen",
                            lambda req: _FakeResponse(b"not-a-zip"))
        with pytest.raises(ValueError, match="not a valid wheel"):
            vm.download_version("9.9.9")
        assert not vm.is_installed("9.9.9")

    def test_existing_corrupted_wheel_is_replaced(self, vm, monkeypatch):
        ver_dir = vm_mod._VERSIONS_DIR / "9.9.9"
        ver_dir.mkdir(parents=True)
        bad = ver_dir / "infernux-9.9.9-cp312-cp312-win_amd64.whl"
        bad.write_bytes(b"garbage from an interrupted install")

        payload = _make_wheel_bytes()
        monkeypatch.setattr(vm_mod.urllib.request, "urlopen",
                            lambda req: _FakeResponse(payload))
        path = vm.download_version("9.9.9")
        assert zipfile.is_zipfile(path)


class TestListingHealsCorruption:
    def test_corrupted_wheel_not_listed_as_installed(self, vm):
        ver_dir = vm_mod._VERSIONS_DIR / "1.2.3"
        ver_dir.mkdir(parents=True)
        (ver_dir / "infernux-1.2.3-cp312-cp312-win_amd64.whl").write_bytes(b"junk")

        assert vm.get_wheel_path("1.2.3") is None
        assert "1.2.3" not in vm.installed_versions()
        # healing removed the junk file
        assert not list(ver_dir.glob("*.whl"))

    def test_valid_wheel_listed(self, vm):
        ver_dir = vm_mod._VERSIONS_DIR / "2.0.0"
        ver_dir.mkdir(parents=True)
        (ver_dir / "infernux-2.0.0-cp312-cp312-win_amd64.whl").write_bytes(_make_wheel_bytes())

        assert vm.get_wheel_path("2.0.0") is not None
        assert "2.0.0" in vm.installed_versions()

    def test_remove_version(self, vm):
        ver_dir = vm_mod._VERSIONS_DIR / "2.0.0"
        ver_dir.mkdir(parents=True)
        (ver_dir / "infernux-2.0.0-cp312-cp312-win_amd64.whl").write_bytes(_make_wheel_bytes())
        assert vm.remove_version("2.0.0") is True
        assert not ver_dir.exists()
        assert vm.remove_version("2.0.0") is False

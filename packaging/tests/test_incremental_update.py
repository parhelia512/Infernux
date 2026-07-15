import json
import zipfile
from pathlib import Path

import pytest

from incremental_update import (
    apply_patch,
    create_manifest,
    create_patch,
    load_manifest,
    write_manifest,
)


def test_patch_contains_only_changed_files_and_applies(tmp_path: Path):
    old = tmp_path / "old"
    new = tmp_path / "new"
    old.mkdir()
    new.mkdir()
    (old / "same.dll").write_bytes(b"same")
    (old / "changed.dll").write_bytes(b"old")
    (old / "removed.dll").write_bytes(b"remove")
    (new / "same.dll").write_bytes(b"same")
    (new / "changed.dll").write_bytes(b"new")
    (new / "added.dll").write_bytes(b"added")

    base = create_manifest(old, "0.2.1")
    target = create_manifest(new, "0.2.2")
    patch = create_patch(new, base, target, tmp_path / "update.zip")

    with zipfile.ZipFile(patch) as archive:
        assert set(archive.namelist()) == {
            "hub-update.json",
            "payload/added.dll",
            "payload/changed.dll",
        }
        metadata = json.loads(archive.read("hub-update.json"))
        assert metadata["delete"] == ["removed.dll"]

    assert apply_patch(old, patch, "0.2.1") == "0.2.2"
    assert (old / "same.dll").read_bytes() == b"same"
    assert (old / "changed.dll").read_bytes() == b"new"
    assert (old / "added.dll").read_bytes() == b"added"
    assert not (old / "removed.dll").exists()


def test_patch_rejects_wrong_base_version(tmp_path: Path):
    old = tmp_path / "old"
    new = tmp_path / "new"
    old.mkdir()
    new.mkdir()
    (old / "hub.exe").write_bytes(b"old")
    (new / "hub.exe").write_bytes(b"new")
    patch = create_patch(
        new,
        create_manifest(old, "1.0.0"),
        create_manifest(new, "1.1.0"),
        tmp_path / "update.zip",
    )
    with pytest.raises(ValueError, match="requires Hub 1.0.0"):
        apply_patch(old, patch, "0.9.0")


def test_manifest_rejects_parent_traversal(tmp_path: Path):
    manifest = {
        "schema": 1,
        "product": "InfernuxHub",
        "version": "1.0.0",
        "files": [{"path": "../outside", "size": 1, "sha256": "0" * 64}],
    }
    path = write_manifest(manifest, tmp_path / "bad.json")
    with pytest.raises(ValueError, match="Unsafe update path"):
        load_manifest(path)

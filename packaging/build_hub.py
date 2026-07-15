"""Compile the Hub and its installer with Nuitka."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def _run(command: list[str], *, cwd: Path) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def _common_nuitka_command(output_dir: Path) -> list[str]:
    command = [
        sys.executable,
        "-m",
        "nuitka",
        "--enable-plugin=pyside6",
        "--assume-yes-for-downloads",
        f"--output-dir={output_dir}",
    ]
    if os.name == "nt":
        command.extend(["--windows-console-mode=disable", "--mingw64"])
    return command


def _build_hub(source_root: Path, build_dir: Path, dist_dir: Path) -> None:
    packaging_dir = source_root / "packaging"
    output_dir = build_dir / "nuitka"
    shutil.rmtree(output_dir, ignore_errors=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    command = _common_nuitka_command(output_dir) + [
        "--standalone",
        "--output-filename=Infernux Hub.exe" if os.name == "nt" else "--output-filename=Infernux Hub",
        f"--include-data-dir={packaging_dir / 'resources'}=resources",
        f"--include-data-file={packaging_dir / 'runtime' / 'runtime_bundle.zip'}=InfernuxHubData/runtime/runtime_bundle.zip",
        "--nofollow-import-to=Infernux,numpy,scipy,pandas,matplotlib,cv2,PIL,tkinter",
    ]
    if sys.platform == "darwin":
        command.append("--macos-create-app-bundle")
    command.append(str(packaging_dir / "launcher.py"))
    _run(command, cwd=packaging_dir)

    candidates = [output_dir / "launcher.dist", output_dir / "launcher.app"]
    produced = next((path for path in candidates if path.exists()), None)
    if produced is None:
        raise RuntimeError(f"Nuitka did not produce a standalone Hub under {output_dir}")

    destination = dist_dir / "Infernux Hub"
    shutil.rmtree(destination, ignore_errors=True)
    if produced.is_dir():
        shutil.copytree(produced, destination)
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(produced, destination)


def _build_installer(source_root: Path, build_dir: Path, dist_dir: Path) -> None:
    packaging_dir = source_root / "packaging"
    hub_payload = dist_dir / "Infernux Hub"
    if not hub_payload.is_dir():
        raise RuntimeError(f"Hub payload does not exist: {hub_payload}")

    output_dir = build_dir / "nuitka"
    shutil.rmtree(output_dir, ignore_errors=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    command = _common_nuitka_command(output_dir) + [
        "--onefile",
        "--output-filename=InfernuxHubInstaller.exe" if os.name == "nt" else "--output-filename=InfernuxHubInstaller",
        f"--include-data-dir={packaging_dir / 'resources'}=resources",
        f"--include-data-dir={hub_payload}=payload",
    ]
    if os.name == "nt":
        command.append("--windows-uac-admin")
    command.append(str(packaging_dir / "installer_gui.py"))
    _run(command, cwd=packaging_dir)

    filename = "InfernuxHubInstaller.exe" if os.name == "nt" else "InfernuxHubInstaller"
    produced = output_dir / filename
    if not produced.is_file():
        raise RuntimeError(f"Nuitka did not produce the Hub installer at {produced}")
    destination_dir = dist_dir / "installer"
    shutil.rmtree(destination_dir, ignore_errors=True)
    destination_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(produced, destination_dir / filename)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=("hub", "installer"), required=True)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--build-dir", required=True)
    parser.add_argument("--dist-dir", required=True)
    args = parser.parse_args()

    source_root = Path(args.source_root).resolve()
    build_dir = Path(args.build_dir).resolve()
    dist_dir = Path(args.dist_dir).resolve()
    build_dir.mkdir(parents=True, exist_ok=True)
    dist_dir.mkdir(parents=True, exist_ok=True)

    if args.target == "hub":
        _build_hub(source_root, build_dir, dist_dir)
    else:
        _build_installer(source_root, build_dir, dist_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

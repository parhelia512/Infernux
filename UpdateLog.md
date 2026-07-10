# Infernux v0.2.1 · 熔炉

This is a focused stability and release-pipeline update after `v0.2.0`. It fixes the inline material preview path that could break when inspecting or creating SpriteRenderer materials, reduces noisy MeshCollider diagnostics, and makes the GitHub release workflow produce the Windows wheel and Hub installer from the same tagged version line.

**Baseline for comparison:** [`v0.2.0...v0.2.1`](https://github.com/ChenlizheMe/Infernux/compare/v0.2.0...v0.2.1)

---

### Editor and material preview fixes

* **Fixed inline material preview crashes** when the Inspector needed to render an unsaved or scene-local material preview from JSON instead of a `.mat` file on disk.
* **Updated the Python preview callsite** to match the unified C++ material-preview bridge, removing a stale `resource_key` argument that no longer belonged in the inline preview API.
* **Improved SpriteRenderer material inspection stability** by letting inline previews resolve through the current path-hint based preview flow instead of an older mixed key/path call.

### Physics and runtime cleanup

* **Reduced MeshCollider log noise** by silencing high-frequency shape/cooking info logs that were useful while debugging collision generation but too chatty for normal editor and runtime sessions.

### GitHub Release and packaging automation

* **GitHub Releases now use `UpdateLog.md` as the release body**, so the release notes are authored intentionally instead of relying only on auto-generated PR summaries.
* **The version workflow now rebuilds when `UpdateLog.md` changes** or when the target release is missing, making patch-release publishing less fragile.
* **Windows release assets now include both artifacts from CI:** the CPython 3.12 Windows wheel and `InfernuxHubInstaller.exe`.
* **The publish job verifies required assets before editing or creating the release**, preventing an incomplete release from being marked latest.
* **Hub installer CI dependencies were fixed** by installing the PyInstaller/PySide6/Pillow build requirements in the Windows workflow and removing a stale hidden import from the Hub spec.

### Version, docs, and metadata

* **Bumped project metadata to `0.2.1`** in `pyproject.toml`, Windows version resources, README badges, docs pages, MCP project metadata, and generated API index pages.
* **Updated Hub version-manager examples** so downloaded engine wheels are documented under the `0.2.1` cache layout.
* **Refreshed website and roadmap text** so public project pages point at the current release line instead of `0.2.0`.

---

### Upgrade notes

* Install the new Windows wheel or Hub installer from this release if you hit Inspector material-preview failures in `v0.2.0`.
* Restart the editor after upgrading so the native preview bridge, Python UI layer, and MCP version metadata are all loaded from the same `0.2.1` package.
* If you maintain release automation for a fork, keep `UpdateLog.md` present and non-empty; the workflow now treats it as the canonical GitHub Release body.

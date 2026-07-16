@echo off
setlocal EnableExtensions

rem Incrementally regenerate Infernux API Markdown and every derived website artifact.
rem The Python generator preserves USER CONTENT blocks, skips byte-identical files,
rem creates missing symbol pages, and deletes stale pages for removed symbols.

cd /d "%~dp0"

where conda >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Conda was not found. Install or initialize Conda, then retry.
    exit /b 1
)

call conda activate infernux
if errorlevel 1 (
    echo [ERROR] Could not activate the required Conda environment: infernux
    exit /b 1
)

set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

echo [1/12] Updating API Markdown...
python docs\wiki\generate_api_docs.py %*
if errorlevel 1 goto :failed

echo [2/12] Restoring deterministic Wiki navigation...
node docs\tools\normalize-wiki-config.mjs
if errorlevel 1 goto :failed

echo [3/12] Applying curated API guidance...
node docs\tools\apply-api-curation.mjs
if errorlevel 1 goto :failed

echo [4/12] Updating the Wiki catalog...
node docs\tools\build-wiki-catalog.mjs
if errorlevel 1 goto :failed

echo [5/12] Updating machine-readable indexes...
node docs\tools\build-doc-index.mjs
if errorlevel 1 goto :failed

echo [6/12] Updating documentation health...
node docs\tools\build-doc-health.mjs
if errorlevel 1 goto :failed

echo [7/12] Updating Agent discovery and full corpus...
node docs\tools\build-llms-index.mjs
if errorlevel 1 goto :failed
node docs\tools\build-agent-corpus.mjs
if errorlevel 1 goto :failed

echo [8/12] Building the static Wiki...
python -m mkdocs build --strict --clean -f docs\wiki\mkdocs.yml
if errorlevel 1 goto :failed

echo [9/12] Optimizing generated Wiki output...
node docs\tools\optimize-static-site.mjs
if errorlevel 1 goto :failed

echo [10/12] Updating the unified sitemap...
node docs\tools\build-sitemap.mjs
if errorlevel 1 goto :failed

echo [11/12] Updating the offline application shell...
node docs\tools\build-service-worker.mjs
if errorlevel 1 goto :failed

echo [12/12] Verifying the generated website contracts...
node docs\tools\verify-site.mjs
if errorlevel 1 goto :failed

echo.
echo [OK] API documentation and derived website artifacts are current.
echo [NOTE] API release snapshots and version diffs are intentionally not modified.
exit /b 0

:failed
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo.
echo [ERROR] API documentation update stopped with exit code %EXIT_CODE%.
exit /b %EXIT_CODE%

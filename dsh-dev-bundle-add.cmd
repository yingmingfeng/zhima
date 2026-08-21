@echo off
rem Add a bundle plugin (by folder name) to the dev profile.
rem Usage: dsh-dev-bundle-add.cmd <plugin-folder>   e.g. dsh-dev-bundle-add.cmd maid-atelier
rem The folder is resolved under deepseek-harness-plugins/host|client|hybrid.
setlocal
set "PLUGIN_DIR="
for /f "usebackq delims=" %%D in (`node "E:\VibeCoding\workspace\zhima\deepseek-harness-plugins\scripts\resolve-plugin.mjs" path %~1`) do set "PLUGIN_DIR=%%D"
if not defined PLUGIN_DIR (
  echo Error: plugin "%~1" not found under host/client/hybrid
  exit /b 1
)
cd /d "E:\VibeCoding\workspace\zhima\deepseek-harness"
node --import tsx/esm apps/cli/src/bin.ts plugin --profile dev add "%PLUGIN_DIR%"
exit /b %errorlevel%

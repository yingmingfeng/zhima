@echo off
rem Remove a bundle plugin (by folder name) from the dev profile.
rem Usage: dsh-dev-bundle-remove.cmd <plugin-folder>   e.g. dsh-dev-bundle-remove.cmd maid-atelier
rem The package name is resolved automatically from the plugin's package.json.
setlocal
set "PKG_NAME="
for /f "usebackq delims=" %%N in (`node "E:\VibeCoding\workspace\zhima\deepseek-harness-plugins\scripts\resolve-plugin.mjs" name %~1`) do set "PKG_NAME=%%N"
if not defined PKG_NAME (
  echo Error: plugin "%~1" not found under host/client/hybrid, or has no name
  exit /b 1
)
cd /d "E:\VibeCoding\workspace\zhima\deepseek-harness"
node --import tsx/esm apps/cli/src/bin.ts plugin --profile dev remove "%PKG_NAME%"
exit /b %errorlevel%

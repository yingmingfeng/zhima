@echo off
rem Start DSH dev profile with deepseek-harness-plugins (host plugins via cordis.yml patch).
rem Usage: dsh-dev-host-plugins [app args...]
cd /d "E:\VibeCoding\workspace\zhima\deepseek-harness"
node --import tsx/esm apps/cli/src/bin.ts --profile dev --patch ../deepseek-harness-plugins/cordis.yml %*
exit /b %errorlevel%

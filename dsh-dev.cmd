@echo off
rem Start DSH dev profile (web GUI, no plugins)
cd /d "E:\VibeCoding\workspace\zhima\deepseek-harness"
node --import tsx/esm apps/cli/src/bin.ts --profile dev %*

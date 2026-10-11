@echo off
REM Double-click this file. It calls start.ps1 with the execution policy
REM relaxed for this one run, which is what stops Windows blocking the script.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*

@echo off
rem ============================================================
rem  ZOMBIE SURVIVAL - one-command launcher (no Anaconda needed)
rem  Usage:  run.bat   (or just double-click this file)
rem ============================================================
setlocal
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
    echo [Setup] Creating virtual environment...
    python -m venv venv || goto :error
    echo [Setup] Installing dependencies...
    "venv\Scripts\python.exe" -m pip install --upgrade pip || goto :error
    "venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :error
)

echo [Run] Starting Zombie Survival...
"venv\Scripts\python.exe" main.py %*
goto :eof

:error
echo [Error] Setup failed. Make sure Python 3.11+ is installed and on PATH.
pause
exit /b 1

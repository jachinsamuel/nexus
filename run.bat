@echo off
title JARVIS Autonomous AI Assistant
echo ===================================================
echo   JARVIS AUTONOMOUS AI ASSISTANT - BOOTING PROCESS
echo ===================================================
echo.
echo [1/2] Opening JARVIS Interface in your browser...
start "" "http://localhost:8001"
echo.
echo [2/2] Booting FastAPI backend server on port 8001...
cd /d "%~dp0"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
pause

@echo off
title NEXUS Autonomous AI Assistant
echo ===================================================
echo   NEXUS AUTONOMOUS AI ASSISTANT - BOOTING PROCESS
echo ===================================================
echo.
cd /d "%~dp0"

echo [1/4] Checking Python dependencies...
python -c "import uvicorn, fastapi, psutil" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing required Python packages...
    python -m pip install -r requirements.txt
    echo.
)

echo [2/4] Checking local Ollama engine service...
python -c "import httpx; res = httpx.get('http://localhost:11434/api/tags'); exit(0 if res.status_code==200 else 1)" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Starting local Ollama engine background service...
    start /b "" ollama serve >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo [3/4] Opening NEXUS Interface in your browser...
start "" "http://localhost:8001"
echo.
echo [4/4] Booting FastAPI backend server on port 8001...
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
pause

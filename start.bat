@echo off
title ForeignTrade

echo ============================================
echo   ForeignTrade - Start
echo ============================================
echo.

echo [1/4] Killing old processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo [2/4] Starting backend (port 8000)...
cd /d "%~dp0backend"
start "Backend" /min cmd /c "venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
ping -n 4 127.0.0.1 >nul

echo [3/4] Starting frontend (port 5173)...
cd /d "%~dp0frontend"
start "Frontend" /min cmd /c "npm run dev"
ping -n 6 127.0.0.1 >nul

echo [4/4] Checking...
curl -s http://localhost:8000/api/health >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Backend:  http://localhost:8000
) else (
    echo   [FAIL] Backend not ready
)
curl -s http://localhost:5173 >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Frontend: http://localhost:5173
) else (
    echo   [FAIL] Frontend not ready
)

echo.
echo ============================================
echo   Open browser: http://localhost:5173
echo   Stop: run stop.bat
echo ============================================
echo.
pause

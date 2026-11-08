@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   ForeignTrade - Build
echo ============================================
echo.

set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"
set "VENV_DIR=%BACKEND_DIR%\venv"
set "DIST_DIR=%PROJECT_ROOT%dist\ForeignTrade"

REM -- Step 1: Check environment --------------------------------
echo [1/7] Checking environment...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)
echo   [OK] Node.js found

if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo [ERROR] Python venv not found: %VENV_DIR%
    echo   Run first: cd backend ^&^& python -m venv venv ^&^& venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)
echo   [OK] Python venv ready

REM -- Step 2: Install PyInstaller if needed ---------------------
echo.
echo [2/7] Checking PyInstaller...
"%VENV_DIR%\Scripts\python.exe" -c "import PyInstaller" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   Installing PyInstaller...
    "%VENV_DIR%\Scripts\pip.exe" install pyinstaller -q
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] PyInstaller install failed
        pause
        exit /b 1
    )
)
echo   [OK] PyInstaller ready

REM -- Step 3: Build frontend -----------------------------------
echo.
echo [3/7] Building frontend...
cd /d "%FRONTEND_DIR%"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend build failed
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)
echo   [OK] Frontend built: %FRONTEND_DIR%\dist

REM -- Step 4: Run PyInstaller ----------------------------------
echo.
echo [4/7] Packaging backend (PyInstaller)...
cd /d "%PROJECT_ROOT%"
"%VENV_DIR%\Scripts\pyinstaller.exe" build/ForeignTrade.spec --noconfirm --clean
if %ERRORLEVEL% neq 0 (
    echo [ERROR] PyInstaller packaging failed
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)
echo   [OK] Backend packaged

REM -- Step 5: Copy runtime data --------------------------------
echo.
echo [5/7] Copying runtime data...

REM Data directory (empty, will be created on first run)
if not exist "%DIST_DIR%\data" mkdir "%DIST_DIR%\data"
if not exist "%DIST_DIR%\data\backups" mkdir "%DIST_DIR%\data\backups"
echo   [OK] Data directory created (empty)

REM Config template (strip secrets for distribution)
if exist "%BACKEND_DIR%\config.json" (
    copy /y "%BACKEND_DIR%\config.json" "%DIST_DIR%\config.json.example" >nul
    echo   [OK] Config template copied
)

REM .env template
if exist "%BACKEND_DIR%\.env.example" (
    copy /y "%BACKEND_DIR%\.env.example" "%DIST_DIR%\.env.example" >nul
    echo   [OK] .env template copied
) else if exist "%BACKEND_DIR%\.env" (
    copy /y "%BACKEND_DIR%\.env" "%DIST_DIR%\.env.example" >nul
    echo   [OK] .env template copied (from .env)
)

echo   [OK] Runtime data copy complete

REM -- Step 6: Generate run.bat ---------------------------------
echo.
echo [6/7] Generating launch scripts...

(
echo @echo off
echo echo Starting ForeignTrade...
echo start "" "ForeignTrade.exe"
echo echo Server started. Wait a few seconds, then visit: http://localhost:8000
echo echo Press any key to open browser...
echo pause ^>nul
echo start http://localhost:8000
) > "%DIST_DIR%\run.bat"

(
echo @echo off
echo echo Stopping ForeignTrade...
echo taskkill /f /im ForeignTrade.exe ^>nul 2^>^&1
echo echo Done.
) > "%DIST_DIR%\stop.bat"

echo   [OK] Launch scripts generated

REM -- Step 7: Summary ------------------------------------------
echo.
echo [7/7] Build complete!
echo.
echo ============================================
echo   Output: %DIST_DIR%
echo ============================================
echo.
echo   Usage:
echo     1. Go to %DIST_DIR%
echo     2. Double-click run.bat to start
echo     3. Open browser: http://localhost:8000
echo.
echo   Stop: Double-click stop.bat
echo.

cd /d "%PROJECT_ROOT%"
pause

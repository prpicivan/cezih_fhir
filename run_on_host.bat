@echo off
SETLOCAL EnableDelayedExpansion

echo ═══ CEZIH Middleware Host Deployment ═══
echo Target Machine: 192.168.1.93 (Host with VPN)
echo.

:: 1. Check for Git
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed on this host. Please install Git for Windows.
    pause
    exit /b 1
)

:: 2. Update Code
echo [1/4] Updating to latest version from Git...
git pull
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Git pull failed. Continuing with local version...
)

:: 3. Install Dependencies
echo [2/4] Installing dependencies (npm install)...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

:: 4. Build TypeScript
echo [3/4] Building project (npm run build)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

:: 5. Start Server
echo [4/4] Starting server...
echo.
echo ✅ Server will be available at http://localhost:3010
echo ✅ Host IP for VM: 192.168.1.93
echo.
npm start

pause

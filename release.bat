@echo off
REM ForgeADB - one-click clean production build (Windows)
REM Installs dependencies and produces the NSIS installer + portable EXE in release\

setlocal
cd /d "%~dp0"

echo ============================================
echo  ForgeADB - clean production build
echo ============================================

echo.
echo [1/2] Installing dependencies...
call npm install
if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    exit /b 1
)

echo.
echo [2/2] Building application (icons + renderer + installer)...
call npm run dist
if errorlevel 1 (
    echo.
    echo Build failed.
    exit /b 1
)

echo.
echo ============================================
echo  Build complete. Output is in the release\ folder.
echo ============================================
endlocal

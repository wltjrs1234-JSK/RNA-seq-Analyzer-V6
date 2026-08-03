@echo off
:: Last Updated: 2026-08-03 (Silent background execution & single Chrome browser tab launch fix)
if "%~1"=="-hidden" goto :MAIN_LOGIC

:: Self-hide CMD console window
powershell -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `"%~f0`" -hidden' -WindowStyle Hidden"
exit /b

:MAIN_LOGIC
title RNA-seq Analyzer Launcher
cd /d "%~dp0"

:: 1. Clean up any previous server instances on port 8500
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8500" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
powershell -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8500 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: 2. Launch background FastAPI server silently
powershell -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `"%~dp0run_server.bat`"' -WindowStyle Hidden"

:: 3. Wait for server on http://127.0.0.1:8500 to become active (Timeout: 60s)
powershell -ExecutionPolicy Bypass -Command "$timeout = 60; $start = [DateTime]::Now; while ($true) { try { $conn = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 8500); if ($conn.Connected) { $conn.Close(); exit 0; } } catch {} if (([DateTime]::Now - $start).TotalSeconds -gt $timeout) { exit 1; } Start-Sleep -Seconds 1 }"

if %errorlevel% neq 0 exit /b 1

:: 4. Launch Chrome browser ONCE
set CHROME_PATH=""
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME_PATH="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME_PATH="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set CHROME_PATH="%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not %CHROME_PATH%=="" (
    start "" %CHROME_PATH% "http://127.0.0.1:8500"
) else (
    start http://127.0.0.1:8500
)

exit /b

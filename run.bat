@echo off
:: Last Updated: 2026-08-03 (Path-safe silent background execution & single Chrome browser launch)
if "%~1"=="-hidden" goto :MAIN_LOGIC

:: Self-hide CMD console window safely (handles spaces and parentheses in path)
mshta vbscript:Execute("CreateObject(""WScript.Shell"").Run ""cmd /c """"%~f0"""" -hidden"", 0, False:close()")
exit /b

:MAIN_LOGIC
title RNA-seq Analyzer Launcher
cd /d "%~dp0"

:: 1. Clean up any previous server instances on port 8500
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8500" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: 2. Launch background FastAPI server silently using mshta (handles spaces & parentheses)
mshta vbscript:Execute("CreateObject(""WScript.Shell"").Run ""cmd /c """"%~dp0run_server.bat"""""", 0, False:close()")

:: 3. Wait for server on http://127.0.0.1:8500 to become active (Timeout: ~30s)
set /a count=0
:WAIT_LOOP
netstat -aon | findstr ":8500" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 goto :SERVER_READY
timeout /t 1 /nobreak >nul
set /a count+=1
if %count% geq 30 goto :SERVER_READY
goto :WAIT_LOOP

:SERVER_READY
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

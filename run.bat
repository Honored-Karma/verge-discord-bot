@echo off
REM Discord Bot Launcher
REM This file starts the Discord RPG bot

echo.
echo Starting Discord RPG Bot...
echo.

REM Check if node is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from https://nodejs.org
    echo Read INSTALL_NODEJS.txt for instructions
    echo.
    pause
    exit /b 1
)

echo Node.js found
echo.

REM Check if npm packages are installed
if not exist "node_modules\" (
    echo Installing npm packages...
    echo This may take a few minutes...
    echo.
    call npm install
    echo.
)

REM Start the bot
echo.
echo Starting bot...
echo.
node index.js

pause

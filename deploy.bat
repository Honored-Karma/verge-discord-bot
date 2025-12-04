@echo off
REM Deploy Discord Bot Commands
REM This file deploys slash commands to your Discord server

echo.
echo Deploying Discord Bot Commands...
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
    echo ERROR: npm packages not installed
    echo.
    echo Run this command first:
    echo    npm install
    echo.
    pause
    exit /b 1
)

REM Deploy commands
echo.
echo Deploying commands to Discord...
echo This will take a moment...
echo.
call npm run deploy

echo.
echo Done!
echo Commands have been deployed to your Discord server
echo.
pause

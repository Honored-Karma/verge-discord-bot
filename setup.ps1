#!/usr/bin/env pwsh
# Setup script for Discord RPG Bot

$ErrorActionPreference = "Stop"

Write-Host "Installing Discord RPG Bot..." -ForegroundColor Cyan
Write-Host ""

# Check admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script requires admin rights!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "OK: Admin rights confirmed" -ForegroundColor Green
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Cyan
try {
    $nodeVersion = node --version 2>$null
    Write-Host "OK: Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not found" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Check npm
Write-Host "Checking npm..." -ForegroundColor Cyan
try {
    $npmVersion = npm --version 2>$null
    Write-Host "OK: npm found: v$npmVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: npm not found" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Clean old modules
Write-Host "Cleaning old dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "OK: Cleaned" -ForegroundColor Green
}

Write-Host ""

# Install dependencies
Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
Write-Host "(This may take 2-3 minutes)" -ForegroundColor Yellow
Write-Host ""

npm install

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Installation complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERROR during npm install" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Check .env
Write-Host "Checking configuration..." -ForegroundColor Cyan
if (Test-Path ".env") {
    Write-Host "OK: .env file found" -ForegroundColor Green
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "MONGODB_URI") {
        Write-Host "OK: MONGODB_URI configured" -ForegroundColor Green
    } else {
        Write-Host "WARNING: MONGODB_URI not found in .env" -ForegroundColor Yellow
    }
} else {
    Write-Host "WARNING: .env file not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Make sure .env has correct MONGODB_URI" -ForegroundColor White
Write-Host ""
Write-Host "2. Deploy commands (first time only):" -ForegroundColor White
Write-Host "   npm run deploy" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Start the bot:" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor Yellow
Write-Host ""

Write-Host "Ready to go!" -ForegroundColor Green

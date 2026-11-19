@echo off
chcp 65001 >nul
title WorkManagement Backend (.NET 10)
echo ===================================================
echo   KHOI CHAY BACKEND WORKMANAGEMENT (.NET 10)
echo ===================================================
echo Giai phong cong 8000 neu dang bi chiem dung...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

set DB_TYPE=postgres
set POSTGRES_CONNECTION_STRING=Host=localhost;Port=5432;Database=work_management;Username=postgres;Password=postgres_secret_2026

echo Dang khoi chay tren http://127.0.0.1:8000 ...
echo Nhan Ctrl+C de dung server.
echo.
cd /d "%~dp0backend"
if exist "bin\Debug\net10.0\backend.exe" (
    "bin\Debug\net10.0\backend.exe"
) else (
    dotnet run --no-restore
)
pause

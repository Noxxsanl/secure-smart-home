@echo off
setlocal enabledelayedexpansion
title IoT Device Manager - Setup

echo.
echo  ===================================
echo   IoT Device Manager - Setup
echo  ===================================
echo.

:: Check Docker
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker khong tim thay. Cai dat tai: https://docs.docker.com/desktop/windows/
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker daemon chua chay. Mo Docker Desktop va thu lai.
    exit /b 1
)

echo [OK] Docker san sang.

:: Check docker-compose
where docker-compose >nul 2>&1
if errorlevel 1 (
    docker compose version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] docker-compose khong tim thay.
        exit /b 1
    )
    set COMPOSE_CMD=docker compose
) else (
    set COMPOSE_CMD=docker-compose
)

echo [OK] Docker Compose san sang.

:: Setup backend .env
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        copy "backend\.env.example" "backend\.env" >nul
        echo [OK] Da tao backend\.env tu .env.example
    ) else (
        echo [WARN] Khong tim thay backend\.env.example - bo qua.
    )
) else (
    echo [OK] backend\.env da ton tai.
)

:: Build and start
echo.
echo [INFO] Dang build va khoi dong services...
echo.

%COMPOSE_CMD% up --build -d

if errorlevel 1 (
    echo.
    echo [ERROR] Khoi dong that bai. Kiem tra log bang lenh:
    echo         %COMPOSE_CMD% logs
    exit /b 1
)

echo.
echo  ===================================
echo   Khoi dong thanh cong!
echo  ===================================
echo.
echo   Frontend : http://localhost:3000
echo   Backend  : http://localhost:5000/api/health
echo.
echo   Dang nhap: admin / 123456
echo.
echo   Xem log  : %COMPOSE_CMD% logs -f
echo   Dung      : %COMPOSE_CMD% down
echo.

endlocal

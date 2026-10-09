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

:: .env goc cho docker compose - mat khau MySQL ngau nhien, khong commit
findstr /b /r /c:"MYSQL_PASSWORD=." .env >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "$g={-join((48..57)+(65..90)+(97..122)|Get-Random -Count 32|%%{[char]$_})}; $l='MYSQL_ROOT_PASSWORD='+(&$g),'MYSQL_DATABASE=secure_smart_home_iot','MYSQL_USER=secure_smart_home_app','MYSQL_PASSWORD='+(&$g); [IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'),$l)"
    echo [OK] Da tao .env ^(mat khau MySQL ngau nhien^).
    docker volume ls -q | findstr /e "_mysql_data" >nul 2>&1
    if not errorlevel 1 echo [WARN] Volume mysql_data da ton tai voi mat khau cu - doi bang ALTER USER hoac "docker compose down -v" ^(mat du lieu^).
) else (
    echo [OK] .env ^(MySQL^) da ton tai.
)

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

:: Chung chi TLS cho MQTT Broker 2 (can Git Bash + openssl). Tham so cua setup.bat (IP LAN) duoc chuyen tiep.
if not exist "mosquitto\certs\server.crt" (
    if not exist "%ProgramFiles%\Git\bin\bash.exe" (
        echo [ERROR] Chua co chung chi MQTT TLS. Mo Git Bash va chay: bash scripts/gen_mqtt_certs.sh ^<IP LAN^>
        exit /b 1
    )
    echo [INFO] Chua co chung chi MQTT TLS - dang sinh...
    "%ProgramFiles%\Git\bin\bash.exe" scripts/gen_mqtt_certs.sh %*
    if errorlevel 1 exit /b 1
) else (
    echo [OK] Chung chi MQTT TLS da co.
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

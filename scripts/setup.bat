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

:: .env goc cho docker compose - mat khau PostgreSQL ngau nhien, khong commit
findstr /b /r /c:"POSTGRES_APP_PASSWORD=." .env >nul 2>&1
if errorlevel 1 (
    rem Noi them thay vi ghi de: .env cu ban MySQL co the con bien khac. Dong trong dau tien dong dong cuoi neu file cu khong ket thuc bang xuong dong.
    powershell -NoProfile -Command "$g={-join((48..57)+(65..90)+(97..122)|Get-Random -Count 32|%%{[char]$_})}; $l=@('',('POSTGRES_PASSWORD='+(&$g)),'POSTGRES_DB=secure_smart_home_iot','POSTGRES_APP_USER=secure_smart_home_app',('POSTGRES_APP_PASSWORD='+(&$g))); [IO.File]::AppendAllLines((Join-Path (Get-Location) '.env'),[string[]]$l)"
    echo [OK] Da tao bien PostgreSQL trong .env ^(mat khau ngau nhien^).
    docker volume ls -q | findstr /e "_pg_data" >nul 2>&1
    if not errorlevel 1 echo [WARN] Volume pg_data da ton tai voi mat khau cu ^(POSTGRES_* chi ap dung lan khoi tao dau^) - doi bang "docker exec -it iot-postgres psql -U postgres" roi ALTER ROLE ^<POSTGRES_APP_USER^> PASSWORD, hoac "docker compose down -v" ^(mat du lieu^).
    docker volume ls -q | findstr /e "_mysql_data" >nul 2>&1
    if not errorlevel 1 echo [INFO] Volume mysql_data ^(MySQL cu^) khong con duoc dung - xoa bang "docker volume rm" khi khong can du lieu cu.
) else (
    echo [OK] .env ^(PostgreSQL^) da ton tai.
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
if not exist "infra\mosquitto\certs\server.crt" (
    if not exist "%ProgramFiles%\Git\bin\bash.exe" (
        echo [ERROR] Chua co chung chi MQTT TLS. Mo Git Bash va chay: bash infra/pki/gen_mqtt_certs.sh ^<IP LAN^>
        exit /b 1
    )
    echo [INFO] Chua co chung chi MQTT TLS - dang sinh...
    "%ProgramFiles%\Git\bin\bash.exe" infra/pki/gen_mqtt_certs.sh %*
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
echo   Admin    : http://localhost:3001
echo   Operator : http://localhost:3002
echo   Khach hang: http://localhost:3003
echo   Backend  : http://localhost:5000/api/health
echo.
echo   Dang nhap Admin: tai khoan seed 'admin' - mat khau xem docs\guides\CHAY_LOCAL.md, doi khi dung that
echo.
echo   Xem log  : %COMPOSE_CMD% logs -f
echo   Dung      : %COMPOSE_CMD% down
echo.

endlocal

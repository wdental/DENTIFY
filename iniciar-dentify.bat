@echo off
REM =====================================================================
REM Dentify - Script de arranque para Windows
REM World Dental - Quito, Ecuador
REM =====================================================================
setlocal
cd /d "%~dp0"

echo =================================================
echo   Dentify - World Dental
echo   Iniciando el sistema...
echo =================================================
echo.

REM Verificar que Node.js este instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se encontro Node.js instalado en este equipo.
    echo Por favor instale Node.js LTS desde https://nodejs.org antes de continuar.
    pause
    exit /b 1
)

REM Instalar dependencias si no existen
if not exist "node_modules" (
    echo Instalando dependencias por primera vez, esto puede tardar unos minutos...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Fallo la instalacion de dependencias.
        pause
        exit /b 1
    )
)

echo Iniciando el servidor Dentify...
echo.

REM Abrir el navegador despues de un breve instante y luego iniciar el servidor
start "" cmd /c "timeout /t 3 >nul && start http://localhost:3000"
call node server.js

pause

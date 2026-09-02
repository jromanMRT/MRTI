@echo off
setlocal EnableExtensions
title Preparar notificaciones MRTI

fltmc >nul 2>&1
if errorlevel 1 (
  echo Solicitando permisos de administrador...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "MRTI_ORIGIN=http://192.168.1.203/"

echo Configurando solamente el origen interno %MRTI_ORIGIN%
call :ADD_POLICY "HKLM\SOFTWARE\Policies\Google\Chrome\OverrideSecurityRestrictionsOnInsecureOrigin"
if errorlevel 1 goto :FAILED
call :ADD_POLICY "HKLM\SOFTWARE\Policies\Google\Chrome\NotificationsAllowedForUrls"
if errorlevel 1 goto :FAILED
call :ADD_POLICY "HKLM\SOFTWARE\Policies\Microsoft\Edge\OverrideSecurityRestrictionsOnInsecureOrigin"
if errorlevel 1 goto :FAILED
call :ADD_POLICY "HKLM\SOFTWARE\Policies\Microsoft\Edge\NotificationsAllowedForUrls"
if errorlevel 1 goto :FAILED

echo.
echo Preparacion completada.
echo 1. Cierre TODAS las ventanas de Chrome y Edge.
echo 2. Abra nuevamente el navegador y entre a %MRTI_ORIGIN%
echo 3. En Perfil, Aplicacion y notificaciones, pulse Activar notificaciones.
echo.
echo Puede comprobar las politicas en chrome://policy o edge://policy
pause
exit /b 0

:ADD_POLICY
set "MRTI_POLICY_PATH=%~1"
reg query "%MRTI_POLICY_PATH%" /f "%MRTI_ORIGIN%" /d /e >nul 2>&1
if not errorlevel 1 exit /b 0
for /l %%N in (1,1,99) do (
  reg query "%MRTI_POLICY_PATH%" /v %%N >nul 2>&1
  if errorlevel 1 (
    reg add "%MRTI_POLICY_PATH%" /v %%N /t REG_SZ /d "%MRTI_ORIGIN%" /f >nul
    if errorlevel 1 exit /b 1
    exit /b 0
  )
)
echo No hay un espacio libre en %MRTI_POLICY_PATH%
exit /b 1

:FAILED
echo.
echo No fue posible completar la configuracion. No se cambiaron protecciones globales.
echo Use el archivo de reversion para retirar cualquier entrada agregada antes del error.
pause
exit /b 1

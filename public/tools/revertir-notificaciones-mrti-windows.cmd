@echo off
setlocal EnableExtensions
title Revertir preparacion de notificaciones MRTI

fltmc >nul 2>&1
if errorlevel 1 (
  echo Solicitando permisos de administrador...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "MRTI_ORIGIN=http://192.168.1.203/"

call :REMOVE_POLICY "HKLM\SOFTWARE\Policies\Google\Chrome\OverrideSecurityRestrictionsOnInsecureOrigin"
call :REMOVE_POLICY "HKLM\SOFTWARE\Policies\Google\Chrome\NotificationsAllowedForUrls"
call :REMOVE_POLICY "HKLM\SOFTWARE\Policies\Microsoft\Edge\OverrideSecurityRestrictionsOnInsecureOrigin"
call :REMOVE_POLICY "HKLM\SOFTWARE\Policies\Microsoft\Edge\NotificationsAllowedForUrls"

echo.
echo Se retiraron las entradas de MRTI. Cierre y vuelva a abrir Chrome y Edge.
pause
exit /b 0

:REMOVE_POLICY
set "MRTI_POLICY_PATH=%~1"
for /f "tokens=1,2,*" %%A in ('reg query "%MRTI_POLICY_PATH%" 2^>nul ^| findstr /i /c:"%MRTI_ORIGIN%"') do (
  if /i "%%C"=="%MRTI_ORIGIN%" reg delete "%MRTI_POLICY_PATH%" /v "%%A" /f >nul 2>&1
)
exit /b 0

@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_game_assets.ps1" %*
exit /b %ERRORLEVEL%

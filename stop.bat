@echo off
title ForeignTrade - Stop

echo Stopping all services...
taskkill /f /fi "WINDOWTITLE eq Backend*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq Frontend*" >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
echo Done.
pause

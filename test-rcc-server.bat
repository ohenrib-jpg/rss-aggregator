@echo off
chcp 65001 >nul
title Test RCC Server
color 0E

echo.
echo ========================================================
echo   TEST RCC-SERVER.EXE
echo ========================================================
echo.

cd llama.cpp

echo Test de demarrage...
rcc-server.exe --help

echo.
echo Si vous voyez les options d aide ci-dessus, le serveur fonctionne!
echo.
echo Pour un test complet:
echo rcc-server.exe -m models\phi-2.Q4_K_M.gguf -c 512 --host 127.0.0.1 --port 8081
echo.
pause
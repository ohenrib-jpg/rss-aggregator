@echo off
title Verification Llama.cpp
color 0E

echo.
echo ========================================================
echo   VERIFICATION LLAMA.CPP
echo ========================================================
echo.

set "LLAMA_DIR=llama.cpp"

echo Contenu du dossier %LLAMA_DIR%:
echo.
dir /B "%LLAMA_DIR%"

echo.
echo Contenu du dossier %LLAMA_DIR%\models:
echo.
dir /B "%LLAMA_DIR%\models" 2>nul || echo Dossier models introuvable

echo.
echo Executables trouves:
dir /B "%LLAMA_DIR%\*.exe" 2>nul || echo Aucun .exe trouve

echo.
pause
@echo off
chcp 65001 >nul
title Test IA
color 0E

echo.
echo ========================================================
echo   TEST DE L IA
echo ========================================================
echo.

echo Envoi d une requete test au serveur IA...
curl -X POST http://localhost:8080/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\": \"phi-2\", \"messages\": [{\"role\": \"user\", \"content\": \"Bonjour, peux-tu me dire bonjour en retour ?\"}], \"max_tokens\": 50}" 

echo.
echo.
echo Si vous voyez une reponse JSON, l IA fonctionne!
echo.
pause
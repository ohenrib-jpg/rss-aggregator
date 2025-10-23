@echo off
chcp 65001 >nul
title Correction Await Racine
color 0E

echo.
echo ========================================================
echo   CORRECTION AWAIT RACINE
echo ========================================================
echo.

echo Recherche du await problematique...
powershell -Command "
(Get-Content 'server.js') -replace 'try {\s*const alertCheck = await fetch', '(async () => {\n    try {\n        const alertCheck = await fetch' | 
Set-Content 'server_temp.js'
"

echo Application correctif...
powershell -Command "
(Get-Content 'server_temp.js') -replace '} catch \(alertError\) {', '    } catch (alertError) {\n        console.warn('\''?? Erreur vérification alertes:'\'', alertError.message);\n    }\n})();' | 
Set-Content 'server.js'
"

del server_temp.js

echo.
echo ========================================================
echo   CORRECTION APPLIQUEE!
echo ========================================================
echo.
echo Le await racine a ete encapsule dans une IIFE
echo.
echo Testez avec: node server.js
echo.
pause
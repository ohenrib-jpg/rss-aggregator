@echo off
REM Script de démarrage local pour Windows

echo 🚀 Démarrage RSS Aggregator (mode local)
echo.

set NODE_ENV=development
set SQLITE_DB=./data/rss_aggregator.db
set LOG_LEVEL=debug

node server.js

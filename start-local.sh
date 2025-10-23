#!/bin/bash
# Script de démarrage local

echo "🚀 Démarrage RSS Aggregator (mode local)"
echo ""

# Charger les variables d'environnement
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Démarrer le serveur
NODE_ENV=development node server.js

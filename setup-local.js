// scripts/setup-local.js - Script d'installation pour mode local

const fs = require('fs');
const path = require('path');

console.log('🚀 Configuration de l\'environnement local...\n');

// 1. Créer les dossiers nécessaires
const dirs = ['data', 'logs', 'public'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Dossier créé: ${dir}/`);
  } else {
    console.log(`✓ Dossier existe: ${dir}/`);
  }
});

// 2. Créer le fichier .env.local si inexistant
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  const envContent = `# Configuration locale RSS Aggregator
NODE_ENV=development

# Base de données SQLite (local)
SQLITE_DB=./data/rss_aggregator.db

# Services externes (optionnels en local)
# FLASK_API_URL=http://localhost:5000
# BAYESIAN_SERVICE_URL=http://localhost:5001
# BAYES_TRIGGER_TOKEN=dev_token_local

# Email (optionnel)
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=

# Sécurité
ADMIN_TOKEN=dev_admin_token_change_me

# Logging
LOG_LEVEL=debug
`;

  fs.writeFileSync(envPath, envContent);
  console.log('✅ Fichier .env.local créé');
  console.log('   → Éditez ce fichier pour configurer vos paramètres\n');
} else {
  console.log('✓ Fichier .env.local existe\n');
}

// 3. Vérifier les dépendances
console.log('📦 Vérification des dépendances...');
try {
  require('sqlite3');
  console.log('✅ sqlite3 installé');
} catch (e) {
  console.log('⚠️  sqlite3 non installé');
  console.log('   → Exécutez: npm install sqlite3');
}

// 4. Créer un fichier de démarrage rapide
const startScriptPath = path.join(__dirname, '..', 'start-local.sh');
const startScriptContent = `#!/bin/bash
# Script de démarrage local

echo "🚀 Démarrage RSS Aggregator (mode local)"
echo ""

# Charger les variables d'environnement
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

# Démarrer le serveur
NODE_ENV=development node server.js
`;

fs.writeFileSync(startScriptPath, startScriptContent);
fs.chmodSync(startScriptPath, '755');
console.log('✅ Script start-local.sh créé');

// 5. Créer un fichier de démarrage Windows
const startBatPath = path.join(__dirname, '..', 'start-local.bat');
const startBatContent = `@echo off
REM Script de démarrage local pour Windows

echo 🚀 Démarrage RSS Aggregator (mode local)
echo.

set NODE_ENV=development
set SQLITE_DB=./data/rss_aggregator.db
set LOG_LEVEL=debug

node server.js
`;

fs.writeFileSync(startBatPath, startBatContent);
console.log('✅ Script start-local.bat créé\n');

// 6. Instructions finales
console.log('='.repeat(70));
console.log('✅ CONFIGURATION LOCALE TERMINÉE');
console.log('='.repeat(70));
console.log('\nPour démarrer en mode local:');
console.log('\n  Linux/Mac:');
console.log('    ./start-local.sh');
console.log('\n  Windows:');
console.log('    start-local.bat');
console.log('\n  Ou directement:');
console.log('    npm run local');
console.log('\nLe serveur utilisera SQLite et sera accessible sur:');
console.log('    http://localhost:3000');
console.log('\n' + '='.repeat(70) + '\n');

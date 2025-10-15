const fs = require('fs');
const path = require('path');
const { pool } = require('../db/database');
const sqlStorage = require('../modules/sql_storage_manager');

async function migrateFromJSON() {
  try {
    console.log('🚀 Début de la migration depuis JSON/Parquet vers PostgreSQL...');

    // Migrer les thèmes
    const themesPath = path.join(__dirname, '..', 'themes.json');
    if (fs.existsSync(themesPath)) {
      const themesData = JSON.parse(fs.readFileSync(themesPath, 'utf8'));
      for (const theme of themesData.themes) {
        await sqlStorage.saveTheme(theme);
        console.log(`✅ Thème migré: ${theme.name}`);
      }
    }

    // Migrer les corrections IA
    const correctionsPath = path.join(__dirname, '..', 'ia-corrections.json');
    if (fs.existsSync(correctionsPath)) {
      const correctionsData = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));
      for (const correction of correctionsData.corrections) {
        // Implémenter la migration des corrections
        console.log(`📝 Correction à migrer: ${correction.title}`);
      }
    }

    console.log('🎉 Migration terminée avec succès!');
    
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
  } finally {
    await pool.end();
  }
}

// Exécuter la migration
if (require.main === module) {
  migrateFromJSON();
}

module.exports = { migrateFromJSON };
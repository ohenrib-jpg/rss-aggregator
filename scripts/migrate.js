const { initDatabase } = require('./init-db');
const sqlStorage = require('../modules/sql_storage_manager');
const fs = require('fs');
const path = require('path');

async function migrateFromJSON() {
  try {
    console.log('🚀 Début de la migration depuis JSON vers PostgreSQL...');

    // S'assurer que la base est initialisée
    await initDatabase();

    // Migrer les thèmes
    const themesPath = path.join(__dirname, '..', 'themes.json');
    if (fs.existsSync(themesPath)) {
      const themesData = JSON.parse(fs.readFileSync(themesPath, 'utf8'));
      console.log(`📚 Migration de ${themesData.themes.length} thèmes...`);
      
      for (const theme of themesData.themes) {
        try {
          await sqlStorage.saveTheme(theme);
          console.log(`✅ Thème migré: ${theme.name}`);
        } catch (error) {
          console.error(`❌ Erreur thème ${theme.name}:`, error.message);
        }
      }
    }

    // Migrer les flux RSS
    const configPath = path.join(__dirname, '..', 'config.json');
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log(`📡 Migration de ${configData.feeds.length} flux RSS...`);
      
      let migratedFeeds = 0;
      for (const feedUrl of configData.feeds.slice(0, 20)) { // Limiter pour le test
        try {
          await sqlStorage.pool.query(`
            INSERT INTO feeds (url, is_active) 
            VALUES ($1, true) 
            ON CONFLICT (url) DO NOTHING
          `, [feedUrl]);
          migratedFeeds++;
        } catch (error) {
          console.error(`❌ Erreur flux ${feedUrl}:`, error.message);
        }
      }
      console.log(`✅ ${migratedFeeds} flux RSS migrés`);
    }

    console.log('🎉 Migration terminée avec succès!');
    
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    throw error;
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  migrateFromJSON()
    .then(() => {
      console.log('✅ Migration complète');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration échouée:', error);
      process.exit(1);
    });
}

module.exports = { migrateFromJSON };
// db/reset_database.js - Réinitialisation compatible Windows
const fs = require('fs').promises;
const path = require('path');
const { config } = require('../config');

async function resetDatabase() {
  console.log('🔄 RESETTING DATABASE...');
  
  try {
    if (config.database.use === 'sqlite') {
      const dbPath = path.resolve(config.database.sqlite.filename);
      
      try {
        await fs.access(dbPath);
        await fs.unlink(dbPath);
        console.log('✅ SQLite database deleted:', dbPath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('ℹ️  Database file does not exist');
        } else {
          throw error;
        }
      }
      
      // Recréer le dossier data
      const dataDir = path.dirname(dbPath);
      await fs.mkdir(dataDir, { recursive: true });
      console.log('✅ Data directory ready');
    }
    
    console.log('🎉 Database reset completed!');
    return true;
    
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    return false;
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  resetDatabase().then(success => {
    if (success) {
      console.log('\n✅ Now restart your application: npm start');
      process.exit(0);
    } else {
      process.exit(1);
    }
  });
}

module.exports = { resetDatabase };
// db/repair_database.js - Réparation d'urgence des tables manquantes
const { query } = require('./database_manager');
const fs = require('fs').promises;
const path = require('path');

async function repairMissingTables() {
  console.log('🛠️  REPAIRING MISSING TABLES...');
  
  try {
    // Vérifier quelles tables existent
    const tablesToCheck = ['feeds', 'articles', 'themes', 'theme_analyses', 'sentiment_lexicon'];
    const missingTables = [];
    
    for (const table of tablesToCheck) {
      try {
        await query(`SELECT 1 FROM ${table} LIMIT 1`);
        console.log(`✅ Table exists: ${table}`);
      } catch (error) {
        if (error.message.includes('no such table')) {
          missingTables.push(table);
          console.log(`❌ Table missing: ${table}`);
        }
      }
    }
    
    if (missingTables.length > 0) {
      console.log(`🔧 Creating ${missingTables.length} missing tables...`);
      
      // Charger et exécuter le schéma complet
      const schemaPath = path.join(__dirname, 'schema_sqlite.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      const statements = schema.split(';').filter(s => s.trim().length > 0);
      
      for (const statement of statements) {
        const tableName = extractTableName(statement);
        if (tableName && missingTables.includes(tableName)) {
          try {
            await query(statement);
            console.log(`✅ Created table: ${tableName}`);
          } catch (error) {
            console.warn(`⚠️ Error creating ${tableName}:`, error.message);
          }
        }
      }
      
      console.log('✅ Database repair completed');
    } else {
      console.log('✅ All tables exist - no repair needed');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Repair failed:', error);
    return false;
  }
}

function extractTableName(statement) {
  const match = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i);
  return match ? match[1] : null;
}

// Exécuter immédiatement si appelé directement
if (require.main === module) {
  repairMissingTables().then(success => {
    if (success) {
      console.log('🎉 Repair completed successfully!');
      process.exit(0);
    } else {
      console.log('💥 Repair failed!');
      process.exit(1);
    }
  });
}

module.exports = { repairMissingTables };
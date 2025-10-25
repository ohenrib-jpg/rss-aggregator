// db/migrate_add_scores.js
const { query } = require('./database_manager');
const { config } = require('../config');

async function migrateAddScoreColumns() {
  try {
    console.log('🔄 Vérification des colonnes de scoring...');
    
    // Vérifier si les colonnes existent
    let checkQuery;
    if (config.database.use === 'postgresql') {
      checkQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'articles' 
        AND column_name IN ('confidence_score', 'importance_score')
      `;
    } else {
      checkQuery = `
        PRAGMA table_info(articles)
      `;
    }
    
    const result = await query(checkQuery);
    
    let hasConfidenceScore = false;
    let hasImportanceScore = false;
    
    if (config.database.use === 'postgresql') {
      const columns = result.rows.map(row => row.column_name);
      hasConfidenceScore = columns.includes('confidence_score');
      hasImportanceScore = columns.includes('importance_score');
    } else {
      // SQLite
      const columns = result.rows.map(row => row.name);
      hasConfidenceScore = columns.includes('confidence_score');
      hasImportanceScore = columns.includes('importance_score');
    }
    
    console.log('📊 Statut des colonnes:');
    console.log(`   - confidence_score: ${hasConfidenceScore ? '✅' : '❌'}`);
    console.log(`   - importance_score: ${hasImportanceScore ? '✅' : '❌'}`);
    
    // Ajouter les colonnes manquantes
    if (!hasConfidenceScore) {
      console.log('➕ Ajout de confidence_score...');
      await query('ALTER TABLE articles ADD COLUMN confidence_score REAL DEFAULT 0.5');
    }
    
    if (!hasImportanceScore) {
      console.log('➕ Ajout de importance_score...');
      await query('ALTER TABLE articles ADD COLUMN importance_score REAL DEFAULT 0.5');
    }
    
    console.log('✅ Migration des colonnes de scoring terminée');
    
  } catch (error) {
    console.error('❌ Erreur migration:', error);
    throw error;
  }
}

module.exports = { migrateAddScoreColumns };
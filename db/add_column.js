// migrations/add_scores_columns.js
const db = require('../db/database_manager');

async function migrate() {
    try {
        console.log('🔄 Migration: Ajout des colonnes de scoring...');
        
        // Vérifier si les colonnes existent déjà
        const checkColumns = await db.query(`
            PRAGMA table_info(articles)
        `);
        
        const hasConfidence = checkColumns.rows.some(col => col.name === 'confidence_score');
        const hasImportance = checkColumns.rows.some(col => col.name === 'importance_score');
        
        if (!hasConfidence) {
            await db.query('ALTER TABLE articles ADD COLUMN confidence_score REAL DEFAULT 0.5');
            console.log('✅ Colonne confidence_score ajoutée');
        }
        
        if (!hasImportance) {
            await db.query('ALTER TABLE articles ADD COLUMN importance_score REAL DEFAULT 0.5');
            console.log('✅ Colonne importance_score ajoutée');
        }
        
        console.log('🎉 Migration terminée avec succès');
        
    } catch (error) {
        console.error('❌ Erreur migration:', error);
    }
}

// Exécuter la migration
migrate();
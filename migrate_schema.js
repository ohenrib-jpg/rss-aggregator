const { getDatabaseManager } = require('./db/database_manager');
const fs = require('fs').promises;
const path = require('path');

async function migrateSchema() {
  try {
    const db = await getDatabaseManager();
    
    // Vérifier si les tables bayésiennes existent
    const tables = await db.query(`
      SELECT name FROM sqlite_master WHERE type='table' 
      AND name IN ('bayes_evidence', 'bayes_priors')
    `);
    
    if (tables.rows.length === 0) {
      console.log('🚀 Creating Bayesian tables...');
      
      const schemaPath = path.join(__dirname, 
        config.database.use === 'postgresql' ? 'schema_postgresql.sql' : 'schema_sqlite.sql'
      );
      
      const schema = await fs.readFile(schemaPath, 'utf8');
      const statements = schema.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        if (statement.includes('bayes_')) {
          await db.query(statement);
        }
      }
      
      console.log('✅ Bayesian tables created successfully');
    } else {
      console.log('✅ Bayesian tables already exist');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

module.exports = { migrateSchema };
const { pool, initializeDatabase } = require('../db/database');

async function initDatabase() {
  try {
    console.log('🚀 Initialisation de la base de données PostgreSQL...');
    
    // Test de connexion
    const client = await pool.connect();
    console.log('✅ Connecté à PostgreSQL');
    client.release();

    // Créer les tables
    await initializeDatabase();
    console.log('✅ Tables créées avec succès');

    // Vérifier les tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('📊 Tables disponibles:');
    tables.rows.forEach(table => {
      console.log(`   - ${table.table_name}`);
    });

    console.log('🎉 Base de données initialisée avec succès!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error);
    process.exit(1);
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
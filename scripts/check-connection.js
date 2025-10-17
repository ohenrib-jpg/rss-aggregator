const { pool, testConnectionWithRetry } = require('../db/database');

async function checkConnection() {
  console.log('🔍 Vérification de la connexion PostgreSQL');
  
  const isConnected = await testConnectionWithRetry();
  
  if (isConnected) {
    console.log('✅ Connexion PostgreSQL fonctionnelle');
    
    // Test des tables
    try {
      const tables = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      console.log(`📊 ${tables.rows.length} tables disponibles`);
      
      process.exit(0);
    } catch (error) {
      console.error('❌ Erreur vérification tables:', error.message);
      process.exit(1);
    }
  } else {
    console.error('❌ Connexion PostgreSQL échouée');
    process.exit(1);
  }
}

checkConnection();
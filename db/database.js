// db/database.js - Version avec indexes
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Configuration de la pool de connexions
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum de connexions
  idleTimeoutMillis: 30000, // Fermer après 30s d'inactivité
  connectionTimeoutMillis: 2000, // Timeout de connexion
});

// Gestion des erreurs de connexion
pool.on('error', (err, client) => {
  console.error('❌ Erreur de connexion PostgreSQL:', err);
});

// Test de connexion au démarrage
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Connecté à PostgreSQL:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Impossible de se connecter à PostgreSQL:', error.message);
    return false;
  }
}

// Création des tables
async function createTables() {
  const client = await pool.connect();
  try {
    console.log('📋 Création des tables...');
    
    // Lecture du schéma SQL
    const schemaPath = path.join(__dirname, 'schema.sql');
    const tablesSQL = await fs.readFile(schemaPath, 'utf8');
    
    // Exécution du schéma
    await client.query(tablesSQL);
    console.log('✅ Tables créées avec succès');
    
  } catch (error) {
    console.error('❌ Erreur création tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ✅ NOUVELLE FONCTION : Création des index
async function createIndexes() {
  const client = await pool.connect();
  try {
    console.log('📊 Création des index...');
    
    // Lecture du fichier d'index
    const indexPath = path.join(__dirname, 'indexes.sql');
    const indexSQL = await fs.readFile(indexPath, 'utf8');
    
    // Exécution des index
    await client.query(indexSQL);
    console.log('✅ Index créés avec succès');
    
  } catch (error) {
    // Les index peuvent déjà exister, c'est normal
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Certains index existent déjà (normal)');
    } else {
      console.warn('⚠️ Erreur création index:', error.message);
    }
  } finally {
    client.release();
  }
}

// ✅ NOUVELLE FONCTION : Vérification des index existants
async function checkExistingIndexes() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        tablename, 
        indexname, 
        indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    
    console.log(`📊 ${result.rows.length} index existants détectés`);
    return result.rows;
    
  } catch (error) {
    console.warn('⚠️ Impossible de vérifier les index:', error.message);
    return [];
  } finally {
    client.release();
  }
}

// Initialisation complète de la base
async function initializeDatabase() {
  try {
    console.log('🚀 Initialisation de la base de données...');
    
    // Test de connexion
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Connexion PostgreSQL échouée');
    }
    
    // Création des tables
    await createTables();
    
    // Création des index
    await createIndexes();
    
    // Vérification finale
    const indexes = await checkExistingIndexes();
    
    console.log('✅ Base de données initialisée avec succès');
    return { success: true, indexesCount: indexes.length };
    
  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error);
    throw error;
  }
}

// ✅ NOUVELLE FONCTION : Réinitialisation des index (pour développement)
async function recreateIndexes() {
  try {
    console.log('🔄 Recréation des index...');
    
    const client = await pool.connect();
    
    // Supprimer tous les index (attention en production !)
    if (process.env.NODE_ENV === 'development') {
      const dropResult = await client.query(`
        SELECT 'DROP INDEX IF EXISTS ' || indexname || ';' as drop_command
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname LIKE 'idx_%'
      `);
      
      for (const row of dropResult.rows) {
        await client.query(row.drop_command);
      }
      console.log('✅ Anciens index supprimés');
    }
    
    client.release();
    
    // Recréer les index
    await createIndexes();
    console.log('✅ Index recréés avec succès');
    
  } catch (error) {
    console.error('❌ Erreur recréation index:', error);
  }
}

// Export des fonctions
module.exports = { 
  pool, 
  initializeDatabase, 
  createIndexes,
  recreateIndexes,
  checkExistingIndexes,
  testConnection 
};
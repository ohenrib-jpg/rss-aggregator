// db/database.js - Version ultra-résiliente pour Render
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Configuration optimisée pour Render
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5, // TRÈS IMPORTANT: réduit le nombre de connexions
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Timeout plus long
  maxUses: 5000, // Recyclage fréquent
};

console.log('🔧 Configuration PostgreSQL:', {
  hasDatabaseUrl: !!process.env.DATABASE_URL,
  ssl: poolConfig.ssl ? 'activé' : 'désactivé',
  maxConnections: poolConfig.max
});

const pool = new Pool(poolConfig);

// Gestion robuste des erreurs
pool.on('error', (err, client) => {
  console.error('❌ Erreur inattendue PostgreSQL:', err);
});

pool.on('connect', () => {
  console.log('🔗 Nouvelle connexion PostgreSQL établie');
});

pool.on('remove', () => {
  console.log('🔗 Connexion PostgreSQL fermée');
});

// Test de connexion avec retry intelligent
async function testConnectionWithRetry(maxRetries = 5, delay = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let client;
    try {
      console.log(`🔗 Tentative de connexion PostgreSQL (${attempt}/${maxRetries})...`);
      
      client = await pool.connect();
      const result = await client.query('SELECT NOW() as time');
      
      console.log('✅ Connecté à PostgreSQL:', result.rows[0].time);
      return true;
      
    } catch (error) {
      console.warn(`⚠️ Échec connexion (tentative ${attempt}):`, error.message);
      
      // Attente progressive (3s, 6s, 9s, 12s, 15s)
      if (attempt < maxRetries) {
        const waitTime = delay * attempt;
        console.log(`⏳ Nouvelle tentative dans ${waitTime/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } finally {
      if (client) client.release();
    }
  }
  
  console.error('❌ Échec de toutes les tentatives de connexion');
  return false;
}

// Vérification simple de fichier
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Création des tables (version simplifiée)
async function createTables() {
  const client = await pool.connect();
  try {
    console.log('📋 Création des tables...');
    
    const schemaPath = path.join(__dirname, 'schema.sql');
    
    if (await fileExists(schemaPath)) {
      const tablesSQL = await fs.readFile(schemaPath, 'utf8');
      await client.query(tablesSQL);
      console.log('✅ Tables créées via schema.sql');
    } else {
      console.log('ℹ️  Création manuelle des tables...');
      await createTablesManually(client);
    }
    
  } catch (error) {
    console.error('❌ Erreur création tables:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Création manuelle des tables (fallback)
async function createTablesManually(client) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS feeds (
      id SERIAL PRIMARY KEY,
      url VARCHAR(500) UNIQUE NOT NULL,
      title VARCHAR(300),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    
      // Dans db/database.js - fonction createTablesManually()
      `CREATE TABLE IF NOT EXISTS articles (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      link VARCHAR(500) UNIQUE NOT NULL,
      pub_date TIMESTAMP,
      feed_url VARCHAR(500),
      sentiment_score FLOAT DEFAULT 0,
      sentiment_type VARCHAR(20) DEFAULT 'neutral',
      sentiment_confidence FLOAT DEFAULT 0,
      confidence_score REAL DEFAULT 0.5,
      importance_score REAL DEFAULT 0.5,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    
    `CREATE TABLE IF NOT EXISTS themes (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      keywords TEXT[],
      color VARCHAR(7) DEFAULT '#6366f1',
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`
  ];

  for (const tableSQL of tables) {
    try {
      await client.query(tableSQL);
    } catch (error) {
      console.warn('⚠️ Table peut déjà exister:', error.message);
    }
  }
  console.log('✅ Tables créées manuellement');
}

// Création des index (version simplifiée)
async function createIndexes() {
  const client = await pool.connect();
  try {
    console.log('📊 Création des index...');
    
    const indexPath = path.join(__dirname, 'indexes.sql');
    
    if (await fileExists(indexPath)) {
      const indexSQL = await fs.readFile(indexPath, 'utf8');
      await client.query(indexSQL);
      console.log('✅ Index créés via indexes.sql');
    } else {
      console.log('ℹ️  Création manuelle des index critiques...');
      await createCriticalIndexes(client);
    }
    
  } catch (error) {
    console.warn('⚠️ Erreur création index (non critique):', error.message);
  } finally {
    client.release();
  }
}

// Index critiques seulement
async function createCriticalIndexes(client) {
  const criticalIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_articles_pub_date_desc ON articles(pub_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link)',
    'CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url)'
  ];

  for (const indexSQL of criticalIndexes) {
    try {
      await client.query(indexSQL);
    } catch (error) {
      console.warn('⚠️ Index peut déjà exister:', error.message);
    }
  }
  console.log('✅ Index critiques créés');
}

// Initialisation principale
async function initializeDatabase() {
  try {
    console.log('🚀 Initialisation de la base de données...');
    
    // Tentative de connexion avec retry
    const connected = await testConnectionWithRetry(5, 3000);
    if (!connected) {
      throw new Error('Impossible de se connecter à PostgreSQL après 5 tentatives');
    }
    
    // Création des tables et index
    await createTables();
    await createIndexes();
    
    console.log('✅ Base de données initialisée avec succès');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error.message);
    throw error;
  }
}

module.exports = { 
  pool, 
  initializeDatabase,
  testConnection: testConnectionWithRetry
};
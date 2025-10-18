// db/database.js - Version résiliente
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ✅ FONCTION RÉSILIENTE : Vérifie si un fichier existe
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ✅ FONCTION RÉSILIENTE : Création des tables avec fallback
async function createTables() {
  const client = await pool.connect();
  try {
    console.log('📋 Création des tables...');
    
    const schemaPath = path.join(__dirname, 'schema.sql');
    
    if (await fileExists(schemaPath)) {
      // Méthode normale : avec fichier SQL
      const tablesSQL = await fs.readFile(schemaPath, 'utf8');
      await client.query(tablesSQL);
      console.log('✅ Tables créées via schema.sql');
    } else {
      // Méthode fallback : création manuelle
      console.log('ℹ️  schema.sql non trouvé, création manuelle...');
      await createTablesManually(client);
      console.log('✅ Tables créées manuellement');
    }
    
  } catch (error) {
    console.error('❌ Erreur création tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ✅ FONCTION DE FALLBACK : Création manuelle des tables
async function createTablesManually(client) {
  // Table feeds
  await client.query(`
    CREATE TABLE IF NOT EXISTS feeds (
      id SERIAL PRIMARY KEY,
      url VARCHAR(500) UNIQUE NOT NULL,
      title VARCHAR(300),
      is_active BOOLEAN DEFAULT true,
      last_fetched TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Table articles
  await client.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      link VARCHAR(500) UNIQUE NOT NULL,
      pub_date TIMESTAMP,
      feed_url VARCHAR(500),
      sentiment_score FLOAT DEFAULT 0,
      sentiment_type VARCHAR(20) DEFAULT 'neutral',
      sentiment_confidence FLOAT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Table themes
  await client.query(`
    CREATE TABLE IF NOT EXISTS themes (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      keywords TEXT[],
      color VARCHAR(7) DEFAULT '#6366f1',
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Table theme_analyses
  await client.query(`
    CREATE TABLE IF NOT EXISTS theme_analyses (
      id SERIAL PRIMARY KEY,
      article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
      theme_id VARCHAR(100) REFERENCES themes(id) ON DELETE CASCADE,
      confidence FLOAT DEFAULT 1.0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(article_id, theme_id)
    )
  `);

  // Table sentiment_lexicon
  await client.query(`
    CREATE TABLE IF NOT EXISTS sentiment_lexicon (
      id SERIAL PRIMARY KEY,
      word VARCHAR(100) UNIQUE NOT NULL,
      score FLOAT NOT NULL,
      language VARCHAR(10) DEFAULT 'fr',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

// ✅ FONCTION RÉSILIENTE : Création des index
async function createIndexes() {
  const client = await pool.connect();
  try {
    console.log('📊 Création des index...');
    
    const indexPath = path.join(__dirname, 'indexes.sql');
    
    if (await fileExists(indexPath)) {
      // Méthode normale : avec fichier SQL
      const indexSQL = await fs.readFile(indexPath, 'utf8');
      await client.query(indexSQL);
      console.log('✅ Index créés via indexes.sql');
    } else {
      // Méthode fallback : création manuelle des index critiques
      console.log('ℹ️  indexes.sql non trouvé, création manuelle des index...');
      await createIndexesManually(client);
      console.log('✅ Index créés manuellement');
    }
    
  } catch (error) {
    console.warn('⚠️ Erreur création index:', error.message);
  } finally {
    client.release();
  }
}

// ✅ FONCTION DE FALLBACK : Création manuelle des index
async function createIndexesManually(client) {
  // Index critiques seulement
  const criticalIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_articles_pub_date_desc ON articles(pub_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_articles_feed_url ON articles(feed_url)`,
    `CREATE INDEX IF NOT EXISTS idx_articles_sentiment_score ON articles(sentiment_score)`,
    `CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url)`,
    `CREATE INDEX IF NOT EXISTS idx_feeds_active ON feeds(is_active) WHERE is_active = true`
  ];

  for (const indexSQL of criticalIndexes) {
    try {
      await client.query(indexSQL);
    } catch (error) {
      console.warn(`⚠️ Index non créé: ${error.message}`);
    }
  }
}

// Le reste du code reste identique...
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

async function initializeDatabase() {
  try {
    console.log('🚀 Initialisation de la base de données...');
    
    const connected = await testConnection();
    if (!connected) throw new Error('Connexion PostgreSQL échouée');
    
    await createTables();
    await createIndexes();
    
    console.log('✅ Base de données initialisée avec succès');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error);
    throw error;
  }
}

module.exports = { 
  pool, 
  initializeDatabase, 
  createIndexes,
  testConnection 
};
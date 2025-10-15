const { Pool } = require('pg');
require('dotenv').config();

// Configuration optimisée pour Render
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10, // Réduire le nombre max de connexions
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // Augmenter à 30s
  query_timeout: 30000, // Timeout des requêtes
  statement_timeout: 30000, // Timeout des statements
};

console.log('🔧 Configuration PostgreSQL chargée pour Render');

const pool = new Pool(poolConfig);

// Gestion robuste des erreurs
pool.on('connect', () => {
  console.log('✅ Connecté à PostgreSQL sur Render');
});

pool.on('error', (err) => {
  console.error('❌ Erreur de connexion PostgreSQL:', err.message);
});

pool.on('remove', () => {
  console.log('ℹ️  Connexion PostgreSQL fermée');
});

// Test de connexion avec retry
async function testConnectionWithRetry(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      console.log(`✅ Test de connexion PostgreSQL réussi (tentative ${attempt})`);
      client.release();
      return true;
    } catch (error) {
      console.error(`❌ Tentative ${attempt} échouée:`, error.message);
      if (attempt < maxRetries) {
        console.log(`⏳ Nouvelle tentative dans 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  return false;
}

// Initialiser la base de données
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');
    
    const connectionOk = await testConnectionWithRetry();
    if (!connectionOk) {
      throw new Error('Impossible de se connecter à PostgreSQL après plusieurs tentatives');
    }

    // Table des flux RSS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feeds (
        id SERIAL PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        last_fetched TIMESTAMP DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des thèmes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS themes (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        keywords TEXT[] NOT NULL,
        color TEXT DEFAULT '#6366f1',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des articles
    await pool.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        link TEXT UNIQUE NOT NULL,
        pub_date TIMESTAMP NOT NULL,
        feed_url TEXT,
        sentiment_score DECIMAL(3,2) DEFAULT 0,
        sentiment_type VARCHAR(20) DEFAULT 'neutral',
        sentiment_confidence DECIMAL(3,2) DEFAULT 0,
        sentiment_words JSONB DEFAULT '[]',
        irony_detected BOOLEAN DEFAULT FALSE,
        ia_corrected BOOLEAN DEFAULT FALSE,
        correction_confidence DECIMAL(3,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des analyses par thème
    await pool.query(`
      CREATE TABLE IF NOT EXISTS theme_analyses (
        id SERIAL PRIMARY KEY,
        theme_id INTEGER REFERENCES themes(id),
        article_id INTEGER REFERENCES articles(id),
        match_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(theme_id, article_id)
      )
    `);

    console.log('✅ Base de données initialisée avec succès');
    return true;

  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error.message);
    throw error;
  }
}

// Fonction pour fermer proprement
async function closeDatabase() {
  try {
    await pool.end();
    console.log('✅ Connexion PostgreSQL fermée');
  } catch (error) {
    console.error('❌ Erreur fermeture base de données:', error.message);
  }
}

module.exports = {
  pool,
  initializeDatabase,
  testConnectionWithRetry,
  closeDatabase
};
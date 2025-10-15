const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://rssaggregator_postgresql_olivier_user:jexuBogPqTuplOcud708PuSuIVWBWwi0@dpg-d3nnodm3jp1c73c3302g-a.frankfurt-postgres.render.com/rssaggregator_postgresql_olivier",
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test de connexion
pool.on('connect', () => {
  console.log('✅ Connecté à PostgreSQL sur Render');
});

pool.on('error', (err) => {
  console.error('❌ Erreur de connexion PostgreSQL:', err);
});

// Initialiser la base de données
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');
    
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
        name TEXT NOT NULL,
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

    // Table des analyses temporelles
    await pool.query(`
      CREATE TABLE IF NOT EXISTS timeline_analyses (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        theme_name TEXT NOT NULL,
        article_count INTEGER DEFAULT 0,
        avg_sentiment DECIMAL(3,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, theme_name)
      )
    `);

    // Table des corrections IA
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ia_corrections (
        id SERIAL PRIMARY KEY,
        article_id INTEGER REFERENCES articles(id),
        original_score DECIMAL(3,2),
        corrected_score DECIMAL(3,2),
        confidence DECIMAL(3,2),
        analysis_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table du lexique de sentiment
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sentiment_lexicon (
        id SERIAL PRIMARY KEY,
        word TEXT UNIQUE NOT NULL,
        score DECIMAL(3,2) NOT NULL,
        usage_count INTEGER DEFAULT 0,
        total_score DECIMAL(10,4) DEFAULT 0,
        consistency DECIMAL(4,3) DEFAULT 0.5,
        last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table des statistiques d'usage
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usage_stats (
        id SERIAL PRIMARY KEY,
        endpoint TEXT NOT NULL,
        call_count INTEGER DEFAULT 0,
        last_called TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        avg_response_time DECIMAL(8,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Base de données initialisée avec succès');

  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error);
    throw error;
  }
}

module.exports = {
  pool,
  initializeDatabase
};
const { Pool } = require('pg');
require('dotenv').config();

// Debug de la configuration
console.log('🔧 Configuration PostgreSQL:');
console.log('NODE_ENV:', process.env.NODE_ENV);

// URL de fallback explicite avec le domaine complet Render
const databaseUrl = process.env.DATABASE_URL || "postgresql://rssaggregator_postgresql_olivier_user:jexuBogPqTuplOcud708PuSuIVWBWwi0@dpg-d3nnodm3jp1c73c3302g-a.frankfurt-postgres.render.com/rssaggregator_postgresql_olivier";

console.log('🔗 Utilisation URL:', databaseUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));

// Configuration optimisée pour Render
const poolConfig = {
  connectionString: databaseUrl,
  ssl: { 
    rejectUnauthorized: false 
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // 15s pour Render
};

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

// Test de connexion avec meilleur debug
async function testConnectionWithRetry(maxRetries = 5) {
  console.log(`🔍 Test de connexion à PostgreSQL (${maxRetries} tentatives max)...`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Tentative ${attempt}/${maxRetries}...`);
      const client = await pool.connect();
      console.log(`✅ Connexion PostgreSQL réussie!`);
      
      // Test simple de requête
      const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
      console.log(`⏰ Heure PostgreSQL: ${result.rows[0].current_time}`);
      console.log(`📊 Version: ${result.rows[0].pg_version.split(',')[0]}`);
      
      client.release();
      return true;
    } catch (error) {
      console.error(`❌ Tentative ${attempt} échouée:`, error.message);
      console.error(`🔍 Détails:`, error.code, error.address, error.port);
      
      if (attempt < maxRetries) {
        const delay = attempt * 2000; // Backoff exponentiel
        console.log(`⏳ Nouvelle tentative dans ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

// Fonction pour créer les contraintes UNIQUE manquantes
async function ensureUniqueConstraints() {
  try {
    console.log('🔍 Vérification des contraintes UNIQUE...');
    
    const constraints = [
      { table: 'themes', column: 'name', name: 'themes_name_key' },
      { table: 'feeds', column: 'url', name: 'feeds_url_key' },
      { table: 'articles', column: 'link', name: 'articles_link_key' },
      { table: 'sentiment_lexicon', column: 'word', name: 'sentiment_lexicon_word_key' }
    ];

    let constraintsCreated = 0;
    
    for (const constraint of constraints) {
      try {
        // Vérifier si la contrainte existe déjà
        const exists = await pool.query(`
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = $1 AND table_name = $2
        `, [constraint.name, constraint.table]);

        if (exists.rows.length === 0) {
          // Vérifier que la table existe d'abord
          const tableExists = await pool.query(`
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = $1
          `, [constraint.table]);

          if (tableExists.rows.length > 0) {
            await pool.query(`
              ALTER TABLE ${constraint.table} 
              ADD CONSTRAINT ${constraint.name} 
              UNIQUE (${constraint.column})
            `);
            console.log(`✅ Contrainte ${constraint.name} créée`);
            constraintsCreated++;
          } else {
            console.log(`⚠️  Table ${constraint.table} n'existe pas encore`);
          }
        } else {
          console.log(`✅ Contrainte ${constraint.name} existe déjà`);
        }
      } catch (error) {
        console.error(`❌ Erreur contrainte ${constraint.name}:`, error.message);
      }
    }

    // Contrainte composite pour theme_analyses
    try {
      const compositeExists = await pool.query(`
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'theme_analyses_theme_id_article_id_key' 
        AND table_name = 'theme_analyses'
      `);

      if (compositeExists.rows.length === 0) {
        const tableExists = await pool.query(`
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'theme_analyses'
        `);

        if (tableExists.rows.length > 0) {
          await pool.query(`
            ALTER TABLE theme_analyses 
            ADD CONSTRAINT theme_analyses_theme_id_article_id_key 
            UNIQUE (theme_id, article_id)
          `);
          console.log('✅ Contrainte composite theme_analyses créée');
          constraintsCreated++;
        }
      } else {
        console.log('✅ Contrainte composite theme_analyses existe déjà');
      }
    } catch (error) {
      console.error('❌ Erreur contrainte composite:', error.message);
    }

    console.log(`🔧 ${constraintsCreated} contrainte(s) UNIQUE créée(s)`);
    return constraintsCreated > 0;
    
  } catch (error) {
    console.error('❌ Erreur création contraintes:', error.message);
    return false;
  }
}

// Initialiser la base de données
async function initializeDatabase() {
  try {
    console.log('🔄 Initialisation de la base de données...');
    
    const connectionOk = await testConnectionWithRetry();
    if (!connectionOk) {
      throw new Error('Impossible de se connecter à PostgreSQL après plusieurs tentatives');
    }

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
    console.log('✅ Table themes créée');

    // Table des flux RSS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feeds (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        last_fetched TIMESTAMP DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table feeds créée');

    // Table des articles
    await pool.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        link TEXT NOT NULL,
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
    console.log('✅ Table articles créée');

    // Table des analyses par thème
    await pool.query(`
      CREATE TABLE IF NOT EXISTS theme_analyses (
        id SERIAL PRIMARY KEY,
        theme_id INTEGER,
        article_id INTEGER,
        match_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table theme_analyses créée');

    // Table des analyses temporelles
    await pool.query(`
      CREATE TABLE IF NOT EXISTS timeline_analyses (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        theme_name TEXT NOT NULL,
        article_count INTEGER DEFAULT 0,
        avg_sentiment DECIMAL(3,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table timeline_analyses créée');

    // Table des corrections IA
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ia_corrections (
        id SERIAL PRIMARY KEY,
        article_id INTEGER,
        original_score DECIMAL(3,2),
        corrected_score DECIMAL(3,2),
        confidence DECIMAL(3,2),
        analysis_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table ia_corrections créée');

    // Table du lexique de sentiment
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sentiment_lexicon (
        id SERIAL PRIMARY KEY,
        word TEXT NOT NULL,
        score DECIMAL(3,2) NOT NULL,
        usage_count INTEGER DEFAULT 0,
        total_score DECIMAL(10,4) DEFAULT 0,
        consistency DECIMAL(4,3) DEFAULT 0.5,
        last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table sentiment_lexicon créée');

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
    console.log('✅ Table usage_stats créée');

    // 🔥 CRÉER LES CONTRAINTES UNIQUE APRÈS LES TABLES
    console.log('🔧 Création des contraintes UNIQUE...');
    await ensureUniqueConstraints();

    // Créer les index pour les performances
    console.log('📊 Création des index...');
    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_sentiment ON articles(sentiment_score)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(name)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url)');
      console.log('✅ Index créés');
    } catch (error) {
      console.error('❌ Erreur création index:', error.message);
    }

    console.log('🎉 Base de données complètement initialisée avec succès');
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

// Fonction utilitaire pour vérifier l'état de la base
async function checkDatabaseStatus() {
  try {
    const client = await pool.connect();
    
    // Compter les tables
    const tablesResult = await client.query(`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    // Vérifier les contraintes UNIQUE
    const constraintsResult = await client.query(`
      SELECT table_name, constraint_name 
      FROM information_schema.table_constraints 
      WHERE constraint_type = 'UNIQUE' 
      AND table_name IN ('themes', 'feeds', 'articles')
    `);
    
    client.release();
    
    return {
      connected: true,
      tables: parseInt(tablesResult.rows[0].table_count),
      uniqueConstraints: constraintsResult.rows.length,
      constraints: constraintsResult.rows
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

module.exports = {
  pool,
  initializeDatabase,
  testConnectionWithRetry,
  ensureUniqueConstraints,
  closeDatabase,
  checkDatabaseStatus
};
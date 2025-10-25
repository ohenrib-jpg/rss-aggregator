// db/init_database.js - Initialisation complète de la base de données
const { getDatabaseManager, query } = require('./database_manager');
const { migrateSchema, initializeDefaultThemes } = require('./migrate_schema');
const { config } = require('../config');
const fs = require('fs').promises;
const path = require('path');

class DatabaseInitializer {
  constructor() {
    this.initialized = false;
  }

  async initializeComplete() {
    if (this.initialized) {
      console.log('✅ Database already initialized');
      return true;
    }

    try {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 COMPLETE DATABASE INITIALIZATION');
      console.log('='.repeat(60));

      // 1. Initialiser la connexion
      console.log('🔗 Step 1: Connecting to database...');
      const db = await getDatabaseManager();
      
      // 2. Vérifier les tables principales
      console.log('📋 Step 2: Checking core tables...');
      await this.checkCoreTables();

      // 3. Migrer les tables bayésiennes
      console.log('🔄 Step 3: Migrating Bayesian tables...');
      await migrateSchema();

      // 4. Initialiser les thèmes par défaut
      console.log('🎨 Step 4: Initializing default themes...');
      await initializeDefaultThemes();

      // 5. Initialiser les flux par défaut
      console.log('📰 Step 5: Initializing default feeds...');
      await this.initializeDefaultFeeds();

      // 6. Vérifier l'intégrité
      console.log('🔍 Step 6: Verifying database integrity...');
        await this.verifyIntegrity();

      // 7. Migrer les colonnes de scoring si nécessaire
      console.log('📈 Step 7: Migrating score columns...');
        const { migrateAddScoreColumns } = require('./migrate_add_scores');
        await migrateAddScoreColumns();

      this.initialized = true;
      
      console.log('='.repeat(60));
      console.log('✅ DATABASE INITIALIZATION COMPLETED SUCCESSFULLY');
      console.log('='.repeat(60) + '\n');

      return true;

    } catch (error) {
      console.error('\n❌ DATABASE INITIALIZATION FAILED:', error);
      throw error;
    }
  }

  async checkCoreTables() {
    const coreTables = ['feeds', 'articles', 'themes', 'theme_analyses'];
    let missingTables = [];

    for (const table of coreTables) {
      try {
        let checkQuery;
        if (config.database.use === 'postgresql') {
          checkQuery = `
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = '${table}'
            );
          `;
        } else {
          checkQuery = `
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='${table}'
          `;
        }

        const result = await query(checkQuery);
        const exists = config.database.use === 'postgresql' 
          ? result.rows[0].exists 
          : result.rows.length > 0;

        if (!exists) {
          missingTables.push(table);
          console.warn(`⚠️  Missing table: ${table}`);
        } else {
          console.log(`✅ Table exists: ${table}`);
        }

      } catch (error) {
        console.warn(`⚠️  Error checking table ${table}:`, error.message);
        missingTables.push(table);
      }
    }

    if (missingTables.length > 0) {
      console.log('🔄 Recreating missing tables...');
      await this.recreateMissingTables(missingTables);
    }
  }

  async recreateMissingTables(missingTables) {
    const schemaPath = path.join(__dirname, 
      config.database.use === 'postgresql' ? 'schema_postgresql.sql' : 'schema_sqlite.sql'
    );

    const schema = await fs.readFile(schemaPath, 'utf8');
    const statements = schema.split(';').filter(s => s.trim().length > 0);

    for (const statement of statements) {
      const tableName = this.extractTableName(statement);
      if (tableName && missingTables.includes(tableName)) {
        try {
          await query(statement);
          console.log(`✅ Recreated table: ${tableName}`);
        } catch (error) {
          console.error(`❌ Failed to recreate ${tableName}:`, error.message);
        }
      }
    }
  }

  extractTableName(statement) {
    const match = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i);
    return match ? match[1] : null;
  }

  async initializeDefaultFeeds() {
    try {
      const feedsCount = await query('SELECT COUNT(*) as count FROM feeds');
      
      if (parseInt(feedsCount.rows[0].count) === 0) {
        console.log('📰 Adding default RSS feeds...');
        
        const configPath = path.join(__dirname, '..', 'config.json');
        const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
        
        const defaultFeeds = configData.feeds || [
          'https://www.lemonde.fr/international/rss_full.xml',
          'https://www.france24.com/fr/rss',
          'https://www.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/'
        ];

        let addedFeeds = 0;
        
        for (const feedUrl of defaultFeeds.slice(0, 10)) { // Limiter pour le premier démarrage
          try {
            await query(
              `INSERT INTO feeds (url, title, is_active) 
               VALUES (?, ?, ?)`,
              [feedUrl, new URL(feedUrl).hostname, true]
            );
            addedFeeds++;
            console.log(`✅ Feed added: ${new URL(feedUrl).hostname}`);
          } catch (e) {
            if (!e.message.includes('UNIQUE') && !e.message.includes('duplicate')) {
              console.warn(`⚠️ Error adding feed ${feedUrl}:`, e.message);
            }
          }
        }
        
        console.log(`✅ ${addedFeeds} default feeds initialized`);
      } else {
        console.log('✅ Feeds already exist in database');
      }
    } catch (error) {
      console.warn('⚠️ Feed initialization warning:', error.message);
    }
  }

  async verifyIntegrity() {
    try {
      console.log('🔍 Verifying database integrity...');
      
      // Vérifier le compte des tables
      const tables = ['feeds', 'articles', 'themes', 'theme_analyses', 'bayes_evidence', 'bayes_priors'];
      
      for (const table of tables) {
        try {
          const result = await query(`SELECT COUNT(*) as count FROM ${table}`);
          const count = parseInt(result.rows[0].count);
          console.log(`   📊 ${table}: ${count} records`);
        } catch (error) {
          console.warn(`   ⚠️  ${table}: Unable to count - ${error.message}`);
        }
      }

      // Vérifier les contraintes d'intégrité
      console.log('🔍 Checking foreign key constraints...');
      
      const integrityChecks = [
        { sql: `SELECT COUNT(*) as broken FROM articles a LEFT JOIN feeds f ON a.feed_url = f.url WHERE f.url IS NULL AND a.feed_url IS NOT NULL`, description: 'Articles with invalid feed references' },
        { sql: `SELECT COUNT(*) as broken FROM theme_analyses ta LEFT JOIN articles a ON ta.article_id = a.id WHERE a.id IS NULL`, description: 'Theme analyses with invalid article references' },
        { sql: `SELECT COUNT(*) as broken FROM theme_analyses ta LEFT JOIN themes t ON ta.theme_id = t.id WHERE t.id IS NULL`, description: 'Theme analyses with invalid theme references' }
      ];

      for (const check of integrityChecks) {
        try {
          const result = await query(check.sql);
          const broken = parseInt(result.rows[0].broken);
          if (broken > 0) {
            console.warn(`   ⚠️  ${check.description}: ${broken} broken references`);
          } else {
            console.log(`   ✅ ${check.description}: OK`);
          }
        } catch (error) {
          console.warn(`   ⚠️  ${check.description}: Check failed - ${error.message}`);
        }
      }

      console.log('✅ Database integrity verification completed');

    } catch (error) {
      console.warn('⚠️ Integrity verification warning:', error.message);
    }
  }

  async resetDatabase() {
    if (config.isRender) {
      console.error('❌ Cannot reset database in production (Render)');
      return false;
    }

    console.log('\n🔄 RESETTING DATABASE...');
    
    try {
      if (config.database.use === 'postgresql') {
        // PostgreSQL - Supprimer et recréer les tables
        const tables = ['bayes_evidence', 'bayes_priors', 'theme_analyses', 'articles', 'themes', 'feeds'];
        
        for (const table of tables) {
          try {
            await query(`DROP TABLE IF EXISTS ${table} CASCADE`);
            console.log(`✅ Dropped table: ${table}`);
          } catch (error) {
            console.warn(`⚠️ Error dropping ${table}:`, error.message);
          }
        }
      } else {
        // SQLite - Supprimer le fichier
        const dbPath = config.database.sqlite.filename;
        try {
          await fs.unlink(dbPath);
          console.log(`✅ Deleted SQLite database: ${dbPath}`);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn(`⚠️ Error deleting database:`, error.message);
          }
        }
      }

      // Réinitialiser le flag
      this.initialized = false;
      
      // Réinitialiser
      await this.initializeComplete();
      
      console.log('✅ Database reset completed');
      return true;

    } catch (error) {
      console.error('❌ Database reset failed:', error);
      return false;
    }
  }
}

// Singleton pattern
const databaseInitializer = new DatabaseInitializer();

// Export pour usage direct
module.exports = databaseInitializer;

// Fonction d'initialisation rapide
async function initializeDatabase() {
  return await databaseInitializer.initializeComplete();
}

// Fonction de reset (développement seulement)
async function resetDatabase() {
  return await databaseInitializer.resetDatabase();
}

module.exports = {
  initializeDatabase,
  resetDatabase,
  databaseInitializer
};
// db/database_manager.js - Gestionnaire de base de données dual (PostgreSQL/SQLite)

const { config } = require('../config');
const fs = require('fs').promises;
const path = require('path');

let dbInstance = null;

// ========== INTERFACE COMMUNE ==========
class DatabaseManager {
    async query(sql, params = []) {
        throw new Error('Method not implemented');
    }

    async connect() {
        throw new Error('Method not implemented');
    }

    async close() {
        throw new Error('Method not implemented');
    }

    async initialize() {
        throw new Error('Method not implemented');
    }
}

// ========== POSTGRESQL (CLOUD) ==========
class PostgreSQLManager extends DatabaseManager {
    constructor() {
        super();
        const { Pool } = require('pg');
        this.pool = new Pool(config.database.postgresql);

        this.pool.on('error', (err) => {
            console.error('❌ PostgreSQL pool error:', err);
        });

        this.pool.on('connect', () => {
            console.log('🔗 PostgreSQL connection established');
        });
    }

    async query(sql, params = []) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(sql, params);
            return result;
        } finally {
            client.release();
        }
    }

    async connect() {
        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            console.log('✅ PostgreSQL connected successfully');
            return true;
        } catch (error) {
            console.error('❌ PostgreSQL connection failed:', error.message);
            throw error;
        }
    }

    async close() {
        await this.pool.end();
        console.log('🔌 PostgreSQL connection closed');
    }

    async initialize() {
        console.log('📋 Initializing PostgreSQL schema...');

        const schemaPath = path.join(__dirname, 'schema_postgresql.sql');
        const schema = await fs.readFile(schemaPath, 'utf8');

        await this.query(schema);

        // Index
        const indexPath = path.join(__dirname, 'indexes.sql');
        try {
            const indexes = await fs.readFile(indexPath, 'utf8');
            await this.query(indexes);
        } catch (e) {
            console.warn('⚠️  No indexes file, skipping');
        }

        console.log('✅ PostgreSQL schema initialized');
    }
}

// ========== SQLITE (LOCAL) ==========
class SQLiteManager extends DatabaseManager {
    constructor() {
        super();
        const sqlite3 = require('sqlite3').verbose();
        const dbPath = config.database.sqlite.filename;

        // Créer le dossier data si nécessaire
        const dbDir = path.dirname(dbPath);
        fs.mkdir(dbDir, { recursive: true }).catch(() => { });

        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ SQLite connection error:', err);
            } else {
                console.log('✅ SQLite database opened:', dbPath);
            }
        });

        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON');
    }

    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            // Adapter la syntaxe PostgreSQL → SQLite
            sql = this._adaptSQLForSQLite(sql);

            if (sql.trim().toUpperCase().startsWith('SELECT')) {
                this.db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve({ rows });
                });
            } else {
                this.db.run(sql, params, function (err) {
                    if (err) reject(err);
                    else resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
                });
            }
        });
    }

    _adaptSQLForSQLite(sql) {
        // Adaptations basiques PostgreSQL → SQLite
        return sql
            .replace(/SERIAL/gi, 'INTEGER')
            .replace(/NOW\(\)/gi, "datetime('now')")
            .replace(/TIMESTAMP/gi, 'TEXT')
            .replace(/BOOLEAN/gi, 'INTEGER')
            .replace(/TEXT\[\]/gi, 'TEXT')
            .replace(/JSONB/gi, 'TEXT')
            .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
            .replace(/ON CONFLICT.*DO NOTHING/gi, 'ON CONFLICT DO NOTHING')
            .replace(/RETURNING \*/gi, '');
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT 1', (err) => {
                if (err) {
                    console.error('❌ SQLite connection test failed:', err);
                    reject(err);
                } else {
                    console.log('✅ SQLite connected successfully');
                    resolve(true);
                }
            });
        });
    }

    async close() {
        return new Promise((resolve) => {
            this.db.close((err) => {
                if (err) console.error('❌ SQLite close error:', err);
                else console.log('🔌 SQLite connection closed');
                resolve();
            });
        });
    }

    async createIndexes() {
        console.log('📊 Creating SQLite indexes...');

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_articles_pub_date_desc ON articles(pub_date DESC)',
            'CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link)',
            'CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url)',
            'CREATE INDEX IF NOT EXISTS idx_articles_feed_url ON articles(feed_url)',
            'CREATE INDEX IF NOT EXISTS idx_bayes_evidence_entity ON bayes_evidence(entity_type, entity_id)',
            'CREATE INDEX IF NOT EXISTS idx_bayes_evidence_processed ON bayes_evidence(processed)',
            'CREATE INDEX IF NOT EXISTS idx_bayes_priors_updated ON bayes_priors(updated_at)'
        ];

        for (const indexSQL of indexes) {
            try {
                await this.query(indexSQL);
            } catch (error) {
                if (!error.message.includes('already exists')) {
                    console.warn('⚠️ Index creation warning:', error.message);
                }
            }
        }

        console.log('✅ SQLite indexes created');
    }

    async initialize() {
        console.log('📋 Initializing SQLite schema...');

        const schemaPath = path.join(__dirname, 'schema_sqlite.sql');
        let schema = await fs.readFile(schemaPath, 'utf8');

        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            try {
                await this.query(statement);
            } catch (error) {
                if (!error.message.includes('already exists')) {
                    console.warn('⚠️ Schema statement warning:', error.message);
                }
            }
        }

        // Créer les index
        await this.createIndexes();
        console.log('✅ SQLite schema initialized');
    }
}

// ========== FACTORY ==========
async function getDatabaseManager() {
    if (dbInstance) return dbInstance;

    console.log(`🗄️  Initializing ${config.database.use.toUpperCase()} database...`);

    if (config.database.use === 'postgresql') {
        dbInstance = new PostgreSQLManager();
    } else {
        // Installer sqlite3 si nécessaire en mode local
        try {
            require('sqlite3');
        } catch (e) {
            console.error('❌ sqlite3 not installed. Run: npm install sqlite3');
            throw new Error('SQLite3 dependency missing');
        }
        dbInstance = new SQLiteManager();
    }

    await dbInstance.connect();
    await dbInstance.initialize();

    return dbInstance;
}

async function closeDatabaseConnection() {
    if (dbInstance) {
        await dbInstance.close();
        dbInstance = null;
    }
}

// ========== HELPERS ==========
async function query(sql, params = []) {
    const db = await getDatabaseManager();
    return await db.query(sql, params);
}

module.exports = {
    getDatabaseManager,
    closeDatabaseConnection,
    query
};
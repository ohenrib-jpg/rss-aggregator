// db/migrate_schema.js - Réparation des chemins d'import
const { getDatabaseManager, query } = require('./database_manager'); // ⬅️ Chemin corrigé
const { config } = require('../config');
const fs = require('fs').promises;
const path = require('path');

async function migrateSchema() {
    console.log('🔄 Starting schema migration...');

    try {
        const db = await getDatabaseManager();

        // Vérifier si les tables bayésiennes existent
        let checkQuery;
        if (config.database.use === 'postgresql') {
            checkQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name IN ('bayes_evidence', 'bayes_priors')
        AND table_schema = 'public'
      `;
        } else {
            checkQuery = `
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name IN ('bayes_evidence', 'bayes_priors')
      `;
        }

        const existingTables = await db.query(checkQuery);

        if (existingTables.rows.length < 2) {
            console.log('🚀 Creating Bayesian tables...');

            const schemaPath = path.join(__dirname,
                config.database.use === 'postgresql' ? 'schema_postgresql.sql' : 'schema_sqlite.sql'
            );

            const schema = await fs.readFile(schemaPath, 'utf8');
            const statements = schema.split(';').filter(s => s.trim().length > 0);

            for (const statement of statements) {
                if (statement.includes('bayes_')) {
                    try {
                        await db.query(statement);
                        console.log(`✅ Created: ${statement.split(' ')[2]}`);
                    } catch (error) {
                        if (!error.message.includes('already exists') &&
                            !error.message.includes('duplicate')) {
                            console.warn('⚠️ Table creation warning:', error.message);
                        }
                    }
                }
            }

            console.log('✅ Bayesian tables migration completed');
        } else {
            console.log('✅ Bayesian tables already exist');
        }

        return true;

    } catch (error) {
        console.error('❌ Schema migration failed:', error);
        return false;
    }
}

async function initializeDefaultThemes() {
    try {
        const themesCount = await query('SELECT COUNT(*) as count FROM themes');

        if (parseInt(themesCount.rows[0].count) === 0) {
            console.log('📋 Initializing default themes from JSON...');

            const themesPath = path.join(__dirname, '..', 'themes.json');
            const themesData = JSON.parse(await fs.readFile(themesPath, 'utf8'));

            for (const theme of themesData.themes) {
                try {
                    await query(
                        `INSERT INTO themes (id, name, keywords, color, description) 
             VALUES (?, ?, ?, ?, ?)`,
                        [
                            theme.id,
                            theme.name,
                            JSON.stringify(theme.keywords),
                            theme.color,
                            theme.description
                        ]
                    );
                    console.log(`✅ Theme added: ${theme.name}`);
                } catch (e) {
                    if (!e.message.includes('UNIQUE') && !e.message.includes('duplicate')) {
                        console.warn(`⚠️ Error adding theme ${theme.name}:`, e.message);
                    }
                }
            }

            console.log('✅ Default themes initialized');
        }
    } catch (error) {
        console.warn('⚠️ Theme initialization warning:', error.message);
    }
}

module.exports = {
    migrateSchema,
    initializeDefaultThemes
};
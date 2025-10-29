// reset-database.js - VERSION CORRIGÉE
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'rss_aggregator.db');
const db = new sqlite3.Database(dbPath);

async function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (params.length > 0) {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        } else {
            db.run(sql, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        }
    });
}

async function resetDatabase() {
    try {
        console.log('🗑️  SUPPRESSION des anciennes tables...');
        
        const tables = ['theme_analyses', 'articles', 'themes', 'feeds'];
        
        for (const table of tables) {
            try {
                await runQuery(`DROP TABLE IF EXISTS ${table}`);
                console.log(`✅ Table ${table} supprimée`);
            } catch (e) {
                console.log(`⚠️  ${table}: ${e.message}`);
            }
        }

        console.log('\n🏗️  CRÉATION des nouvelles tables...');

        // Table themes
        await runQuery(`
            CREATE TABLE themes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                keywords TEXT NOT NULL,
                color TEXT DEFAULT '#6366f1',
                description TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table themes créée');

        // Table feeds
        await runQuery(`
            CREATE TABLE feeds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                title TEXT,
                is_active BOOLEAN DEFAULT 1,
                last_fetched DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table feeds créée');

        // Table articles
        await runQuery(`
            CREATE TABLE articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT,
                link TEXT,
                pub_date DATETIME,
                feed_url TEXT,
                sentiment_score REAL DEFAULT 0,
                sentiment_type TEXT DEFAULT 'neutral',
                sentiment_confidence REAL DEFAULT 0,
                confidence_score REAL DEFAULT 0.5,
                importance_score REAL DEFAULT 0.5,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table articles créée');

        // Table theme_analyses
        await runQuery(`
            CREATE TABLE theme_analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                article_id INTEGER,
                theme_id INTEGER,
                confidence REAL DEFAULT 0.5,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
                FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Table theme_analyses créée');

        console.log('\n📝 Insertion des thèmes par défaut...');

        // Thèmes par défaut - CORRIGÉ
        const defaultThemes = [
            {
                name: 'Politique',
                keywords: '["président", "gouvernement", "élection", "politique", "ministre", "parlement", "vote"]',
                color: '#3b82f6',
                description: 'Actualités politiques'
            },
            {
                name: 'Économie',
                keywords: '["économie", "inflation", "croissance", "marché", "entreprise", "finance", "investissement"]',
                color: '#10b981',
                description: 'Actualités économiques'
            },
            {
                name: 'International',
                keywords: '["international", "monde", "europe", "usa", "chine", "relations", "diplomatie", "sommet"]',
                color: '#f59e0b',
                description: 'Actualités internationales'
            },
            {
                name: 'Conflits',
                keywords: '["guerre", "conflit", "ukraine", "gaza", "paix", "négociation", "crise", "tension"]',
                color: '#ef4444',
                description: 'Zones de conflits'
            }
        ];

        for (const theme of defaultThemes) {
            await runQuery(
                'INSERT INTO themes (name, keywords, color, description) VALUES (?, ?, ?, ?)',
                [theme.name, theme.keywords, theme.color, theme.description]
            );
            console.log(`✅ Thème "${theme.name}" inséré`);
        }

        // Flux RSS par défaut
        console.log('\n📡 Insertion des flux RSS par défaut...');
        const defaultFeeds = [
            'https://www.lemonde.fr/international/rss_full.xml',
            'https://www.france24.com/fr/rss',
            'https://www.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/'
        ];

        for (const url of defaultFeeds) {
            const hostname = new URL(url).hostname;
            await runQuery(
                'INSERT INTO feeds (url, title, is_active) VALUES (?, ?, 1)',
                [url, hostname]
            );
            console.log(`✅ Flux ${hostname} inséré`);
        }

        // VÉRIFICATION FINALE
        console.log('\n🔍 Vérification finale...');
        const themesCheck = await new Promise((resolve) => {
            db.all('SELECT id, name FROM themes ORDER BY id', (err, rows) => {
                if (err) resolve([]);
                else resolve(rows);
            });
        });

        console.log('📋 Thèmes dans la base:');
        themesCheck.forEach(theme => {
            console.log(`   - ID: ${theme.id}, Nom: ${theme.name}`);
        });

        console.log('\n🎉 BASE DE DONNÉES RECRÉÉE AVEC SUCCÈS!');
        console.log('✅ ' + themesCheck.length + ' thèmes créés avec IDs valides');

    } catch (error) {
        console.error('❌ ERREUR:', error);
    } finally {
        db.close(() => {
            console.log('🔒 Base de données fermée');
        });
    }
}

// Exécution simple sans async/await complexe
resetDatabase();
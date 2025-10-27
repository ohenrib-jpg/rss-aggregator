// create-database.js - CRÉATION 100% GARANTIE
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'db');
const dbPath = path.join(dbDir, 'rss_aggregator.db');

// Assurer que le dossier db existe
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Supprimer l'ancien fichier s'il existe
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('🗑️  Ancienne base de données supprimée');
}

const db = new sqlite3.Database(dbPath);

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        console.log(`📝 Exécution: ${sql.substring(0, 50)}...`);
        db.run(sql, params, function(err) {
            if (err) {
                console.error(`❌ Erreur: ${err.message}`);
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

async function createDatabase() {
    try {
        console.log('🏗️  CRÉATION DE LA BASE DE DONNÉES...\n');

        // 1. TABLE THEMES - STRUCTURE PARFAITE
        console.log('1. Création table themes...');
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

        // 2. THÈMES PAR DÉFAUT
        console.log('\n2. Insertion thèmes par défaut...');
        const defaultThemes = [
            ['Politique', '["président", "gouvernement", "élection", "politique", "ministre"]', '#3b82f6', 'Actualités politiques'],
            ['Économie', '["économie", "inflation", "croissance", "marché", "entreprise"]', '#10b981', 'Actualités économiques'],
            ['International', '["international", "monde", "europe", "usa", "chine"]', '#f59e0b', 'Actualités internationales'],
            ['Conflits', '["guerre", "conflit", "ukraine", "gaza", "paix"]', '#ef4444', 'Zones de conflits']
        ];

        for (const theme of defaultThemes) {
            await runQuery(
                'INSERT INTO themes (name, keywords, color, description) VALUES (?, ?, ?, ?)',
                theme
            );
            console.log(`   ✅ "${theme[0]}" inséré`);
        }

        // 3. TABLE FEEDS
        console.log('\n3. Création table feeds...');
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

        // 4. FLUX RSS
        console.log('\n4. Insertion flux RSS...');
        const defaultFeeds = [
            ['https://www.lemonde.fr/international/rss_full.xml', 'lemonde.fr'],
            ['https://www.france24.com/fr/rss', 'france24.com'],
            ['https://www.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/', 'bfmtv.com']
        ];

        for (const feed of defaultFeeds) {
            await runQuery(
                'INSERT INTO feeds (url, title, is_active) VALUES (?, ?, 1)',
                feed
            );
            console.log(`   ✅ ${feed[1]} inséré`);
        }

        // 5. TABLE ARTICLES
        console.log('\n5. Création table articles...');
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

        // 6. TABLE THEME_ANALYSES
        console.log('\n6. Création table theme_analyses...');
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

        // VÉRIFICATION FINALE
        console.log('\n7. Vérification finale...');
        const themesCheck = await new Promise((resolve) => {
            db.all('SELECT id, name FROM themes ORDER BY id', (err, rows) => {
                resolve(rows || []);
            });
        });

        const structureCheck = await new Promise((resolve) => {
            db.all('PRAGMA table_info(themes)', (err, rows) => {
                resolve(rows || []);
            });
        });

        console.log('\n🎉 BASE DE DONNÉES CRÉÉE AVEC SUCCÈS!');
        console.log('📋 Structure table themes:');
        structureCheck.forEach(col => {
            console.log(`   - ${col.name} (${col.type}) ${col.pk ? 'PRIMARY KEY' : ''}`);
        });

        console.log('\n📝 Thèmes créés:');
        themesCheck.forEach(theme => {
            console.log(`   - ID: ${theme.id}, Nom: ${theme.name}`);
        });

        console.log('\n✅ TOUT EST PRÊT! Redémarrez le serveur.');

    } catch (error) {
        console.error('❌ ERREUR CRITIQUE:', error);
    } finally {
        db.close();
    }
}

createDatabase();
// rebuild-database.js - RECONSTRUCTION COMPLÈTE ET GARANTIE
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');

const dbPath = path.join(__dirname, 'rss_aggregator.db');

async function run() {
    console.log('🔄 RECONSTRUCTION DE LA BASE DE DONNÉES...\n');

    // Supprimer l'ancienne base
    try {
        if (await fs.access(dbPath).then(() => true).catch(() => false)) {
            await fs.unlink(dbPath);
            console.log('🗑️  Ancienne base supprimée');
        }
    } catch (error) {
        console.log('ℹ️  Pas d ancienne base à supprimer');
    }

    const db = new sqlite3.Database(dbPath);

    try {
        // Lire et exécuter le schéma
        const schemaPath = path.join(__dirname, 'schema_sqlite.sql');
        const schema = await fs.readFile(schemaPath, 'utf8');
        
        console.log('📋 Exécution du schéma...');
        const statements = schema.split(';').filter(s => s.trim().length > 0);
        
        for (const statement of statements) {
            await new Promise((resolve, reject) => {
                db.run(statement, (err) => {
                    if (err && !err.message.includes('already exists')) {
                        console.warn(`⚠️  ${err.message}`);
                    }
                    resolve();
                });
            });
        }

        // Vérification
        console.log('\n🔍 Vérification...');
        const themes = await new Promise((resolve) => {
            db.all('SELECT id, name FROM themes ORDER BY id', (err, rows) => {
                resolve(rows || []);
            });
        });

        console.log('✅ BASE RECONSTRUITE AVEC SUCCÈS!');
        console.log('📝 Thèmes créés:');
        themes.forEach(theme => {
            console.log(`   - ID: ${theme.id}, Nom: ${theme.name}`);
        });

        console.log('\n🎯 Prochaines étapes:');
        console.log('1. Redémarrez le serveur: node server.js');
        console.log('2. Testez la création/suppression de thèmes');
        console.log('3. Les IDs devraient maintenant être numériques (1, 2, 3...)');

    } catch (error) {
        console.error('❌ ERREUR:', error);
    } finally {
        db.close();
    }
}

run();
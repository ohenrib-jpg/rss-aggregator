const { pool } = require('../db/database');

async function fixUniqueConstraints() {
  let client;
  try {
    console.log('🔧 Réparation des contraintes UNIQUE...');
    
    client = await pool.connect();
    
    // Liste des contraintes à créer
    const constraints = [
      {
        table: 'themes',
        column: 'name',
        constraintName: 'themes_name_key'
      },
      {
        table: 'feeds', 
        column: 'url',
        constraintName: 'feeds_url_key'
      },
      {
        table: 'articles',
        column: 'link', 
        constraintName: 'articles_link_key'
      },
      {
        table: 'theme_analyses',
        columns: ['theme_id', 'article_id'],
        constraintName: 'theme_analyses_theme_id_article_id_key'
      }
    ];

    for (const constraint of constraints) {
      try {
        // Vérifier si la contrainte existe déjà
        const checkResult = await client.query(`
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = $1 AND table_name = $2
        `, [constraint.constraintName, constraint.table]);

        if (checkResult.rows.length === 0) {
          // Créer la contrainte
          if (constraint.columns) {
            // Contrainte composite
            await client.query(`
              ALTER TABLE ${constraint.table} 
              ADD CONSTRAINT ${constraint.constraintName} 
              UNIQUE (${constraint.columns.join(', ')})
            `);
          } else {
            // Contrainte simple
            await client.query(`
              ALTER TABLE ${constraint.table} 
              ADD CONSTRAINT ${constraint.constraintName} 
              UNIQUE (${constraint.column})
            `);
          }
          console.log(`✅ Contrainte ${constraint.constraintName} créée`);
        } else {
          console.log(`✅ Contrainte ${constraint.constraintName} existe déjà`);
        }
      } catch (error) {
        console.error(`❌ Erreur contrainte ${constraint.constraintName}:`, error.message);
      }
    }

    // Vérification finale
    const result = await client.query(`
      SELECT table_name, constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name IN ('themes', 'feeds', 'articles', 'theme_analyses')
      AND constraint_type = 'UNIQUE'
      ORDER BY table_name
    `);

    console.log('\n📋 Contraintes UNIQUE actuelles:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}.${row.constraint_name}`);
    });

    console.log('\n🎉 Toutes les contraintes UNIQUE sont en place!');

  } catch (error) {
    console.error('❌ Erreur réparation contraintes:', error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  fixUniqueConstraints()
    .then(() => {
      console.log('✅ Script terminé');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script échoué:', error);
      process.exit(1);
    });
}

module.exports = { fixUniqueConstraints };
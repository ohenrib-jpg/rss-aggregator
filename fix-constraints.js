const { pool } = require('../db/database');

async function fixConstraints() {
  try {
    console.log('🔧 Réparation des contraintes UNIQUE...');
    
    // Ajouter les contraintes UNIQUE manquantes
    await pool.query(`
      DO $$ 
      BEGIN
        -- Themes: contrainte UNIQUE sur name
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'themes_name_key' AND table_name = 'themes'
        ) THEN
          ALTER TABLE themes ADD CONSTRAINT themes_name_key UNIQUE (name);
        END IF;
        
        -- Feeds: contrainte UNIQUE sur url  
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'feeds_url_key' AND table_name = 'feeds'
        ) THEN
          ALTER TABLE feeds ADD CONSTRAINT feeds_url_key UNIQUE (url);
        END IF;
        
        -- Articles: contrainte UNIQUE sur link
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'articles_link_key' AND table_name = 'articles'
        ) THEN
          ALTER TABLE articles ADD CONSTRAINT articles_link_key UNIQUE (link);
        END IF;
        
        -- Sentiment lexicon: contrainte UNIQUE sur word
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'sentiment_lexicon_word_key' AND table_name = 'sentiment_lexicon'
        ) THEN
          ALTER TABLE sentiment_lexicon ADD CONSTRAINT sentiment_lexicon_word_key UNIQUE (word);
        END IF;
      END $$;
    `);
    
    console.log('✅ Contraintes UNIQUE réparées');
    
    // Vérifier les contraintes
    const constraints = await pool.query(`
      SELECT table_name, constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name IN ('themes', 'feeds', 'articles', 'sentiment_lexicon')
      AND constraint_type = 'UNIQUE'
    `);
    
    console.log('📋 Contraintes UNIQUE actuelles:');
    constraints.rows.forEach(constraint => {
      console.log(`   - ${constraint.table_name}.${constraint.constraint_name}`);
    });
    
  } catch (error) {
    console.error('❌ Erreur réparation contraintes:', error);
    throw error;
  }
}

if (require.main === module) {
  fixConstraints()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { fixConstraints };
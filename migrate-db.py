# migrate-db.py
import sqlite3
import os

def migrate_database():
    """Migre la base de données vers la structure compatible Flask"""
    db_path = './data/rss_aggregator.db'
    
    print("🔄 Migration de la base de données...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Créer la table analyses si elle n'existe pas
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            source TEXT,
            date TIMESTAMP,
            summary TEXT,
            confidence REAL,
            corroboration_count INTEGER,
            corroboration_strength REAL,
            bayesian_posterior REAL,
            raw TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 2. Copier les données des articles vers analyses
    cursor.execute("""
        INSERT OR IGNORE INTO analyses (title, source, date, summary, confidence, raw)
        SELECT 
            title,
            feed_url as source,
            pub_date as date,
            content as summary,
            sentiment_confidence as confidence,
            json_object(
                'id', id,
                'title', title,
                'link', link,
                'content', content,
                'pub_date', pub_date,
                'feed_url', feed_url,
                'sentiment', json_object(
                    'score', sentiment_score,
                    'sentiment', sentiment_type,
                    'confidence', sentiment_confidence
                ),
                'themes', (
                    SELECT json_group_array(t.name)
                    FROM theme_analyses ta
                    JOIN themes t ON ta.theme_id = t.id
                    WHERE ta.article_id = articles.id
                )
            ) as raw
        FROM articles
        WHERE id NOT IN (SELECT id FROM analyses)
    """)
    
    # 3. Vérifier les données migrées
    cursor.execute("SELECT COUNT(*) FROM analyses")
    analyses_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM articles")
    articles_count = cursor.fetchone()[0]
    
    print(f"✅ Migration terminée:")
    print(f"   📰 Articles: {articles_count}")
    print(f"   🔬 Analyses: {analyses_count}")
    print(f"   📊 Données synchronisées")
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    migrate_database()
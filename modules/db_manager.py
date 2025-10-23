# modules/db_manager.py
import os
import logging
import sqlite3
from typing import List, Dict, Any

logger = logging.getLogger("rss-aggregator")

def get_database_url():
    """Retourne le chemin SQLite"""
    sqlite_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'rss_aggregator.db')
    os.makedirs(os.path.dirname(sqlite_path), exist_ok=True)
    logger.info(f"🔗 Utilisation SQLite: {sqlite_path}")
    return sqlite_path

def get_connection():
    """Retourne une connexion SQLite"""
    db_path = get_database_url()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def put_connection(conn):
    """Libère une connexion"""
    if conn:
        conn.close()

def init_db():
    """Initialise les tables Flask si nécessaire"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Vérifier/créer la table analyses
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
        
        # Créer un index pour les performances
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_analyses_date ON analyses(date)")
        
        conn.commit()
        cursor.close()
        logger.info("✅ Base Flask initialisée")
        
    except Exception as e:
        logger.error(f"❌ Erreur initialisation DB Flask: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            put_connection(conn)

def sync_with_node_data():
    """Synchronise les données avec la structure Node.js"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Vérifier si la table articles existe (structure Node.js)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='articles'")
        if cursor.fetchone():
            # Synchroniser les données
            cursor.execute("""
                INSERT OR IGNORE INTO analyses (title, source, date, summary, confidence, raw)
                SELECT 
                    title,
                    feed_url as source,
                    pub_date as date,
                    content as summary,
                    COALESCE(sentiment_confidence, 0.5) as confidence,
                    json_object(
                        'id', id,
                        'title', title, 
                        'link', link,
                        'content', content,
                        'pub_date', pub_date,
                        'feed_url', feed_url,
                        'sentiment', json_object(
                            'score', COALESCE(sentiment_score, 0),
                            'sentiment', COALESCE(sentiment_type, 'neutral'),
                            'confidence', COALESCE(sentiment_confidence, 0.5)
                        ),
                        'themes', (
                            SELECT json_group_array(t.name)
                            FROM theme_analyses ta
                            JOIN themes t ON ta.theme_id = t.id
                            WHERE ta.article_id = articles.id
                        )
                    ) as raw
                FROM articles
                WHERE id NOT IN (SELECT id FROM analyses WHERE id IS NOT NULL)
            """)
            
            count = cursor.rowcount
            if count > 0:
                logger.info(f"🔄 {count} articles synchronisés depuis Node.js")
            
        conn.commit()
        cursor.close()
        
    except Exception as e:
        logger.error(f"❌ Erreur synchronisation: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            put_connection(conn)
# modules/db_manager.py
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool
import logging

logger = logging.getLogger("rss-aggregator")
_POOL = None

def get_database_url():
    """Récupère l'URL depuis les variables d'environnement ou utilise l'URL Render"""
    # Priorité à la variable d'environnement
    db_url = os.getenv("DATABASE_URL")
    
    if not db_url:
        # URL Render complète avec port
        db_url = "postgresql://rssaggregator_postgresql_olivier_user:jexuBogPqTuplOcud708PuSuIVWBWwi0@dpg-d3nnodm3jp1c73c3302g-a:5432/rssaggregator_postgresql_olivier"
    
    if not db_url:
        raise RuntimeError("DATABASE_URL non configurée")
    
    # S'assurer que l'URL a le format correct
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    
    logger.info(f"🔗 Utilisation URL DB: {db_url.split('@')[0]}@***")
    return db_url

def init_pool(minconn=1, maxconn=5):
    global _POOL
    if _POOL is not None:
        return _POOL
    
    db_url = get_database_url()
    
    # Configuration optimisée pour Render
    pool_config = {
        'dsn': db_url,
        'cursor_factory': RealDictCursor,
        'minconn': minconn,
        'maxconn': maxconn,
        'sslmode': 'require'
    }
    
    try:
        _POOL = psycopg2.pool.SimpleConnectionPool(**pool_config)
        logger.info("✅ Pool de connexions PostgreSQL créé")
        return _POOL
    except Exception as e:
        logger.error(f"❌ Erreur création pool: {e}")
        raise

def get_connection():
    if _POOL is None:
        init_pool()
    
    try:
        conn = _POOL.getconn()
        return conn
    except Exception as e:
        logger.error(f"❌ Erreur obtention connexion: {e}")
        raise

def put_connection(conn):
    if _POOL and conn:
        try:
            _POOL.putconn(conn)
        except Exception as e:
            logger.error(f"❌ Erreur libération connexion: {e}")

def init_db():
    """Initialise la structure de la base si nécessaire"""
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        # Vérifier si la table analyses existe déjà
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'analyses'
            )
        """)
        table_exists = cur.fetchone()['exists']
        
        if not table_exists:
            logger.info("🔄 Création de la table analyses...")
            cur.execute("""
                CREATE TABLE analyses (
                    id SERIAL PRIMARY KEY,
                    title TEXT,
                    source TEXT,
                    date TIMESTAMP,
                    summary TEXT,
                    confidence DOUBLE PRECISION,
                    corroboration_count INT,
                    corroboration_strength DOUBLE PRECISION,
                    bayesian_posterior DOUBLE PRECISION,
                    raw JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)
            conn.commit()
            logger.info("✅ Table analyses créée")
        else:
            logger.info("✅ Table analyses existe déjà")
        
        cur.close()
        finally:
            try:
                if cur:
                    cur.close()
            except Exception:
                pass
            if conn:
                put_connection(conn)

        
    except Exception as e:
        logger.error(f"❌ Erreur initialisation DB: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            put_connection(conn)
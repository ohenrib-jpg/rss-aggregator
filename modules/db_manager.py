import os
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool

_POOL = None

def get_database_url():
    # Récupère l’URL définie dans les variables d’environnement
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL non défini — ajoute-le dans les variables Render.")
    return db_url

def init_pool(minconn=1, maxconn=5):
    global _POOL
    if _POOL is not None:
        return _POOL
    db_url = get_database_url()
    _POOL = psycopg2.pool.SimpleConnectionPool(minconn, maxconn,
                                               dsn=db_url,
                                               cursor_factory=RealDictCursor)
    return _POOL

def get_connection():
    if _POOL is None:
        init_pool()
    return _POOL.getconn()

def put_connection(conn):
    if _POOL and conn:
        _POOL.putconn(conn)

def init_db():
    """Crée la table d’analyses si elle n’existe pas."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
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
        );
    """)
    conn.commit()
    cur.close()
    put_connection(conn)

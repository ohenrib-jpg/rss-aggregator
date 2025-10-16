import os
import psycopg2
from psycopg2.extras import RealDictCursor

# Connexion unique (pool minimale)
def get_connection():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL non défini dans les variables d’environnement.")

    # Render fournit déjà une URL complète de la forme :
    # postgresql://user:password@host:port/dbname
    conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    return conn


def init_db():
    """Crée les tables principales si elles n’existent pas."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
            id SERIAL PRIMARY KEY,
            title TEXT,
            source TEXT,
            date TIMESTAMP,
            summary TEXT,
            confidence FLOAT,
            corroboration_count INT,
            corroboration_strength FLOAT,
            bayesian_posterior FLOAT,
            raw JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    conn.commit()
    cur.close()
    conn.close()

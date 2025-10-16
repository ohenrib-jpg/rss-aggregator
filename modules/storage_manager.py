import json
import datetime
from typing import List, Dict, Any
from modules.db_manager import get_connection, init_db

# Appelé une seule fois au lancement de l’appli
init_db()


def save_analysis_batch(batch: List[Dict[str, Any]]) -> None:
    """
    Sauvegarde une liste d'analyses dans la base PostgreSQL.
    Chaque élément du batch est un dictionnaire contenant les clés principales.
    """
    if not batch:
        return

    conn = get_connection()
    cur = conn.cursor()

    for analysis in batch:
        cur.execute("""
            INSERT INTO analyses
            (title, source, date, summary, confidence,
             corroboration_count, corroboration_strength, bayesian_posterior, raw)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            analysis.get("title"),
            analysis.get("source"),
            analysis.get("date", datetime.datetime.utcnow()),
            analysis.get("summary"),
            float(analysis.get("confidence", 0)),
            int(analysis.get("corroboration_count", 0)),
            float(analysis.get("corroboration_strength", 0)),
            float(analysis.get("bayesian_posterior", 0)),
            json.dumps(analysis, ensure_ascii=False)
        ))

    conn.commit()
    cur.close()
    conn.close()


def load_recent_analyses(days: int = 7) -> list[dict]:
    """
    Charge les analyses effectuées dans les X derniers jours.
    Retourne une liste de dictionnaires.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM analyses
        WHERE date > NOW() - INTERVAL '%s days'
        ORDER BY date DESC
    """, (days,))
    results = cur.fetchall()
    cur.close()
    conn.close()
    return results


def summarize_analyses() -> dict:
    """
    Calcule des métriques agrégées globales.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            COUNT(*) AS total_articles,
            AVG(confidence) AS avg_confidence,
            AVG(bayesian_posterior) AS avg_posterior,
            AVG(corroboration_strength) AS avg_corroboration
        FROM analyses;
    """)
    summary = cur.fetchone()
    cur.close()
    conn.close()
    return summary or {}

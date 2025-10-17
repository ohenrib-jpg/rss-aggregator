# rss_aggregator/modules/storage_manager.py
import os
import json
import datetime
from typing import List, Dict, Any
from modules.db_manager import init_db, get_connection, put_connection, get_database_url

# Initialisation DB (si présente)
init_db()
_DB_URL = get_database_url()
_USE_SQL = bool(_DB_URL)

def save_analysis_batch(batch: List[Dict[str, Any]]) -> None:
    """
    Sauvegarde une liste d'analyses dans la base PostgreSQL si configurée,
    sinon écrit dans data/analyses/*.json.gz en fallback local (dev).
    """
    if not batch:
        return

    if _USE_SQL:
        conn = None
        try:
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
                    float(analysis.get("confidence", 0.0)),
                    int(analysis.get("corroboration_count", 0)),
                    float(analysis.get("corroboration_strength", 0.0)),
                    float(analysis.get("bayesian_posterior", 0.0)),
                    json.dumps(analysis, ensure_ascii=False)
                ))
            conn.commit()
            cur.close()
        finally:
            if conn:
                put_connection(conn)
        return

    # Fallback local (dev only)
    data_dir = os.path.join(os.path.dirname(__file__), "..", "data", "analyses")
    os.makedirs(data_dir, exist_ok=True)
    date = datetime.datetime.utcnow().strftime("%Y-%m-%d_%H%M%S")
    path = os.path.join(data_dir, f"batch_{date}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(batch, fh, ensure_ascii=False, indent=2)


def load_recent_analyses(days: int = 7) -> List[Dict[str, Any]]:
    """
    Charge les analyses depuis PostgreSQL (si configurée) ou fallback local.
    Retourne une liste de dict (avec champs normalisés).
    """
    if _USE_SQL:
        conn = None
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT id, title, source, date, summary, confidence,
                       corroboration_count, corroboration_strength, bayesian_posterior, raw, created_at
                FROM analyses
                WHERE date > NOW() - INTERVAL '%s days'
                ORDER BY date DESC
                LIMIT 1000
            """, (days,))
            rows = cur.fetchall()
            cur.close()
            # rows are RealDictRow via RealDictCursor
            return [dict(r) for r in rows]
        finally:
            if conn:
                put_connection(conn)

    # Fallback: read last few local files (dev only)
    data_dir = os.path.join(os.path.dirname(__file__), "..", "data", "analyses")
    results = []
    if not os.path.isdir(data_dir):
        return results
    files = sorted([os.path.join(data_dir, f) for f in os.listdir(data_dir)], reverse=True)
    for fpath in files[:10]:
        try:
            with open(fpath, "r", encoding="utf-8") as fh:
                batch = json.load(fh)
                for item in batch:
                    results.append(item)
        except Exception:
            continue
    return results


def summarize_analyses() -> Dict[str, Any]:
    """
    Résumé global (SQL si possible).
    """
    if _USE_SQL:
        conn = None
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT
                    COUNT(*)::int AS total_articles,
                    AVG(confidence)::float AS avg_confidence,
                    AVG(bayesian_posterior)::float AS avg_posterior,
                    AVG(corroboration_strength)::float AS avg_corroboration
                FROM analyses;
            """)
            row = cur.fetchone()
            cur.close()
            return dict(row) if row else {}
        finally:
            if conn:
                put_connection(conn)
    # Fallback compute from local files (dev)
    articles = load_recent_analyses(days=30)
    if not articles:
        return {}
    confidences = [a.get("confidence", 0) for a in articles if a.get("confidence") is not None]
    post = [a.get("bayesian_posterior", 0) for a in articles if a.get("bayesian_posterior") is not None]
    cor = [a.get("corroboration_strength", 0) for a in articles if a.get("corroboration_strength") is not None]
    import statistics
    return {
        "total_articles": len(articles),
        "avg_confidence": statistics.mean(confidences) if confidences else None,
        "avg_posterior": statistics.mean(post) if post else None,
        "avg_corroboration": statistics.mean(cor) if cor else None
    }
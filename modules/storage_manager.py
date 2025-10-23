# modules/storage_manager.py
import os
import json
import datetime
from typing import List, Dict, Any
from modules.db_manager import get_connection, put_connection, sync_with_node_data

def _rows_to_dicts(cur):
    """Convertit les rows SQLite en dicts"""
    rows = cur.fetchall()
    cols = [col[0] for col in cur.description]
    return [dict(zip(cols, [row[i] for i in range(len(cols))])) for row in rows]

def save_analysis_batch(batch: List[Dict[str, Any]]) -> None:
    """Sauvegarde une liste d'analyses"""
    if not batch:
        return

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        for analysis in batch:
            cur.execute("""
                INSERT OR REPLACE INTO analyses
                (id, title, source, date, summary, confidence,
                 corroboration_count, corroboration_strength, bayesian_posterior, raw)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                analysis.get("id"),
                analysis.get("title"),
                analysis.get("source"),
                analysis.get("date", datetime.datetime.utcnow()),
                analysis.get("summary"),
                float(analysis.get("confidence", 0.5)),
                int(analysis.get("corroboration_count", 0)),
                float(analysis.get("corroboration_strength", 0.0)),
                float(analysis.get("bayesian_posterior", 0.5)),
                json.dumps(analysis, ensure_ascii=False, default=str) if analysis else '{}'
            ))
        
        conn.commit()
        cur.close()
        
    except Exception as e:
        print(f"❌ Erreur sauvegarde analyses: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            put_connection(conn)

def load_recent_analyses(days: int = 7) -> List[Dict[str, Any]]:
    """Charge les analyses récentes"""
    # Synchroniser d'abord avec les données Node.js
    sync_with_node_data()
    
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, title, source, date, summary, confidence,
                   corroboration_count, corroboration_strength, bayesian_posterior, raw
            FROM analyses
            WHERE date > datetime('now', ?)
            ORDER BY date DESC
            LIMIT 1000
        """, (f'-{days} days',))
        
        rows = _rows_to_dicts(cur)
        cur.close()
        
        # Parser le JSON raw
        for row in rows:
            if row.get('raw'):
                try:
                    row['raw'] = json.loads(row['raw'])
                except:
                    row['raw'] = {}
        
        return rows
        
    except Exception as e:
        print(f"❌ Erreur chargement analyses: {e}")
        return []
    finally:
        if conn:
            put_connection(conn)

def summarize_analyses() -> Dict[str, Any]:
    """Résumé global"""
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT
                COUNT(*) as total_articles,
                AVG(confidence) as avg_confidence,
                AVG(bayesian_posterior) as avg_posterior,
                AVG(corroboration_strength) as avg_corroboration
            FROM analyses
        """)
        
        row = cur.fetchone()
        cur.close()
        
        if row:
            return {
                "total_articles": row[0] or 0,
                "avg_confidence": float(row[1] or 0.5),
                "avg_posterior": float(row[2] or 0.5),
                "avg_corroboration": float(row[3] or 0)
            }
        return {}
        
    except Exception as e:
        print(f"❌ Erreur résumé analyses: {e}")
        return {}
    finally:
        if conn:
            put_connection(conn)
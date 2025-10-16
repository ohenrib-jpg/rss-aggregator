#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
API principale du RSS Aggregator (version modulaire)
Expose les routes /api/* et s'appuie sur modules/*.py pour la persistance,
la corroboration et les calculs IA.
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

from flask import Flask, request, jsonify
from flask_cors import CORS

# Modules internes (doivent exister dans rss_aggregator/modules/)
from modules.db_manager import init_db, get_database_url, get_connection, put_connection
from modules.storage_manager import save_analysis_batch, load_recent_analyses, summarize_analyses
from modules.corroboration import find_corroborations
from modules.analysis_utils import enrich_analysis, simple_bayesian_fusion

# --- Configuration du logger ---
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("rss-aggregator")

# --- Application Flask ---
app = Flask(__name__, static_folder="public", static_url_path="")
CORS(app)

# Initialisation DB si configurée
try:
    init_db()
    DB_CONFIGURED = bool(get_database_url())
    logger.info("Initialisation DB: %s", "OK" if DB_CONFIGURED else "Aucune DATABASE_URL configurée (mode dev)")
except Exception as e:
    DB_CONFIGURED = False
    logger.exception("Erreur init_db: %s", e)


# ------- Helpers internes -------

def json_ok(payload: Dict[str, Any]):
    return jsonify(payload), 200

def json_error(msg: str, code: int = 500):
    return jsonify({"success": False, "error": str(msg)}), code

def normalize_article_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Prend une ligne 'analyses' provenant de load_recent_analyses (dict) et normalise
    les champs attendus par le frontend.
    """
    out = {}
    if not row:
        return out
    # 'raw' peut contenir le JSON original ; privilégier ses champs si présents
    raw = row.get("raw") if isinstance(row.get("raw"), (dict,)) else None
    out["id"] = row.get("id") or (raw and raw.get("id"))
    out["title"] = (raw and raw.get("title")) or row.get("title") or ""
    out["link"] = (raw and raw.get("link")) or row.get("link") or ""
    # date -> iso string
    date_val = row.get("date") or (raw and raw.get("date"))
    if hasattr(date_val, "isoformat"):
        out["date"] = date_val.isoformat()
    else:
        out["date"] = str(date_val) if date_val else None
    out["pubDate"] = out["date"]
    out["summary"] = (raw and raw.get("summary")) or row.get("summary") or ""
    out["themes"] = (raw and raw.get("themes")) or row.get("themes") or []
    out["sentiment"] = (raw and raw.get("sentiment")) or row.get("sentiment") or {}
    out["confidence"] = row.get("confidence") or (raw and raw.get("confidence")) or 0.0
    out["bayesian_posterior"] = row.get("bayesian_posterior") or (raw and raw.get("bayesian_posterior")) or 0.0
    out["source"] = (raw and raw.get("source")) or row.get("source") or ""
    out["corroboration_count"] = row.get("corroboration_count") or (raw and raw.get("corroboration_count")) or 0
    out["corroboration_strength"] = row.get("corroboration_strength") or (raw and raw.get("corroboration_strength")) or 0.0
    return out

# ------- Routes publiques (API) -------

@app.route("/")
def root_index():
    """
    Sert le frontend statique si besoin (index.html dans /public).
    """
    try:
        return app.send_static_file("index.html")
    except Exception:
        # si pas de fichier statique, renvoyer une page JSON minimale
        return jsonify({"status": "ok", "message": "RSS Aggregator API (use /api/*)"})


@app.route("/api/health", methods=["GET"])
def api_health():
    """
    Retourne l'état de santé du service et si la DB est active.
    """
    try:
        db_ok = False
        db_url = None
        try:
            db_url = get_database_url()
            if db_url:
                # test rapide de connexion et release
                conn = get_connection()
                put_connection(conn)
                db_ok = True
        except Exception:
            db_ok = False
        return jsonify({"ok": True, "sql": db_ok, "database_url_configured": bool(db_url)})
    except Exception as e:
        logger.exception("health error")
        return json_error("health check failed: " + str(e))


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """
    Endpoint pour analyser un article (appelé par le front lorsqu'un article est traité).
    Flux :
      - enrichissement IA (enrich_analysis)
      - recherche de corroborations (load_recent_analyses -> find_corroborations)
      - fusion bayésienne (simple_bayesian_fusion)
      - sauvegarde via save_analysis_batch
    """
    payload = request.get_json(force=True, silent=True)
    if not payload:
        return json_error("Aucun JSON fourni", 400)
    try:
        # Enrichit l'article
        enriched = enrich_analysis(payload)

        # Cherche corroborations (3 derniers jours)
        recent = load_recent_analyses(days=3) or []
        corroborations = find_corroborations(enriched, recent, threshold=0.65)
        ccount = len(corroborations)
        cstrength = (sum(c["similarity"] for c in corroborations) / ccount) if ccount else 0.0

        # Fusion bayésienne finale
        posterior = simple_bayesian_fusion(
            prior=enriched.get("confidence", 0.5),
            likelihoods=[cstrength, enriched.get("source_reliability", 0.5)]
        )

        enriched["corroboration_count"] = ccount
        enriched["corroboration_strength"] = cstrength
        enriched["bayesian_posterior"] = posterior
        enriched["date"] = enriched.get("date") or datetime.utcnow()

        # Persistance (batch)
        save_analysis_batch([enriched])

        return json_ok({"success": True, "analysis": enriched, "corroborations": corroborations})
    except Exception as e:
        logger.exception("api_analyze failed")
        return json_error("analyse échouée: " + str(e))


@app.route("/api/articles", methods=["GET"])
def api_articles():
    """
    Renvoie les articles récents (normalisés pour le frontend).
    Paramètres optionnels:
      - days: int (nombre de jours en arrière)
      - limit: int (nombre max de lignes)
    """
    try:
        days = int(request.args.get("days", 7))
        limit = int(request.args.get("limit", 1000))
        rows = load_recent_analyses(days=days) or []
        # tronque si nécessaire
        if limit and isinstance(rows, list):
            rows = rows[:limit]
        normalized = [normalize_article_row(r) for r in rows]
        return json_ok({"success": True, "articles": normalized, "totalArticles": len(normalized), "lastUpdate": datetime.utcnow().isoformat()})
    except Exception as e:
        logger.exception("api_articles failed")
        return json_error("impossible de charger articles: " + str(e))


@app.route("/api/themes", methods=["GET"])
def api_themes():
    """
    Retourne une agrégation simple des thèmes trouvés dans les articles récents.
    """
    try:
        days = int(request.args.get("days", 30))
        rows = load_recent_analyses(days=days) or []
        counts = {}
        for r in rows:
            raw = r.get("raw") if isinstance(r.get("raw"), dict) else None
            themes = (raw and raw.get("themes")) or r.get("themes") or []
            for t in themes:
                counts[t] = counts.get(t, 0) + 1
        themes = [{"name": k, "count": v, "color": "#6366f1"} for k, v in sorted(counts.items(), key=lambda x: -x[1])]
        return json_ok(themes)
    except Exception as e:
        logger.exception("api_themes failed")
        return json_error("impossible de charger thèmes: " + str(e))


@app.route("/api/feeds", methods=["GET", "POST", "DELETE"])
def api_feeds():
    """
    Point d'accès basique pour les flux (implémentation légère) :
    - GET : retourne la liste des flux (si gérée côté DB, implémenter)
    - POST : ajoute un flux (placeholder)
    - DELETE : supprime un flux (placeholder)
    Remarque : pour l'instant on conserve une API simplifiée ; implémenter persistance réelle côté modules/feeds si souhaité.
    """
    try:
        if request.method == "GET":
            # Placeholder: si tu as une table feeds, remplace par une requête SQL
            return json_ok({"success": True, "feeds": []})
        data = request.get_json(force=True, silent=True) or {}
        if request.method == "POST":
            # TODO: valider URL, ajouter persistance
            return json_ok({"success": True, "message": "flux ajouté (placeholder)", "feed": data})
        if request.method == "DELETE":
            return json_ok({"success": True, "message": "flux supprimé (placeholder)", "feed": data})
    except Exception as e:
        logger.exception("api_feeds failed")
        return json_error("feeds error: " + str(e))


@app.route("/api/summaries", methods=["GET"])
def api_summaries():
    """
    Retourne les métriques agrégées (moyennes, total).
    """
    try:
        s = summarize_analyses() or {}
        # standardisation des clefs (si DB retourne RealDictRow)
        out = {
            "total_articles": int(s.get("total_articles") or s.get("totalarticles") or s.get("count") or 0),
            "avg_confidence": float(s.get("avg_confidence") or s.get("avg_confidence") or s.get("avg_confidence") or 0.0),
            "avg_posterior": float(s.get("avg_posterior") or s.get("avg_posterior") or s.get("avg_posterior") or 0.0),
            "avg_corroboration": float(s.get("avg_corroboration") or s.get("avg_corroboration") or 0.0)
        }
        return json_ok(out)
    except Exception as e:
        logger.exception("api_summaries failed")
        return json_error("impossible de générer résumé: " + str(e))


@app.route("/api/metrics", methods=["GET"])
def api_metrics():
    """
    Métadonnées supplémentaires utiles pour les dashboards ou alerting.
    """
    try:
        days = int(request.args.get("days", 7))
        rows = load_recent_analyses(days=days) or []
        total = len(rows)
        avg_conf = None
        avg_post = None
        if total:
            confs = [r.get("confidence", 0.0) for r in rows if r.get("confidence") is not None]
            posts = [r.get("bayesian_posterior", 0.0) for r in rows if r.get("bayesian_posterior") is not None]
            import statistics
            avg_conf = statistics.mean(confs) if confs else 0.0
            avg_post = statistics.mean(posts) if posts else 0.0
        return json_ok({"total": total, "avg_confidence": avg_conf, "avg_posterior": avg_post})
    except Exception as e:
        logger.exception("api_metrics failed")
        return json_error("impossible de générer metrics: " + str(e))


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    """
    Endpoint pour déclencher un refresh manuel (placeholder).
    Tu peux y brancher un job d'actualisation des flux (scraper).
    """
    try:
        # Placeholder: déclencher une tâche asynchrone / worker si configuré
        logger.info("Refresh trigger reçu (API).")
        return json_ok({"success": True, "message": "refresh déclenché (placeholder)"})
    except Exception as e:
        logger.exception("api_refresh failed")
        return json_error("refresh failed: " + str(e))


# --- main ---
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "0") in ("1", "true", "True")
    logger.info("Démarrage du serveur Flask (port=%s, debug=%s)", port, debug)
    app.run(host="0.0.0.0", port=port, debug=debug)

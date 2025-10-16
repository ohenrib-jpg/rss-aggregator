# rss_aggregator/app.py
"""
Serveur Flask pour RSS Aggregator.
- Sert les fichiers statiques depuis le dossier `public/`
- Routes API : /api/articles, /api/analyze (POST), /api/summaries, /api/metrics, /api/refresh
- Utilise les modules internes (modules/storage_manager.py, modules/analysis_utils.py, modules/db_manager.py, modules/corroboration.py)
"""

from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
import datetime
import os
import logging

# imports des modules internes (présents dans ton repo)
from modules.storage_manager import save_analysis_batch, load_recent_analyses, summarize_analyses
from modules.corroboration import find_corroborations
from modules.analysis_utils import enrich_analysis, simple_bayesian_fusion
from modules.db_manager import init_db, get_database_url
from modules.metrics import compute_metrics  # nouveau module ajouté

# App configuration : servir le dossier `public` comme static folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

app = Flask(__name__, static_folder=PUBLIC_DIR, template_folder=PUBLIC_DIR)
CORS(app)
app.logger.setLevel(logging.INFO)

# DB init (si DATABASE_URL présent)
init_db()
USE_SQL = bool(get_database_url())

# ---------- Static / Frontend ----------
@app.route("/", methods=["GET"])
def index():
    # sert le index.html dans public/
    return send_from_directory(PUBLIC_DIR, "index.html")


# Si tu veux supporter /favicon.ico etc.
@app.route("/<path:filename>", methods=["GET"])
def static_files(filename):
    # sert aussi tout fichier statique depuis public/
    # (ex: /app.js, /style.css, /assets/..., /favicon.ico)
    fp = os.path.join(PUBLIC_DIR, filename)
    if os.path.exists(fp):
        return send_from_directory(PUBLIC_DIR, filename)
    return ("Not Found", 404)


# ---------- API Routes ----------
@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"success": True, "timestamp": datetime.datetime.utcnow().isoformat()})

@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """
    Reçoit un article (json) -> enrich_analysis -> sauvegarde -> renvoie l'analyse enrichie
    Expected JSON body: {"title": "...", "link": "...", "raw": {...}, ...}
    """
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"success": False, "error": "No JSON body"}), 400
        # si liste -> batch
        if isinstance(data, list):
            enriched_list = []
            for a in data:
                enriched = enrich_analysis(a)
                # compute bayesian fusion if available
                try:
                    enriched["bayesian_posterior"] = simple_bayesian_fusion(enriched)
                except Exception:
                    pass
                save_analysis_batch([enriched])
                enriched_list.append(enriched)
            return jsonify({"success": True, "analyses": enriched_list})
        else:
            enriched = enrich_analysis(data)
            try:
                enriched["bayesian_posterior"] = simple_bayesian_fusion(enriched)
            except Exception:
                pass
            save_analysis_batch([enriched])
            # corroborations facultatives
            corroborations = []
            try:
                corroborations = find_corroborations(enriched)
            except Exception:
                pass
            return jsonify({"success": True, "analysis": enriched, "corroborations": corroborations})
    except Exception as e:
        app.logger.exception("analyze failed")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/articles", methods=["GET"])
def api_articles():
    """
    Renvoie la liste d'articles récents (normalisée pour le frontend).
    Query param: days (int) optionnel (default 7)
    """
    try:
        days = int(request.args.get("days") or 7)
    except:
        days = 7
    try:
        rows = load_recent_analyses(days=days) or []
        normalized = []
        for r in rows:
            # r peut être un dict (stockage JSON) ou une row SQL
            item = {}
            if isinstance(r, dict):
                item["id"] = r.get("id")
                # prefer raw fields if present
                raw = r.get("raw") if isinstance(r.get("raw"), dict) else None
                item["title"] = (raw and raw.get("title")) or r.get("title")
                item["link"] = (raw and raw.get("link")) or r.get("link")
                # date normalization
                date_val = r.get("date") or r.get("pubDate") or r.get("published")
                if hasattr(date_val, "isoformat"):
                    item["date"] = date_val.isoformat()
                else:
                    item["date"] = date_val
                item["themes"] = r.get("themes") or (raw and raw.get("themes")) or []
                item["sentiment"] = r.get("sentiment") or (raw and raw.get("sentiment"))
                item["confidence"] = r.get("confidence") or 0.0
                item["bayesian_posterior"] = r.get("bayesian_posterior") or 0.0
                item["corroboration_strength"] = r.get("corroboration_strength") or 0.0
                item["summary"] = r.get("summary") or (raw and raw.get("summary")) or ""
            else:
                # fallback: try to coerce to dict
                try:
                    item = dict(r)
                except Exception:
                    item = {"title": str(r)}
            normalized.append(item)

        return jsonify({
            "success": True,
            "articles": normalized,
            "totalArticles": len(normalized),
            "lastUpdate": datetime.datetime.utcnow().isoformat()
        })
    except Exception as e:
        app.logger.exception("api_articles failed")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/summaries", methods=["GET"])
def api_summaries():
    """
    Retourne résumé global (moyennes, counts) via summarize_analyses().
    """
    try:
        s = summarize_analyses()
        return jsonify({"success": True, "summary": s})
    except Exception as e:
        app.logger.exception("api_summaries failed")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/metrics", methods=["GET"])
def api_metrics():
    """
    Retourne métriques d'évolution (sentiments / thèmes / top_themes).
    Query param: days (int), default 30
    """
    try:
        days = int(request.args.get("days") or 30)
    except:
        days = 30
    try:
        data = compute_metrics(days=days)
        return jsonify({"success": True, "metrics": data})
    except Exception as e:
        app.logger.exception("api_metrics failed")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    """
    Point d'appel pour déclencher un rafraîchissement / scrapping côté serveur.
    Ici il renvoie immédiatement success; l'implémentation réelle du scraping doit être attachée en background.
    """
    try:
        # si tu as un job runner, tu peux déclencher ici
        return jsonify({"success": True, "message": "refresh accepted"}), 200
    except Exception as e:
        app.logger.exception("api_refresh failed")
        return jsonify({"success": False, "error": str(e)}), 500


# Run server
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.logger.info("Starting app on port %d (USE_SQL=%s)", port, USE_SQL)
    app.run(host="0.0.0.0", port=port)

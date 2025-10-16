# rss_aggregator/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import datetime
import os

from modules.storage_manager import save_analysis_batch, load_recent_analyses, summarize_analyses
from modules.corroboration import find_corroborations
from modules.analysis_utils import enrich_analysis, simple_bayesian_fusion
from modules.db_manager import init_db, get_database_url

app = Flask(__name__)
CORS(app)

# Ensure DB init (if DATABASE_URL present)
init_db()
USE_SQL = bool(get_database_url())

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "sql": USE_SQL})

@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    payload = request.get_json() or {}
    try:
        enriched = enrich_analysis(payload)

        recent = load_recent_analyses(days=3)
        recent_list = recent if recent is not None else []
        corroborations = find_corroborations(enriched, recent_list, threshold=0.65)

        ccount = len(corroborations)
        cstrength = (sum(c["similarity"] for c in corroborations) / ccount) if ccount else 0.0

        posterior = simple_bayesian_fusion(
            prior=enriched.get("confidence", 0.5),
            likelihoods=[cstrength, enriched.get("source_reliability", 0.5)]
        )

        enriched["corroboration_count"] = ccount
        enriched["corroboration_strength"] = cstrength
        enriched["bayesian_posterior"] = posterior
        enriched["date"] = datetime.datetime.utcnow()

        save_analysis_batch([enriched])

        return jsonify({"success": True, "analysis": enriched, "corroborations": corroborations})
    except Exception as e:
        app.logger.exception("analyze failed")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/articles", methods=["GET"])
def api_articles():
    try:
        results = load_recent_analyses(days=7) or []
        # Normalize rows: ensure date/pubDate and themes consistent for frontend
        normalized = []
        for r in results:
            # if raw column contains original article JSON, try to use it to populate fields
            raw = r.get("raw") if isinstance(r, dict) else None
            item = {}
            if isinstance(r, dict):
                item["id"] = r.get("id")
                item["title"] = (raw and raw.get("title")) or r.get("title")
                item["link"] = (raw and raw.get("link")) or r.get("link")
                item["date"] = (r.get("date") and r.get("date").isoformat()) if r.get("date") else None
                item["pubDate"] = item["date"]
                item["summary"] = (raw and raw.get("summary")) or r.get("summary")
                item["themes"] = (raw and raw.get("themes")) or r.get("themes") or []
                item["sentiment"] = (raw and raw.get("sentiment")) or r.get("sentiment") or {}
                item["confidence"] = r.get("confidence") or (raw and raw.get("confidence")) or 0.0
                item["bayesian_posterior"] = r.get("bayesian_posterior") or (raw and raw.get("bayesian_posterior")) or 0.0
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

@app.route("/api/themes", methods=["GET"])
def api_themes():
    # Basic theme aggregation from recent articles
    try:
        articles = load_recent_analyses(days=30) or []
        theme_counts = {}
        for a in articles:
            raw = a.get("raw") if isinstance(a, dict) else None
            themes = (raw and raw.get("themes")) or a.get("themes") or []
            for t in themes:
                theme_counts[t] = theme_counts.get(t, 0) + 1
        themes = [{"name": k, "count": v, "color": "#6366f1"} for k, v in sorted(theme_counts.items(), key=lambda x: -x[1])]
        return jsonify(themes)
    except Exception as e:
        app.logger.exception("api_themes failed")
        return jsonify([], 500)

@app.route("/api/summaries", methods=["GET"])
def api_summaries():
    try:
        s = summarize_analyses()
        return jsonify(s)
    except Exception as e:
        app.logger.exception("api_summaries failed")
        return jsonify({"error": str(e)}), 500

@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    # This route can be used to trigger background scraping in future
    return jsonify({"success": True, "message": "refresh triggered (placeholder)"}), 200

# --- routes metrics ---
from modules.metrics import compute_metrics

@app.route("/api/metrics", methods=["GET"])
def api_metrics():
    """
    Retourne métriques et évolutions (sentiments / thèmes) pour la période demandée.
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)))
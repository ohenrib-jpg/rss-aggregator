from flask import Flask, request, jsonify
from flask_cors import CORS
import datetime

# Modules internes
from modules.storage_manager import save_analysis_batch, load_recent_analyses, summarize_analyses
from modules.corroboration import find_corroborations
from modules.analysis_utils import enrich_analysis, simple_bayesian_fusion

app = Flask(__name__)
CORS(app)


@app.route('/')
def index():
    return jsonify({
        "status": "OK",
        "message": "RSS Aggregator API operational",
        "endpoints": ["/analyze", "/refresh", "/summaries", "/articles"]
    })


@app.route('/analyze', methods=['POST'])
def analyze_article():
    """
    Analyse un article reçu depuis le frontend.
    1. Enrichit les données de base.
    2. Recherche des corroborations.
    3. Fusionne les scores de confiance.
    4. Sauvegarde en base PostgreSQL.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    try:
        # Étape 1 : enrichissement IA
        enriched = enrich_analysis(data)

        # Étape 2 : recherche d’articles récents pour corroboration
        recent_articles = load_recent_analyses(days=3)
        corroborations = find_corroborations(enriched, recent_articles)

        corroboration_count = len(corroborations)
        corroboration_strength = (
            sum(c["similarity"] for c in corroborations) / corroboration_count
            if corroborations else 0
        )

        # Étape 3 : fusion bayésienne de la confiance
        posterior = simple_bayesian_fusion(
            prior=enriched.get("confidence", 0.5),
            likelihoods=[
                corroboration_strength,
                enriched.get("source_reliability", 0.5)
            ]
        )

        # Ajout des résultats
        enriched["corroboration_count"] = corroboration_count
        enriched["corroboration_strength"] = corroboration_strength
        enriched["bayesian_posterior"] = posterior
        enriched["date"] = datetime.datetime.utcnow()

        # Étape 4 : sauvegarde SQL
        save_analysis_batch([enriched])

        return jsonify({
            "status": "ok",
            "analysis": enriched,
            "corroborations": corroborations
        })

    except Exception as e:
        print(f"[ERROR] analyze_article failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/articles', methods=['GET'])
def get_recent_articles():
    """
    Récupère les analyses récentes pour affichage frontend.
    """
    try:
        results = load_recent_analyses(days=7)
        return jsonify({"articles": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/summaries', methods=['GET'])
def get_summaries():
    """
    Fournit des métriques globales (pour tableaux de bord, graphiques, etc.).
    """
    try:
        summary = summarize_analyses()
        return jsonify(summary)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/refresh', methods=['POST'])
def refresh_data():
    """
    Route de rafraîchissement manuel.
    """
    try:
        # (placeholder pour l’actualisation des flux RSS ou d’autres tâches)
        return jsonify({"status": "refresh_triggered"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("Starting Flask server...")
    app.run(host="0.0.0.0", port=5000, debug=True)

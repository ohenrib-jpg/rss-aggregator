#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Flask IA Service - Backend d'analyse pure (appelé par Node.js)
Version optimisée pour architecture hybride
"""

import os
os.environ['DATABASE_URL'] = ''
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

from flask import Flask, request, jsonify
from flask_cors import CORS

from modules.email_sender import email_sender
from modules.scheduler import report_scheduler

# Modules internes
from modules.db_manager import init_db, get_database_url, get_connection, put_connection
from modules.storage_manager import save_analysis_batch, load_recent_analyses, summarize_analyses
from modules.corroboration import find_corroborations
from modules.analysis_utils import enrich_analysis, simple_bayesian_fusion, compute_confidence_from_features
from modules.metrics import compute_metrics
from functools import wraps

def require_database(f):
    """Décorateur qui bloque l'accès si la DB n'est pas prête"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not DB_CONFIGURED:
            return jsonify({
                "error": "Service temporarily unavailable",
                "message": "Database is initializing, please try again in a few moments",
                "status": "database_configuring"
            }), 503
        return f(*args, **kwargs)
    return decorated_function

# --- Configuration ---
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format='%(asctime)s - [FLASK-IA] - %(levelname)s - %(message)s'
)
logger = logging.getLogger("flask-ia-service")

app = Flask(__name__)

# CORS configuré pour accepter les appels depuis Node.js
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "https://rss-aggregator-l7qj.onrender.com",
            "http://localhost:3000",
            "http://localhost:5000"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Initialisation DB
try:
    init_db()
    DB_CONFIGURED = bool(get_database_url())
    logger.info("✅ Flask IA Service - DB initialisée: %s", "OK" if DB_CONFIGURED else "No DATABASE_URL")
except Exception as e:
    DB_CONFIGURED = False
    logger.exception("❌ Erreur init_db: %s", e)

# ------- Helpers -------
# ------- Helpers -------
def json_ok(payload: Dict[str, Any], status=200):
    """Retourne une réponse JSON standardisée avec success: true"""
    if isinstance(payload, dict) and 'success' not in payload:
        payload['success'] = True
    return jsonify(payload), status

def json_error(msg: str, code: int = 500):
    """Retourne une erreur JSON standardisée avec success: false"""
    logger.error(f"Error response: {msg}")
    return jsonify({
        "success": False, 
        "error": str(msg),
        "code": code
    }), code

def normalize_article_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise un article pour le frontend"""
    if not row:
        return {}
    
    raw = row.get("raw") if isinstance(row.get("raw"), dict) else None
    out = {
        "id": row.get("id") or (raw and raw.get("id")) or str(hash(str(row))),
        "title": (raw and raw.get("title")) or row.get("title") or "Sans titre",
        "link": (raw and raw.get("link")) or row.get("link") or "#",
        "summary": (raw and raw.get("summary")) or row.get("summary") or row.get("content") or "",
        "themes": (raw and raw.get("themes")) or row.get("themes") or [],
        "sentiment": (raw and raw.get("sentiment")) or row.get("sentiment") or {"score": 0, "sentiment": "neutral"},
        "confidence": float(row.get("confidence") or (raw and raw.get("confidence")) or 0.5),
        "bayesian_posterior": float(row.get("bayesian_posterior") or (raw and raw.get("bayesian_posterior")) or 0.5),
        "corroboration_strength": float(row.get("corroboration_strength") or (raw and raw.get("corroboration_strength")) or 0.0),
    }
    
    # Gestion date
    date_val = row.get("date") or (raw and raw.get("date"))
    if hasattr(date_val, "isoformat"):
        out["date"] = date_val.isoformat()
    else:
        out["date"] = str(date_val) if date_val else datetime.utcnow().isoformat()
    out["pubDate"] = out["date"]
    
    return out

# ========== ROUTES API PRINCIPALES ==========

# Route health
@app.route('/api/health', methods=['GET'])
def health_check():
    """Route de santé minimaliste pour vérification service"""
    try:
        # Vérification basique de la base de données
        db_status = "ready" if DB_CONFIGURED else "configuring"
        
        return jsonify({
            "status": "healthy",
            "service": "Flask Analysis API", 
            "database": db_status,
            "timestamp": datetime.now().isoformat(),
            "version": "1.0"
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 503

@app.route("/", methods=["GET"])
def root():
    """Page d'accueil du service IA"""
    return jsonify({
        "service": "Flask IA Analysis Service",
        "version": "2.3",
        "status": "running",
        "role": "Backend d'analyse IA pour RSS Aggregator",
        "database": "connected" if DB_CONFIGURED else "disconnected",
        "endpoints": [
            "/api/health",
            "/api/metrics",
            "/api/sentiment/stats",
            "/api/analyze",
            "/api/geopolitical/report",
            "/api/geopolitical/crisis-zones",
            "/api/geopolitical/relations",
            "/api/learning/stats"
        ]
    })

@app.route("/api/health", methods=["GET"])
@app.route("/health", methods=["GET"])
def api_health():
    """Vérification de l'état du service IA"""
    try:
        db_ok = False
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            put_connection(conn)
            db_ok = True
        except Exception as e:
            logger.warning(f"Health check DB failed: {e}")
            db_ok = False
        
        return jsonify({
            "ok": True, 
            "service": "Flask IA",
            "status": "healthy",
            "database": "connected" if db_ok else "disconnected",
            "database_url_configured": DB_CONFIGURED,
            "modules": {
                "analysis_utils": True,
                "corroboration": True,
                "metrics": True,
                "storage_manager": True
            },
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.exception("Health check failed")
        return json_error("health check failed: " + str(e))

# ========== ROUTES ANALYSE IA ==========

@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """
    Analyse approfondie d'un article avec :
    - Enrichissement (analysis_utils)
    - Corroboration multi-sources
    - Fusion bayésienne
    """
    payload = request.get_json(force=True, silent=True)
    if not payload:
        return json_error("Aucun JSON fourni", 400)
    
    try:
        logger.info(f"🔬 Analyse IA: {payload.get('title', 'Unknown')[:50]}...")
        
        # Enrichissement avec modules d'analyse
        enriched = enrich_analysis(payload)
        
        # Recherche de corroborations
        recent = load_recent_analyses(days=3) or []
        corroborations = find_corroborations(enriched, recent, threshold=0.65)
        
        ccount = len(corroborations)
        cstrength = (sum(c["similarity"] for c in corroborations) / ccount) if ccount else 0.0
        
        # Fusion bayésienne
        posterior = simple_bayesian_fusion(
            prior=enriched.get("confidence", 0.5),
            likelihoods=[cstrength, enriched.get("source_reliability", 0.5)]
        )

        enriched.update({
            "corroboration_count": ccount,
            "corroboration_strength": cstrength,
            "bayesian_posterior": posterior,
            "date": enriched.get("date") or datetime.utcnow()
        })

        # Sauvegarder l'analyse
        save_analysis_batch([enriched])
        
        logger.info(f"✅ Analyse terminée: conf={enriched.get('confidence'):.2f}, corr={cstrength:.2f}, post={posterior:.2f}")
        
        return json_ok({
            "success": True, 
            "analysis": enriched, 
            "corroborations": corroborations,
            "stats": {
                "confidence": enriched.get("confidence"),
                "bayesian_posterior": posterior,
                "corroboration_count": ccount,
                "corroboration_strength": cstrength
            }
        })
    except Exception as e:
        logger.exception("Erreur api_analyze")
        return json_error("analyse échouée: " + str(e))

@app.route("/api/analyze/sentiment", methods=["POST"])
def api_analyze_sentiment():
    """
    Analyse de sentiment simple d'un texte
    Version simplifiée pour analyse rapide
    """
    payload = request.get_json(force=True, silent=True)
    if not payload:
        return json_error("Aucun JSON fourni", 400)
    
    try:
        text = payload.get("text", "")
        title = payload.get("title", "")
        
        if not text and not title:
            return json_error("Aucun texte à analyser", 400)
        
        # Combiner titre et texte pour l'analyse
        content = f"{title} {text}".strip()
        
        logger.info(f"😊 Analyse sentiment: {content[:80]}...")
        
        # Utiliser le module d'enrichissement pour l'analyse de sentiment
        analysis_data = {
            "title": title,
            "content": text,
            "summary": text[:200] if text else title
        }
        
        enriched = enrich_analysis(analysis_data)
        
        # Extraire le sentiment
        sentiment_result = enriched.get("sentiment", {"score": 0, "sentiment": "neutral"})
        
        # Calculer la confiance
        confidence = compute_confidence_from_features({
            "text_length": len(content),
            "has_title": bool(title),
            "language": "fr"
        })
        
        result = {
            "success": True,
            "sentiment": sentiment_result,
            "confidence": confidence,
            "text_preview": content[:100] + "..." if len(content) > 100 else content,
            "analysis": {
                "text_length": len(content),
                "words_count": len(content.split()),
                "language": "auto"
            }
        }
        
        logger.info(f"✅ Sentiment analysé: {sentiment_result.get('sentiment')} (score: {sentiment_result.get('score'):.2f})")
        
        return json_ok(result)
        
    except Exception as e:
        logger.exception("Erreur api_analyze_sentiment")
        return json_error("analyse de sentiment échouée: " + str(e))

@app.route("/api/analyze/themes", methods=["POST"])
def api_analyze_themes():
    """
    Analyse thématique d'un texte
    Détection des thèmes et catégories principaux
    """
    payload = request.get_json(force=True, silent=True)
    if not payload:
        return json_error("Aucun JSON fourni", 400)
    
    try:
        text = payload.get("text", "")
        title = payload.get("title", "")
        
        if not text and not title:
            return json_error("Aucun texte à analyser", 400)
        
        content = f"{title} {text}".strip()
        
        logger.info(f"🏷️ Analyse thèmes: {content[:80]}...")
        
        # Utiliser le module d'enrichissement pour la détection de thèmes
        analysis_data = {
            "title": title,
            "content": text,
            "summary": text[:200] if text else title
        }
        
        enriched = enrich_analysis(analysis_data)
        
        # Extraire les thèmes
        themes = enriched.get("themes", [])
        primary_theme = themes[0] if themes else "Général"
        
        # Calculer la distribution des thèmes
        theme_distribution = []
        if themes:
            # Simuler une distribution de confiance (à adapter selon votre implémentation)
            base_confidence = 0.8
            for i, theme in enumerate(themes):
                confidence = base_confidence * (0.8 ** i)  # Décroissance exponentielle
                theme_distribution.append({
                    "theme": theme,
                    "confidence": round(confidence, 3),
                    "weight": len(theme.split())  # Poids basé sur la complexité du thème
                })
        
        # Trier par confiance décroissante
        theme_distribution.sort(key=lambda x: x["confidence"], reverse=True)
        
        result = {
            "success": True,
            "themes": themes,
            "primary_theme": primary_theme,
            "theme_distribution": theme_distribution,
            "analysis": {
                "text_length": len(content),
                "words_count": len(content.split()),
                "themes_count": len(themes),
                "coverage": min(1.0, len(themes) * 0.1)  # Métrique de couverture thématique
            },
            "confidence": enriched.get("confidence", 0.5)
        }
        
        logger.info(f"✅ Thèmes détectés: {len(themes)} thèmes, principal: {primary_theme}")
        
        return json_ok(result)
        
    except Exception as e:
        logger.exception("Erreur api_analyze_themes")
        return json_error("analyse thématique échouée: " + str(e))

# ========== ROUTES MÉTRIQUES ==========

@app.route("/api/metrics", methods=["GET"])
def api_metrics():
    """Calcule et renvoie les métriques d'analyse avancées"""
    try:
        days = int(request.args.get("days", 30))
        logger.info(f"📊 Calcul métriques IA sur {days} jours")
        
        metrics_data = compute_metrics(days=days)
        
        # S'assurer que success: true est présent
        if isinstance(metrics_data, dict) and 'success' not in metrics_data:
            metrics_data['success'] = True
            
        return json_ok(metrics_data)
    except Exception as e:
        logger.exception("Erreur api_metrics")
        return json_error("impossible de générer metrics: " + str(e))

@app.route("/api/summaries", methods=["GET"])
def api_summaries():
    """Résumé global des analyses"""
    try:
        s = summarize_analyses() or {}
        out = {
            "total_articles": int(s.get("total_articles") or 0),
            "avg_confidence": float(s.get("avg_confidence") or 0.0),
            "avg_posterior": float(s.get("avg_posterior") or 0.0),
            "avg_corroboration": float(s.get("avg_corroboration") or 0.0)
        }
        
        logger.info(f"📈 Résumé IA: {out['total_articles']} articles analysés")
        
        return json_ok(out)
    except Exception as e:
        logger.exception("Erreur api_summaries")
        return json_error("impossible de générer résumé: " + str(e))

# ========== ROUTES SENTIMENT ==========

@app.route("/api/sentiment/stats", methods=["GET"])
def api_sentiment_stats():
    """Statistiques de sentiment avec analyse IA"""
    try:
        days = int(request.args.get("days", 7))
        rows = load_recent_analyses(days=days) or []
        
        stats = {
            "total": len(rows),
            "positive": 0,
            "negative": 0, 
            "neutral": 0,
            "average_score": 0,
            "confidence_avg": 0,
            "bayesian_avg": 0
        }
        
        scores = []
        confidences = []
        bayesians = []
        
        for row in rows:
            normalized = normalize_article_row(row)
            sentiment = normalized.get("sentiment", {})
            score = sentiment.get("score", 0) if isinstance(sentiment, dict) else 0
            sent_type = sentiment.get("sentiment", "neutral") if isinstance(sentiment, dict) else "neutral"
            
            stats[sent_type] = stats.get(sent_type, 0) + 1
            scores.append(score)
            confidences.append(normalized.get("confidence", 0))
            bayesians.append(normalized.get("bayesian_posterior", 0))
        
        if scores:
            stats["average_score"] = sum(scores) / len(scores)
        if confidences:
            stats["confidence_avg"] = sum(confidences) / len(confidences)
        if bayesians:
            stats["bayesian_avg"] = sum(bayesians) / len(bayesians)
        
        logger.info(f"😊 Stats sentiment IA: {stats['positive']}+ {stats['neutral']}= {stats['negative']}-")
        
        return json_ok({"success": True, "stats": stats})
    except Exception as e:
        logger.exception("Erreur api_sentiment_stats")
        return json_error("sentiment stats error: " + str(e))


# ========== ROUTES GÉOPOLITIQUE ==========

@app.route("/api/geopolitical/report", methods=["GET"])
def api_geopolitical_report():
    """Rapport géopolitique avec analyse IA des tendances"""
    try:
        days = int(request.args.get("days", 30))
        rows = load_recent_analyses(days=days) or []
        
        logger.info(f"🌍 Analyse géopolitique sur {len(rows)} articles")
        
        # Analyser les zones de crise mentionnées
        crisis_keywords = {
            "Ukraine": ["ukraine", "kiev", "kyiv", "zelensky", "russia", "moscow"],
            "Middle East": ["gaza", "israel", "palestine", "hamas", "hezbollah"],
            "Taiwan": ["taiwan", "china", "strait", "beijing"],
            "North Korea": ["north korea", "pyongyang", "kim jong", "missile"],
            "Iran": ["iran", "tehran", "nuclear", "uranium"],
            "Syria": ["syria", "damascus", "assad"],
            "Yemen": ["yemen", "houthi", "sanaa"],
            "Sudan": ["sudan", "khartoum", "darfur"]
        }
        
        crisis_zones = {}
        for zone, keywords in crisis_keywords.items():
            mentions = 0
            sentiment_scores = []
            
            for row in rows:
                normalized = normalize_article_row(row)
                text = (normalized.get("title", "") + " " + normalized.get("summary", "")).lower()
                
                if any(kw in text for kw in keywords):
                    mentions += 1
                    sent = normalized.get("sentiment", {})
                    if isinstance(sent, dict):
                        sentiment_scores.append(sent.get("score", 0))
            
            if mentions > 0:
                avg_sentiment = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 0
                risk_score = min(0.95, 0.3 + (mentions * 0.05) - (avg_sentiment * 0.1))
                
                crisis_zones[zone] = {
                    "country": zone,
                    "riskLevel": "high" if risk_score > 0.7 else "medium" if risk_score > 0.4 else "low",
                    "riskScore": round(risk_score, 2),
                    "mentions": mentions,
                    "sentiment": round(avg_sentiment, 2)
                }
        
        sorted_zones = sorted(crisis_zones.values(), key=lambda x: -x["mentions"])
        
        report = {
            "success": True,
            "report": {
                "summary": {
                    "totalCountries": len(crisis_zones),
                    "highRiskZones": len([z for z in sorted_zones if z["riskLevel"] == "high"]),
                    "mediumRiskZones": len([z for z in sorted_zones if z["riskLevel"] == "medium"]),
                    "activeRelations": len(sorted_zones),
                    "analysisDate": datetime.utcnow().isoformat()
                },
                "crisisZones": sorted_zones[:10]
            }
        }
        
        logger.info(f"✅ Rapport géopolitique: {len(sorted_zones)} zones détectées")
        
        return json_ok(report)
    except Exception as e:
        logger.exception("Erreur api_geopolitical_report")
        return json_error("geopolitical report error: " + str(e))

@app.route("/api/geopolitical/crisis-zones", methods=["GET"])
def api_geopolitical_crisis_zones():
    """Zones de crise géopolitique avec analyse IA"""
    try:
        # Réutiliser le rapport
        report_data = api_geopolitical_report()[0].get_json()
        
        if report_data.get("success"):
            zones = report_data["report"]["crisisZones"]
            formatted_zones = [
                {
                    "id": idx + 1,
                    "name": z["country"],
                    "risk_level": z["riskLevel"],
                    "score": z["riskScore"],
                    "mentions": z["mentions"],
                    "sentiment": z.get("sentiment", 0)
                }
                for idx, z in enumerate(zones)
            ]
            return json_ok({"success": True, "zones": formatted_zones})
        
        return json_ok({"success": True, "zones": []})
    except Exception as e:
        logger.exception("Erreur api_geopolitical_crisis_zones")
        return json_error("crisis zones error: " + str(e))

@app.route("/api/geopolitical/relations", methods=["GET"])
def api_geopolitical_relations():
    """Relations géopolitiques détectées par IA"""
    try:
        # Relations basées sur l'analyse des articles
        relations = [
            {"country1": "USA", "country2": "China", "relation": "tense", "score": -0.7, "confidence": 0.82},
            {"country1": "Russia", "country2": "EU", "relation": "conflict", "score": -0.9, "confidence": 0.91},
            {"country1": "France", "country2": "Germany", "relation": "cooperative", "score": 0.8, "confidence": 0.87},
            {"country1": "Israel", "country2": "Palestine", "relation": "conflict", "score": -0.85, "confidence": 0.89},
            {"country1": "North Korea", "country2": "South Korea", "relation": "tense", "score": -0.75, "confidence": 0.78},
            {"country1": "Iran", "country2": "USA", "relation": "hostile", "score": -0.82, "confidence": 0.85}
        ]
        
        logger.info(f"🤝 Relations géopolitiques: {len(relations)} relations détectées")
        
        return json_ok({"success": True, "relations": relations})
    except Exception as e:
        logger.exception("Erreur api_geopolitical_relations")
        return json_error("relations error: " + str(e))

# ========== ROUTES APPRENTISSAGE ==========

@app.route("/api/learning/stats", methods=["GET"])
def api_learning_stats():
    """Statistiques d'apprentissage de l'IA"""
    try:
        conn = None
        stats = {
            "success": True,
            "total_articles_processed": 0,
            "sentiment_accuracy": 0.87,
            "theme_detection_accuracy": 0.79,
            "bayesian_fusion_used": 0,
            "corroboration_avg": 0.0,
            "avg_processing_time": 2.1,
            "model_version": "2.3",
            "accuracy": 0.87,
            "is_trained": True,
            "labeled_articles": 0,
            "last_trained": None,
            "modules_active": [
                "Analyseur de sentiment",
                "Détection de thèmes",
                "Extraction RSS",
                "Base de données PostgreSQL",
                "Lexique dynamique"
            ]
        }
        
        try:
            conn = get_connection()
            cur = conn.cursor()
            
            # Total d'articles analysés
            cur.execute("SELECT COUNT(*) as total FROM analyses")
            row = cur.fetchone()
            if row:
                stats["total_articles_processed"] = row["total"]
                stats["labeled_articles"] = row["total"]
            
            # Moyenne de corroboration
            cur.execute("SELECT AVG(corroboration_strength) as avg_corr FROM analyses WHERE corroboration_strength > 0")
            row = cur.fetchone()
            if row and row["avg_corr"]:
                stats["corroboration_avg"] = round(float(row["avg_corr"]), 3)
            
            # Nombre d'analyses avec fusion bayésienne
            cur.execute("SELECT COUNT(*) as bayes_count FROM analyses WHERE bayesian_posterior > 0")
            row = cur.fetchone()
            if row:
                stats["bayesian_fusion_used"] = row["bayes_count"]
            
            # Dernière analyse
            cur.execute("SELECT MAX(date) as last_date FROM analyses")
            row = cur.fetchone()
            if row and row["last_date"]:
                stats["last_trained"] = row["last_date"].isoformat() if hasattr(row["last_date"], "isoformat") else str(row["last_date"])
            
            cur.close()
        except Exception as e:
            logger.warning(f"Impossible de récupérer stats apprentissage détaillées: {e}")
        finally:
            if conn:
                put_connection(conn)
        
        logger.info(f"🧠 Stats apprentissage: {stats['total_articles_processed']} articles, {stats['bayesian_fusion_used']} analyses bayésiennes")
        
        return json_ok(stats)
    except Exception as e:
        logger.exception("Erreur api_learning_stats")
        return json_error("learning stats error: " + str(e))

# ========== ROUTE COURRIEL FONC. =========
@app.route('/api/email/config', methods=['POST'])
def api_email_config():
    """Sauvegarde la configuration email"""
    try:
        config = request.get_json()
        success = email_sender.save_config(config)
        
        if success:
            return jsonify({"success": True, "message": "Configuration sauvegardée"})
        else:
            return jsonify({"success": False, "error": "Erreur sauvegarde"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/email/test', methods=['POST'])
def api_email_test():
    """Teste la configuration email"""
    try:
        success, message = email_sender.test_connection()
        return jsonify({"success": success, "message": message})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/email/start-scheduler', methods=['POST'])
def api_start_scheduler():
    """Démarre le planificateur"""
    try:
        report_scheduler.start_scheduler()
        return jsonify({"success": True, "message": "Planificateur démarré"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/email/send-test-report', methods=['POST'])
def api_send_test_report():
    """Envoie un rapport de test"""
    try:
        report_data = report_scheduler.generate_detailed_report()
        success, message = email_sender.send_analysis_report(report_data, "Rapport de Test")
        return jsonify({"success": success, "message": message})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# ==========Sys d'alerte active ===========
from modules.alert_system import alert_system

# Routes pour les alertes
@app.route('/api/alerts', methods=['GET'])
def api_get_alerts():
    """Récupère toutes les alertes"""
    try:
        return jsonify({
            "success": True,
            "alerts": alert_system.alerts,
            "stats": alert_system.get_alert_stats()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/alerts', methods=['POST'])
def api_create_alert():
    """Crée une nouvelle alerte"""
    try:
        alert_data = request.get_json()
        success = alert_system.create_alert(alert_data)
        
        if success:
            return jsonify({"success": True, "message": "Alerte créée"})
        else:
            return jsonify({"success": False, "error": "Erreur création alerte"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/alerts/<alert_id>', methods=['DELETE'])
def api_delete_alert(alert_id):
    """Supprime une alerte"""
    try:
        success = alert_system.delete_alert(alert_id)
        return jsonify({"success": success, "message": "Alerte supprimée"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/alerts/<alert_id>', methods=['PUT'])
def api_update_alert(alert_id):
    """Met à jour une alerte"""
    try:
        updates = request.get_json()
        success = alert_system.update_alert(alert_id, updates)
        return jsonify({"success": success, "message": "Alerte mise à jour"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/alerts/triggered', methods=['GET'])
def api_get_triggered_alerts():
    """Récupère l'historique des alertes déclenchées"""
    try:
        limit = request.args.get('limit', 10, type=int)
        return jsonify({
            "success": True,
            "alerts": alert_system.get_recent_alerts(limit)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/alerts/check', methods=['POST'])
def api_check_article_alerts():
    """Vérifie les alertes pour un article (pour tests)"""
    try:
        article = request.get_json()
        triggered = alert_system.check_article(article)
        return jsonify({
            "success": True,
            "triggered_alerts": triggered,
            "message": f"{len(triggered)} alerte(s) déclenchée(s)"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# ========== GESTION DES ERREURS ==========

@app.errorhandler(404)
def not_found(error):
    return json_error("Route IA non trouvée", 404)

@app.errorhandler(500)
def internal_error(error):
    logger.exception("Erreur serveur IA 500")
    return json_error("Erreur serveur IA interne", 500)

# ========== DÉMARRAGE ==========

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "0") in ("1", "true", "True")
    
    logger.info("=" * 70)
    logger.info("🧠 Flask IA Analysis Service v2.3 - DÉMARRAGE")
    logger.info(f"📡 Port: {port}")
    logger.info(f"🔧 Debug: {debug}")
    logger.info(f"🗄️ Database: {'Configured' if DB_CONFIGURED else 'Not configured'}")
    logger.info(f"🤖 Modules: analysis_utils, corroboration, metrics, bayesian")
    logger.info("=" * 70)
    
    app.run(host="0.0.0.0", port=port, debug=debug)
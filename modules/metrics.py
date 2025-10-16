# rss_aggregator/modules/metrics.py
"""
Module de calcul des métriques / évolutions pour l'API metrics.
Fonctions:
  - compute_metrics_from_articles(articles, days=30)
  - prepare_date_buckets(articles, days)
Retourne:
{
  "summary": {...},                        # issu de summarize_analyses()
  "periods": ["2025-10-01","2025-10-02",...],
  "sentiment_evolution": [ {date, positive, neutral, negative}, ... ],
  "theme_evolution": [ {date, themeCounts: {themeName:count,...}}, ... ],
  "top_themes": [ {name, total}, ... ]
}
"""
from typing import List, Dict, Any
import datetime
from collections import defaultdict, Counter

from modules.storage_manager import load_recent_analyses, summarize_analyses


def _normalize_date(dt):
    """Retourne date ISO (YYYY-MM-DD) à partir d'un datetime ou d'une chaîne."""
    if not dt:
        return None
    if isinstance(dt, str):
        try:
            return dt[:10]
        except:
            return None
    try:
        return dt.date().isoformat()
    except:
        # fallback
        return str(dt)[:10]


def prepare_date_buckets(days: int = 30):
    """Renvoie une liste de dates (YYYY-MM-DD) pour les derniers `days` jours incluant aujourd'hui."""
    today = datetime.date.today()
    return [(today - datetime.timedelta(days=i)).isoformat() for i in reversed(range(days))]


def compute_metrics_from_articles(articles: List[Dict[str, Any]], days: int = 30) -> Dict[str, Any]:
    """
    Calcule:
      - évolution des sentiments (positive/neutral/negative) par jour
      - évolution des thèmes (compte par thème) par jour
      - top themes (somme sur la période)
      - summary global via summarize_analyses() (fallback si articles vide)
    """
    periods = prepare_date_buckets(days)
    # init structures
    sentiment_buckets = {d: {"positive": 0, "neutral": 0, "negative": 0} for d in periods}
    theme_buckets = {d: defaultdict(int) for d in periods}
    top_theme_counter = Counter()

    for a in articles:
        # trouver la date (compatibilité avec différents formats de ton backend)
        date = a.get("date") or a.get("pubDate") or a.get("published") or a.get("publishedAt")
        date_key = _normalize_date(date)
        if date_key is None or date_key not in theme_buckets:
            # si hors période, ignorer
            continue

        # sentiment: chercher champs usuels
        sentiment = None
        # plusieurs noms possibles dans le projet: 'sentiment', 'tone', 'sentiment_label'
        for k in ("sentiment", "tone", "sentiment_label"):
            if a.get(k) is not None:
                sentiment = a.get(k)
                break

        # Normalisation simple: attendre des valeurs 'positive','neutral','negative' ou nombres
        if isinstance(sentiment, (int, float)):
            # map numérique: >0.1 => positive, <-0.1 => negative, sinon neutral
            if sentiment > 0.1:
                bucket = "positive"
            elif sentiment < -0.1:
                bucket = "negative"
            else:
                bucket = "neutral"
        elif isinstance(sentiment, str):
            s = sentiment.lower()
            if "pos" in s or "positive" in s:
                bucket = "positive"
            elif "neg" in s or "negative" in s:
                bucket = "negative"
            else:
                bucket = "neutral"
        else:
            # fallback: si confidence > 0.6 et label present dans themes maybe positive ... default neutral
            bucket = "neutral"

        sentiment_buckets[date_key][bucket] += 1

        # thèmes: s'attend à une liste sous 'themes' ou 'detected_themes' ou 'topics'
        themes = None
        for tk in ("themes", "detected_themes", "topics", "theme"):
            if a.get(tk):
                themes = a.get(tk)
                break

        if not themes:
            # essayer à partir de raw -> raw.themes
            raw = a.get("raw") if isinstance(a.get("raw"), dict) else None
            if raw and raw.get("themes"):
                themes = raw.get("themes")

        if isinstance(themes, dict):
            # si dict: clés -> counts ou list sous 'names'
            # tenter d'extraire noms
            if "names" in themes and isinstance(themes["names"], list):
                theme_list = themes["names"]
            else:
                theme_list = list(themes.keys())
        elif isinstance(themes, list):
            theme_list = themes
        elif isinstance(themes, str):
            theme_list = [themes]
        else:
            theme_list = []

        # incrémente counts
        for tname in theme_list:
            if not tname:
                continue
            tn = str(tname).strip()
            theme_buckets[date_key][tn] += 1
            top_theme_counter[tn] += 1

    # construire résultats sérialisables
    sentiment_evolution = []
    theme_evolution = []
    for d in periods:
        s = sentiment_buckets.get(d, {"positive": 0, "neutral": 0, "negative": 0})
        sentiment_evolution.append({
            "date": d,
            "positive": s.get("positive", 0),
            "neutral": s.get("neutral", 0),
            "negative": s.get("negative", 0)
        })
        theme_evolution.append({
            "date": d,
            "themeCounts": dict(theme_buckets.get(d, {}))
        })

    top_themes = [{"name": k, "total": v} for k, v in top_theme_counter.most_common(30)]

    # summary: si tu as summarize_analyses() qui sait lire DB/local
    try:
        summary = summarize_analyses() or {}
    except Exception:
        summary = {
            "total_articles": len(articles),
            "avg_confidence": None,
            "avg_posterior": None,
            "avg_corroboration": None
        }

    return {
        "summary": summary,
        "periods": periods,
        "sentiment_evolution": sentiment_evolution,
        "theme_evolution": theme_evolution,
        "top_themes": top_themes
    }


def compute_metrics(days: int = 30) -> Dict[str, Any]:
    """
    Convenience: charge les articles récents et renvoie compute_metrics_from_articles
    """
    articles = load_recent_analyses(days=days) or []
    # Normaliser si les articles sont des tuples/rows (selon storage manager)
    normalized = []
    for a in articles:
        if isinstance(a, dict):
            normalized.append(a)
        else:
            # si c'est une row type tuple, essaye de l'utiliser tel quel (fallback)
            try:
                normalized.append(dict(a))
            except:
                pass
    return compute_metrics_from_articles(normalized, days=days)

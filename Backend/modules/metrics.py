# rss_aggregator/modules/metrics.py
"""
Calcul des métriques et évolutions (sentiment, thèmes).
S'appuie sur load_recent_analyses() et summarize_analyses() de modules.storage_manager.
"""

from typing import List, Dict, Any
import datetime
from collections import defaultdict, Counter

from modules.storage_manager import load_recent_analyses, summarize_analyses


def _normalize_date(dt):
    if not dt:
        return None
    if isinstance(dt, str):
        return dt[:10]
    try:
        return dt.date().isoformat()
    except Exception:
        return str(dt)[:10]


def prepare_date_buckets(days: int = 30):
    today = datetime.date.today()
    return [(today - datetime.timedelta(days=i)).isoformat() for i in reversed(range(days))]


def compute_metrics_from_articles(articles: List[Dict[str, Any]], days: int = 30) -> Dict[str, Any]:
    periods = prepare_date_buckets(days)
    sentiment_buckets = {d: {"positive": 0, "neutral": 0, "negative": 0} for d in periods}
    theme_buckets = {d: defaultdict(int) for d in periods}
    top_theme_counter = Counter()

    for a in articles:
        date = a.get("date") or a.get("pubDate") or a.get("published")
        date_key = _normalize_date(date)
        if not date_key or date_key not in sentiment_buckets:
            continue

        # sentiment detection (tolerant)
        sentiment = None
        for k in ("sentiment", "tone", "sentiment_label"):
            if a.get(k) is not None:
                sentiment = a.get(k)
                break

        if isinstance(sentiment, (int, float)):
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
            bucket = "neutral"

        sentiment_buckets[date_key][bucket] += 1

        # themes extraction
        themes = None
        for tk in ("themes", "detected_themes", "topics", "theme"):
            if a.get(tk):
                themes = a.get(tk)
                break
        if not themes and isinstance(a.get("raw"), dict) and a["raw"].get("themes"):
            themes = a["raw"].get("themes")

        theme_list = []
        if isinstance(themes, list):
            theme_list = themes
        elif isinstance(themes, dict):
            if "names" in themes and isinstance(themes["names"], list):
                theme_list = themes["names"]
            else:
                theme_list = list(themes.keys())
        elif isinstance(themes, str):
            theme_list = [themes]

        for t in theme_list:
            if not t:
                continue
            tn = str(t).strip()
            theme_buckets[date_key][tn] += 1
            top_theme_counter[tn] += 1

    sentiment_evolution = []
    theme_evolution = []
    for d in periods:
        s = sentiment_buckets.get(d, {"positive": 0, "neutral": 0, "negative": 0})
        sentiment_evolution.append({"date": d, "positive": s.get("positive", 0), "neutral": s.get("neutral", 0), "negative": s.get("negative", 0)})
        theme_evolution.append({"date": d, "themeCounts": dict(theme_buckets.get(d, {}))})

    top_themes = [{"name": k, "total": v} for k, v in top_theme_counter.most_common(30)]

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
    articles = load_recent_analyses(days=days) or []
    normalized = []
    for a in articles:
        if isinstance(a, dict):
            normalized.append(a)
        else:
            try:
                normalized.append(dict(a))
            except Exception:
                pass
    return compute_metrics_from_articles(normalized, days=days)

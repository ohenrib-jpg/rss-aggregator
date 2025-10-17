from typing import List, Dict
from rapidfuzz import fuzz, process


def similarity(a: str, b: str) -> float:
    """
    Calcule une similarité textuelle entre deux chaînes.
    """
    if not a or not b:
        return 0.0
    return fuzz.token_sort_ratio(a, b) / 100.0


def find_corroborations(article: Dict, recent_articles: List[Dict], threshold: float = 0.65) -> List[Dict]:
    """
    Recherche d'autres articles récents présentant une similarité suffisante
    (titre, résumé, source).
    """
    corroborations = []
    a_title = article.get("title", "")
    a_summary = article.get("summary", "")
    a_source = article.get("source", "")

    for candidate in recent_articles:
        b_title = candidate.get("title", "")
        b_summary = candidate.get("summary", "")
        b_source = candidate.get("source", "")

        score_title = similarity(a_title, b_title)
        score_summary = similarity(a_summary, b_summary)
        score_source = 1.0 if a_source == b_source else 0.0

        avg_score = (score_title * 0.6 + score_summary * 0.3 + score_source * 0.1)

        if avg_score >= threshold:
            corroborations.append({
                "id": candidate.get("id"),
                "title": b_title,
                "source": b_source,
                "similarity": round(avg_score, 3)
            })

    return corroborations
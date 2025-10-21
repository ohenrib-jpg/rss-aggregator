from typing import List, Dict, Optional
from rapidfuzz import fuzz
import logging
import re

logger = logging.getLogger("rss-aggregator.corroboration")
logger.setLevel(logging.INFO)  # niveau visible par défaut


def _normalize_text(s: Optional[str]) -> str:
    """Nettoyage léger : None -> '', minuscules, collapse whitespace, strip punctuation group ends."""
    if not s:
        return ""
    if not isinstance(s, str):
        s = str(s)
    s = s.strip().lower()
    # collapse whitespace
    s = re.sub(r"\s+", " ", s)
    return s


def similarity(a: str, b: str) -> float:
    """
    Calcule une similarité textuelle entre deux chaînes.
    Renvoie un flottant entre 0.0 et 1.0.
    """
    a_n = _normalize_text(a)
    b_n = _normalize_text(b)
    if not a_n or not b_n:
        return 0.0
    try:
        # token_sort_ratio is robust aux ordres différents ; retourne 0..100
        return fuzz.token_sort_ratio(a_n, b_n) / 100.0
    except Exception as e:
        logger.exception("similarity error: %s", e)
        return 0.0


def find_corroborations(article: Dict, recent_articles: List[Dict], threshold: float = 0.65, top_n: int = 10) -> List[Dict]:
    """
    Recherche d'articles récents présentant une similarité suffisante.
    Retourne une liste d'objets { id, title, source, similarity } (0..1).
    """
    corroborations = []

    a_id = article.get("id")
    a_title = article.get("title", "")
    a_summary = article.get("summary") or article.get("content") or ""
    a_source = article.get("source") or ""

    logger.info("Corroboration: recherche pour article id=%s title=\"%s\" (recent_articles=%d, threshold=%.2f)",
                a_id, (a_title[:80] + '...') if len(a_title) > 80 else a_title, len(recent_articles), threshold)

    for candidate in recent_articles:
        # éviter comparer l'article avec lui-même
        if a_id is not None and candidate.get("id") == a_id:
            continue

        b_title = candidate.get("title", "")
        b_summary = candidate.get("summary") or candidate.get("content") or ""
        b_source = candidate.get("source") or ""

        score_title = similarity(a_title, b_title)
        score_summary = similarity(a_summary, b_summary)
        score_source = 1.0 if a_source and (a_source == b_source) else 0.0

        # pondération (titre plus important que résumé)
        avg_score = (score_title * 0.6) + (score_summary * 0.3) + (score_source * 0.1)

        if avg_score >= threshold:
            corroborations.append({
                "id": candidate.get("id"),
                "title": b_title,
                "source": b_source,
                "similarity": round(avg_score, 4)
            })

    # trier par similarité décroissante et limiter top_n
    corroborations.sort(key=lambda x: x.get("similarity", 0), reverse=True)
    if top_n:
        corroborations = corroborations[:top_n]

    logger.info("Corroboration: trouvé %d corroboration(s) pour article id=%s (top similarity=%s)",
                len(corroborations), a_id, (corroborations[0]['similarity'] if corroborations else 0.0))
    logger.debug("Corroborations detail: %s", corroborations)
    return corroborations
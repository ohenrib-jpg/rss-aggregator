"""
Module de corroboration principal utilisé par le backend.
Version adaptée pour environnements contraints (Render free : 0.1 CPU, 1GB).
- préfiltrage strict des candidats avant encodage
- taille de batch configurable via CORROBORATION_BATCH_SIZE (par défaut conservateur)
- nombre maximal de candidats configurable via CORROBORATION_MAX_CANDIDATES
"""
from typing import List, Dict, Optional
import logging
import re
import os
import numpy as np

logger = logging.getLogger("rss-aggregator.corroboration")
logger.setLevel(logging.INFO)

# Import opt-in heavy deps ; si indisponibles on retombe sur rapidfuzz/TF-IDF fallback
try:
    from sentence_transformers import SentenceTransformer
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    HEAVY_AVAILABLE = True
except Exception as e:
    HEAVY_AVAILABLE = False
    logger.info("Libs lourdes non disponibles (%s). Le module utilisera rapidfuzz/TF-IDF fallback.", e)

# rapidfuzz fallback for short-text fuzzy matching
try:
    from rapidfuzz import fuzz
    HAVE_RAPIDFUZZ = True
except Exception:
    HAVE_RAPIDFUZZ = False

def _normalize_text(s: Optional[str]) -> str:
    if not s:
        return ""
    if not isinstance(s, str):
        s = str(s)
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s

def similarity(a: str, b: str) -> float:
    """
    Fallback similarity simple (0..1). Utilise rapidfuzz si disponible.
    """
    a_n = _normalize_text(a)
    b_n = _normalize_text(b)
    if not a_n or not b_n:
        return 0.0
    if HAVE_RAPIDFUZZ:
        try:
            return fuzz.token_sort_ratio(a_n, b_n) / 100.0
        except Exception as e:
            logger.debug("rapidfuzz error: %s", e)
            return 0.0
    # fallback trivial
    return 1.0 if a_n == b_n else 0.0

class CorroborationEngine:
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        self.model_name = model_name
        if HEAVY_AVAILABLE:
            try:
                self.sentence_model = SentenceTransformer(model_name)
                logger.info("SentenceTransformer chargé dans corroboration: %s", model_name)
            except Exception as e:
                logger.warning("Impossible de charger SentenceTransformer: %s", e)
                self.sentence_model = None
            self.tfidf = TfidfVectorizer(max_features=4000, stop_words='french', ngram_range=(1,2))
        else:
            self.sentence_model = None
            self.tfidf = None

        # Config runtime via env
        # Par défaut conservateur pour Render free-tier
        self.default_batch_size = int(os.getenv("CORROBORATION_BATCH_SIZE", "8"))
        self.max_candidates = int(os.getenv("CORROBORATION_MAX_CANDIDATES", "25"))
        # fenêtre temporelle (jours) pour préfiltrage ; réduit nombre de candidats
        self.window_days = int(os.getenv("CORROBORATION_WINDOW_DAYS", "3"))

        logger.info("CorroborationEngine config: batch=%d, max_candidates=%d, window_days=%d",
                    self.default_batch_size, self.max_candidates, self.window_days)

    def _texts(self, article, candidates):
        target = (article.get("title","") or "") + " " + (article.get("summary") or article.get("content") or "")
        texts = [(c.get("title","") or "") + " " + (c.get("summary") or c.get("content") or "") for c in candidates]
        return target, texts

    def semantic_scores(self, target_text: str, candidates_texts: List[str], batch_size: Optional[int] = None) -> List[float]:
        bs = int(batch_size) if batch_size else self.default_batch_size

        if self.sentence_model:
            try:
                embeddings = self.sentence_model.encode([target_text] + candidates_texts,
                                                       batch_size=bs,
                                                       show_progress_bar=False,
                                                       convert_to_numpy=True)
                sims = cosine_similarity([embeddings[0]], embeddings[1:])[0]
                return sims.tolist()
            except Exception as e:
                logger.warning("Erreur encode embeddings (fallback TF-IDF) : %s", e)
                # fallback to TF-IDF below

        if self.tfidf:
            try:
                mat = self.tfidf.fit_transform([target_text] + candidates_texts)
                sims = cosine_similarity(mat[0], mat[1:])[0]
                return sims.tolist()
            except Exception as e:
                logger.debug("TF-IDF vectorization failed: %s", e)
                return [0.0] * len(candidates_texts)

        # fallback: use fuzzy similarity on titles as proxy
        return [similarity(target_text, t) for t in candidates_texts]

    def compute_structural_similarity(self, a: Dict, b: Dict) -> float:
        scores = []
        source_a = a.get("source") or a.get("feed") or ""
        source_b = b.get("source") or b.get("feed") or ""
        if source_a and source_b:
            scores.append((1.0 if source_a == source_b else 0.0) * 0.2)

        themes_a = set(a.get("themes") or [])
        themes_b = set(b.get("themes") or [])
        if themes_a and themes_b:
            union = themes_a.union(themes_b)
            if union:
                jaccard = len(themes_a.intersection(themes_b)) / len(union)
                scores.append(jaccard * 0.5)

        # date similarity only if datetimes present
        date_a = a.get("date") or a.get("pubDate")
        date_b = b.get("date") or b.get("pubDate")
        if date_a and date_b:
            try:
                delta = abs((date_a - date_b).total_seconds())
                scores.append(np.exp(-delta / (24*3600)) * 0.3)
            except Exception:
                pass

        return float(sum(scores) / len(scores)) if scores else 0.0

    def _prefilter_candidates(self, article: Dict, recent_articles: List[Dict]) -> List[Dict]:
        """
        Préfiltrage pour réduire le nombre de candidats à encoder.
        Stratégie (conservative pour environnements limités) :
         1) garder d'abord les flux identiques (même source)
         2) ajouter les articles récents (window_days)
         3) si encore insuffisant, compléter par similarité fuzzy sur titres
        """
        if not recent_articles:
            return []

        max_cand = max(5, self.max_candidates)  # tolérance minimale
        target_source = article.get("source") or article.get("feed") or ""
        candidates_same_source = []
        candidates_recent = []
        candidates_other = []

        # classify
        for c in recent_articles:
            if article.get("id") is not None and c.get("id") == article.get("id"):
                continue
            src = c.get("source") or c.get("feed") or ""
            if target_source and src and src == target_source:
                candidates_same_source.append(c)
                continue

            # date filter
            date = c.get("date") or c.get("pubDate")
            if date and article.get("date"):
                try:
                    dt_diff_days = abs((article.get("date") - date).days)
                    if dt_diff_days <= self.window_days:
                        candidates_recent.append(c)
                        continue
                except Exception:
                    pass

            candidates_other.append(c)

        selected = []
        # priority 1: same source
        selected.extend(candidates_same_source[:max_cand])

        if len(selected) < max_cand:
            # add recent
            needed = max_cand - len(selected)
            selected.extend(candidates_recent[:needed])

        if len(selected) < max_cand:
            # fill by fuzzy similarity on title (cheap)
            needed = max_cand - len(selected)
            target_title = article.get("title","") or ""
            scored = []
            for c in candidates_other:
                score = similarity(target_title, c.get("title",""))
                scored.append((score, c))
            scored.sort(key=lambda x: x[0], reverse=True)
            selected.extend([c for _, c in scored[:needed]])

        logger.debug("Prefilter: %d -> %d candidates (same_source=%d, recent=%d, other_used=%d)",
                     len(recent_articles), len(selected), len(candidates_same_source), len(candidates_recent),
                     max(0, len(selected) - len(candidates_same_source) - len(candidates_recent)))
        return selected

    def find_corroborations(self, article: Dict, recent_articles: List[Dict], threshold: float = 0.65, top_n: int = 10, batch_size: Optional[int] = None) -> List[Dict]:
        """
        Recherche d'articles corroborants.
        - préfiltre strict avant encodage pour protéger la mémoire/CPU
        - batch_size configurable via param ou env
        """
        if not recent_articles:
            return []

        # Préfiltrage pour réduire coût
        candidates = self._prefilter_candidates(article, recent_articles)

        target_text, candidates_texts = self._texts(article, candidates)
        sem_scores = self.semantic_scores(target_text, candidates_texts, batch_size=batch_size)

        results = []
        for idx, candidate in enumerate(candidates):
            semantic_sim = float(sem_scores[idx]) if idx < len(sem_scores) else 0.0
            structural_sim = self.compute_structural_similarity(article, candidate)
            total_sim = (semantic_sim * 0.7) + (structural_sim * 0.3)

            if total_sim >= threshold:
                results.append({
                    "id": candidate.get("id"),
                    "title": candidate.get("title"),
                    "source": candidate.get("source") or candidate.get("feed"),
                    "similarity": round(total_sim, 4)
                })

        results.sort(key=lambda x: x.get("similarity", 0), reverse=True)
        if top_n:
            results = results[:top_n]
        return results

# module-level convenience API matching the previous interface
_engine = CorroborationEngine()

def find_corroborations(article: Dict, recent_articles: List[Dict], threshold: float = 0.65, top_n: int = 10, batch_size: Optional[int] = None) -> List[Dict]:
    """
    Appel utilisé par le reste de l'application.
    batch_size peut être passé (ou défini via CORROBORATION_BATCH_SIZE env var).
    """
    try:
        return _engine.find_corroborations(article, recent_articles, threshold=threshold, top_n=top_n, batch_size=batch_size)
    except Exception as e:
        logger.exception("Erreur find_corroborations: %s", e)
        # fallback simple scan using fuzzy similarity
        fallback = []
        for candidate in recent_articles:
            if article.get("id") and candidate.get("id") == article.get("id"):
                continue
            score = 0.0
            try:
                score = (similarity(article.get("title",""), candidate.get("title","")) * 0.6 +
                         similarity(article.get("summary") or "", candidate.get("summary") or "") * 0.3)
            except Exception:
                score = 0.0
            if score >= threshold:
                fallback.append({"id": candidate.get("id"), "title": candidate.get("title"), "source": candidate.get("source"), "similarity": round(score, 4)})
        fallback.sort(key=lambda x: x.get("similarity", 0), reverse=True)
        return fallback[:top_n]
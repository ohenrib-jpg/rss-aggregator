"""
corroboration.py
~~~~~~~~~~~~~~~~
Module de corroboration principal (backend).

Adapté pour les environnements contraints (Render free‑tier, CPUs limitées) :
  • Pré‑filtrage strict des candidats avant encodage.
  • Taille de batch configurable via env : CORROBORATION_BATCH_SIZE (défaut = 8).
  • Nombre max de candidats configurable : CORROBORATION_MAX_CANDIDATES (défaut = 25).
  • Fenêtre temporelle (jours) configurable : CORROBORATION_WINDOW_DAYS (défaut = 3).

Le code fonctionne même si :
  • `sentence‑transformers` ou `scikit‑learn` sont absents.
  • `numpy` n’est pas installé (fallback math.exp).

Auteur : 2025‑GEOPOLIS
"""

from __future__ import annotations

import logging
import os
import re
import math
import difflib
from typing import List, Dict, Optional, Tuple, TYPE_CHECKING, Any

# ----------------------------------------------------------------------
#  Type‑checking only imports (not executed at runtime)
# ----------------------------------------------------------------------
if TYPE_CHECKING:
    from datetime import datetime

# ----------------------------------------------------------------------
#  Runtime datetime import – we use the module, not the class name
# ----------------------------------------------------------------------
import datetime as dt_module

# ----------------------------------------------------------------------
#  Logging
# ----------------------------------------------------------------------
logger = logging.getLogger("rss_aggregator.corroboration")
logger.setLevel(logging.INFO)

# ----------------------------------------------------------------------
#  Helper – lazy import of optional heavy libs
# ----------------------------------------------------------------------
def _lazy_import_from(mod_path: str, name: str):
    """
    Import a specific attribute from *mod_path*.
    Return the attribute or ``None`` if the module cannot be imported.
    """
    try:
        mod = __import__(mod_path, fromlist=[name])
        return getattr(mod, name)
    except (ImportError, AttributeError):
        return None


# ----------------------------------------------------------------------
#  Light‑weight similarity (fallback)
# ----------------------------------------------------------------------
HAVE_RAPIDFUZZ = False
try:
    from rapidfuzz import fuzz as _rf_fuzz
    HAVE_RAPIDFUZZ = True
except Exception:
    _rf_fuzz = None


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
    Simple similarity (0..1).  Uses ``rapidfuzz`` if available,
    otherwise falls back to ``difflib.SequenceMatcher``.
    """
    a_n = _normalize_text(a)
    b_n = _normalize_text(b)
    if not a_n or not b_n:
        return 0.0

    if HAVE_RAPIDFUZZ:
        try:
            return _rf_fuzz.token_sort_ratio(a_n, b_n) / 100.0
        except Exception:
            pass

    return difflib.SequenceMatcher(None, a_n, b_n).ratio()


# ----------------------------------------------------------------------
#  Optional heavy libs (lazy import)
# ----------------------------------------------------------------------
SentenceTransformer = None
TfidfVectorizer = None
CosineSimilarity = None

_sentence_transformers = _lazy_import_from("sentence_transformers", "SentenceTransformer")
_sklearn_text = _lazy_import_from("sklearn.feature_extraction.text", "TfidfVectorizer")
_sklearn_pairwise = _lazy_import_from("sklearn.metrics.pairwise", "cosine_similarity")

if _sentence_transformers:
    SentenceTransformer = _sentence_transformers
if _sklearn_text:
    TfidfVectorizer = _sklearn_text
if _sklearn_pairwise:
    CosineSimilarity = _sklearn_pairwise


# ----------------------------------------------------------------------
#  Date handling – we work with the *module* (dt_module) at runtime
# ----------------------------------------------------------------------
def _to_datetime(value) -> Optional[Any]:
    """
    Convert *value* to a timezone‑aware ``datetime`` (or ``None``).
    Accepts ISO‑8601 strings, ``datetime`` objects or common RSS date formats.
    """
    if value is None:
        return None
    if isinstance(value, dt_module.datetime):
        # Ensure UTC if it has no tzinfo – best effort
        if value.tzinfo is None:
            return value.replace(tzinfo=dt_module.timezone.utc)
        return value
    if isinstance(value, str):
        # Common ISO‑8601 with trailing Z
        try:
            dt_val = dt_module.datetime.fromisoformat(value.replace("Z", "+00:00"))
            if dt_val.tzinfo is None:
                dt_val = dt_val.replace(tzinfo=dt_module.timezone.utc)
            return dt_val
        except Exception:
            # try fallback formats
            for fmt in (
                "%a, %d %b %Y %H:%M:%S %z",
                "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%d %H:%M:%S",
            ):
                try:
                    return dt_module.datetime.strptime(value, fmt)
                except Exception:
                    continue
    return None


# ----------------------------------------------------------------------
#  Core engine
# ----------------------------------------------------------------------
class CorroborationEngine:
    """
    Engine that finds articles corroborating a given article.

    Parameters
    ----------
    model_name : str, optional
        Name of the sentence‑transformer model to load (default = ``all-MiniLM-L6-v2``).
        If the model cannot be loaded the engine will silently fall back to
        TF‑IDF / fuzzy similarity.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.sentence_model = None   # lazy
        self.tfidf = None            # lazy

        # ---- configuration via environment variables ----------
        self.default_batch_size = int(os.getenv("CORROBORATION_BATCH_SIZE", "8"))
        self.max_candidates = int(os.getenv("CORROBORATION_MAX_CANDIDATES", "25"))
        self.window_days = int(os.getenv("CORROBORATION_WINDOW_DAYS", "3"))

        logger.info(
            "CorroborationEngine config: batch=%d, max_candidates=%d, window_days=%d",
            self.default_batch_size,
            self.max_candidates,
            self.window_days,
        )

    # --------------------------------------------------------------
    #  Lazy getters for heavy libs
    # --------------------------------------------------------------
    def _get_sentence_model(self) -> Optional[Any]:
        if self.sentence_model is not None:
            return self.sentence_model

        if SentenceTransformer is None:
            return None
        try:
            self.sentence_model = SentenceTransformer(self.model_name)
            logger.info("SentenceTransformer loaded: %s", self.model_name)
        except Exception as e:
            logger.warning("Failed to load SentenceTransformer: %s", e)
            self.sentence_model = None
        return self.sentence_model

    def _get_tfidf(self) -> Optional[Any]:
        if self.tfidf is not None:
            return self.tfidf

        if TfidfVectorizer is None:
            return None
        try:
            self.tfidf = TfidfVectorizer(
                max_features=4000,
                stop_words="french",
                ngram_range=(1, 2),
            )
        except Exception as e:
            logger.debug("TF‑IDF initialisation failed: %s", e)
            self.tfidf = None
        return self.tfidf

    # --------------------------------------------------------------
    #  Core similarity methods
    # --------------------------------------------------------------
    def _texts(self, article: Dict, candidates: List[Dict]) -> Tuple[str, List[str]]:
        """
        Build a *target* string (title+summary) and a list of *candidate*
        strings.
        """
        target = (article.get("title", "") or "") + " " + (article.get("summary") or article.get("content") or "")
        cand_texts = [
            (c.get("title", "") or "") + " " + (c.get("summary") or c.get("content") or "")
            for c in candidates
        ]
        return target, cand_texts

    def semantic_scores(
        self,
        target_text: str,
        candidates_texts: List[str],
        batch_size: Optional[int] = None,
    ) -> List[float]:
        """
        Return a list of similarity scores (0..1) between *target_text*
        and each candidate string.

        The method tries, in order:
        1. Sentence‑transformer embeddings (if available).
        2. TF‑IDF + cosine similarity (if scikit‑learn is present).
        3. Fallback: fuzzy / sequence‑match similarity on the whole strings.
        """
        bs = int(batch_size) if batch_size else self.default_batch_size

        # ---- 1️⃣  Sentence‑Transformer embeddings -----------------
        sent_model = self._get_sentence_model()
        if sent_model and CosineSimilarity:
            try:
                embeddings = sent_model.encode(
                    [target_text] + candidates_texts,
                    batch_size=bs,
                    show_progress_bar=False,
                    convert_to_numpy=True,
                )
                sims = CosineSimilarity([embeddings[0]], embeddings[1:])[0]
                return sims.tolist()
            except Exception as e:
                logger.warning(
                    "Sentence‑Transformer embeddings error (fallback TF‑IDF): %s",
                    e,
                )

        # ---- 2️⃣  TF‑IDF + cosine similarity -----------------------
        tfidf = self._get_tfidf()
        if tfidf and CosineSimilarity:
            try:
                mat = tfidf.fit_transform([target_text] + candidates_texts)
                sims = CosineSimilarity(mat[0], mat[1:])[0]
                return sims.tolist()
            except Exception as e:
                logger.debug("TF‑IDF vectorisation failed: %s", e)

        # ---- 3️⃣  Fallback (fuzzy / sequence matcher) -------------
        return [similarity(target_text, cand) for cand in candidates_texts]

    def compute_structural_similarity(self, a: Dict, b: Dict) -> float:
        """
        Compute a structural similarity score based on source, shared
        themes, and temporal proximity.
        Returns a float in 0..1.
        """
        scores = []

        # ---- source ----------------------------------------------------
        src_a = a.get("source") or a.get("feed") or ""
        src_b = b.get("source") or b.get("feed") or ""
        if src_a and src_b:
            scores.append((1.0 if src_a == src_b else 0.0) * 0.2)

        # ---- theme Jaccard --------------------------------------------
        themes_a = set(a.get("themes") or [])
        themes_b = set(b.get("themes") or [])
        if themes_a and themes_b:
            union = themes_a | themes_b
            if union:
                jaccard = len(themes_a & themes_b) / len(union)
                scores.append(jaccard * 0.5)

        # ---- temporal proximity ----------------------------------------
        da = _to_datetime(a.get("date") or a.get("pubDate"))
        db = _to_datetime(b.get("date") or b.get("pubDate"))
        if da and db:
            delta_seconds = abs((da - db).total_seconds())
            scores.append(math.exp(-delta_seconds / (24 * 3600)) * 0.3)

        return float(sum(scores) / len(scores)) if scores else 0.0

    # --------------------------------------------------------------
    #  Candidate pre‑filtering (cheap, reduces the amount of work)
    # --------------------------------------------------------------
    def _prefilter_candidates(self, article: Dict, recent_articles: List[Dict]) -> List[Dict]:
        """
        Very cheap pre‑filtering step to keep the number of candidates
        manageable in limited‑CPU environments.

        Strategy (conservative):
          1️⃣ Keep articles from the *same source* (same feed) first.
          2️⃣ Add recent articles (within ``window_days``).
          3️⃣ If still not enough, fill the rest with cheap fuzzy similarity
             on titles.
        """
        if not recent_articles:
            return []

        max_cand = max(5, self.max_candidates)  # minimal safety margin
        target_source = article.get("source") or article.get("feed") or ""

        same_source = []
        recent = []
        other = []

        aid = article.get("id")
        for c in recent_articles:
            if aid is not None and c.get("id") == aid:
                continue

            src = c.get("source") or c.get("feed") or ""
            if target_source and src and src == target_source:
                same_source.append(c)
                continue

            # date filter
            dc = _to_datetime(c.get("date") or c.get("pubDate"))
            da = _to_datetime(article.get("date") or article.get("pubDate"))
            if dc and da:
                try:
                    diff_days = abs((da - dc).days)
                    if diff_days <= self.window_days:
                        recent.append(c)
                        continue
                except Exception:
                    pass

            other.append(c)

        selected = []
        # priority 1: same source
        selected.extend(same_source[:max_cand])

        # priority 2: recent
        needed = max_cand - len(selected)
        if needed > 0:
            selected.extend(recent[:needed])

        # priority 3: fill by cheap fuzzy similarity on titles
        needed = max_cand - len(selected)
        if needed > 0:
            target_title = article.get("title", "") or ""
            scored = []
            for c in other:
                score = similarity(target_title, c.get("title", ""))
                scored.append((score, c))
            scored.sort(key=lambda x: x[0], reverse=True)
            selected.extend([c for _, c in scored[:needed]])

        logger.debug(
            "Prefilter: %d -> %d candidates (same_source=%d, recent=%d, other_used=%d)",
            len(recent_articles),
            len(selected),
            len(same_source),
            len(recent),
            max(0, len(selected) - len(same_source) - len(recent)),
        )
        return selected

    # --------------------------------------------------------------
    #  Public API
    # --------------------------------------------------------------
    def find_corroborations(
        self,
        article: Dict,
        recent_articles: List[Dict],
        threshold: float = 0.65,
        top_n: int = 10,
        batch_size: Optional[int] = None,
    ) -> List[Dict]:
        """
        Main entry point – returns a list of corroborating articles.

        Parameters
        ----------
        article : dict
            Article for which we look for corroboration.
        recent_articles : list[dict]
            Candidate pool (preferably limited to recent items).
        threshold : float, optional
            Minimal similarity score to accept a match (default = 0.65).
        top_n : int, optional
            Return at most *top_n* matches (default = 10).
        batch_size : int, optional
            Override the default batch size used when encoding embeddings.

        Returns
        -------
        list[dict]
            Each entry contains ``id``, ``title``, ``source`` and a
            ``similarity`` score (rounded to 4 decimals).
        """
        if not recent_articles:
            return []

        # ---- cheap pre‑filtering ------------------------------------
        candidates = self._prefilter_candidates(article, recent_articles)

        # ---- semantic scores -----------------------------------------
        target_text, candidates_texts = self._texts(article, candidates)
        sem_scores = self.semantic_scores(target_text, candidates_texts, batch_size=batch_size)

        # ---- combine with structural similarity -----------------------
        results = []
        for idx, cand in enumerate(candidates):
            semantic_sim = float(sem_scores[idx]) if idx < len(sem_scores) else 0.0
            structural_sim = self.compute_structural_similarity(article, cand)
            total_sim = (semantic_sim * 0.7) + (structural_sim * 0.3)

            if total_sim >= threshold:
                results.append(
                    {
                        "id": cand.get("id"),
                        "title": cand.get("title"),
                        "source": cand.get("source") or cand.get("feed"),
                        "similarity": round(total_sim, 4),
                    }
                )

        # ---- sort & trim --------------------------------------------
        results.sort(key=lambda x: x.get("similarity", 0), reverse=True)
        if top_n:
            results = results[:top_n]
        return results


# ------------------------------------------------------------------------
#  Module‑level convenience API (compatible with the old interface)
# ------------------------------------------------------------------------
_engine = CorroborationEngine()


def find_corroborations(
    article: Dict,
    recent_articles: List[Dict],
    threshold: float = 0.65,
    top_n: int = 10,
    batch_size: Optional[int] = None,
) -> List[Dict]:
    """
    Wrapper used by the rest of the application.
    Accepts the same signature as the ``CorroborationEngine.find_corroborations``.
    """
    try:
        return _engine.find_corroborations(
            article,
            recent_articles,
            threshold=threshold,
            top_n=top_n,
            batch_size=batch_size,
        )
    except Exception as e:
        logger.exception("Error in find_corroborations – fallback simple scan: %s", e)
        # Very cheap fallback – only fuzzy similarity on title+summary
        fallback = []
        for cand in recent_articles:
            if article.get("id") and cand.get("id") == article.get("id"):
                continue
            score = (
                similarity(article.get("title", ""), cand.get("title", "")) * 0.6
                + similarity(article.get("summary") or "", cand.get("summary") or "") * 0.3
            )
            if score >= threshold:
                fallback.append(
                    {
                        "id": cand.get("id"),
                        "title": cand.get("title"),
                        "source": cand.get("source") or cand.get("feed"),
                        "similarity": round(score, 4),
                    }
                )


        fallback.sort(key=lambda x: x.get("similarity", 0), reverse=True)
        return fallback[:top_n]


if __name__ == "__main__":
    import sys
    import json
    import traceback

    try:
        # Lecture de l'argument JSON envoyé depuis Node.js
        raw_input = sys.argv[1] if len(sys.argv) > 1 else "{}"
        data = json.loads(raw_input)

        article = data.get("article", {})
        recent_articles = data.get("recent_articles", [])
        options = data.get("options", {})

        # Appel direct de la fonction déjà définie dans ce module
        result = find_corroborations(
            article,
            recent_articles,
            threshold=options.get("threshold", 0.65),
            top_n=options.get("top_n", 10),
            batch_size=options.get("batch_size"),
        )

        # Envoi du résultat JSON sur la sortie standard
        print(json.dumps(result))

    except Exception as e:
        traceback.print_exc()
        sys.exit(1)

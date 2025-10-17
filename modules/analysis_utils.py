import math
from typing import Dict, List


def normalize_score(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    """
    Normalise un score entre 0 et 1.
    """
    if value is None:
        return 0.0
    if max_value == min_value:
        return 0.0
    return max(min((value - min_value) / (max_value - min_value), 1.0), 0.0)


def compute_confidence_from_features(features: Dict[str, float]) -> float:
    """
    Calcule un indice de confiance global à partir de plusieurs caractéristiques pondérées.
    Exemple d'entrée : {"credibility": 0.8, "source_reliability": 0.6, "theme_relevance": 0.9}
    """
    weights = {
        "credibility": 0.5,
        "source_reliability": 0.3,
        "theme_relevance": 0.2
    }
    total = 0.0
    weight_sum = 0.0
    for k, w in weights.items():
        v = normalize_score(features.get(k, 0))
        total += v * w
        weight_sum += w
    return round(total / weight_sum, 3) if weight_sum else 0.0


def simple_bayesian_fusion(prior: float, likelihoods: List[float]) -> float:
    """
    Combine plusieurs probabilités indépendantes selon une logique bayésienne simplifiée.
    prior : probabilité initiale (0-1)
    likelihoods : liste de scores de vraisemblance (0-1)
    """
    p = prior
    for l in likelihoods:
        l = max(min(l, 1.0), 0.0)
        # Évite les divisions par zéro
        numerator = p * l
        denominator = numerator + (1 - p) * (1 - l)
        p = numerator / denominator if denominator != 0 else p
    return round(p, 4)


def explain_confidence(confidence: float) -> str:
    """
    Fournit une explication textuelle du niveau de confiance.
    """
    if confidence >= 0.85:
        return "Très fiable"
    elif confidence >= 0.65:
        return "Assez fiable"
    elif confidence >= 0.45:
        return "Modérément fiable"
    else:
        return "Faible fiabilité"


def enrich_analysis(article: Dict) -> Dict:
    """
    Applique une série de traitements pour enrichir les résultats d’analyse.
    """
    features = {
        "credibility": article.get("credibility", 0.5),
        "source_reliability": article.get("source_reliability", 0.5),
        "theme_relevance": article.get("theme_relevance", 0.5)
    }

    confidence = compute_confidence_from_features(features)
    article["confidence"] = confidence
    article["confidence_explain"] = explain_confidence(confidence)
    return article

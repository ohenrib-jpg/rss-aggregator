
import math

def clamp01(x):
    try:
        x = float(x)
    except Exception:
        return 0.0
    return max(0.0, min(1.0, x))

def normalize_linear(value, minv, maxv):
    try:
        v = float(value)
    except Exception:
        return 0.0
    if maxv <= minv:
        return 0.0
    return clamp01((v - minv) / (maxv - minv))

def logistic(x, k=1.0, x0=0.0):
    try:
        x = float(x)
    except Exception:
        x = 0.0
    return 1.0 / (1.0 + math.exp(-k*(x - x0)))

def compute_confidence_from_features(features):
    sr = clamp01(features.get('source_reliability', 0.5))
    cp = float(features.get('corroboration_count', 0) or 0)
    mp = clamp01(features.get('model_prob', 0.0) or 0.0)
    ss = clamp01(features.get('sentiment_strength', 0.0) or 0.0)
    nov = clamp01(features.get('novelty_score', 0.0) or 0.0)
    cov = clamp01(features.get('coverage', 0.0) or 0.0)

    corro_norm = clamp01(1.0 - math.exp(-cp/2.0))

    # Weights are configurable by editing this file
    w_source = 0.35
    w_corro = 0.25
    w_model = 0.20
    w_coverage = 0.10
    w_novelty = 0.05
    w_sent = 0.05

    raw = (w_source * sr +
           w_corro * corro_norm +
           w_model * mp +
           w_coverage * cov +
           w_novelty * (1.0 - nov) +
           w_sent * (1.0 - ss))

    # small calibration
    confidence = logistic((raw - 0.5) * 6.0, k=1.0, x0=0.0)
    confidence = clamp01(confidence)

    explain = {
        'raw_combination': raw,
        'source_reliability': sr,
        'corroboration_norm': corro_norm,
        'model_prob': mp,
        'coverage': cov,
        'novelty': nov,
        'sentiment_strength': ss,
        'weights': {
            'w_source': w_source, 'w_corro': w_corro, 'w_model': w_model,
            'w_coverage': w_coverage, 'w_novelty': w_novelty, 'w_sent': w_sent
        }
    }
    return confidence, explain

def simple_bayesian_fusion(prior, likelihoods):
    """Simple fusion: combine a prior belief (0..1) with independent likelihoods (list of 0..1)
    using log-odds averaging as a heuristic.
    """
    def prob_to_logodds(p):
        p = clamp01(p)
        if p == 0: return -1e6
        if p == 1: return 1e6
        return math.log(p / (1.0 - p))
    def logodds_to_prob(l):
        try:
            return clamp01(1.0 / (1.0 + math.exp(-l)))
        except OverflowError:
            return 1.0 if l>0 else 0.0

    lod = prob_to_logodds(prior)
    for lk in likelihoods:
        lod += prob_to_logodds(lk) * 0.5  # dampen each additional likelihood
    posterior = logodds_to_prob(lod/(1.0 + 0.5*len(likelihoods))) if likelihoods else clamp01(prior)
    return clamp01(posterior)

def ensure_deep_analysis_consistency(deep_analysis):
    """Normalise les clés, ajoute fields manquants et calcule confidence si possible."""
    if not isinstance(deep_analysis, dict):
        return deep_analysis or {}

    # Normalize French/English keys
    if 'score_corrigé' in deep_analysis:
        deep_analysis['score_corrected'] = deep_analysis.pop('score_corrigé')
    if 'score_corrige' in deep_analysis:
        deep_analysis['score_corrected'] = deep_analysis.pop('score_corrige')
    if 'confiance' in deep_analysis:
        deep_analysis['confidence'] = deep_analysis.pop('confiance')

    # Ensure score fields exist
    deep_analysis['score_original'] = clamp01(deep_analysis.get('score_original', 0.0))
    deep_analysis['score_corrected'] = clamp01(deep_analysis.get('score_corrected', deep_analysis.get('score_original', 0.0)))

    # Derive some feature values if missing
    src_rel = deep_analysis.get('source_reliability', None)
    if src_rel is None:
        source = deep_analysis.get('source') or deep_analysis.get('source_url') or ''
        if isinstance(source, str) and source:
            known = {
                'lemonde.fr': 0.9, 'leparisien.fr': 0.75, 'wikipedia.org': 0.85,
            }
            for k,v in known.items():
                if k in source:
                    src_rel = v; break
        if src_rel is None:
            src_rel = 0.5
    deep_analysis['source_reliability'] = clamp01(src_rel)

    # corroboration_count fallback
    deep_analysis['corroboration_count'] = int(deep_analysis.get('corroboration_count', 0) or 0)

    # model probability fallback
    deep_analysis['model_prob'] = clamp01(deep_analysis.get('model_prob', deep_analysis.get('model_probability', 0.0) or 0.0))

    deep_analysis['sentiment'] = deep_analysis.get('sentiment', {})
    deep_analysis['sentiment_strength'] = abs(deep_analysis['sentiment'].get('score', 0.0))

    deep_analysis['novelty'] = clamp01(deep_analysis.get('novelty', deep_analysis.get('novelty_score', 0.0) or 0.0))
    deep_analysis['coverage'] = clamp01(deep_analysis.get('coverage', 0.0) or 0.0)

    # If confidence absent or low-confidence default, compute it
    if not deep_analysis.get('confidence') or deep_analysis.get('confidence') < 0.01:
        features = {
            'source_reliability': deep_analysis['source_reliability'],
            'corroboration_count': deep_analysis['corroboration_count'],
            'model_prob': deep_analysis['model_prob'],
            'sentiment_strength': deep_analysis['sentiment_strength'],
            'novelty_score': deep_analysis['novelty'],
            'coverage': deep_analysis['coverage']
        }
        conf, explain = compute_confidence_from_features(features)
        deep_analysis['confidence'] = conf
        deep_analysis['confidence_explain'] = explain

    # simple bayesian fusion posterior for an extra view
    try:
        prior = deep_analysis.get('source_reliability', 0.5)
        liks = [deep_analysis.get('model_prob', 0.0), clamp01(1.0 - deep_analysis.get('novelty', 0.0)), clamp01(deep_analysis.get('corroboration_count',0)/5.0)]
        posterior = simple_bayesian_fusion(prior, liks)
        deep_analysis['bayesian_posterior'] = posterior
    except Exception:
        deep_analysis['bayesian_posterior'] = deep_analysis.get('confidence', 0.0)

    return deep_analysis

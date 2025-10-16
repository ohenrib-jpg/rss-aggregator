from rapidfuzz import fuzz, process
from collections import defaultdict

def jaccard_tokens(a, b):
    a_tokens = set(str(a).lower().split())
    b_tokens = set(str(b).lower().split())
    if not a_tokens or not b_tokens:
        return 0.0
    inter = a_tokens.intersection(b_tokens)
    uni = a_tokens.union(b_tokens)
    return len(inter)/len(uni)

def find_corroborations(article, candidates, title_key='title', snippet_key='summary', threshold=70):
    if not article or not candidates:
        return 0, 0.0
    title = str(article.get(title_key,'') or '')
    scores = []
    for c in candidates:
        if c is article:
            continue
        ct = str(c.get(title_key,'') or '')
        if not ct:
            continue
        r = fuzz.token_set_ratio(title, ct)
        if r >= threshold:
            scores.append(r/100.0)
        else:
            j = jaccard_tokens(title, ct)
            if j > 0.5:
                scores.append(j)
    if not scores:
        return 0, 0.0
    return len(scores), sum(scores)/len(scores)

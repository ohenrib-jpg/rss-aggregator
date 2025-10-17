# Metrics module placeholder filled
def compute_basic_metrics(data):
    """Compute simple metrics from dataset"""
    return {
        'count': len(data),
        'keys': list(data[0].keys()) if data else []
    }

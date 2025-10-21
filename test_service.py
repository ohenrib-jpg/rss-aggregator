#!/usr/bin/env python3
"""Test rapide du service bayésien"""
import os
from bayesienappre import BayesianLearningSystem

def test_bayesian():
    engine = BayesianLearningSystem()
    
    # Test simple
    evidences = [
        {'type': 'credibility', 'value': 0.8, 'confidence': 0.9},
        {'type': 'source', 'value': 0.7, 'confidence': 0.8}
    ]
    
    result = engine.bayesian_fusion_multiple(evidences)
    print(f"✅ Test réussi : {result}")
    assert 'posterior' in result
    assert 'confidence' in result
    return True

if __name__ == "__main__":
    try:
        test_bayesian()
        print("✅ Tous les tests passés")
    except Exception as e:
        print(f"❌ Test échoué : {e}")
        exit(1)
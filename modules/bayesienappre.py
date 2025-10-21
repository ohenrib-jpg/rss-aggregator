#!/usr/bin/env python3
"""
Module de fusion bayésienne pour l'apprentissage adaptatif
Version simplifiée pour environnements contraints
"""
import math
from typing import Dict, List, Optional


class BayesianLearningSystem:
    """
    Système d'apprentissage bayésien pour fusion de preuves multiples.
    Utilise une approche de mise à jour bayésienne itérative.
    """
    
    def __init__(self):
        self.default_prior = 0.5  # Prior neutre par défaut
        
    def bayesian_update(self, prior: float, likelihood: float, evidence_weight: float = 1.0) -> Dict[str, float]:
        """
        Mise à jour bayésienne simple : P(H|E) = P(E|H) * P(H) / P(E)
        
        Args:
            prior: Probabilité a priori (0-1)
            likelihood: Vraisemblance de l'évidence (0-1)
            evidence_weight: Poids de confiance dans l'évidence (0-1)
            
        Returns:
            Dict avec 'posterior' et 'confidence'
        """
        # Normaliser les entrées
        prior = max(0.01, min(0.99, prior))
        likelihood = max(0.01, min(0.99, likelihood))
        evidence_weight = max(0.0, min(1.0, evidence_weight))
        
        # Calcul bayésien standard
        # P(H|E) = [P(E|H) * P(H)] / [P(E|H) * P(H) + P(E|¬H) * P(¬H)]
        likelihood_not = 1.0 - likelihood
        
        numerator = likelihood * prior
        denominator = (likelihood * prior) + (likelihood_not * (1 - prior))
        
        if denominator == 0:
            posterior = prior
        else:
            posterior = numerator / denominator
        
        # Appliquer le poids de l'évidence (interpolation)
        posterior = prior + (posterior - prior) * evidence_weight
        
        # Calculer la confiance basée sur l'écart au prior et le poids
        confidence = abs(posterior - prior) * evidence_weight
        confidence = min(0.95, max(0.1, confidence))
        
        return {
            'posterior': round(posterior, 4),
            'confidence': round(confidence, 4)
        }
    
    def bayesian_fusion_multiple(self, evidences: List[Dict]) -> Dict[str, float]:
        """
        Fusion de multiples évidences par mise à jour bayésienne séquentielle.
        
        Args:
            evidences: Liste de dict avec 'type', 'value', 'confidence'
            
        Returns:
            Dict avec 'posterior' et 'confidence' finales
        """
        if not evidences:
            return {'posterior': self.default_prior, 'confidence': 0.0}
        
        # Partir du prior par défaut
        current_posterior = self.default_prior
        cumulative_confidence = 0.0
        
        for evidence in evidences:
            value = evidence.get('value', 0.5)
            confidence = evidence.get('confidence', 0.5)
            
            # Mise à jour bayésienne
            result = self.bayesian_update(
                prior=current_posterior,
                likelihood=value,
                evidence_weight=confidence
            )
            
            current_posterior = result['posterior']
            # Accumulation de confiance (moyenne pondérée)
            cumulative_confidence += result['confidence'] * confidence
        
        # Normaliser la confiance cumulée
        if evidences:
            avg_confidence = cumulative_confidence / len(evidences)
        else:
            avg_confidence = 0.0
        
        return {
            'posterior': round(current_posterior, 4),
            'confidence': round(min(0.95, avg_confidence), 4),
            'evidence_count': len(evidences)
        }
    
    def compute_beta_params(self, posterior: float, confidence: float) -> Dict[str, float]:
        """
        Convertit posterior + confidence en paramètres Beta(alpha, beta).
        Utile pour modéliser l'incertitude.
        
        Args:
            posterior: Valeur postérieure (0-1)
            confidence: Niveau de confiance (0-1)
            
        Returns:
            Dict avec 'alpha' et 'beta'
        """
        # Pseudo-compte basé sur la confiance
        # Plus la confiance est élevée, plus les paramètres sont grands
        n = max(2, int(confidence * 100))
        
        alpha = posterior * n
        beta = (1 - posterior) * n
        
        return {
            'alpha': round(alpha, 2),
            'beta': round(beta, 2)
        }


# Instance globale pour usage direct
_bayesian_system = BayesianLearningSystem()


def bayesian_fusion(evidences: List[Dict]) -> Dict[str, float]:
    """
    API simplifiée pour fusion bayésienne.
    
    Args:
        evidences: Liste de preuves avec 'value' et 'confidence'
        
    Returns:
        Résultat de la fusion avec 'posterior' et 'confidence'
    """
    return _bayesian_system.bayesian_fusion_multiple(evidences)


if __name__ == "__main__":
    # Test du module
    print("=== Test du système bayésien ===")
    
    # Test 1: Évidence unique
    result1 = bayesian_fusion([
        {'type': 'source_reliability', 'value': 0.8, 'confidence': 0.9}
    ])
    print(f"Test 1 - Évidence unique: {result1}")
    
    # Test 2: Évidences multiples convergentes
    result2 = bayesian_fusion([
        {'type': 'credibility', 'value': 0.7, 'confidence': 0.8},
        {'type': 'corroboration', 'value': 0.75, 'confidence': 0.7},
        {'type': 'source', 'value': 0.8, 'confidence': 0.85}
    ])
    print(f"Test 2 - Évidences convergentes: {result2}")
    
    # Test 3: Évidences contradictoires
    result3 = bayesian_fusion([
        {'type': 'positive', 'value': 0.8, 'confidence': 0.6},
        {'type': 'negative', 'value': 0.3, 'confidence': 0.7}
    ])
    print(f"Test 3 - Évidences contradictoires: {result3}")
    
    print("\n✅ Tests terminés")
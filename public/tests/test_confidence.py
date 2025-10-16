import unittest
from modules.analysis_utils import (
    compute_confidence_from_features,
    simple_bayesian_fusion,
    normalize_score,
    explain_confidence
)


class TestConfidenceFunctions(unittest.TestCase):

    def test_normalize_score(self):
        self.assertEqual(normalize_score(0.5, 0, 1), 0.5)
        self.assertEqual(normalize_score(1.5, 0, 1), 1.0)
        self.assertEqual(normalize_score(-1, 0, 1), 0.0)

    def test_compute_confidence_from_features(self):
        features = {
            "credibility": 0.8,
            "source_reliability": 0.6,
            "theme_relevance": 0.9
        }
        score = compute_confidence_from_features(features)
        self.assertTrue(0 <= score <= 1)

    def test_simple_bayesian_fusion(self):
        result = simple_bayesian_fusion(0.6, [0.7, 0.8])
        self.assertTrue(0 <= result <= 1)
        self.assertGreater(result, 0.6)

    def test_explain_confidence(self):
        self.assertEqual(explain_confidence(0.9), "Très fiable")
        self.assertEqual(explain_confidence(0.7), "Assez fiable")
        self.assertEqual(explain_confidence(0.5), "Modérément fiable")
        self.assertEqual(explain_confidence(0.2), "Faible fiabilité")


if __name__ == "__main__":
    unittest.main()

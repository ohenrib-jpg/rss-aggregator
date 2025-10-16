import unittest
from analysis_utils import compute_confidence_from_features
class TestConfidence(unittest.TestCase):
    def test_high_confidence(self):
        f = {'source_reliability':1.0,'corroboration_count':5,'model_prob':0.9,'sentiment_strength':0.1,'novelty_score':0.1,'coverage':0.8}
        c, e = compute_confidence_from_features(f)
        self.assertGreater(c, 0.7)
    def test_low_confidence(self):
        f = {'source_reliability':0.1,'corroboration_count':0,'model_prob':0.2,'sentiment_strength':0.9,'novelty_score':0.9,'coverage':0.1}
        c, e = compute_confidence_from_features(f)
        self.assertLess(c, 0.4)
if __name__ == '__main__':
    unittest.main()

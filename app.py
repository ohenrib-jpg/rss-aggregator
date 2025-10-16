import os
import json
import datetime
import requests
from flask import Flask, request, jsonify, send_from_directory
from bs4 import BeautifulSoup
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus.flowables import Spacer
import matplotlib.pyplot as plt
import io
import base64
from analysis_utils import ensure_deep_analysis_consistency, compute_confidence_from_features, clamp01
from modules.storage_manager import save_analysis_batch, load_recent_analyses
from modules.corroboration import find_corroborations

app = Flask(__name__)
REPORTS_DIR = os.path.join(os.path.dirname(__file__), 'reports')
os.makedirs(REPORTS_DIR, exist_ok=True)

# Service de recherche web avancé
class AdvancedWebResearch:
    def __init__(self):
        self.trusted_sources = [
            'reuters.com', 'apnews.com', 'bbc.com', 'theguardian.com',
            'lemonde.fr', 'liberation.fr', 'figaro.fr', 'france24.com'
        ]
    
    def search_contextual_info(self, article_title, themes):
        """Recherche des informations contextuelles sur le web"""
        try:
            # Recherche sur des sources fiables
            search_terms = self.build_search_query(article_title, themes)
            contextual_data = []
            
            for source in self.trusted_sources[:2]:  # Limiter pour performance
                try:
                    data = self.search_on_source(source, search_terms)
                    if data:
                        contextual_data.append(data)
                except Exception as e:
                    print(f"❌ Erreur recherche {source}: {e}")
            
            # CORRECTION : utiliser article_title au lieu de original_title
            return self.analyze_contextual_data(contextual_data, article_title)
            
        except Exception as e:
            print(f"❌ Erreur recherche contextuelle: {e}")
            return None
    
    def build_search_query(self, title, themes):
        """Construit une requête de recherche optimisée"""
        # Extraire les entités nommées
        entities = self.extract_entities(title)
        
        # CORRECTION : gérer les thèmes comme liste de strings
        theme_keywords = ''
        if themes:
            if isinstance(themes, list):
                theme_keywords = ' OR '.join(str(t) for t in themes[:3])
            else:
                theme_keywords = str(themes)
        
        query = f"({title}) {theme_keywords}"
        if entities:
            query += f" {' '.join(entities)}"
        
        return query
    
    def extract_entities(self, text):
        """Extraction basique d'entités nommées"""
        # Patterns pour les entités géopolitiques
        patterns = {
            'pays': r'\b(France|Allemagne|États-Unis|USA|China|Chine|Russie|UK|Royaume-Uni|Ukraine|Israel|Palestine)\b',
            'organisations': r'\b(ONU|OTAN|UE|Union Européenne|UN|NATO|OMS|WHO)\b',
            'personnes': r'\b(Poutine|Zelensky|Macron|Biden|Xi|Merkel|Scholz)\b'
        }
        
        entities = []
        for category, pattern in patterns.items():
            matches = re.findall(pattern, text, re.IGNORECASE)
            entities.extend(matches)
        
        return entities
    
    def search_on_source(self, source, query):
        """Recherche sur une source spécifique (simulée pour l'instant)"""
        # Implémentation simulée - à remplacer par une vraie recherche
        return {
            'source': source,
            'title': f"Article contextuel sur {query}",
            'content': f"Informations contextuelles récupérées de {source} concernant {query}",
            'sentiment': 'neutral',
            'date': datetime.datetime.now().isoformat()
        }
    
    def analyze_contextual_data(self, contextual_data, article_title):
        """Analyse les données contextuelles pour détecter les divergences"""
        if not contextual_data:
            return None
        
        # Analyse de cohérence
        sentiment_scores = []
        key_facts = []
        
        for data in contextual_data:
            sentiment = self.analyze_sentiment(data['content'])
            sentiment_scores.append(sentiment)
            key_facts.extend(self.extract_key_facts(data['content']))
        
        avg_sentiment = sum(sentiment_scores) / len(sentiment_scores) if sentiment_scores else 0
        
        return {
            'sources_consultées': len(contextual_data),
            'sentiment_moyen': avg_sentiment,
            'faits_cles': list(set(key_facts))[:5],  # Dédupliquer et limiter
            'coherence': self.calculate_coherence(sentiment_scores),
            'recommendations': self.generate_recommendations(avg_sentiment, key_facts)
        }
    
    def analyze_sentiment(self, text):
        """Analyse de sentiment simplifiée"""
        positive_words = ['accord', 'paix', 'progrès', 'succès', 'coopération', 'dialogue']
        negative_words = ['conflit', 'crise', 'tension', 'sanction', 'violence', 'protestation']
        
        text_lower = text.lower()
        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)
        
        total = positive_count + negative_count
        if total == 0:
            return 0
        
        return (positive_count - negative_count) / total
    
    def extract_key_facts(self, text):
        """Extraction de faits clés"""
        facts = []
        
        # Patterns pour les faits importants
        fact_patterns = [
            r'accord sur\s+([^.,]+)',
            r'sanctions?\s+contre\s+([^.,]+)',
            r'crise\s+(?:au|en)\s+([^.,]+)',
            r'négociations?\s+(?:à|en)\s+([^.,]+)'
        ]
        
        for pattern in fact_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            facts.extend(matches)
        
        return facts
    
    def calculate_coherence(self, sentiment_scores):
        """Calcule la cohérence entre les sources"""
        if len(sentiment_scores) < 2:
            return 1.0
        
        variance = sum((score - sum(sentiment_scores)/len(sentiment_scores))**2 for score in sentiment_scores)
        return max(0, 1 - variance)
    
    def generate_recommendations(self, sentiment, key_facts):
        """Génère des recommandations basées sur l'analyse"""
        recommendations = []
        
        if abs(sentiment) > 0.3:
            recommendations.append("Écart sentiment détecté - vérification recommandée")
        
        if key_facts:
            recommendations.append(f"Faits contextuels identifiés: {', '.join(key_facts[:3])}")
        
        if len(recommendations) == 0:
            recommendations.append("Cohérence générale avec le contexte médiatique")
        
        return recommendations

# Analyseur IA avancé avec raisonnement
class AdvancedIAAnalyzer:
    def __init__(self):
        self.web_research = AdvancedWebResearch()
        self.analysis_framework = {
            'géopolitique': self.analyze_geopolitical_context,
            'économique': self.analyze_economic_context,
            'social': self.analyze_social_context,
            'environnement': self.analyze_environmental_context
        }
    
    def perform_deep_analysis(self, article, themes):
        """Analyse approfondie avec raisonnement"""
        print(f"🧠 Analyse approfondie: {article.get('title', '')[:50]}...")
        
        try:
            # CORRECTION : extraire les noms des thèmes
            theme_names = []
            if themes:
                if isinstance(themes, list):
                    theme_names = [t.get('name', str(t)) if isinstance(t, dict) else str(t) for t in themes]
                else:
                    theme_names = [str(themes)]
            
            # 1. Analyse contextuelle avancée
            contextual_analysis = self.analyze_advanced_context(article, theme_names)
            
            # 2. Recherche web pour vérification
            web_research = self.web_research.search_contextual_info(
                article.get('title', ''), 
                theme_names
            )
            
            # 3. Analyse thématique spécialisée
            thematic_analysis = self.analyze_thematic_context(article, theme_names)
            
            # 4. Détection de biais et vérification
            bias_analysis = self.analyze_biases(article, contextual_analysis, web_research)
            
            # 5. Synthèse et recommandations
            final_analysis = self.synthesize_analysis(
                article, 
                contextual_analysis, 
                web_research, 
                thematic_analysis, 
                bias_analysis
            )
            
            return final_analysis
            
        except Exception as e:
            print(f"❌ Erreur analyse approfondie: {e}")
            import traceback
            traceback.print_exc()
            
            # Retourner une analyse par défaut en cas d'erreur
            sentiment = article.get('sentiment', {})
            return {
                'score_original': sentiment.get('score', 0),
                'score_corrected': sentiment.get('score', 0),
                'confidence': 0.3,
                'analyse_contextuelle': {},
                'recherche_web': None,
                'analyse_thematique': {},
                'analyse_biases': {'biais_détectés': [], 'score_credibilite': 0.5},
                'recommandations_globales': ['Erreur lors de l\'analyse approfondie']
            }
    
    def analyze_advanced_context(self, article, themes):
        """Analyse contextuelle avancée"""
        title = article.get('title', '')
        content = article.get('content', '')
        full_text = f"{title} {content}"
        
        analysis = {
            'urgence': self.assess_urgency(full_text),
            'portée': self.assess_scope(full_text),
            'impact': self.assess_impact(full_text, themes),
            'nouveauté': self.assess_novelty(full_text),
            'controverses': self.detect_controversies(full_text)
        }
        
        return analysis
    
    def assess_urgency(self, text):
        """Évalue l'urgence de l'information"""
        urgent_indicators = ['urgence', 'crise', 'immédiat', 'drame', 'catastrophe', 'attaque']
        text_lower = text.lower()
        
        urgency_score = sum(1 for indicator in urgent_indicators if indicator in text_lower)
        return min(1.0, urgency_score / 3)
    
    def assess_scope(self, text):
        """Évalue la portée géographique"""
        scopes = {
            'local': ['ville', 'région', 'local', 'municipal'],
            'national': ['France', 'pays', 'national', 'gouvernement'],
            'international': ['monde', 'international', 'ONU', 'OTAN', 'UE']
        }
        
        text_lower = text.lower()
        scope_scores = {}
        
        for scope, indicators in scopes.items():
            score = sum(1 for indicator in indicators if indicator in text_lower)
            scope_scores[scope] = score
        
        return max(scope_scores, key=scope_scores.get) if scope_scores else 'local'
    
    def assess_impact(self, text, themes):
        """Évalue l'impact potentiel"""
        high_impact_indicators = [
            'crise', 'récession', 'guerre', 'sanctions', 'accord historique',
            'rupture', 'révolution', 'transition'
        ]
        
        text_lower = text.lower()
        impact_score = sum(1 for indicator in high_impact_indicators if indicator in text_lower)
        
        # Pondération par thème
        theme_weights = {
            'conflit': 1.5, 'économie': 1.3, 'diplomatie': 1.2,
            'environnement': 1.1, 'social': 1.0
        }
        
        theme_weight = 1.0
        for theme in themes:
            theme_lower = str(theme).lower() if theme else ''
            if theme_lower in theme_weights:
                theme_weight = max(theme_weight, theme_weights[theme_lower])
        
        return min(1.0, (impact_score / 5) * theme_weight)
    
    def assess_novelty(self, text):
        """Évalue la nouveauté de l'information"""
        novel_indicators = [
            'nouveau', 'premier', 'historique', 'inaugural', 'innovation',
            'révolutionnaire', 'changement', 'réforme'
        ]
        
        text_lower = text.lower()
        novelty_score = sum(1 for indicator in novel_indicators if indicator in text_lower)
        return min(1.0, novelty_score / 4)
    
    def detect_controversies(self, text):
        """Détecte les controverses potentielles"""
        controversy_indicators = [
            'polémique', 'controversé', 'débat', 'opposition', 'critique',
            'protestation', 'manifestation', 'conflit d\'intérêt'
        ]
        
        text_lower = text.lower()
        controversies = []
        
        for indicator in controversy_indicators:
            if indicator in text_lower:
                # Trouver le contexte autour de l'indicateur
                start = max(0, text_lower.find(indicator) - 50)
                end = min(len(text), text_lower.find(indicator) + len(indicator) + 50)
                context = text[start:end].strip()
                controversies.append(f"{indicator}: {context}")
        
        return controversies
    
    def analyze_thematic_context(self, article, themes):
        """Analyse contextuelle par thème"""
        thematic_analysis = {}
        
        # CORRECTION : s'assurer que themes est une liste de chaînes
        theme_list = []
        if themes:
            if isinstance(themes, list):
                theme_list = [str(t) for t in themes]
            else:
                theme_list = [str(themes)]
        
        for theme in theme_list:
            theme_lower = theme.lower() if theme else ''
            
            if theme_lower in self.analysis_framework:
                try:
                    analysis = self.analysis_framework[theme_lower](article)
                    thematic_analysis[theme] = analysis
                except Exception as e:
                    print(f"❌ Erreur analyse thème {theme}: {e}")
        
        return thematic_analysis

    def analyze_economic_context(self, article):
        """Analyse contextuelle économique"""
        text = f"{article.get('title', '')} {article.get('content', '')}"
        
        return {
            'indicateurs': self.extract_economic_indicators(text),
            'secteurs': self.identify_economic_sectors(text),
            'impact_economique': self.assess_economic_impact(text),
            'tendances': self.detect_economic_trends(text),
            'recommandations': self.generate_economic_recommendations(text)
        }

    def extract_economic_indicators(self, text):
        """Extrait les indicateurs économiques mentionnés"""
        indicators = {
            'macroéconomiques': {
                'patterns': [
                    r'PIB\s*(?:de|du|\s)([^.,;]+)',
                    r'croissance\s+économique\s+de\s+([\d,]+)%',
                    r'inflation\s+de\s+([\d,]+)%',
                    r'chômage\s+de\s+([\d,]+)%',
                    r'dette\s+publique\s+de\s+([\d,]+)',
                    r'déficit\s+budgétaire\s+de\s+([\d,]+)'
                ],
                'matches': []
            },
            'financiers': {
                'patterns': [
                    r'marchés?\s+boursiers?\s+([^.,;]+)',
                    r'indice\s+([A-Z]+)\s+([\d,]+)',
                    r'euro\s+([\d,]+)\s+dollars?',
                    r'dollar\s+([\d,]+)\s+euros?',
                    r'taux\s+directeur\s+([^.,;]+)',
                    r'banque\s+centrale\s+([^.,;]+)'
                ],
                'matches': []
            },
            'commerciaux': {
                'patterns': [
                    r'commerce\s+extérieur\s+([^.,;]+)',
                    r'exportations?\s+de\s+([\d,]+)',
                    r'importations?\s+de\s+([\d,]+)',
                    r'balance\s+commerciale\s+([^.,;]+)',
                    r'sanctions?\s+économiques\s+([^.,;]+)',
                    r'embargo\s+([^.,;]+)'
                ],
                'matches': []
            }
        }
        
        text_lower = text.lower()
        
        for category, data in indicators.items():
            for pattern in data['patterns']:
                matches = re.findall(pattern, text_lower, re.IGNORECASE)
                if matches:
                    data['matches'].extend(matches)
        
        # Nettoyer et formater les résultats
        result = {}
        for category, data in indicators.items():
            if data['matches']:
                result[category] = list(set(data['matches']))[:5]  # Limiter à 5 résultats par catégorie
        
        return result

    def identify_economic_sectors(self, text):
        """Identifie les secteurs économiques concernés"""
        sectors = {
            'énergie': ['pétrole', 'gaz', 'électricité', 'énergie', 'renouvelable', 'nucléaire', 'OPEP'],
            'finance': ['banque', 'bourse', 'finance', 'investissement', 'crédit', 'prêt', 'action'],
            'industrie': ['industrie', 'manufacturier', 'production', 'usine', 'automobile', 'aéronautique'],
            'technologie': ['technologie', 'digital', 'numérique', 'IA', 'intelligence artificielle', 'tech'],
            'agriculture': ['agriculture', 'agroalimentaire', 'cultures', 'récolte', 'ferme'],
            'transport': ['transport', 'logistique', 'aérien', 'maritime', 'routier'],
            'commerce': ['commerce', 'détail', 'distribution', 'vente', 'magasin'],
            'tourisme': ['tourisme', 'hôtellerie', 'restauration', 'voyage']
        }
        
        detected_sectors = []
        text_lower = text.lower()
        
        for sector, keywords in sectors.items():
            if any(keyword in text_lower for keyword in keywords):
                detected_sectors.append(sector)
        
        return detected_sectors

    def assess_economic_impact(self, text):
        """Évalue l'impact économique potentiel"""
        impact_indicators = {
            'fort_positif': [
                'croissance record', 'hausse historique', 'rebond économique', 
                'reprise vigoureuse', 'investissement massif', 'création d\'emplois',
                'innovation majeure', 'accord commercial', 'partenariat stratégique'
            ],
            'positif': [
                'amélioration', 'progrès', 'augmentation', 'hausse', 'expansion',
                'développement', 'investissement', 'croissance', 'emploi'
            ],
            'négatif': [
                'récession', 'crise économique', 'chute', 'baisse', 'déclin',
                'ralentissement', 'contraction', 'licenciement', 'faillite'
            ],
            'fort_négatif': [
                'effondrement', 'krach', 'dépression', 'catastrophe économique',
                'effondrement boursier', 'crise financière', 'faillite massive'
            ]
        }
        
        text_lower = text.lower()
        impact_score = 0
        
        for level, indicators in impact_indicators.items():
            weight = {
                'fort_positif': 2.0,
                'positif': 1.0,
                'négatif': -1.0,
                'fort_négatif': -2.0
            }[level]
            
            for indicator in indicators:
                if indicator in text_lower:
                    impact_score += weight
                    break  # Un indicateur par niveau suffit
        
        # Normaliser entre -1 et 1
        return max(-1, min(1, impact_score / 2))

    def detect_economic_trends(self, text):
        """Détecte les tendances économiques mentionnées"""
        trends = {
            'hausse': [],
            'baisse': [],
            'stabilité': [],
            'volatilité': []
        }
        
        trend_patterns = {
            'hausse': [
                r'hausse\s+de\s+([\d,]+)%',
                r'augmentation\s+de\s+([\d,]+)%',
                r'croissance\s+de\s+([\d,]+)%',
                r'progresser?\s+de\s+([\d,]+)%'
            ],
            'baisse': [
                r'baisse\s+de\s+([\d,]+)%',
                r'chute\s+de\s+([\d,]+)%',
                r'déclin\s+de\s+([\d,]+)%',
                r'ralentissement\s+de\s+([\d,]+)%'
            ],
            'stabilité': [
                r'stable\s+à\s+([\d,]+)',
                r'maintien\s+à\s+([\d,]+)',
                r'stabilité\s+autour\s+de\s+([\d,]+)'
            ]
        }
        
        text_lower = text.lower()
        
        for trend, patterns in trend_patterns.items():
            for pattern in patterns:
                matches = re.findall(pattern, text_lower, re.IGNORECASE)
                if matches:
                    trends[trend].extend(matches)
        
        # Détection de volatilité
        volatility_indicators = [
            'volatilité', 'fluctuation', 'instabilité', 'incertitude', 'spéculation'
        ]
        if any(indicator in text_lower for indicator in volatility_indicators):
            trends['volatilité'].append('marché volatile détecté')
        
        # Nettoyer les résultats vides
        return {k: v for k, v in trends.items() if v}

    def generate_economic_recommendations(self, text):
        """Génère des recommandations basées sur l'analyse économique"""
        recommendations = []
        
        # Analyser l'impact économique
        impact = self.assess_economic_impact(text)
        sectors = self.identify_economic_sectors(text)
        indicators = self.extract_economic_indicators(text)
        
        # Recommandations basées sur l'impact
        if impact < -0.5:
            recommendations.append("📉 IMPACT ÉCONOMIQUE NÉGATIF - Surveillance des marchés recommandée")
        elif impact > 0.5:
            recommendations.append("📈 IMPACT ÉCONOMIQUE POSITIF - Opportunités potentielles")
        
        # Recommandations basées sur les secteurs
        if 'énergie' in sectors:
            recommendations.append("⚡ SECTEUR ÉNERGÉTIQUE - Surveiller les prix des matières premières")
        
        if 'finance' in sectors:
            recommendations.append("💹 SECTEUR FINANCIER - Analyser l'impact sur les marchés")
        
        # Recommandations basées sur les indicateurs
        if any('inflation' in str(indicator).lower() for category in indicators.values() for indicator in category):
            recommendations.append("💰 INFLATION DÉTECTÉE - Impact sur le pouvoir d'achat à surveiller")
        
        if any('chômage' in str(indicator).lower() for category in indicators.values() for indicator in category):
            recommendations.append("👥 CHÔMAGE MENTIONNÉ - Impact social et économique à analyser")
        
        # Recommandation par défaut si peu d'éléments détectés
        if not recommendations and (sectors or indicators):
            recommendations.append("📊 ANALYSE ÉCONOMIQUE - Contextualiser avec les données macroéconomiques")
        
        return recommendations

    def analyze_geopolitical_context(self, article):
        """Analyse contextuelle géopolitique"""
        text = f"{article.get('title', '')} {article.get('content', '')}"
        
        return {
            'acteurs': self.extract_geopolitical_actors(text),
            'enjeux': self.extract_geopolitical_issues(text),
            'tensions': self.assess_geopolitical_tensions(text),
            'recommandations': self.generate_geopolitical_recommendations(text)
        }
    
    def extract_geopolitical_actors(self, text):
        """Extrait les acteurs géopolitiques"""
        actors = {
            'pays': re.findall(r'\b(France|Allemagne|États-Unis|USA|China|Chine|Russie|UK|Royaume-Uni|Ukraine|Israel|Palestine)\b', text, re.IGNORECASE),
            'organisations': re.findall(r'\b(ONU|OTAN|UE|Union Européenne|UN|NATO|OMS|WHO)\b', text, re.IGNORECASE),
            'dirigeants': re.findall(r'\b(Poutine|Zelensky|Macron|Biden|Xi|Merkel|Scholz)\b', text, re.IGNORECASE)
        }
        
        return {k: list(set(v)) for k, v in actors.items() if v}
    
    def extract_geopolitical_issues(self, text):
        """Extrait les enjeux géopolitiques"""
        issues = [
            'conflit territorial', 'sanctions économiques', 'crise diplomatique',
            'accord commercial', 'coopération militaire', 'tensions frontalières'
        ]
        
        detected_issues = []
        for issue in issues:
            if issue in text.lower():
                detected_issues.append(issue)
        
        return detected_issues
    
    def assess_geopolitical_tensions(self, text):
        """Évalue les tensions géopolitiques"""
        tension_indicators = ['tension', 'conflit', 'crise', 'sanction', 'menace', 'hostilité']
        text_lower = text.lower()
        
        tension_score = sum(1 for indicator in tension_indicators if indicator in text_lower)
        return min(1.0, tension_score / 5)
    
    def generate_geopolitical_recommendations(self, text):
        """Génère des recommandations géopolitiques"""
        recommendations = []
        
        if self.assess_geopolitical_tensions(text) > 0.5:
            recommendations.append("⚠️ Tensions géopolitiques élevées - surveillance recommandée")
        
        actors = self.extract_geopolitical_actors(text)
        if len(actors.get('pays', [])) >= 3:
            recommendations.append("🌍 Implication multiple de pays - analyse systémique nécessaire")
        
        return recommendations
    
    def analyze_social_context(self, article):
        """Analyse contextuelle sociale"""
        return {
            'enjeux_sociaux': [],
            'mouvements_sociaux': [],
            'recommandations': ["Analyse sociale à développer"]
        }
    
    def analyze_environmental_context(self, article):
        """Analyse contextuelle environnementale"""
        return {
            'enjeux_environnementaux': [],
            'impacts_climatiques': [],
            'recommandations': ["Analyse environnementale à développer"]
        }
    
    def analyze_biases(self, article, contextual_analysis, web_research):
        """Détecte les biais potentiels"""
        biases = []
        text = f"{article.get('title', '')} {article.get('content', '')}"
        
        # Biais de langage
        if self.detect_emotional_language(text):
            biases.append("Langage émotionnel détecté")
        
        # Biais de source
        if self.assess_source_credibility(article):
            biases.append("Source à vérifier")
        
        # Biais de contexte
        if web_research and web_research.get('coherence', 1) < 0.7:
            biases.append("Divergence avec le contexte médiatique")
        
        return {
            'biais_détectés': biases,
            'score_credibilite': self.calculate_credibility_score(biases, contextual_analysis),
            'recommandations': self.generate_bias_recommendations(biases)
        }
    
    def detect_emotional_language(self, text):
        """Détecte le langage émotionnel"""
        emotional_words = [
            'incroyable', 'choquant', 'scandaleux', 'horrible', 'magnifique',
            'exceptionnel', 'catastrophique', 'dramatique'
        ]
        
        text_lower = text.lower()
        return any(word in text_lower for word in emotional_words)
    
    def assess_source_credibility(self, article):
        """Évalue la crédibilité de la source"""
        credible_sources = ['reuters', 'associated press', 'afp', 'bbc']
        source = article.get('feed', '').lower()
        
        return not any(credible in source for credible in credible_sources)
    
    def calculate_credibility_score(self, biases, contextual_analysis):
        """Calcule un score de crédibilité"""
        base_score = 1.0
        
        # Pénalités pour les biais
        for bias in biases:
            if "Langage émotionnel" in bias:
                base_score -= 0.2
            if "Source à vérifier" in bias:
                base_score -= 0.3
            if "Divergence" in bias:
                base_score -= 0.2
        
        # Bonus pour l'urgence et l'impact (sujets importants)
        if contextual_analysis.get('urgence', 0) > 0.5:
            base_score += 0.1
        if contextual_analysis.get('impact', 0) > 0.5:
            base_score += 0.1
        
        return max(0, min(1, base_score))
    
    def generate_bias_recommendations(self, biases):
        """Génère des recommandations pour corriger les biais"""
        recommendations = []
        
        if "Langage émotionnel" in str(biases):
            recommendations.append("Recadrer avec un langage plus neutre")
        
        if "Source à vérifier" in str(biases):
            recommendations.append("Recouper avec des sources fiables")
        
        if "Divergence" in str(biases):
            recommendations.append("Contextualiser avec des informations vérifiées")
        
        return recommendations
    
    def synthesize_analysis(self, article, contextual_analysis, web_research, thematic_analysis, bias_analysis):
        """Synthétise toutes les analyses"""
        sentiment = article.get('sentiment', {})
        original_score = sentiment.get('score', 0)
        
        # Calcul du score corrigé basé sur l'analyse approfondie
        corrected_score = self.calculate_corrected_score(
            original_score, 
            contextual_analysis, 
            web_research, 
            bias_analysis
        )
        
        return {
            'score_original': original_score,
            'score_corrected': corrected_score,
            'analyse_contextuelle': contextual_analysis,
            'recherche_web': web_research,
            'analyse_thematique': thematic_analysis,
            'analyse_biases': bias_analysis,
            'confidence': bias_analysis.get('score_credibilite', 0.5),
            'recommandations_globales': self.generate_global_recommendations(
                contextual_analysis, web_research, bias_analysis
            )
        }
    
    def calculate_corrected_score(self, original_score, contextual_analysis, web_research, bias_analysis):
        """Calcule le score corrigé basé sur l'analyse approfondie"""
        correction = 0
        
        # Ajustement basé sur l'urgence
        urgency = contextual_analysis.get('urgence', 0)
        if urgency > 0.7:
            correction -= 0.1  # Les sujets urgents sont souvent plus négatifs
        
        # Ajustement basé sur les tensions
        if 'géopolitique' in contextual_analysis:
            tensions = contextual_analysis.get('tensions', 0)
            if tensions > 0.5:
                correction -= 0.15
        
        # Ajustement basé sur la recherche web
        if web_research:
            web_sentiment = web_research.get('sentiment_moyen', 0)
            correction += (web_sentiment - original_score) * 0.3
        
        # Ajustement basé sur la crédibilité
        credibility = bias_analysis.get('score_credibilite', 0.5)
        credibility_factor = credibility * 2 - 1  # Convertit 0-1 en -1 à 1
        correction *= credibility_factor
        
        corrected = original_score + correction
        return max(-1, min(1, corrected))
    
    def generate_global_recommendations(self, contextual_analysis, web_research, bias_analysis):
        """Génère des recommandations globales"""
        recommendations = []
        
        # Recommandations basées sur l'urgence
        if contextual_analysis.get('urgence', 0) > 0.7:
            recommendations.append("🚨 SUJET URGENT - Surveillance renforcée recommandée")
        
        # Recommandations basées sur la portée
        scope = contextual_analysis.get('portée', 'local')
        if scope == 'international':
            recommendations.append("🌍 PORTÉE INTERNATIONALE - Analyse géopolitique approfondie")
        
        # Recommandations basées sur la crédibilité
        credibility = bias_analysis.get('score_credibilite', 0.5)
        if credibility < 0.7:
            recommendations.append("🔍 CRÉDIBILITÉ À VÉRIFIER - Recoupement des sources nécessaire")
        
        # Recommandations basées sur la recherche web
        if web_research and web_research.get('coherence', 1) < 0.8:
            recommendations.append("📊 DIVERGENCE CONTEXTUELLE - Analyse comparative recommandée")
        
        return recommendations

# Initialiser l'analyseur IA avancé
advanced_analyzer = AdvancedIAAnalyzer()

@app.route('/correct_analysis', methods=['POST'])
def correct_analysis():
    """Endpoint pour corriger l'analyse des articles"""
    try:
        data = request.json or {}
        api_key = data.get('apiKey')
        articles = data.get('articles', [])
        current_analysis = data.get('currentAnalysis', {})
        themes = data.get('themes', [])
        
        if not api_key:
            return jsonify({'success': False, 'error': 'Clé API requise'})
        
        print(f"🧠 Correction de l'analyse pour {len(articles)} articles avec {len(themes)} thèmes")
        
        # CORRECTION : s'assurer que themes est une liste
        if themes and not isinstance(themes, list):
            themes = [themes]
        
        # Appliquer l'analyse approfondie à chaque article
        corrected_analyses = []
        for i, article in enumerate(articles):
            print(f"📝 Traitement article {i+1}/{len(articles)}: {article.get('title', '')[:50]}...")
            
            try:
                # Analyse approfondie avec raisonnement
                deep_analysis = advanced_analyzer.perform_deep_analysis(article, themes)
                
                # CORRECTION : s'assurer de la cohérence de l'analyse
                final_analysis = ensure_deep_analysis_consistency(deep_analysis, article)
                
                # Calcul de la confiance basé sur les features
                confidence = compute_confidence_from_features(final_analysis)
                final_analysis['confidence'] = clamp01(confidence)
                
                corrected_analyses.append(final_analysis)
                
                print(f"✅ Article {i+1} traité - Score: {final_analysis.get('score_corrected', 0):.2f}, Confiance: {final_analysis.get('confidence', 0):.2f}")
                
            except Exception as e:
                print(f"❌ Erreur traitement article {i+1}: {e}")
                import traceback
                traceback.print_exc()
                
                # En cas d'erreur, utiliser l'analyse de base
                sentiment = article.get('sentiment', {})
                corrected_analyses.append({
                    'score_original': sentiment.get('score', 0),
                    'score_corrected': sentiment.get('score', 0),
                    'confidence': 0.3,
                    'analyse_contextuelle': {},
                    'recherche_web': None,
                    'analyse_thematique': {},
                    'analyse_biases': {'biais_détectés': [], 'score_credibilite': 0.5},
                    'recommandations_globales': ['Erreur lors de l\'analyse approfondie']
                })
        
        # CORRECTION : sauvegarde du lot d'analyses
        try:
            save_analysis_batch(corrected_analyses, api_key, themes)
            print(f"💾 Lot d'analyses sauvegardé ({len(corrected_analyses)} articles)")
        except Exception as e:
            print(f"⚠️ Erreur sauvegarde analyses: {e}")
        
        # CORRECTION : corroboration automatique et fusion bayésienne
        try:
            print("🔄 Début de la corroboration automatique...")
            corroboration_results = []
            
            for i, (article, analysis) in enumerate(zip(articles, corrected_analyses)):
                try:
                    # Recherche de corroborations pour cet article
                    article_corroborations = find_corroborations(
                        article_title=article.get('title', ''),
                        article_content=article.get('content', ''),
                        themes=themes,
                        api_key=api_key
                    )
                    
                    if article_corroborations:
                        # Appliquer la fusion bayésienne si des corroborations trouvées
                        from modules.bayesian_fusion import apply_bayesian_fusion
                        
                        fused_analysis = apply_bayesian_fusion(
                            base_analysis=analysis,
                            corroborations=article_corroborations,
                            article_data=article
                        )
                        
                        # Mettre à jour l'analyse avec les résultats fusionnés
                        if fused_analysis:
                            corrected_analyses[i] = fused_analysis
                            print(f"✅ Fusion bayésienne appliquée pour l'article {i+1}")
                    
                    corroboration_results.append({
                        'article_index': i,
                        'corroborations_found': len(article_corroborations) if article_corroborations else 0,
                        'corroboration_details': article_corroborations
                    })
                    
                except Exception as e:
                    print(f"❌ Erreur corroboration article {i+1}: {e}")
                    import traceback
                    traceback.print_exc()
                    corroboration_results.append({
                        'article_index': i,
                        'corroborations_found': 0,
                        'error': str(e)
                    })
            
            print(f"✅ Corroboration terminée: {sum(r.get('corroborations_found', 0) for r in corroboration_results)} corroborations trouvées")
            
        except Exception as e:
            print(f"❌ Erreur globale dans la corroboration: {e}")
            import traceback
            traceback.print_exc()
            corroboration_results = []
        
        return jsonify({
            'success': True,
            'correctedAnalyses': corrected_analyses,
            'corroborationResults': corroboration_results,
            'summary': {
                'articles_traites': len(corrected_analyses),
                'analyses_corrigees': len([a for a in corrected_analyses if abs(a.get('score_corrected', 0) - a.get('score_original', 0)) > 0.1]),
                'confiance_moyenne': sum(a.get('confidence', 0) for a in corrected_analyses) / len(corrected_analyses) if corrected_analyses else 0
            }
        })
        
    except Exception as e:
        print(f"❌ Erreur endpoint correct_analysis: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/generate_report', methods=['POST'])
def generate_report():
    """Génère un rapport PDF détaillé"""
    try:
        data = request.json or {}
        analyses = data.get('analyses', [])
        themes = data.get('themes', [])
        date_range = data.get('dateRange', {})
        
        if not analyses:
            return jsonify({'success': False, 'error': 'Aucune analyse fournie'})
        
        # Créer le nom du fichier
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"rapport_analyse_{timestamp}.pdf"
        filepath = os.path.join(REPORTS_DIR, filename)
        
        # Créer le document PDF
        doc = SimpleDocTemplate(filepath, pagesize=A4)
        styles = getSampleStyleSheet()
        story = []
        
        # Titre
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=30,
            alignment=1
        )
        story.append(Paragraph("RAPPORT D'ANALYSE AVANCÉE", title_style))
        
        # Métadonnées
        meta_style = styles['Normal']
        story.append(Paragraph(f"Date de génération: {datetime.datetime.now().strftime('%d/%m/%Y %H:%M')}", meta_style))
        story.append(Paragraph(f"Nombre d'articles analysés: {len(analyses)}", meta_style))
        story.append(Paragraph(f"Thèmes: {', '.join(str(t) for t in themes)}", meta_style))
        story.append(Spacer(1, 20))
        
        # Résumé statistique
        story.append(Paragraph("RÉSUMÉ STATISTIQUE", styles['Heading2']))
        
        # Calculer les statistiques
        original_scores = [a.get('score_original', 0) for a in analyses]
        corrected_scores = [a.get('score_corrected', 0) for a in analyses]
        confidences = [a.get('confidence', 0) for a in analyses]
        
        stats_data = [
            ['Métrique', 'Valeur'],
            ['Score moyen original', f"{sum(original_scores)/len(original_scores):.3f}"],
            ['Score moyen corrigé', f"{sum(corrected_scores)/len(corrected_scores):.3f}"],
            ['Confiance moyenne', f"{sum(confidences)/len(confidences):.3f}"],
            ['Corrections significatives', f"{sum(1 for o,c in zip(original_scores, corrected_scores) if abs(o-c) > 0.1)}/{len(analyses)}"]
        ]
        
        stats_table = Table(stats_data, colWidths=[200, 100])
        stats_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(stats_table)
        story.append(Spacer(1, 20))
        
        # Détails par article
        story.append(Paragraph("DÉTAILS PAR ARTICLE", styles['Heading2']))
        
        for i, analysis in enumerate(analyses[:10]):  # Limiter à 10 articles pour le rapport
            story.append(Paragraph(f"Article {i+1}", styles['Heading3']))
            
            article_data = [
                ['Score original', f"{analysis.get('score_original', 0):.3f}"],
                ['Score corrigé', f"{analysis.get('score_corrected', 0):.3f}"],
                ['Confiance', f"{analysis.get('confidence', 0):.3f}"],
                ['Biais détectés', f"{len(analysis.get('analyse_biases', {}).get('biais_détectés', []))}"]
            ]
            
            article_table = Table(article_data, colWidths=[150, 100])
            article_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            story.append(article_table)
            story.append(Spacer(1, 10))
        
        # Générer le PDF
        doc.build(story)
        
        return jsonify({
            'success': True,
            'reportUrl': f'/reports/{filename}',
            'filename': filename
        })
        
    except Exception as e:
        print(f"❌ Erreur génération rapport: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/reports/<filename>')
def download_report(filename):
    """Télécharge un rapport généré"""
    return send_from_directory(REPORTS_DIR, filename)

@app.route('/health')
def health_check():
    """Endpoint de santé"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.datetime.now().isoformat(),
        'reports_count': len(os.listdir(REPORTS_DIR)) if os.path.exists(REPORTS_DIR) else 0
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
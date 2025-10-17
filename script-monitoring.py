#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🤖 Script de Monitoring RSS Aggregator
======================================
Auteur: Claude (Anthropic)
Date: 12 octobre 2025
Usage: python monitor_rss.py

Fonctionnalités:
- Tests automatiques de tous les endpoints
- Analyse de la qualité du sentiment
- Génération de rapports détaillés
- Alertes sur anomalies
- Export de statistiques
"""

import requests
import json
from datetime import datetime
from collections import Counter
import time

# ========================================
# CONFIGURATION
# ========================================
BASE_URL = "https://rss-aggregator-l7qj.onrender.com"
REPORT_FILE = f"rapport_rss_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

# Couleurs pour terminal
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'

# ========================================
# FONCTIONS UTILITAIRES
# ========================================

def print_header(text):
    """Affiche un en-tête stylisé"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text:^60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}\n")

def print_success(text):
    """Affiche un message de succès"""
    print(f"{Colors.GREEN}✓ {text}{Colors.END}")

def print_error(text):
    """Affiche un message d'erreur"""
    print(f"{Colors.RED}✗ {text}{Colors.END}")

def print_warning(text):
    """Affiche un avertissement"""
    print(f"{Colors.YELLOW}⚠ {text}{Colors.END}")

def print_info(text):
    """Affiche une information"""
    print(f"{Colors.BLUE}ℹ {text}{Colors.END}")

# ========================================
# TESTS DES ENDPOINTS
# ========================================

def test_endpoint(endpoint, method="GET", data=None):
    """Teste un endpoint et retourne le résultat"""
    url = f"{BASE_URL}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=30)
        
        if response.status_code == 200:
            return True, response.json()
        else:
            return False, f"Status {response.status_code}"
    except Exception as e:
        return False, str(e)

def test_all_endpoints():
    """Teste tous les endpoints de l'API"""
    print_header("TESTS DES ENDPOINTS")
    
    endpoints = [
        ("/api/articles", "GET"),
        ("/api/feeds", "GET"),
        ("/api/themes", "GET"),
        ("/api/sentiment/stats", "GET"),
        ("/api/geopolitical/report", "GET"),
        ("/api/geopolitical/crisis-zones", "GET"),
        ("/api/geopolitical/relations", "GET"),
    ]
    
    results = {}
    for endpoint, method in endpoints:
        print(f"Test {endpoint}# TODO: complete logic", end=" ")
        success, data = test_endpoint(endpoint, method)
        results[endpoint] = {"success": success, "data": data}
        
        if success:
            print_success("OK")
        else:
            print_error(f"ÉCHEC - {data}")
        time.sleep(0.5)
    
    return results

# ========================================
# ANALYSE DE LA QUALITÉ DU SENTIMENT
# ========================================

def analyze_sentiment_quality(articles):
    """Analyse la qualité de l'analyse de sentiment"""
    print_header("ANALYSE DE LA QUALITÉ DU SENTIMENT")
    
    total = len(articles)
    sentiments = {
        'positive': 0,
        'negative': 0,
        'neutral': 0
    }
    
    scores_zero = 0
    words_detected = []
    confidence_scores = []
    
    for article in articles:
        sentiment = article.get('sentiment', {})
        sent_type = sentiment.get('sentiment', 'neutral')
        score = sentiment.get('score', 0)
        confidence = sentiment.get('confidence', 0)
        word_count = sentiment.get('wordCount', 0)
        
        sentiments[sent_type] += 1
        
        if score == 0:
            scores_zero += 1
        
        if word_count > 0:
            words_detected.append(word_count)
        
        confidence_scores.append(confidence)
    
    # Calculs
    success_rate = ((total - scores_zero) / total * 100) if total > 0 else 0
    avg_words = sum(words_detected) / len(words_detected) if words_detected else 0
    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
    
    # Affichage
    print(f"📊 Total d'articles: {total}")
    print(f"📈 Taux de détection: {success_rate:.1f}%")
    print(f"   • Articles analysés: {total - scores_zero}")
    print(f"   • Articles score 0: {scores_zero}")
    print()
    
    print(f"😊 Distribution des sentiments:")
    print(f"   • Positifs: {sentiments['positive']} ({sentiments['positive']/total*100:.1f}%)")
    print(f"   • Neutres: {sentiments['neutral']} ({sentiments['neutral']/total*100:.1f}%)")
    print(f"   • Négatifs: {sentiments['negative']} ({sentiments['negative']/total*100:.1f}%)")
    print()
    
    print(f"🔍 Métriques de qualité:")
    print(f"   • Mots détectés (moyenne): {avg_words:.1f}")
    print(f"   • Confiance (moyenne): {avg_confidence:.2f}")
    print()
    
    # Évaluation
    if success_rate >= 80:
        print_success(f"EXCELLENT : Taux de détection {success_rate:.1f}%")
    elif success_rate >= 50:
        print_warning(f"CORRECT : Taux de détection {success_rate:.1f}%")
    else:
        print_error(f"INSUFFISANT : Taux de détection {success_rate:.1f}%")
    
    return {
        'total': total,
        'success_rate': success_rate,
        'sentiments': sentiments,
        'avg_words': avg_words,
        'avg_confidence': avg_confidence
    }

# ========================================
# ANALYSE DES THÈMES
# ========================================

def analyze_themes(themes):
    """Analyse les thèmes configurés"""
    print_header("ANALYSE DES THÈMES")
    
    print(f"📚 Nombre de thèmes: {len(themes)}")
    print()
    
    total_keywords = sum(len(theme.get('keywords', [])) for theme in themes)
    print(f"🔤 Total de mots-clés: {total_keywords}")
    print(f"🔤 Moyenne par thème: {total_keywords/len(themes):.1f}")
    print()
    
    print("📋 Liste des thèmes:")
    for theme in themes:
        name = theme.get('name', 'Sans nom')
        keywords_count = len(theme.get('keywords', []))
        color = theme.get('color', '#000000')
        print(f"   • {name}: {keywords_count} mots-clés (couleur: {color})")
    
    return {
        'total_themes': len(themes),
        'total_keywords': total_keywords,
        'themes_list': [t.get('name') for t in themes]
    }

# ========================================
# ANALYSE DES FLUX RSS
# ========================================

def analyze_feeds(feeds):
    """Analyse les flux RSS"""
    print_header("ANALYSE DES FLUX RSS")
    
    print(f"📰 Nombre de flux RSS: {len(feeds)}")
    print()
    
    # Catégorisation
    domains = {}
    for feed in feeds:
        domain = feed.split('/')[2] if len(feed.split('/')) > 2 else 'inconnu'
        domains[domain] = domains.get(domain, 0) + 1
    
    print("🌐 Sources par domaine:")
    for domain, count in sorted(domains.items(), key=lambda x: x[1], reverse=True):
        print(f"   • {domain}: {count} flux")
    
    return {
        'total_feeds': len(feeds),
        'domains': domains
    }

# ========================================
# DÉTECTION D'ANOMALIES
# ========================================

def detect_anomalies(analysis_results):
    """Détecte les anomalies dans l'analyse"""
    print_header("DÉTECTION D'ANOMALIES")
    
    anomalies = []
    
    # Vérifier le taux de détection
    sentiment_quality = analysis_results.get('sentiment_quality', {})
    success_rate = sentiment_quality.get('success_rate', 0)
    
    if success_rate < 50:
        anomalies.append({
            'severity': 'CRITIQUE',
            'type': 'Sentiment',
            'message': f"Taux de détection très faible: {success_rate:.1f}%"
        })
    elif success_rate < 80:
        anomalies.append({
            'severity': 'AVERTISSEMENT',
            'type': 'Sentiment',
            'message': f"Taux de détection sous-optimal: {success_rate:.1f}%"
        })
    
    # Vérifier la distribution des sentiments
    sentiments = sentiment_quality.get('sentiments', {})
    neutral_percent = sentiments.get('neutral', 0) / sentiment_quality.get('total', 1) * 100
    
    if neutral_percent > 90:
        anomalies.append({
            'severity': 'AVERTISSEMENT',
            'type': 'Distribution',
            'message': f"Trop d'articles neutres: {neutral_percent:.1f}%"
        })
    
    # Vérifier les mots détectés
    avg_words = sentiment_quality.get('avg_words', 0)
    if avg_words < 1:
        anomalies.append({
            'severity': 'CRITIQUE',
            'type': 'Détection',
            'message': f"Très peu de mots détectés: {avg_words:.1f} en moyenne"
        })
    
    # Affichage
    if not anomalies:
        print_success("Aucune anomalie détectée ! 🎉")
    else:
        for anomaly in anomalies:
            severity = anomaly['severity']
            if severity == 'CRITIQUE':
                print_error(f"{severity} [{anomaly['type']}] {anomaly['message']}")
            else:
                print_warning(f"{severity} [{anomaly['type']}] {anomaly['message']}")
    
    return anomalies

# ========================================
# GÉNÉRATION DU RAPPORT
# ========================================

def generate_report(analysis_results):
    """Génère un rapport complet"""
    print_header("GÉNÉRATION DU RAPPORT")
    
    report = []
    report.append("=" * 80)
    report.append("RAPPORT D'ANALYSE RSS AGGREGATOR".center(80))
    report.append("=" * 80)
    report.append(f"\nDate: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    report.append(f"URL: {BASE_URL}")
    report.append("\n" + "=" * 80)
    
    # Résumé des tests
    report.append("\n1. TESTS DES ENDPOINTS")
    report.append("-" * 80)
    endpoint_results = analysis_results.get('endpoint_results', {})
    working = sum(1 for r in endpoint_results.values() if r['success'])
    total = len(endpoint_results)
    report.append(f"Endpoints fonctionnels: {working}/{total}")
    for endpoint, result in endpoint_results.items():
        status = "✓ OK" if result['success'] else "✗ ÉCHEC"
        report.append(f"  {status} - {endpoint}")
    
    # Qualité du sentiment
    report.append("\n2. QUALITÉ DE L'ANALYSE DE SENTIMENT")
    report.append("-" * 80)
    sentiment_quality = analysis_results.get('sentiment_quality', {})
    report.append(f"Taux de détection: {sentiment_quality.get('success_rate', 0):.1f}%")
    report.append(f"Articles analysés: {sentiment_quality.get('total', 0) - sentiment_quality.get('sentiments', {}).get('neutral', 0)}")
    report.append(f"Mots détectés (moyenne): {sentiment_quality.get('avg_words', 0):.1f}")
    report.append(f"Confiance (moyenne): {sentiment_quality.get('avg_confidence', 0):.2f}")
    
    sentiments = sentiment_quality.get('sentiments', {})
    total = sentiment_quality.get('total', 1)
    report.append(f"\nDistribution:")
    report.append(f"  Positifs: {sentiments.get('positive', 0)} ({sentiments.get('positive', 0)/total*100:.1f}%)")
    report.append(f"  Neutres: {sentiments.get('neutral', 0)} ({sentiments.get('neutral', 0)/total*100:.1f}%)")
    report.append(f"  Négatifs: {sentiments.get('negative', 0)} ({sentiments.get('negative', 0)/total*100:.1f}%)")
    
    # Thèmes
    report.append("\n3. THÈMES CONFIGURÉS")
    report.append("-" * 80)
    themes_analysis = analysis_results.get('themes_analysis', {})
    report.append(f"Nombre de thèmes: {themes_analysis.get('total_themes', 0)}")
    report.append(f"Total de mots-clés: {themes_analysis.get('total_keywords', 0)}")
    report.append("\nThèmes:")
    for theme_name in themes_analysis.get('themes_list', []):
        report.append(f"  • {theme_name}")
    
    # Flux RSS
    report.append("\n4. FLUX RSS")
    report.append("-" * 80)
    feeds_analysis = analysis_results.get('feeds_analysis', {})
    report.append(f"Nombre de flux: {feeds_analysis.get('total_feeds', 0)}")
    
    # Anomalies
    report.append("\n5. ANOMALIES DÉTECTÉES")
    report.append("-" * 80)
    anomalies = analysis_results.get('anomalies', [])
    if not anomalies:
        report.append("✓ Aucune anomalie détectée")
    else:
        for anomaly in anomalies:
            report.append(f"  [{anomaly['severity']}] {anomaly['type']}: {anomaly['message']}")
    
    # Recommandations
    report.append("\n6. RECOMMANDATIONS")
    report.append("-" * 80)
    
    success_rate = sentiment_quality.get('success_rate', 0)
    if success_rate < 50:
        report.append("  URGENT: Appliquer le patch de correction du sentiment")
        report.append("          Le taux de détection est critique (<50%)")
    elif success_rate < 80:
        report.append("  IMPORTANT: Optimiser l'analyse de sentiment")
        report.append("             Enrichir le lexique avec plus de termes")
    else:
        report.append("  ✓ Application en bon état de fonctionnement")
        report.append("  SUGGESTION: Continuer à enrichir le lexique")
    
    if themes_analysis.get('total_keywords', 0) < 300:
        report.append("\n  SUGGESTION: Ajouter plus de mots-clés thématiques")
        report.append("              Objectif recommandé: 300+ mots-clés")
    
    report.append("\n" + "=" * 80)
    report.append("FIN DU RAPPORT".center(80))
    report.append("=" * 80)
    
    # Sauvegarder
    report_text = "\n".join(report)
    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        f.write(report_text)
    
    print_success(f"Rapport sauvegardé: {REPORT_FILE}")
    
    return report_text

# ========================================
# ANALYSE GÉOPOLITIQUE
# ========================================

def analyze_geopolitical(data):
    """Analyse le rapport géopolitique"""
    print_header("ANALYSE GÉOPOLITIQUE")
    
    if not data or 'success' not in data or not data['success']:
        print_error("Module géopolitique non accessible")
        return None
    
    report = data.get('report', {})
    summary = report.get('summary', {})
    
    print(f"🌍 Pays détectés: {summary.get('totalCountries', 0)}")
    print(f"🚨 Zones à haut risque: {summary.get('highRiskZones', 0)}")
    print(f"🤝 Relations actives: {summary.get('activeRelations', 0)}")
    print(f"🏛️ Organisations: {summary.get('totalOrganizations', 0)}")
    print()
    
    # Top zones de crise
    crisis_zones = report.get('crisisZones', [])
    if crisis_zones:
        print("🔥 Top 5 Zones de Crise:")
        for i, zone in enumerate(crisis_zones[:5], 1):
            risk_level = zone.get('riskLevel', 'unknown')
            risk_score = zone.get('riskScore', 0)
            country = zone.get('country', 'Inconnu')
            mentions = zone.get('mentions', 0)
            
            emoji = '🔴' if risk_level == 'high' else '🟡' if risk_level == 'medium' else '🟢'
            print(f"   {i}. {emoji} {country}: Score {risk_score:.2f} ({mentions} mentions)")
    
    return {
        'summary': summary,
        'crisis_zones_count': len(crisis_zones),
        'high_risk_count': summary.get('highRiskZones', 0)
    }

# ========================================
# EXPORT DE DONNÉES
# ========================================

def export_statistics(analysis_results):
    """Exporte les statistiques en JSON"""
    print_header("EXPORT DES STATISTIQUES")
    
    filename = f"stats_rss_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(analysis_results, f, indent=2, ensure_ascii=False)
    
    print_success(f"Statistiques exportées: {filename}")
    return filename

# ========================================
# FONCTION PRINCIPALE
# ========================================

def main():
    """Fonction principale"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}")
    print("  ╔═══════════════════════════════════════════════════════════╗")
    print("  ║                                                           ║")
    print("  ║       🤖 MONITORING RSS AGGREGATOR v2.0                  ║")
    print("  ║                                                           ║")
    print("  ║       Analyse automatique et génération de rapport       ║")
    print("  ║                                                           ║")
    print("  ╚═══════════════════════════════════════════════════════════╝")
    print(f"{Colors.END}\n")
    
    print_info(f"Cible: {BASE_URL}")
    print_info(f"Démarrage: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print()
    
    analysis_results = {}
    
    # 1. Tests des endpoints
    endpoint_results = test_all_endpoints()
    analysis_results['endpoint_results'] = endpoint_results
    
    # 2. Récupération des données
    articles_success, articles_data = test_endpoint('/api/articles')
    feeds_success, feeds_data = test_endpoint('/api/feeds')
    themes_success, themes_data = test_endpoint('/api/themes')
    geo_success, geo_data = test_endpoint('/api/geopolitical/report')
    
    # 3. Analyse de la qualité du sentiment
    if articles_success and 'articles' in articles_data:
        sentiment_quality = analyze_sentiment_quality(articles_data['articles'])
        analysis_results['sentiment_quality'] = sentiment_quality
    else:
        print_error("Impossible d'analyser le sentiment - pas de données articles")
    
    # 4. Analyse des thèmes
    if themes_success:
        themes_analysis = analyze_themes(themes_data)
        analysis_results['themes_analysis'] = themes_analysis
    else:
        print_error("Impossible d'analyser les thèmes")
    
    # 5. Analyse des flux
    if feeds_success:
        feeds_analysis = analyze_feeds(feeds_data)
        analysis_results['feeds_analysis'] = feeds_analysis
    else:
        print_error("Impossible d'analyser les flux")
    
    # 6. Analyse géopolitique
    if geo_success:
        geo_analysis = analyze_geopolitical(geo_data)
        if geo_analysis:
            analysis_results['geo_analysis'] = geo_analysis
    
    # 7. Détection d'anomalies
    anomalies = detect_anomalies(analysis_results)
    analysis_results['anomalies'] = anomalies
    
    # 8. Génération du rapport
    report_text = generate_report(analysis_results)
    
    # 9. Export des statistiques
    export_statistics(analysis_results)
    
    # 10. Résumé final
    print_header("RÉSUMÉ FINAL")
    
    success_rate = analysis_results.get('sentiment_quality', {}).get('success_rate', 0)
    
    if success_rate >= 80:
        print_success(f"Application en EXCELLENT état ({success_rate:.1f}% de détection)")
    elif success_rate >= 50:
        print_warning(f"Application en état CORRECT ({success_rate:.1f}% de détection)")
    else:
        print_error(f"Application nécessite des CORRECTIONS ({success_rate:.1f}% de détection)")
    
    if anomalies:
        print_warning(f"{len(anomalies)} anomalie(s) détectée(s)")
    else:
        print_success("Aucune anomalie détectée")
    
    print()
    print_info(f"Rapport complet: {REPORT_FILE}")
    print_info(f"Fin de l'analyse: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print()

# ========================================
# POINT D'ENTRÉE
# ========================================

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}⚠ Analyse interrompue par l'utilisateur{Colors.END}")
    except Exception as e:
        print(f"\n\n{Colors.RED}✗ ERREUR CRITIQUE: {e}{Colors.END}")
        import traceback
        traceback.print_exc()

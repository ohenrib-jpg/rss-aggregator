# test-alerts.py
from modules.alert_system import alert_system

# Test avec un article fictif
test_article = {
    "id": "test_001",
    "title": "Nouvelle escalade du conflit en Ukraine après les récentes attaques",
    "summary": "Le président Zelensky a annoncé de nouvelles mesures militaires suite aux récentes offensives russes dans l'est du pays.",
    "link": "https://example.com/test",
    "themes": ["Ukraine", "conflit", "politique"]
}

print("🧪 Test du système d'alertes...")
triggered = alert_system.check_article(test_article)

if triggered:
    print(f"✅ {len(triggered)} alerte(s) déclenchée(s):")
    for alert in triggered:
        print(f"   🚨 {alert['alert_name']}")
        print(f"      Article: {alert['article_title']}")
        print(f"      Mots-clés: {', '.join(alert['matched_keywords'])}")
else:
    print("❌ Aucune alerte déclenchée")

print(f"\n📊 Stats: {alert_system.get_alert_stats()}")
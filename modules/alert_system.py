# modules/alert_system.py
import json
import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

logger = logging.getLogger("rss-aggregator")

class AlertSystem:
    def __init__(self):
        self.alerts_file = "data/alerts_config.json"
        self.triggered_file = "data/triggered_alerts.json"
        self.alerts = self.load_alerts()
        self.triggered = self.load_triggered()
        self.last_cooldown_check = {}
        
        # Créer le dossier data si nécessaire
        os.makedirs("data", exist_ok=True)
    
    def load_alerts(self) -> List[Dict]:
        """Charge la configuration des alertes"""
        default_alerts = [
            {
                "id": "crise_ukraine",
                "name": "🚨 Crise Ukraine",
                "keywords": ["Ukraine", "Kiev", "Zelensky", "conflit ukrainien", "guerre Ukraine"],
                "severity": "high",
                "actions": ["notification", "highlight"],
                "enabled": True,
                "cooldown": 3600,  # 1 heure
                "created": datetime.now().isoformat()
            },
            {
                "id": "election_france",
                "name": "🗳️ Élection France", 
                "keywords": ["élection", "présidentielle", "vote", "scrutin", "candidat"],
                "severity": "medium",
                "actions": ["notification"],
                "enabled": True,
                "cooldown": 1800,  # 30 minutes
                "created": datetime.now().isoformat()
            },
            {
                "id": "crise_economique",
                "name": "💸 Crise Économique",
                "keywords": ["inflation", "récession", "crise économique", "chômage", "pouvoir d'achat"],
                "severity": "medium",
                "actions": ["notification"],
                "enabled": True,
                "cooldown": 3600,
                "created": datetime.now().isoformat()
            }
        ]
        
        try:
            if os.path.exists(self.alerts_file):
                with open(self.alerts_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            else:
                # Sauvegarder les alertes par défaut
                self.save_alerts(default_alerts)
                return default_alerts
        except Exception as e:
            logger.error(f"Erreur chargement alertes: {e}")
            return default_alerts
    
    def save_alerts(self, alerts: List[Dict]) -> bool:
        """Sauvegarde la configuration des alertes"""
        try:
            with open(self.alerts_file, 'w', encoding='utf-8') as f:
                json.dump(alerts, f, indent=2, ensure_ascii=False)
            self.alerts = alerts
            return True
        except Exception as e:
            logger.error(f"Erreur sauvegarde alertes: {e}")
            return False
    
    def load_triggered(self) -> List[Dict]:
        """Charge l'historique des alertes déclenchées"""
        try:
            if os.path.exists(self.triggered_file):
                with open(self.triggered_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Erreur chargement historique alertes: {e}")
        return []
    
    def save_triggered(self):
        """Sauvegarde l'historique des alertes déclenchées"""
        try:
            # Garder seulement les 100 dernières alertes
            recent_alerts = self.triggered[-100:]
            with open(self.triggered_file, 'w', encoding='utf-8') as f:
                json.dump(recent_alerts, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Erreur sauvegarde historique: {e}")
    
    def check_article(self, article: Dict) -> List[Dict]:
        """Vérifie si un article déclenche des alertes"""
        triggered_alerts = []
        text = f"{article.get('title', '')} {article.get('summary', '')}".lower()
        
        for alert in self.alerts:
            if not alert.get('enabled', True):
                continue
                
            if self._matches_alert(text, alert) and self._check_cooldown(alert):
                triggered_info = self._trigger_alert(alert, article)
                triggered_alerts.append(triggered_info)
        
        return triggered_alerts
    
    def _matches_alert(self, text: str, alert: Dict) -> bool:
        """Vérifie si le texte match avec les mots-clés de l'alerte"""
        keywords = [k.lower() for k in alert.get('keywords', [])]
        return any(keyword in text for keyword in keywords)
    
    def _check_cooldown(self, alert: Dict) -> bool:
        """Vérifie si l'alerte n'est pas en cooldown"""
        alert_id = alert.get('id')
        cooldown = alert.get('cooldown', 0)
        
        if cooldown == 0:
            return True
            
        last_trigger = self.last_cooldown_check.get(alert_id)
        if not last_trigger:
            return True
            
        time_since_last = (datetime.now() - last_trigger).total_seconds()
        return time_since_last >= cooldown
    
    def _trigger_alert(self, alert: Dict, article: Dict) -> Dict:
        """Déclenche une alerte"""
        alert_id = alert.get('id')
        
        # Mettre à jour le cooldown
        self.last_cooldown_check[alert_id] = datetime.now()
        
        # Créer l'info d'alerte déclenchée
        triggered_alert = {
            "alert_id": alert_id,
            "alert_name": alert.get('name'),
            "article_id": article.get('id'),
            "article_title": article.get('title'),
            "article_link": article.get('link'),
            "severity": alert.get('severity'),
            "triggered_at": datetime.now().isoformat(),
            "matched_keywords": self._find_matched_keywords(article, alert)
        }
        
        # Ajouter à l'historique
        self.triggered.append(triggered_alert)
        self.save_triggered()
        
        logger.info(f"🚨 Alerte déclenchée: {alert.get('name')} - {article.get('title')}")
        
        return triggered_alert
    
    def _find_matched_keywords(self, article: Dict, alert: Dict) -> List[str]:
        """Trouve les mots-clés qui ont matché"""
        text = f"{article.get('title', '')} {article.get('summary', '')}".lower()
        keywords = [k.lower() for k in alert.get('keywords', [])]
        return [kw for kw in keywords if kw in text]
    
    def create_alert(self, alert_data: Dict) -> bool:
        """Crée une nouvelle alerte"""
        alert_id = alert_data.get('id') or f"alert_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        new_alert = {
            "id": alert_id,
            "name": alert_data.get('name', 'Nouvelle Alerte'),
            "keywords": alert_data.get('keywords', []),
            "severity": alert_data.get('severity', 'medium'),
            "actions": alert_data.get('actions', ['notification']),
            "enabled": alert_data.get('enabled', True),
            "cooldown": alert_data.get('cooldown', 1800),
            "created": datetime.now().isoformat()
        }
        
        self.alerts.append(new_alert)
        return self.save_alerts(self.alerts)
    
    def delete_alert(self, alert_id: str) -> bool:
        """Supprime une alerte"""
        self.alerts = [a for a in self.alerts if a.get('id') != alert_id]
        return self.save_alerts(self.alerts)
    
    def update_alert(self, alert_id: str, updates: Dict) -> bool:
        """Met à jour une alerte"""
        for alert in self.alerts:
            if alert.get('id') == alert_id:
                alert.update(updates)
                return self.save_alerts(self.alerts)
        return False
    
    def get_recent_alerts(self, limit: int = 10) -> List[Dict]:
        """Récupère les alertes récentes"""
        return self.triggered[-limit:]
    
    def get_alert_stats(self) -> Dict:
        """Retourne des statistiques sur les alertes"""
        total_triggered = len(self.triggered)
        today = datetime.now().date()
        today_alerts = [a for a in self.triggered 
                       if datetime.fromisoformat(a['triggered_at']).date() == today]
        
        return {
            "total_alerts": len(self.alerts),
            "enabled_alerts": len([a for a in self.alerts if a.get('enabled', True)]),
            "total_triggered": total_triggered,
            "today_triggered": len(today_alerts),
            "severity_breakdown": {
                "high": len([a for a in self.triggered if a.get('severity') == 'high']),
                "medium": len([a for a in self.triggered if a.get('severity') == 'medium']),
                "low": len([a for a in self.triggered if a.get('severity') == 'low'])
            }
        }

# Instance globale
alert_system = AlertSystem()
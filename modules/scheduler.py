# modules/scheduler.py
import schedule
import time
import threading
from datetime import datetime
from modules.email_sender import email_sender
from modules.storage_manager import summarize_analyses, load_recent_analyses
import logging

logger = logging.getLogger("rss-aggregator")

class ReportScheduler:
    def __init__(self):
        self.running = False
        self.thread = None
    
    def generate_detailed_report(self):
        """Génère un rapport détaillé avec analyse IA"""
        try:
            # Charger les données récentes
            analyses = load_recent_analyses(7)  # 7 derniers jours
            summary = summarize_analyses()
            
            # Analyser avec IA locale
            ia_insights = self._get_ia_insights(analyses)
            
            # Préparer le rapport
            report_data = {
                'total_articles': summary.get('total_articles', 0),
                'total_themes': len(set([theme for analysis in analyses 
                                       for theme in analysis.get('themes', [])])),
                'avg_confidence': summary.get('avg_confidence', 0),
                'top_themes': self._extract_top_themes(analyses),
                'sentiment_breakdown': self._analyze_sentiments(analyses),
                'ia_insights': ia_insights,
                'generation_date': datetime.now().isoformat(),
                'period_analyzed': '7 jours'
            }
            
            return report_data
            
        except Exception as e:
            logger.error(f"Erreur génération rapport: {e}")
            return {}
    
    def _get_ia_insights(self, analyses):
        """Obtient des insights de l'IA locale"""
        try:
            # Préparer le contexte pour l'IA
            themes_text = ", ".join(self._extract_top_themes(analyses)[:5])
            sentiment_summary = self._analyze_sentiments(analyses)
            
            prompt = f"""
            En tant qu'analyste géopolitique, fournis une analyse concise des tendances actuelles basée sur ces données:
            
            Thèmes principaux: {themes_text}
            Répartition des sentiments: {sentiment_summary}
            Nombre d'articles: {len(analyses)}
            
            Donne 2-3 insights clés sur les tendances géopolitiques émergentes.
            Réponds en français, sois concis et factuel.
            """
            
            # Ici intégrer l'appel à votre IA locale
            # Pour l'instant, retourner une analyse simulée
            return [
                "Augmentation des discussions sur les conflits régionaux",
                "Focus croissant sur les questions économiques internationales", 
                "Sentiment global légèrement négatif sur les relations internationales"
            ]
            
        except Exception as e:
            logger.error(f"Erreur analyse IA: {e}")
            return ["Analyse IA temporairement indisponible"]
    
    def _extract_top_themes(self, analyses):
        """Extrait les thèmes principaux"""
        theme_count = {}
        for analysis in analyses:
            for theme in analysis.get('themes', []):
                theme_count[theme] = theme_count.get(theme, 0) + 1
        
        return sorted(theme_count.keys(), key=lambda x: theme_count[x], reverse=True)
    
    def _analyze_sentiments(self, analyses):
        """Analyse la répartition des sentiments"""
        sentiments = {'positive': 0, 'neutral': 0, 'negative': 0}
        for analysis in analyses:
            sentiment = analysis.get('sentiment', {})
            if isinstance(sentiment, dict):
                sent_type = sentiment.get('sentiment', 'neutral')
                sentiments[sent_type] = sentiments.get(sent_type, 0) + 1
        
        total = sum(sentiments.values())
        if total > 0:
            return {k: f"{(v/total)*100:.1f}%" for k, v in sentiments.items()}
        return sentiments
    
    def send_scheduled_report(self):
        """Envoie le rapport planifié"""
        if not email_sender.config['enabled']:
            return
        
        logger.info("📧 Génération du rapport planifié...")
        report_data = self.generate_detailed_report()
        
        if report_data:
            success, message = email_sender.send_analysis_report(report_data)
            if success:
                logger.info("✅ Rapport planifié envoyé")
            else:
                logger.error(f"❌ Erreur envoi rapport: {message}")
    
    def start_scheduler(self):
        """Démarre le planificateur"""
        if self.running:
            return
        
        self.running = True
        
        # Configurer les planifications selon la configuration
        schedule_config = email_sender.config.get('schedule', 'daily')
        
        if schedule_config == 'daily':
            schedule.every().day.at("08:00").do(self.send_scheduled_report)
        elif schedule_config == 'weekly':
            schedule.every().monday.at("09:00").do(self.send_scheduled_report)
        elif schedule_config == 'monthly':
            schedule.every(30).days.do(self.send_scheduled_report)
        
        def run_scheduler():
            while self.running:
                schedule.run_pending()
                time.sleep(60)  # Vérifier toutes les minutes
        
        self.thread = threading.Thread(target=run_scheduler, daemon=True)
        self.thread.start()
        logger.info("🕒 Planificateur de rapports démarré")
    
    def stop_scheduler(self):
        """Arrête le planificateur"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("🛑 Planificateur de rapports arrêté")

# Instance globale
report_scheduler = ReportScheduler()
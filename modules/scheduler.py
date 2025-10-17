# modules/scheduler.py
import schedule
import time
import logging
from threading import Thread
from modules.feed_scraper import refresh_all_feeds

logger = logging.getLogger("rss-aggregator")

def scheduled_refresh():
    """Tâche planifiée d'actualisation"""
    try:
        logger.info("⏰ Déclenchement de l'actualisation planifiée")
        refresh_all_feeds()
        logger.info("✅ Actualisation planifiée terminée")
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'actualisation planifiée: {e}")

def start_scheduler():
    """Démarre le scheduler dans un thread séparé"""
    def run_scheduler():
        # Planifier l'actualisation toutes les heures
        schedule.every(1).hour.do(scheduled_refresh)
        
        # Première exécution immédiate
        schedule.every(1).minute.do(scheduled_refresh)
        
        logger.info("🕒 Scheduler démarré - Actualisation toutes les heures")
        
        while True:
            schedule.run_pending()
            time.sleep(60)  # Vérifier toutes les minutes
    
    thread = Thread(target=run_scheduler)
    thread.daemon = True
    thread.start()
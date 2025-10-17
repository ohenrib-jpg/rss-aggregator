# modules/feed_scraper.py
import feedparser
import requests
from typing import List, Dict
import logging
from datetime import datetime
from modules.db_manager import get_connection, put_connection

logger = logging.getLogger("rss-aggregator")

def get_all_feeds() -> List[Dict]:
    """Récupère tous les flux de la base"""
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, url, title FROM feeds WHERE is_active = TRUE")
        feeds = [dict(row) for row in cur.fetchall()]
        cur.close()
        return feeds
    except Exception as e:
        logger.error(f"Erreur récupération flux: {e}")
        return []
    finally:
        if conn:
            put_connection(conn)

def parse_feed(feed_url: str) -> List[Dict]:
    """Parse un flux RSS et retourne les articles"""
    try:
        feed = feedparser.parse(feed_url)
        articles = []
        
        for entry in feed.entries:
            # Gestion de la date
            published = None
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                published = datetime(*entry.published_parsed[:6])
            elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                published = datetime(*entry.updated_parsed[:6])
            else:
                published = datetime.utcnow()
            
            article = {
                'title': entry.title if hasattr(entry, 'title') else 'Sans titre',
                'link': entry.link if hasattr(entry, 'link') else '#',
                'content': entry.summary if hasattr(entry, 'summary') else '',
                'pub_date': published,
                'feed_url': feed_url,
                'source': feed_url.split('/')[2] if len(feed_url.split('/')) > 2 else 'unknown'
            }
            articles.append(article)
        
        logger.info(f"✓ Flux {feed_url}: {len(articles)} articles")
        return articles
    except Exception as e:
        logger.error(f"❌ Erreur parsing flux {feed_url}: {e}")
        return []

def save_article_batch(articles: List[Dict]) -> int:
    """Sauvegarde un lot d'articles en évitant les doublons"""
    if not articles:
        return 0
    
    conn = None
    saved_count = 0
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        for article in articles:
            # Vérifier si l'article existe déjà
            cur.execute("SELECT id FROM articles WHERE link = %s", (article['link'],))
            existing = cur.fetchone()
            
            if not existing:
                cur.execute("""
                    INSERT INTO articles 
                    (title, content, link, pub_date, feed_url, source)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    article['title'],
                    article['content'],
                    article['link'],
                    article['pub_date'],
                    article['feed_url'],
                    article['source']
                ))
                saved_count += 1
        
        conn.commit()
        cur.close()
        logger.info(f"💾 {saved_count} nouveaux articles sauvegardés")
        return saved_count
        
    except Exception as e:
        logger.error(f"❌ Erreur sauvegarde articles: {e}")
        if conn:
            conn.rollback()
        return 0
    finally:
        if conn:
            put_connection(conn)

def refresh_all_feeds():
    """Actualise tous les flux et sauvegarde les nouveaux articles"""
    logger.info("🔄 Début de l'actualisation des flux RSS")
    
    feeds = get_all_feeds()
    if not feeds:
        logger.warning("⚠️ Aucun flux RSS configuré")
        return
    
    total_articles = 0
    total_saved = 0
    
    for feed in feeds:
        feed_url = feed['url']
        logger.info(f"📰 Traitement du flux: {feed_url}")
        
        articles = parse_feed(feed_url)
        total_articles += len(articles)
        
        if articles:
            saved = save_article_batch(articles)
            total_saved += saved
        
        # Mettre à jour last_fetched
        conn = None
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute(
                "UPDATE feeds SET last_fetched = %s WHERE id = %s",
                (datetime.utcnow(), feed['id'])
            )
            conn.commit()
            cur.close()
        except Exception as e:
            logger.error(f"❌ Erreur mise à jour last_fetched: {e}")
        finally:
            if conn:
                put_connection(conn)
    
    logger.info(f"✅ Actualisation terminée: {total_articles} articles traités, {total_saved} nouveaux sauvegardés")
    return total_saved
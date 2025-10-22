# modules/feed_scraper.py
import feedparser
import requests
from typing import List, Dict, Optional
import logging
from datetime import datetime
from collections import defaultdict
from modules.db_manager import get_connection, put_connection

# Logging minimal pour debug
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("rss-aggregator")

# utilitaire pour convertir fetchall() + description en liste de dicts
def _rows_to_dicts(cur):
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description] if getattr(cur, "description", None) else []
    return [dict(zip(cols, row)) for row in rows]


def get_all_feeds() -> List[Dict]:
    """Récupère tous les flux actifs depuis la base."""
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, url, title FROM feeds WHERE is_active = TRUE")
        feeds = _rows_to_dicts(cur)
        cur.close()
        logger.info("✅ %d flux actifs récupérés", len(feeds))
        return feeds
    except Exception:
        logger.exception("❌ Erreur récupération flux")
        return []
    finally:
        if conn:
            put_connection(conn)


def parse_feed(feed_url: str) -> List[Dict]:
    """Télécharge et parse un flux RSS via requests + feedparser (timeout géré)."""
    try:
        headers = {"User-Agent": "rss-aggregator/1.0 (+https://example.org)"}
        resp = requests.get(feed_url, headers=headers, timeout=10)
        if resp.status_code != 200:
            logger.warning("⚠️ Échec HTTP %s pour %s", resp.status_code, feed_url)
            return []

        parsed = feedparser.parse(resp.content)
        if getattr(parsed, "bozo", False):
            logger.warning("⚠️ feedparser signale un problème pour %s: %s", feed_url, getattr(parsed, "bozo_exception", "unknown"))

        articles = []
        for entry in parsed.entries:
            # date
            published = None
            if getattr(entry, "published_parsed", None):
                published = datetime(*entry.published_parsed[:6])
            elif getattr(entry, "updated_parsed", None):
                published = datetime(*entry.updated_parsed[:6])
            else:
                published = datetime.utcnow()

            # contenu
            content = ""
            if getattr(entry, "content", None) and isinstance(entry.content, (list, tuple)) and len(entry.content) > 0:
                content = entry.content[0].value
            elif getattr(entry, "summary", None):
                content = entry.summary
            elif getattr(entry, "description", None):
                content = entry.description

            title = getattr(entry, "title", "Sans titre") or "Sans titre"
            link = getattr(entry, "link", "#") or "#"

            source = "unknown"
            try:
                parts = feed_url.split("/")
                source = parts[2] if len(parts) > 2 else feed_url
            except Exception:
                source = feed_url

            article = {
                "title": title,
                "link": link,
                "content": content,
                "summary": content,
                "pub_date": published,
                "feed_url": feed_url,
                "source": source
            }
            articles.append(article)

        logger.info("✓ Flux %s: %d articles", feed_url, len(articles))
        return articles

    except requests.RequestException as re:
        logger.error("❌ Erreur réseau pour %s: %s", feed_url, re)
        return []
    except Exception:
        logger.exception("❌ Erreur parsing flux %s", feed_url)
        return []


# ========== CORROBORATION (utilise modules.corroboration) ==========
from modules.corroboration import find_corroborations


def save_article_batch(articles: List[Dict]) -> List[Dict]:
    """
    INSERT ... ON CONFLICT DO NOTHING RETURNING id, link
    Retourne la liste des tuples {id, link} insérés.
    """
    if not articles:
        return []

    conn = None
    inserted: List[Dict] = []
    try:
        conn = get_connection()
        cur = conn.cursor()

        insert_sql = """
            INSERT INTO articles
                (title, content, link, pub_date, feed_url, source)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (link) DO NOTHING
            RETURNING id, link
        """

        for article in articles:
            try:
                cur.execute(
                    insert_sql,
                    (
                        article.get("title"),
                        article.get("content"),
                        article.get("link"),
                        article.get("pub_date"),
                        article.get("feed_url"),
                        article.get("source"),
                    ),
                )
                row = cur.fetchone()
                if row:
                    inserted.append({"id": int(row[0]), "link": row[1]})
            except Exception:
                logger.exception("❌ Erreur insertion article (link=%s)", article.get("link"))
                # continuer

        conn.commit()
        cur.close()
        logger.info("💾 %d nouveaux articles sauvegardés (ids: %s)", len(inserted), [i["id"] for i in inserted])
        return inserted

    except Exception:
        logger.exception("❌ Erreur sauvegarde articles (batch)")
        if conn:
            conn.rollback()
        return []
    finally:
        if conn:
            put_connection(conn)


def process_and_save_articles_with_corroboration(articles: List[Dict], threshold: float = 0.5) -> List[int]:
    """
    Calcule corroborations vs articles récents, insère les articles, puis met à jour
    uniquement les nouveaux enregistrements par id (évite UPDATE par link sur tout).
    Retourne la liste des ids nouvellement insérés.
    """
    if not articles:
        return []

    # 1) Charger articles récents pour comparaison (7 jours)
    conn_cmp = get_connection()
    try:
        cur_cmp = conn_cmp.cursor()
        cur_cmp.execute("""
            SELECT id, title, summary, content, link, source, pub_date
            FROM articles
            WHERE pub_date > NOW() - INTERVAL '7 days'
        """)
        rows = cur_cmp.fetchall()
        cols = [d[0] for d in cur_cmp.description] if cur_cmp.description else []
        recent_articles = [dict(zip(cols, row)) for row in rows]
        cur_cmp.close()
    finally:
        put_connection(conn_cmp)

    # 2) Calculer corroborations (en mémoire) pour chaque nouvel article
    for art in articles:
        corrs = find_corroborations(art, recent_articles, threshold=threshold, top_n=5)
        art["corroboration_count"] = len(corrs)
        art["corroboration_strength"] = max([c["similarity"] for c in corrs]) if corrs else 0.0

    # 3) Insérer et récupérer nouveaux ids (et links)
    inserted_info = save_article_batch(articles)  # [{id, link}, ...]

    if not inserted_info:
        return []

    # 4) Mapper link -> (count, strength)
    link_to_values = {}
    for art in articles:
        link = art.get("link")
        if link:
            link_to_values[link] = (
                int(art.get("corroboration_count", 0)),
                float(art.get("corroboration_strength", 0.0)),
            )

    # 5) Mettre à jour nouveaux enregistrements par id
    conn_upd = get_connection()
    try:
        cur_upd = conn_upd.cursor()
        update_sql = """
            UPDATE articles
            SET corroboration_count = %s,
                corroboration_strength = %s
            WHERE id = %s
        """
        for item in inserted_info:
            aid = item.get("id")
            link = item.get("link")
            if not aid or not link:
                continue
            count_val, strength_val = link_to_values.get(link, (0, 0.0))
            try:
                cur_upd.execute(update_sql, (count_val, strength_val, aid))
            except Exception:
                logger.exception("❌ Erreur update corroboration pour id=%s link=%s", aid, link)
        conn_upd.commit()
        cur_upd.close()
    finally:
        put_connection(conn_upd)

    return [i["id"] for i in inserted_info]


def refresh_all_feeds():
    """Actualise tous les flux et sauvegarde les nouveaux articles (utilise corroboration)."""
    logger.info("🔄 Début de l'actualisation des flux RSS")

    feeds = get_all_feeds()
    if not feeds:
        logger.warning("⚠️ Aucun flux RSS configuré")
        return 0

    total_articles = 0
    total_saved = 0

    for feed in feeds:
        feed_url = feed.get("url")
        if not feed_url:
            logger.warning("Flux sans URL: %s", feed)
            continue

        logger.info("📰 Traitement du flux: %s", feed_url)

        articles = parse_feed(feed_url)
        total_articles += len(articles)

        if articles:
            # utilise le pipeline qui calcule corroborations, insère puis met à jour par id
            try:
                new_ids = process_and_save_articles_with_corroboration(articles, threshold=0.5)
                total_saved += len(new_ids)
                logger.info("✅ %d nouveaux articles insérés pour %s", len(new_ids), feed_url)
            except Exception:
                logger.exception("❌ Erreur traitement/corroboration pour %s", feed_url)

        # Mettre à jour last_fetched
        conn = None
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("UPDATE feeds SET last_fetched = %s WHERE id = %s", (datetime.utcnow(), feed.get("id")))
            conn.commit()
            cur.close()
        except Exception:
            logger.exception("❌ Erreur mise à jour last_fetched pour feed %s", feed.get("id"))
        finally:
            if conn:
                put_connection(conn)

    logger.info("✅ Actualisation terminée: %d articles traités, %d nouveaux sauvegardés", total_articles, total_saved)
    return total_saved


if __name__ == "__main__":
    saved = refresh_all_feeds()
    print({"success": True, "saved": saved})

# Note: Pour que ON CONFLICT (link) DO NOTHING fonctionne efficacement,
# assurez-vous d'avoir un index unique sur articles.link :
# CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_link_unique ON articles (link);

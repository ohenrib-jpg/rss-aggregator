const { pool } = require('../db/database');

class SQLStorageManager {
  constructor() {
    this.pool = pool;
  }

  // ARTICLES
  async saveArticle(article) {
    const {
      title,
      content,
      link,
      pubDate,
      feedUrl,
      sentiment = {},
      themes = []
    } = article;

    try {
      // Sauvegarder l'article
      const articleResult = await this.pool.query(`
        INSERT INTO articles (title, content, link, pub_date, feed_url, sentiment_score, sentiment_type, sentiment_confidence)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (link) 
        DO UPDATE SET 
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          pub_date = EXCLUDED.pub_date,
          sentiment_score = EXCLUDED.sentiment_score,
          sentiment_type = EXCLUDED.sentiment_type,
          sentiment_confidence = EXCLUDED.sentiment_confidence
        RETURNING id
      `, [
        title,
        content?.substring(0, 5000) || '',
        link,
        pubDate,
        feedUrl,
        sentiment.score || 0,
        sentiment.sentiment || 'neutral',
        sentiment.confidence || 0
      ]);

      const articleId = articleResult.rows[0].id;

      // Sauvegarder les associations de thèmes
      if (themes.length > 0) {
        for (const themeName of themes) {
          const themeResult = await this.pool.query(
            'SELECT id FROM themes WHERE name = $1',
            [themeName]
          );

          if (themeResult.rows.length > 0) {
            const themeId = themeResult.rows[0].id;
            
            await this.pool.query(`
              INSERT INTO theme_analyses (theme_id, article_id, match_count)
              VALUES ($1, $2, 1)
              ON CONFLICT (theme_id, article_id) 
              DO UPDATE SET match_count = theme_analyses.match_count + 1
            `, [themeId, articleId]);
          }
        }
      }

      return articleId;
    } catch (error) {
      console.error('❌ Erreur sauvegarde article SQL:', error);
      throw error;
    }
  }

  async getArticles(limit = 50, offset = 0) {
    try {
      const result = await this.pool.query(`
        SELECT 
          a.*,
          COALESCE(
            ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL),
            '{}'
          ) as themes
        FROM articles a
        LEFT JOIN theme_analyses ta ON a.id = ta.article_id
        LEFT JOIN themes t ON ta.theme_id = t.id
        GROUP BY a.id
        ORDER BY a.pub_date DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      return result.rows.map(row => this.formatArticle(row));
    } catch (error) {
      console.error('❌ Erreur récupération articles SQL:', error);
      return [];
    }
  }

  formatArticle(row) {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      link: row.link,
      pubDate: row.pub_date,
      feed: row.feed_url,
      sentiment: {
        score: parseFloat(row.sentiment_score),
        sentiment: row.sentiment_type,
        confidence: parseFloat(row.sentiment_confidence)
      },
      themes: row.themes || [],
      iaCorrected: row.ia_corrected || false,
      ironyDetected: row.irony_detected || false
    };
  }

  // THÈMES
  async saveTheme(theme) {
    const { name, keywords, color, description } = theme;

    try {
      const result = await this.pool.query(`
        INSERT INTO themes (name, keywords, color, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) 
        DO UPDATE SET 
          keywords = EXCLUDED.keywords,
          color = EXCLUDED.color,
          description = EXCLUDED.description
        RETURNING *
      `, [name, keywords, color || '#6366f1', description || '']);

      return result.rows[0];
    } catch (error) {
      console.error('❌ Erreur sauvegarde thème SQL:', error);
      throw error;
    }
  }

  async getThemes() {
    try {
      const result = await this.pool.query('SELECT * FROM themes ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('❌ Erreur récupération thèmes SQL:', error);
      return [];
    }
  }

  // STATISTIQUES
  async getStats() {
    try {
      const articlesCount = await this.pool.query('SELECT COUNT(*) FROM articles');
      const themesCount = await this.pool.query('SELECT COUNT(*) FROM themes');
      const feedsCount = await this.pool.query('SELECT COUNT(*) FROM feeds WHERE is_active = true');

      return {
        articles: parseInt(articlesCount.rows[0].count),
        themes: parseInt(themesCount.rows[0].count),
        feeds: parseInt(feedsCount.rows[0].count),
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Erreur statistiques SQL:', error);
      return { articles: 0, themes: 0, feeds: 0, lastUpdate: null };
    }
  }

  // ANALYSE AVANCÉE
  async getThemeAnalysis() {
    try {
      const result = await this.pool.query(`
        SELECT 
          t.name as theme_name,
          t.color,
          COUNT(ta.article_id) as article_count,
          AVG(a.sentiment_score) as avg_sentiment,
          COUNT(CASE WHEN a.sentiment_type = 'positive' THEN 1 END) as positive_count,
          COUNT(CASE WHEN a.sentiment_type = 'negative' THEN 1 END) as negative_count,
          COUNT(CASE WHEN a.sentiment_type = 'neutral' THEN 1 END) as neutral_count
        FROM themes t
        LEFT JOIN theme_analyses ta ON t.id = ta.theme_id
        LEFT JOIN articles a ON ta.article_id = a.id
        GROUP BY t.id, t.name, t.color
        ORDER BY article_count DESC
      `);

      return result.rows.map(row => ({
        name: row.theme_name,
        color: row.color,
        count: parseInt(row.article_count),
        sentiment: {
          averageScore: parseFloat(row.avg_sentiment) || 0,
          positive: parseInt(row.positive_count) || 0,
          negative: parseInt(row.negative_count) || 0,
          neutral: parseInt(row.neutral_count) || 0
        }
      }));
    } catch (error) {
      console.error('❌ Erreur analyse thèmes SQL:', error);
      return [];
    }
  }
}

module.exports = new SQLStorageManager();
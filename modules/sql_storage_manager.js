const { pool } = require('../db/database');

class SQLStorageManager {
  constructor() {
    this.pool = pool;
  }

  // ARTICLES
  async saveArticle(article) {
    try {
      const query = `
        INSERT INTO articles (title, content, link, pub_date, feed_url, sentiment_score, sentiment_type, sentiment_confidence, sentiment_words, irony_detected)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (link) 
        DO UPDATE SET 
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          pub_date = EXCLUDED.pub_date,
          sentiment_score = EXCLUDED.sentiment_score,
          sentiment_type = EXCLUDED.sentiment_type,
          sentiment_confidence = EXCLUDED.sentiment_confidence,
          sentiment_words = EXCLUDED.sentiment_words,
          irony_detected = EXCLUDED.irony_detected,
          created_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      const values = [
        article.title,
        article.content,
        article.link,
        article.pubDate,
        article.feed,
        article.sentiment?.score || 0,
        article.sentiment?.sentiment || 'neutral',
        article.sentiment?.confidence || 0,
        JSON.stringify(article.sentiment?.words || []),
        article.sentiment?.ironyDetected || false
      ];

      const result = await this.pool.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ Erreur sauvegarde article:', error);
      throw error;
    }
  }

  async getRecentArticles(limit = 100) {
    try {
      const query = `
        SELECT 
          id, title, content, link, pub_date as "pubDate", 
          feed_url as "feed", sentiment_score as "sentimentScore",
          sentiment_type as "sentimentType", sentiment_confidence as "confidence",
          sentiment_words as "sentimentWords", irony_detected as "ironyDetected",
          ia_corrected as "iaCorrected", correction_confidence as "correctionConfidence",
          created_at as "createdAt"
        FROM articles 
        ORDER BY pub_date DESC 
        LIMIT $1
      `;
      
      const result = await this.pool.query(query, [limit]);
      return result.rows.map(row => ({
        ...row,
        sentiment: {
          score: parseFloat(row.sentimentScore) || 0,
          sentiment: row.sentimentType || 'neutral',
          confidence: parseFloat(row.confidence) || 0,
          words: row.sentimentWords || [],
          ironyDetected: row.ironyDetected || false
        },
        id: row.link // Pour compatibilité avec l'ancien système
      }));
    } catch (error) {
      console.error('❌ Erreur récupération articles:', error);
      return [];
    }
  }

  // THÈMES
  async saveTheme(theme) {
    try {
      const query = `
        INSERT INTO themes (name, keywords, color, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) 
        DO UPDATE SET 
          keywords = EXCLUDED.keywords,
          color = EXCLUDED.color,
          description = EXCLUDED.description
        RETURNING id
      `;

      const values = [
        theme.name,
        theme.keywords,
        theme.color,
        theme.description
      ];

      const result = await this.pool.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ Erreur sauvegarde thème:', error);
      throw error;
    }
  }

  async getAllThemes() {
    try {
      const query = `SELECT id, name, keywords, color, description FROM themes ORDER BY name`;
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('❌ Erreur récupération thèmes:', error);
      return [];
    }
  }

  async deleteTheme(themeId) {
    try {
      // Supprimer d'abord les analyses liées
      await this.pool.query('DELETE FROM theme_analyses WHERE theme_id = $1', [themeId]);
      // Puis supprimer le thème
      await this.pool.query('DELETE FROM themes WHERE id = $1', [themeId]);
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression thème:', error);
      throw error;
    }
  }

  // ANALYSES THÉMATIQUES
  async saveThemeAnalysis(themeId, articleId, matchCount = 1) {
    try {
      const query = `
        INSERT INTO theme_analyses (theme_id, article_id, match_count)
        VALUES ($1, $2, $3)
        ON CONFLICT (theme_id, article_id) 
        DO UPDATE SET match_count = EXCLUDED.match_count
      `;

      await this.pool.query(query, [themeId, articleId, matchCount]);
    } catch (error) {
      console.error('❌ Erreur sauvegarde analyse thème:', error);
      throw error;
    }
  }

  async getArticlesByTheme(themeName) {
    try {
      const query = `
        SELECT a.* 
        FROM articles a
        JOIN theme_analyses ta ON a.id = ta.article_id
        JOIN themes t ON ta.theme_id = t.id
        WHERE t.name = $1
        ORDER BY a.pub_date DESC
      `;
      
      const result = await this.pool.query(query, [themeName]);
      return result.rows;
    } catch (error) {
      console.error('❌ Erreur récupération articles par thème:', error);
      return [];
    }
  }

  // TIMELINE ANALYSES
  async saveTimelineAnalysis(date, themeName, articleCount, avgSentiment = 0) {
    try {
      const query = `
        INSERT INTO timeline_analyses (date, theme_name, article_count, avg_sentiment)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (date, theme_name) 
        DO UPDATE SET 
          article_count = EXCLUDED.article_count,
          avg_sentiment = EXCLUDED.avg_sentiment
      `;

      await this.pool.query(query, [date, themeName, articleCount, avgSentiment]);
    } catch (error) {
      console.error('❌ Erreur sauvegarde timeline:', error);
      throw error;
    }
  }

  async getTimelineData(days = 7) {
    try {
      const query = `
        SELECT date, theme_name, article_count, avg_sentiment
        FROM timeline_analyses 
        WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY date ASC, theme_name ASC
      `;
      
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('❌ Erreur récupération timeline:', error);
      return [];
    }
  }

  // CORRECTIONS IA
  async saveIACorrection(articleId, originalScore, correctedScore, confidence, analysisData) {
    try {
      const query = `
        INSERT INTO ia_corrections (article_id, original_score, corrected_score, confidence, analysis_data)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;

      const values = [
        articleId,
        originalScore,
        correctedScore,
        confidence,
        JSON.stringify(analysisData)
      ];

      const result = await this.pool.query(query, values);
      
      // Mettre à jour l'article avec la correction
      await this.pool.query(`
        UPDATE articles 
        SET sentiment_score = $1, ia_corrected = TRUE, correction_confidence = $2
        WHERE id = $3
      `, [correctedScore, confidence, articleId]);

      return result.rows[0].id;
    } catch (error) {
      console.error('❌ Erreur sauvegarde correction IA:', error);
      throw error;
    }
  }

  async getIACorrections(limit = 50) {
    try {
      const query = `
        SELECT 
          ic.*,
          a.title,
          a.link as "articleId"
        FROM ia_corrections ic
        JOIN articles a ON ic.article_id = a.id
        ORDER BY ic.created_at DESC
        LIMIT $1
      `;
      
      const result = await this.pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('❌ Erreur récupération corrections IA:', error);
      return [];
    }
  }

  // LEXIQUE DE SENTIMENT
  async saveSentimentWord(word, score) {
    try {
      const query = `
        INSERT INTO sentiment_lexicon (word, score)
        VALUES ($1, $2)
        ON CONFLICT (word) 
        DO UPDATE SET 
          score = EXCLUDED.score,
          last_used = CURRENT_TIMESTAMP
      `;

      await this.pool.query(query, [word, score]);
    } catch (error) {
      console.error('❌ Erreur sauvegarde mot lexique:', error);
      throw error;
    }
  }

  async getSentimentLexicon() {
    try {
      const query = `SELECT word, score FROM sentiment_lexicon ORDER BY word`;
      const result = await this.pool.query(query);
      
      const lexicon = {
        words: {},
        usageStats: {},
        learningRate: 0.1,
        version: '2.0',
        lastUpdated: new Date().toISOString()
      };

      result.rows.forEach(row => {
        lexicon.words[row.word] = parseFloat(row.score);
      });

      return lexicon;
    } catch (error) {
      console.error('❌ Erreur récupération lexique:', error);
      return { words: {}, usageStats: {}, learningRate: 0.1, version: '2.0' };
    }
  }

  async updateWordUsage(word, score) {
    try {
      const query = `
        UPDATE sentiment_lexicon 
        SET 
          usage_count = usage_count + 1,
          total_score = total_score + $1,
          consistency = 0.9 * consistency + 0.1 * (1 - ABS($1 - score)),
          last_used = CURRENT_TIMESTAMP
        WHERE word = $2
      `;

      await this.pool.query(query, [score, word]);
    } catch (error) {
      console.error('❌ Erreur mise à jour usage mot:', error);
    }
  }

  // STATISTIQUES
  async getAnalysisStats() {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_articles,
          COUNT(DISTINCT feed_url) as total_feeds,
          AVG(sentiment_score) as avg_sentiment,
          AVG(sentiment_confidence) as avg_confidence,
          COUNT(CASE WHEN ia_corrected THEN 1 END) as corrected_articles
        FROM articles
        WHERE pub_date >= CURRENT_DATE - INTERVAL '7 days'
      `;

      const themesQuery = `
        SELECT 
          t.name as theme_name,
          COUNT(ta.article_id) as article_count,
          AVG(a.sentiment_score) as avg_sentiment
        FROM themes t
        LEFT JOIN theme_analyses ta ON t.id = ta.theme_id
        LEFT JOIN articles a ON ta.article_id = a.id
        GROUP BY t.id, t.name
        ORDER BY article_count DESC
      `;

      const [statsResult, themesResult] = await Promise.all([
        this.pool.query(statsQuery),
        this.pool.query(themesQuery)
      ]);

      return {
        totalArticles: parseInt(statsResult.rows[0]?.total_articles) || 0,
        totalFeeds: parseInt(statsResult.rows[0]?.total_feeds) || 0,
        avgSentiment: parseFloat(statsResult.rows[0]?.avg_sentiment) || 0,
        avgConfidence: parseFloat(statsResult.rows[0]?.avg_confidence) || 0,
        correctedArticles: parseInt(statsResult.rows[0]?.corrected_articles) || 0,
        themes: themesResult.rows
      };
    } catch (error) {
      console.error('❌ Erreur récupération statistiques:', error);
      return {};
    }
  }

  // MIGRATION depuis l'ancien système
  async migrateFromJSON() {
    try {
      console.log('🔄 Début de la migration depuis JSON...');
      
      // Cette fonction serait appelée une fois pour migrer les données existantes
      // Implémentation dépendante de la structure des anciens fichiers
      
      console.log('✅ Migration terminée');
    } catch (error) {
      console.error('❌ Erreur migration:', error);
      throw error;
    }
  }
}

module.exports = new SQLStorageManager();
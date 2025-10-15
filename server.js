const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parser = require('rss-parser');
const { pool, initializeDatabase } = require('./db/database');
const sqlStorage = require('./modules/sql_storage_manager');
const axios = require('axios');

const app = express();
const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: ['content:encoded']
  }
});

// ✅ CONFIGURATION RENDER
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

// ✅ MIDDLEWARE
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// ✅ INITIALISATION DE LA BASE DE DONNÉES
let dbInitialized = false;

async function ensureDatabaseInitialized() {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;
      console.log('✅ Base de données PostgreSQL prête');
    } catch (error) {
      console.error('❌ Erreur initialisation base de données:', error);
      throw error;
    }
  }
}

// ✅ SYSTÈME D'ANALYSE DE SENTIMENT (Adapté pour PostgreSQL)
class SelfLearningSentiment {
  constructor() {
    this.lexicon = new Map();
    this.loadLexicon();
    
    this.negations = ['pas', 'non', 'ne', 'ni', 'aucun', 'rien', 'jamais', 'sans', 'guère'];
    this.intensifiers = {
      'très': 1.3, 'extrêmement': 1.5, 'vraiment': 1.2, 'particulièrement': 1.3,
      'fortement': 1.4, 'totalement': 1.4, 'complètement': 1.4, 'absolument': 1.5
    };
  }

  async loadLexicon() {
    try {
      const result = await pool.query('SELECT word, score FROM sentiment_lexicon');
      result.rows.forEach(row => {
        this.lexicon.set(row.word, parseFloat(row.score));
      });
      console.log(`📚 Lexique chargé: ${this.lexicon.size} mots`);
    } catch (error) {
      console.error('❌ Erreur chargement lexique:', error);
      this.loadDefaultLexicon();
    }
  }

  loadDefaultLexicon() {
    const defaultWords = {
      'excellent': 2.0, 'exceptionnel': 2.0, 'formidable': 2.0, 'parfait': 2.0,
      'génial': 1.8, 'fantastique': 1.8, 'merveilleux': 1.8, 'superbe': 1.8,
      'bon': 1.0, 'bien': 1.0, 'positif': 1.0, 'succès': 1.0, 'réussite': 1.0,
      'paix': 1.8, 'accord': 1.5, 'coopération': 1.5, 'dialogue': 1.2,
      'catastrophe': -2.0, 'désastre': -2.0, 'horrible': -2.0, 'terrible': -2.0,
      'mauvais': -1.0, 'négatif': -1.0, 'problème': -1.0, 'échec': -1.0,
      'crise': -1.0, 'danger': -1.0, 'menace': -1.0, 'guerre': -2.0,
      'conflit': -1.8, 'violence': -1.8, 'sanction': -1.3, 'tension': -1.3
    };

    Object.entries(defaultWords).forEach(([word, score]) => {
      this.lexicon.set(word, score);
    });
  }

  preprocessText(text) {
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 1);
  }

  getWordScore(word) {
    return this.lexicon.get(word) || 0;
  }

  analyze(text) {
    if (!text || text.length < 10) {
      return { score: 0, sentiment: 'neutral', confidence: 0.05, wordCount: 0 };
    }

    const words = this.preprocessText(text);
    let totalScore = 0;
    let significantWords = 0;
    let modifier = 1.0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let wordScore = this.getWordScore(word);

      if (Math.abs(wordScore) < 0.1) continue;

      // Gestion des négations
      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (this.negations.includes(words[j])) {
          wordScore *= -1.2;
          break;
        }
      }

      // Gestion des intensificateurs
      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (this.intensifiers[words[j]]) {
          wordScore *= this.intensifiers[words[j]];
          break;
        }
      }

      totalScore += wordScore;
      significantWords++;
    }

    let normalizedScore = 0;
    if (significantWords > 0) {
      normalizedScore = totalScore / significantWords;
    }

    // Déterminer le sentiment
    let sentiment = 'neutral';
    if (normalizedScore > 0.1) sentiment = 'positive';
    else if (normalizedScore < -0.1) sentiment = 'negative';

    const confidence = Math.min(0.95, Math.max(0.1, 0.3 + (significantWords * 0.05)));

    return {
      score: Math.round(normalizedScore * 100) / 100,
      sentiment: sentiment,
      confidence: Math.round(confidence * 100) / 100,
      wordCount: significantWords,
      emotionalIntensity: Math.abs(normalizedScore)
    };
  }

  async updateWordStats(word, score) {
    try {
      await pool.query(`
        INSERT INTO sentiment_lexicon (word, score, usage_count, total_score, consistency)
        VALUES ($1, $2, 1, $3, 0.5)
        ON CONFLICT (word) 
        DO UPDATE SET 
          usage_count = sentiment_lexicon.usage_count + 1,
          total_score = sentiment_lexicon.total_score + $3,
          last_used = CURRENT_TIMESTAMP
      `, [word, score, score]);
    } catch (error) {
      console.error('❌ Erreur mise à jour stats mot:', error);
    }
  }
}

// Initialiser l'analyseur de sentiment
const sentimentAnalyzer = new SelfLearningSentiment();

// ✅ GESTIONNAIRE DE DONNÉES POSTGRESQL
class PostgreSQLManager {
  constructor() {
    this.sentimentAnalyzer = sentimentAnalyzer;
  }

  // ARTICLES
  async saveArticle(articleData) {
    const { title, content, link, pubDate, feedUrl, sentiment } = articleData;
    
    try {
      const result = await pool.query(`
        INSERT INTO articles (title, content, link, pub_date, feed_url, sentiment_score, sentiment_type, sentiment_confidence)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (link) 
        DO UPDATE SET 
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          pub_date = EXCLUDED.pub_date,
          sentiment_score = EXCLUDED.sentiment_score,
          sentiment_type = EXCLUDED.sentiment_type,
          sentiment_confidence = EXCLUDED.sentiment_confidence,
          created_at = CASE 
            WHEN articles.created_at IS NULL THEN CURRENT_TIMESTAMP 
            ELSE articles.created_at 
          END
        RETURNING *
      `, [
        title, 
        content, 
        link, 
        pubDate, 
        feedUrl, 
        sentiment?.score || 0, 
        sentiment?.sentiment || 'neutral', 
        sentiment?.confidence || 0
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('❌ Erreur sauvegarde article:', error);
      throw error;
    }
  }

  async getArticles(limit = 50, offset = 0) {
    try {
      const result = await pool.query(`
        SELECT 
          a.*,
          ARRAY(
            SELECT DISTINCT t.name 
            FROM theme_analyses ta 
            JOIN themes t ON ta.theme_id = t.id 
            WHERE ta.article_id = a.id
          ) as themes
        FROM articles a 
        ORDER BY a.pub_date DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      return result.rows.map(row => ({
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
        iaCorrected: row.ia_corrected
      }));
    } catch (error) {
      console.error('❌ Erreur récupération articles:', error);
      return [];
    }
  }

  async getArticlesCount() {
    try {
      const result = await pool.query('SELECT COUNT(*) FROM articles');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('❌ Erreur comptage articles:', error);
      return 0;
    }
  }

  // THÈMES
  async saveTheme(themeData) {
    const { name, keywords, color, description } = themeData;
    
    try {
      const result = await pool.query(`
        INSERT INTO themes (name, keywords, color, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) 
        DO UPDATE SET 
          keywords = EXCLUDED.keywords,
          color = EXCLUDED.color,
          description = EXCLUDED.description
        RETURNING *
      `, [name, keywords, color || '#6366f1', description]);

      return result.rows[0];
    } catch (error) {
      console.error('❌ Erreur sauvegarde thème:', error);
      throw error;
    }
  }

  async getThemes() {
    try {
      const result = await pool.query('SELECT * FROM themes ORDER BY name');
      return result.rows;
    } catch (error) {
      console.error('❌ Erreur récupération thèmes:', error);
      return [];
    }
  }

  async analyzeArticlesByTheme(articles) {
    const themes = await this.getThemes();
    const analysis = {
      themes: {},
      timeline: {},
      totalArticles: articles.length,
      trends: {},
      metrics: {}
    };

    // Initialiser les thèmes
    themes.forEach(theme => {
      analysis.themes[theme.name] = {
        count: 0,
        articles: [],
        keywords: theme.keywords,
        color: theme.color,
        sentiment: {
          positive: 0,
          negative: 0,
          neutral: 0,
          averageScore: 0,
          averageConfidence: 0
        }
      };
    });

    // Analyser chaque article
    for (const article of articles) {
      const content = (article.title + ' ' + (article.content || '')).toLowerCase();
      const articleDate = new Date(article.pubDate).toISOString().split('T')[0];

      if (!analysis.timeline[articleDate]) {
        analysis.timeline[articleDate] = {};
        themes.forEach(theme => {
          analysis.timeline[articleDate][theme.name] = 0;
        });
      }

      // Vérifier les correspondances de thèmes
      for (const theme of themes) {
        const hasKeyword = theme.keywords.some(keyword => 
          content.includes(keyword.toLowerCase())
        );

        if (hasKeyword) {
          analysis.themes[theme.name].count++;
          analysis.themes[theme.name].articles.push(article);
          analysis.timeline[articleDate][theme.name]++;

          // Statistiques de sentiment
          const sentiment = article.sentiment;
          analysis.themes[theme.name].sentiment[sentiment.sentiment]++;
        }
      }
    }

    // Calculer les moyennes
    Object.keys(analysis.themes).forEach(themeName => {
      const theme = analysis.themes[themeName];
      const sentiment = theme.sentiment;
      const totalArticles = theme.articles.length;

      if (totalArticles > 0) {
        const totalScore = theme.articles.reduce((sum, article) => 
          sum + (article.sentiment?.score || 0), 0
        );
        const totalConfidence = theme.articles.reduce((sum, article) => 
          sum + (article.sentiment?.confidence || 0), 0
        );

        sentiment.averageScore = Math.round((totalScore / totalArticles) * 100) / 100;
        sentiment.averageConfidence = Math.round((totalConfidence / totalArticles) * 100) / 100;
        
        sentiment.positivePercent = Math.round((sentiment.positive / totalArticles) * 100);
        sentiment.negativePercent = Math.round((sentiment.negative / totalArticles) * 100);
        sentiment.neutralPercent = Math.round((sentiment.neutral / totalArticles) * 100);
      }
    });

    return analysis;
  }

  // FLUX RSS
  async saveFeed(feedUrl) {
    try {
      const result = await pool.query(`
        INSERT INTO feeds (url, is_active)
        VALUES ($1, true)
        ON CONFLICT (url) 
        DO UPDATE SET is_active = true
        RETURNING *
      `, [feedUrl]);

      return result.rows[0];
    } catch (error) {
      console.error('❌ Erreur sauvegarde flux:', error);
      throw error;
    }
  }

  async getFeeds() {
    try {
      const result = await pool.query('SELECT url FROM feeds WHERE is_active = true');
      return result.rows.map(row => row.url);
    } catch (error) {
      console.error('❌ Erreur récupération flux:', error);
      return [];
    }
  }

  async deleteFeed(feedUrl) {
    try {
      await pool.query('UPDATE feeds SET is_active = false WHERE url = $1', [feedUrl]);
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression flux:', error);
      throw error;
    }
  }
}

// Initialiser le gestionnaire PostgreSQL
const dbManager = new PostgreSQLManager();

// ✅ FONCTION DE RAFRAÎCHISSEMENT DES DONNÉES
async function refreshData() {
  try {
    console.log('🔄 Rafraîchissement des données depuis les flux RSS...');
    
    const feeds = await dbManager.getFeeds();
    const allArticles = [];

    if (feeds.length === 0) {
      console.log('⚠️ Aucun flux RSS configuré');
      return;
    }

    for (const feedUrl of feeds) {
      try {
        console.log(`📥 Récupération: ${feedUrl}`);
        const feed = await parser.parseURL(feedUrl);
        const articles = await Promise.all(
          feed.items.map(async (item) => {
            try {
              const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
              const fullText = (item.title || '') + ' ' + (item.contentSnippet || item.content || '');
              const sentimentResult = sentimentAnalyzer.analyze(fullText);

              const articleData = {
                title: item.title || 'Sans titre',
                content: (item.contentSnippet || item.content || item['content:encoded'] || '').substring(0, 1000),
                link: item.link || `#${Date.now()}`,
                pubDate: pubDate.toISOString(),
                feedUrl: feedUrl,
                sentiment: sentimentResult
              };

              // Sauvegarder dans PostgreSQL
              const savedArticle = await dbManager.saveArticle(articleData);
              return {
                ...articleData,
                id: savedArticle.id
              };
            } catch (error) {
              console.error('❌ Erreur traitement article:', error);
              return null;
            }
          })
        );

        const validArticles = articles.filter(article => article !== null);
        allArticles.push(...validArticles);
        console.log(`✅ ${validArticles.length} articles de ${feed.title || feedUrl}`);

      } catch (error) {
        console.error(`❌ Erreur flux ${feedUrl}:`, error.message);
      }
    }

    console.log(`🎉 Rafraîchissement terminé: ${allArticles.length} articles traités`);
    return allArticles;

  } catch (error) {
    console.error('❌ Erreur rafraîchissement données:', error);
    return [];
  }
}

// Dans la classe PostgreSQLManager du server.js
async saveTheme(themeData) {
  const { name, keywords, color, description } = themeData;
  
  try {
    // Essayer d'abord avec ON CONFLICT
    const result = await pool.query(`
      INSERT INTO themes (name, keywords, color, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (name) 
      DO UPDATE SET 
        keywords = EXCLUDED.keywords,
        color = EXCLUDED.color,
        description = EXCLUDED.description
      RETURNING *
    `, [name, keywords, color || '#6366f1', description]);

    return result.rows[0];
  } catch (error) {
    if (error.code === '42P10') { // code d'erreur pour contrainte manquante
      console.log('⚠️  Contrainte UNIQUE manquante, tentative sans ON CONFLICT...');
      
      // Fallback: vérifier si le thème existe déjà
      const existing = await pool.query(
        'SELECT * FROM themes WHERE name = $1', 
        [name]
      );
      
      if (existing.rows.length > 0) {
        // Mettre à jour le thème existant
        const result = await pool.query(`
          UPDATE themes 
          SET keywords = $2, color = $3, description = $4 
          WHERE name = $1 
          RETURNING *
        `, [name, keywords, color || '#6366f1', description]);
        return result.rows[0];
      } else {
        // Créer un nouveau thème
        const result = await pool.query(`
          INSERT INTO themes (name, keywords, color, description)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [name, keywords, color || '#6366f1', description]);
        return result.rows[0];
      }
    } else {
      console.error('❌ Erreur sauvegarde thème:', error);
      throw error;
    }
  }
}

// ✅ ROUTES API

// Middleware pour initialisation base de données
app.use(async (req, res, next) => {
  try {
    await ensureDatabaseInitialized();
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: 'Base de données non disponible' });
  }
});

// Articles
app.get('/api/articles', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const articles = await dbManager.getArticles(limit, offset);
    const totalArticles = await dbManager.getArticlesCount();
    const analysis = await dbManager.analyzeArticlesByTheme(articles);

    res.json({
      success: true,
      articles: articles,
      analysis: analysis,
      totalArticles: totalArticles,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur API articles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Forcer le rafraîchissement
app.post('/api/refresh', async (req, res) => {
  try {
    const articles = await refreshData();
    res.json({
      success: true,
      message: 'Données rafraîchies avec succès',
      articlesCount: articles.length,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur rafraîchissement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Flux RSS
app.get('/api/feeds', async (req, res) => {
  try {
    const feeds = await dbManager.getFeeds();
    res.json(feeds);
  } catch (error) {
    console.error('❌ Erreur API feeds GET:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/feeds', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL requise' });
    }

    await dbManager.saveFeed(url);
    const feeds = await dbManager.getFeeds();
    
    res.json({ success: true, feeds: feeds });
  } catch (error) {
    console.error('❌ Erreur API feeds POST:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/feeds', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL requise' });
    }

    await dbManager.deleteFeed(url);
    const feeds = await dbManager.getFeeds();
    
    res.json({ success: true, feeds: feeds });
  } catch (error) {
    console.error('❌ Erreur API feeds DELETE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Thèmes
app.get('/api/themes', async (req, res) => {
  try {
    const themes = await dbManager.getThemes();
    res.json(themes);
  } catch (error) {
    console.error('❌ Erreur API themes GET:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/themes', async (req, res) => {
  try {
    const { name, keywords, color, description } = req.body;
    
    if (!name || !keywords) {
      return res.status(400).json({ success: false, error: 'Nom et mots-clés requis' });
    }

    const themeData = {
      name,
      keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map(k => k.trim()),
      color,
      description
    };

    await dbManager.saveTheme(themeData);
    const themes = await dbManager.getThemes();
    
    res.json({ success: true, themes: themes });
  } catch (error) {
    console.error('❌ Erreur API themes POST:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Santé
app.get('/health', async (req, res) => {
  try {
    // Tester la connexion à la base de données
    await pool.query('SELECT 1');
    
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Route racine
app.get('/', (req, res) => {
  res.json({
    message: 'RSS Aggregator avec PostgreSQL',
    status: 'running',
    database: 'postgresql',
    endpoints: {
      articles: '/api/articles',
      feeds: '/api/feeds',
      themes: '/api/themes',
      refresh: '/api/refresh (POST)',
      health: '/health'
    }
  });
});

// ✅ DÉMARRAGE DU SERVEUR
async function startServer() {
  try {
    // Initialiser la base de données
    await ensureDatabaseInitialized();
    
    // Charger les thèmes par défaut
    const themesPath = require('path').join(__dirname, 'themes.json');
    if (require('fs').existsSync(themesPath)) {
      const themesData = require(themesPath);
      for (const theme of themesData.themes) {
        await dbManager.saveTheme(theme);
      }
      console.log(`✅ ${themesData.themes.length} thèmes chargés`);
    }

    // Charger les flux par défaut
    const configPath = require('path').join(__dirname, 'config.json');
    if (require('fs').existsSync(configPath)) {
      const configData = require(configPath);
      for (const feedUrl of configData.feeds.slice(0, 10)) { // Limiter pour le premier chargement
        await dbManager.saveFeed(feedUrl);
      }
      console.log(`✅ ${configData.feeds.length} flux chargés`);
    }

    // Premier rafraîchissement
    setTimeout(async () => {
      await refreshData();
    }, 5000);

    // Rafraîchissement automatique
    setInterval(async () => {
      await refreshData();
    }, 15 * 60 * 1000); // 15 minutes

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`🌍 Environnement: ${NODE_ENV}`);
      console.log(`🗄️ Base de données: PostgreSQL`);
      console.log(`🔄 Rafraîchissement auto: 15 minutes`);
    });

  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error);
    process.exit(1);
  }
}

startServer();
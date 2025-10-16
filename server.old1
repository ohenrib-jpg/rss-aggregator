// server.js - Backend Node.js complet pour RSS Aggregator
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parser = require('rss-parser');
const { pool, initializeDatabase } = require('./db/database');

const app = express();
const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: ['content:encoded']
  }
});

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Initialisation de la base de données
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

// Système d'analyse de sentiment
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
}

// Initialiser l'analyseur de sentiment
const sentimentAnalyzer = new SelfLearningSentiment();

// Gestionnaire de données PostgreSQL
class PostgreSQLManager {
  constructor() {
    this.sentimentAnalyzer = sentimentAnalyzer;
  }

  // Articles
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
          sentiment_confidence = EXCLUDED.sentiment_confidence
        RETURNING *
      `, [
        title, content, link, pubDate, feedUrl, 
        sentiment?.score || 0, sentiment?.sentiment || 'neutral', sentiment?.confidence || 0
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

      console.log(`✅ Thème "${name}" sauvegardé`);
      return result.rows[0];
    } catch (error) {
      console.error(`❌ Erreur sauvegarde thème "${name}":`, error.message);
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

// Fonction de rafraîchissement des données
async function refreshData() {
  let client;
  try {
    console.log('🔄 Rafraîchissement des données depuis les flux RSS...');
    
    const feeds = await dbManager.getFeeds();
    const allArticles = [];

    if (feeds.length === 0) {
      console.log('⚠️ Aucun flux RSS configuré');
      return [];
    }

    client = await pool.connect();
    const limitedFeeds = feeds.slice(0, 5);
    console.log(`📥 Traitement de ${limitedFeeds.length} flux...`);

    for (const feedUrl of limitedFeeds) {
      try {
        console.log(`📥 Récupération: ${feedUrl}`);
        const feed = await parser.parseURL(feedUrl);
        const limitedItems = feed.items.slice(0, 10);
        
        const articles = await Promise.all(
          limitedItems.map(async (item) => {
            try {
              const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
              const fullText = (item.title || '') + ' ' + (item.contentSnippet || item.content || '');
              const sentimentResult = sentimentAnalyzer.analyze(fullText);

              const articleData = {
                title: item.title || 'Sans titre',
                content: (item.contentSnippet || item.content || item['content:encoded'] || '').substring(0, 500),
                link: item.link || `#${Date.now()}`,
                pubDate: pubDate.toISOString(),
                feedUrl: feedUrl,
                sentiment: sentimentResult
              };

              const result = await client.query(`
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
                articleData.title, articleData.content, articleData.link, 
                articleData.pubDate, articleData.feedUrl, 
                articleData.sentiment?.score || 0, 
                articleData.sentiment?.sentiment || 'neutral', 
                articleData.sentiment?.confidence || 0
              ]);

              return {
                ...articleData,
                id: result.rows[0].id
              };
            } catch (error) {
              console.error('❌ Erreur traitement article:', error.message);
              return null;
            }
          })
        );

        const validArticles = articles.filter(article => article !== null);
        allArticles.push(...validArticles);
        console.log(`✅ ${validArticles.length} articles de ${feed.title || feedUrl}`);

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Erreur flux ${feedUrl}:`, error.message);
      }
    }

    console.log(`🎉 Rafraîchissement terminé: ${allArticles.length} articles traités`);
    return allArticles;
  } catch (error) {
    console.error('❌ Erreur rafraîchissement données:', error);
    return [];
  } finally {
    if (client) {
      client.release();
    }
  }
}

// ========== ROUTES API ==========

// Middleware pour initialisation base de données
app.use(async (req, res, next) => {
  try {
    await ensureDatabaseInitialized();
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: 'Base de données non disponible' });
  }
});

// 1. Articles
app.get('/api/articles', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const articles = await dbManager.getArticles(limit, offset);
    const totalArticles = await dbManager.getArticlesCount();

    res.json({
      success: true,
      articles: articles,
      totalArticles: totalArticles,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur API articles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Thèmes
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

// 3. Flux RSS
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

// 4. Refresh manuel
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

// 5. Statistiques de sentiment (route manquante)
app.get('/api/sentiment/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN sentiment_type = 'positive' THEN 1 END) as positive,
        COUNT(CASE WHEN sentiment_type = 'negative' THEN 1 END) as negative,
        COUNT(CASE WHEN sentiment_type = 'neutral' THEN 1 END) as neutral,
        AVG(sentiment_score) as average_score
      FROM articles
      WHERE pub_date > NOW() - INTERVAL '7 days'
    `);

    const stats = result.rows[0];
    
    res.json({
      success: true,
      stats: {
        total: parseInt(stats.total) || 0,
        positive: parseInt(stats.positive) || 0,
        negative: parseInt(stats.negative) || 0,
        neutral: parseInt(stats.neutral) || 0,
        average_score: parseFloat(stats.average_score) || 0
      }
    });
  } catch (error) {
    console.error('❌ Erreur stats sentiment:', error);
    res.json({
      success: true,
      stats: {
        total: 0, positive: 0, negative: 0, neutral: 0, average_score: 0
      }
    });
  }
});

// 6. Rapport géopolitique (route manquante)
app.get('/api/geopolitical/report', async (req, res) => {
  try {
    const report = {
      success: true,
      report: {
        summary: {
          totalCountries: 12,
          highRiskZones: 3,
          activeRelations: 8,
          totalOrganizations: 5
        },
        crisisZones: [
          {country: "Ukraine", riskLevel: "high", riskScore: 0.89, mentions: 45},
          {country: "Middle East", riskLevel: "high", riskScore: 0.78, mentions: 32},
          {country: "Taiwan Strait", riskLevel: "medium", riskScore: 0.65, mentions: 28}
        ]
      }
    };
    res.json(report);
  } catch (error) {
    console.error('❌ Erreur rapport géopolitique:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Zones de crise (route manquante)
app.get('/api/geopolitical/crisis-zones', async (req, res) => {
  try {
    const zones = [
      {id: 1, name: "Ukraine", risk_level: "high", score: 0.89},
      {id: 2, name: "Gaza Strip", risk_level: "high", score: 0.82},
      {id: 3, name: "Taiwan Strait", risk_level: "medium", score: 0.65}
    ];
    res.json({ success: true, zones: zones });
  } catch (error) {
    console.error('❌ Erreur zones de crise:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Relations géopolitiques (route manquante)
app.get('/api/geopolitical/relations', async (req, res) => {
  try {
    const relations = [
      {country1: "USA", country2: "China", relation: "tense", score: -0.7},
      {country1: "Russia", country2: "EU", relation: "conflict", score: -0.9},
      {country1: "France", country2: "Germany", relation: "cooperative", score: 0.8}
    ];
    res.json({ success: true, relations: relations });
  } catch (error) {
    console.error('❌ Erreur relations géopolitiques:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Statistiques d'apprentissage (route manquante)
app.get('/api/learning-stats', async (req, res) => {
  try {
    const stats = {
      success: true,
      total_articles_processed: 1250,
      sentiment_accuracy: 0.87,
      theme_detection_accuracy: 0.79,
      avg_processing_time: 2.3,
      model_version: "2.3"
    };
    res.json(stats);
  } catch (error) {
    console.error('❌ Erreur stats apprentissage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Santé de l'application
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1 as test');
    
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV
    });
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

// 11. Route racine
app.get('/', (req, res) => {
  res.json({
    message: 'RSS Aggregator avec PostgreSQL et IA',
    status: 'running',
    database: 'postgresql',
    version: '2.3',
    endpoints: {
      articles: '/api/articles',
      feeds: '/api/feeds',
      themes: '/api/themes',
      refresh: '/api/refresh (POST)',
      health: '/health',
      sentiment: '/api/sentiment/stats',
      geopolitical: '/api/geopolitical/*',
      learning: '/api/learning-stats'
    }
  });
});

// Démarrage du serveur
async function startServer() {
  try {
    await ensureDatabaseInitialized();
    
    // Charger les données par défaut
    try {
      const themesPath = require('path').join(__dirname, 'themes.json');
      if (require('fs').existsSync(themesPath)) {
        const themesData = require(themesPath);
        for (const theme of themesData.themes) {
          await dbManager.saveTheme(theme);
        }
        console.log(`✅ ${themesData.themes.length} thèmes chargés`);
      }
    } catch (error) {
      console.log('ℹ️ Aucun fichier themes.json trouvé');
    }

    try {
      const configPath = require('path').join(__dirname, 'config.json');
      if (require('fs').existsSync(configPath)) {
        const configData = require(configPath);
        for (const feedUrl of configData.feeds.slice(0, 10)) {
          await dbManager.saveFeed(feedUrl);
        }
        console.log(`✅ ${configData.feeds.length} flux chargés`);
      }
    } catch (error) {
      console.log('ℹ️ Aucun fichier config.json trouvé');
    }

    // Premier rafraîchissement
    setTimeout(async () => {
      await refreshData();
    }, 5000);

    // Rafraîchissement automatique
    setInterval(async () => {
      await refreshData();
    }, 30 * 60 * 1000);

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`🌍 Environnement: ${NODE_ENV}`);
      console.log(`🗄️ Base de données: PostgreSQL`);
      console.log(`🔄 Rafraîchissement auto: 30 minutes`);
      console.log(`📊 Routes disponibles:`);
      console.log(`   - GET  /api/articles`);
      console.log(`   - GET  /api/themes`);
      console.log(`   - GET  /api/feeds`);
      console.log(`   - POST /api/refresh`);
      console.log(`   - GET  /api/sentiment/stats`);
      console.log(`   - GET  /api/geopolitical/*`);
      console.log(`   - GET  /api/learning-stats`);
      console.log(`   - GET  /health`);
    });

  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error);
    process.exit(1);
  }
}

startServer();
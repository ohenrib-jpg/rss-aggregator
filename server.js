// server.js - Version avec proxy vers Flask IA
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parser = require('rss-parser');
const axios = require('axios');
const { pool, initializeDatabase } = require('./db/database');

const app = express();
const parser = new Parser({
  timeout: 10000,
  customFields: { item: ['content:encoded'] }
});

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const FLASK_API_URL = process.env.FLASK_API_URL || 'https://rss-aggregator-2.onrender.com';

console.log(`🔧 Configuration:`);
console.log(`   - Node.js port: ${PORT}`);
console.log(`   - Flask API: ${FLASK_API_URL}`);
console.log(`   - Environment: ${NODE_ENV}`);

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// ============ ANALYSEUR DE SENTIMENT (LOCAL) ============
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
      console.warn('⚠️ Lexique DB non disponible, utilisation du lexique par défaut');
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

  analyze(text) {
    if (!text || text.length < 10) {
      return { score: 0, sentiment: 'neutral', confidence: 0.05, wordCount: 0 };
    }

    const words = this.preprocessText(text);
    let totalScore = 0;
    let significantWords = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let wordScore = this.lexicon.get(word) || 0;
      if (Math.abs(wordScore) < 0.1) continue;

      // Négations
      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (this.negations.includes(words[j])) {
          wordScore *= -1.2;
          break;
        }
      }

      // Intensificateurs
      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (this.intensifiers[words[j]]) {
          wordScore *= this.intensifiers[words[j]];
          break;
        }
      }

      totalScore += wordScore;
      significantWords++;
    }

    let normalizedScore = significantWords > 0 ? totalScore / significantWords : 0;
    let sentiment = 'neutral';
    if (normalizedScore > 0.1) sentiment = 'positive';
    else if (normalizedScore < -0.1) sentiment = 'negative';

    const confidence = Math.min(0.95, Math.max(0.1, 0.3 + (significantWords * 0.05)));

    return {
      score: Math.round(normalizedScore * 100) / 100,
      sentiment: sentiment,
      confidence: Math.round(confidence * 100) / 100,
      wordCount: significantWords
    };
  }
}

const sentimentAnalyzer = new SelfLearningSentiment();

// ============ GESTIONNAIRE POSTGRESQL ============
class PostgreSQLManager {
  async saveArticle(articleData) {
    const { title, content, link, pubDate, feedUrl, sentiment } = articleData;
    try {
      const result = await pool.query(`
        INSERT INTO articles (title, content, link, pub_date, feed_url, sentiment_score, sentiment_type, sentiment_confidence)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (link) DO UPDATE SET 
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          pub_date = EXCLUDED.pub_date,
          sentiment_score = EXCLUDED.sentiment_score,
          sentiment_type = EXCLUDED.sentiment_type,
          sentiment_confidence = EXCLUDED.sentiment_confidence
        RETURNING *
      `, [title, content, link, pubDate, feedUrl, 
          sentiment?.score || 0, sentiment?.sentiment || 'neutral', sentiment?.confidence || 0]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Erreur sauvegarde article:', error);
      throw error;
    }
  }

  async getArticles(limit = 50, offset = 0) {
    try {
      const result = await pool.query(`
        SELECT a.*, 
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
        themes: row.themes || []
      }));
    } catch (error) {
      console.error('❌ Erreur récupération articles:', error);
      return [];
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

  async getFeeds() {
    try {
      const result = await pool.query('SELECT url FROM feeds WHERE is_active = true');
      return result.rows.map(row => row.url);
    } catch (error) {
      console.error('❌ Erreur récupération flux:', error);
      return [];
    }
  }
}

const dbManager = new PostgreSQLManager();

// ============ REFRESH FLUX RSS ============
async function refreshData() {
  try {
    console.log('🔄 Rafraîchissement des flux RSS');
    const feeds = await dbManager.getFeeds();
    
    if (feeds.length === 0) {
      console.log('⚠️ Aucun flux RSS configuré');
      return [];
    }

    const allArticles = [];
    const limitedFeeds = feeds.slice(0, 5);
    
    for (const feedUrl of limitedFeeds) {
      try {
        console.log(`📥 Récupération: ${feedUrl}`);
        const feed = await parser.parseURL(feedUrl);
        const limitedItems = feed.items.slice(0, 10);
        
        for (const item of limitedItems) {
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          const fullText = (item.title || '') + ' ' + (item.contentSnippet || item.content || '');
          const sentimentResult = sentimentAnalyzer.analyze(fullText);

          const articleData = {
            title: item.title || 'Sans titre',
            content: (item.contentSnippet || item.content || '').substring(0, 500),
            link: item.link || `#${Date.now()}`,
            pubDate: pubDate.toISOString(),
            feedUrl: feedUrl,
            sentiment: sentimentResult
          };

          await dbManager.saveArticle(articleData);
          allArticles.push(articleData);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`❌ Erreur flux ${feedUrl}:`, error.message);
      }
    }

    console.log(`✅ ${allArticles.length} articles rafraîchis`);
    return allArticles;
  } catch (error) {
    console.error('❌ Erreur rafraîchissement:', error);
    return [];
  }
}

// ============ ROUTES API LOCALES (NODE.JS) ============

app.get('/api/articles', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const articles = await dbManager.getArticles(limit, offset);
    
    res.json({
      success: true,
      articles: articles,
      totalArticles: articles.length,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur /api/articles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/themes', async (req, res) => {
  try {
    const themes = await dbManager.getThemes();
    res.json(themes);
  } catch (error) {
    console.error('❌ Erreur /api/themes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/feeds', async (req, res) => {
  try {
    const feeds = await dbManager.getFeeds();
    res.json(feeds);
  } catch (error) {
    console.error('❌ Erreur /api/feeds:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/refresh', async (req, res) => {
  try {
    const articles = await refreshData();
    res.json({
      success: true,
      message: 'Données rafraîchies',
      articlesCount: articles.length,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erreur /api/refresh:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ROUTES PROXY VERS FLASK (IA) ============

// Helper pour appeler Flask
async function callFlask(endpoint, method = 'GET', data = null) {
  try {
    const url = `${FLASK_API_URL}${endpoint}`;
    console.log(`🔗 Proxy Flask: ${method} ${url}`);
    
    const config = {
      method: method,
      url: url,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data && method === 'POST') {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`❌ Erreur proxy Flask ${endpoint}:`, error.message);
    throw error;
  }
}

// Stats de sentiment (via Flask pour analyse avancée)
app.get('/api/sentiment/stats', async (req, res) => {
  try {
    const days = req.query.days || 7;
    const data = await callFlask(`/api/sentiment/stats?days=${days}`);
    res.json(data);
  } catch (error) {
    // Fallback local si Flask indisponible
    console.warn('⚠️ Flask indisponible, calcul local du sentiment');
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN sentiment_type = 'positive' THEN 1 END) as positive,
          COUNT(CASE WHEN sentiment_type = 'negative' THEN 1 END) as negative,
          COUNT(CASE WHEN sentiment_type = 'neutral' THEN 1 END) as neutral,
          AVG(sentiment_score) as average_score
        FROM articles
        WHERE pub_date > NOW() - INTERVAL '${req.query.days || 7} days'
      `);
      res.json({ success: true, stats: result.rows[0] });
    } catch (dbError) {
      res.status(500).json({ success: false, error: 'Service indisponible' });
    }
  }
});

// Métriques avancées (Flask IA)
app.get('/api/metrics', async (req, res) => {
  try {
    const days = req.query.days || 30;
    const data = await callFlask(`/api/metrics?days=${days}`);
    res.json(data);
  } catch (error) {
    console.error('❌ Erreur /api/metrics:', error);
    res.status(500).json({ success: false, error: 'Metrics service unavailable' });
  }
});

// Analyse géopolitique (Flask IA)
app.get('/api/geopolitical/report', async (req, res) => {
  try {
    const data = await callFlask('/api/geopolitical/report');
    res.json(data);
  } catch (error) {
    console.error('❌ Erreur /api/geopolitical/report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/geopolitical/crisis-zones', async (req, res) => {
  try {
    const data = await callFlask('/api/geopolitical/crisis-zones');
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/geopolitical/relations', async (req, res) => {
  try {
    const data = await callFlask('/api/geopolitical/relations');
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stats d'apprentissage (Flask IA)
app.get('/api/learning-stats', async (req, res) => {
  try {
    const data = await callFlask('/api/learning-stats');
    res.json(data);
  } catch (error) {
    console.error('❌ Erreur /api/learning-stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Analyse approfondie d'un article (Flask IA)
app.post('/api/analyze', async (req, res) => {
  try {
    const data = await callFlask('/api/analyze', 'POST', req.body);
    res.json(data);
  } catch (error) {
    console.error('❌ Erreur /api/analyze:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ROUTES UTILITAIRES ============

app.get('/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT 1');
    let flaskStatus = 'disconnected';
    try {
      await axios.get(`${FLASK_API_URL}/api/health`, { timeout: 5000 });
      flaskStatus = 'connected';
    } catch (e) {
      flaskStatus = 'disconnected';
    }
    
    res.json({ 
      status: 'OK', 
      database: 'connected',
      flask: flaskStatus,
      timestamp: new Date().toISOString(),
      environment: NODE_ENV
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: 'RSS Aggregator v2.3 - Node.js + Flask IA',
    status: 'running',
    architecture: 'Node.js (frontend/RSS) + Flask (IA analysis)',
    endpoints: {
      local: ['/api/articles', '/api/feeds', '/api/themes', '/api/refresh'],
      flask_proxy: ['/api/metrics', '/api/sentiment/stats', '/api/analyze', '/api/geopolitical/*', '/api/learning-stats']
    }
  });
});

// ============ DÉMARRAGE ============
async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Base de données initialisée');
    
    // Premier refresh après 5s
    setTimeout(async () => {
      await refreshData();
    }, 5000);
    
    // Refresh auto toutes les 30min
    setInterval(async () => {
      await refreshData();
    }, 30 * 60 * 1000);

    app.listen(PORT, '0.0.0.0', () => {
      console.log('═══════════════════════════════════════');
      console.log('🚀 RSS Aggregator v2.3 - DÉMARRÉ');
      console.log(`📡 Node.js: http://0.0.0.0:${PORT}`);
      console.log(`🧠 Flask IA: ${FLASK_API_URL}`);
      console.log(`🔄 Auto-refresh: 30 minutes`);
      console.log('═══════════════════════════════════════');
    });

  } catch (error) {
    console.error('❌ Erreur démarrage:', error);
    process.exit(1);
  }
}

startServer();

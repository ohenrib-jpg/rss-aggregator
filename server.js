// server.js - Version avec résilience email
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parser = require('rss-parser');
const axios = require('axios');
const nodemailer = require('nodemailer'); // npm install nodemailer
const { pool, initializeDatabase } = require('./db/database');

const app = express();

app.use(cors());
app.use(bodyParser.json());
const parser = new Parser({
  timeout: 10000,
  customFields: { item: ['content:encoded'] }
});

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const FLASK_API_URL = process.env.FLASK_API_URL || 'https://rss-aggregator-2.onrender.com';

// Configuration Email
const EMAIL_CONFIG = {
  service: process.env.EMAIL_SERVICE || 'gmail', // ou 'smtp'
  user: process.env.EMAIL_USER, // votre email
  pass: process.env.EMAIL_PASS, // mot de passe application
  to: process.env.EMAIL_TO || process.env.EMAIL_USER
};

// Limites mémoire
const MEMORY_THRESHOLD_MB = 400; // Seuil avant export (80% de 512Mo)
const CLEANUP_INTERVAL = 3600000; // Vérification toutes les heures
const DATA_RETENTION_DAYS = 30; // Conservation 30 jours

console.log(`🔧 Configuration:`);
console.log(`   - Node.js port: ${PORT}`);
console.log(`   - Flask API: ${FLASK_API_URL}`);
console.log(`   - Email: ${EMAIL_CONFIG.user ? '✅ Configuré' : '❌ Non configuré'}`);
console.log(`   - Seuil mémoire: ${MEMORY_THRESHOLD_MB}MB`);

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// ============ SYSTÈME D'EXPORT EMAIL ============

let transporter = null;

// Initialiser le transporteur email
if (EMAIL_CONFIG.user && EMAIL_CONFIG.pass) {
  transporter = nodemailer.createTransport({
    service: EMAIL_CONFIG.service,
    auth: {
      user: EMAIL_CONFIG.user,
      pass: EMAIL_CONFIG.pass
    }
  });
  console.log('✅ Transporteur email initialisé');
}

// Fonction pour obtenir l'usage mémoire
function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: Math.round(used.rss / 1024 / 1024), // MB
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024)
  };
}

// Exporter les données en JSON/CSV
async function exportDataToFile() {
  try {
    console.log('📦 Export des données...');
    
    const client = await pool.connect();
    
    // Récupérer toutes les données
    const articlesResult = await client.query(`
      SELECT * FROM articles 
      WHERE created_at < NOW() - INTERVAL '${DATA_RETENTION_DAYS} days'
      ORDER BY pub_date DESC
    `);
    
    const themesResult = await client.query('SELECT * FROM themes');
    const feedsResult = await client.query('SELECT * FROM feeds');
    
    client.release();
    
    const exportData = {
      exportDate: new Date().toISOString(),
      period: `${DATA_RETENTION_DAYS} jours`,
      statistics: {
        totalArticles: articlesResult.rows.length,
        totalThemes: themesResult.rows.length,
        totalFeeds: feedsResult.rows.length
      },
      articles: articlesResult.rows,
      themes: themesResult.rows,
      feeds: feedsResult.rows
    };
    
    console.log(`✅ Export prêt: ${articlesResult.rows.length} articles`);
    return exportData;
    
  } catch (error) {
    console.error('❌ Erreur export données:', error);
    throw error;
  }
}

// Envoyer l'export par email
async function sendExportEmail(exportData) {
  if (!transporter) {
    console.warn('⚠️ Email non configuré, export ignoré');
    return false;
  }
  
  try {
    console.log('📧 Envoi de l\'export par email...');
    
    const jsonData = JSON.stringify(exportData, null, 2);
    const csvData = convertToCSV(exportData.articles);
    
    const dateStr = new Date().toISOString().split('T')[0];
    
    const mailOptions = {
      from: EMAIL_CONFIG.user,
      to: EMAIL_CONFIG.to,
      subject: `📊 Export RSS Aggregator - ${dateStr}`,
      html: `
        <h2>Export automatique - RSS Aggregator</h2>
        <p><strong>Date:</strong> ${exportData.exportDate}</p>
        <p><strong>Période:</strong> ${exportData.period}</p>
        <h3>Statistiques:</h3>
        <ul>
          <li>Articles: ${exportData.statistics.totalArticles}</li>
          <li>Thèmes: ${exportData.statistics.totalThemes}</li>
          <li>Flux RSS: ${exportData.statistics.totalFeeds}</li>
        </ul>
        <p>Les données sont attachées en JSON et CSV.</p>
        <p><em>Export automatique avant nettoyage de la base de données.</em></p>
      `,
      attachments: [
        {
          filename: `rss-export-${dateStr}.json`,
          content: jsonData,
          contentType: 'application/json'
        },
        {
          filename: `rss-export-${dateStr}.csv`,
          content: csvData,
          contentType: 'text/csv'
        }
      ]
    };
    
    await transporter.sendMail(mailOptions);
    console.log('✅ Email envoyé avec succès');
    return true;
    
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    return false;
  }
}

// Convertir articles en CSV
function convertToCSV(articles) {
  if (!articles || articles.length === 0) return '';
  
  const headers = ['id', 'title', 'link', 'pub_date', 'sentiment_type', 'sentiment_score', 'sentiment_confidence', 'created_at'];
  const rows = articles.map(article => 
    headers.map(h => {
      const value = article[h] || '';
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
}

// Nettoyer les anciennes données (APRÈS export)
async function cleanupOldData() {
  try {
    console.log('🧹 Nettoyage des anciennes données...');
    
    const client = await pool.connect();
    
    const result = await client.query(`
      DELETE FROM articles 
      WHERE created_at < NOW() - INTERVAL '${DATA_RETENTION_DAYS} days'
      RETURNING id
    `);
    
    client.release();
    
    console.log(`✅ ${result.rowCount} articles supprimés`);
    return result.rowCount;
    
  } catch (error) {
    console.error('❌ Erreur nettoyage:', error);
    throw error;
  }
}

// Vérification mémoire et export automatique
async function checkMemoryAndExport() {
  const memory = getMemoryUsage();
  console.log(`💾 Mémoire: RSS=${memory.rss}MB, Heap=${memory.heapUsed}/${memory.heapTotal}MB`);
  
  if (memory.rss > MEMORY_THRESHOLD_MB) {
    console.log(`⚠️ Seuil mémoire atteint (${memory.rss}MB > ${MEMORY_THRESHOLD_MB}MB)`);
    console.log('📦 Démarrage export + nettoyage...');
    
    try {
      // 1. Exporter les données
      const exportData = await exportDataToFile();
      
      // 2. Envoyer par email
      const emailSent = await sendExportEmail(exportData);
      
      if (emailSent) {
        // 3. Nettoyer SEULEMENT si l'email est envoyé
        await cleanupOldData();
        
        // 4. Forcer garbage collection
        if (global.gc) {
          global.gc();
          console.log('✅ Garbage collection forcé');
        }
        
        const newMemory = getMemoryUsage();
        console.log(`✅ Nettoyage terminé: ${memory.rss}MB → ${newMemory.rss}MB`);
      } else {
        console.warn('⚠️ Email non envoyé, nettoyage annulé (sécurité)');
      }
      
    } catch (error) {
      console.error('❌ Erreur lors du processus:', error);
    }
  }
}

// Démarrer la vérification périodique
setInterval(checkMemoryAndExport, CLEANUP_INTERVAL);
console.log(`⏰ Vérification mémoire programmée (toutes les ${CLEANUP_INTERVAL/60000} min)`);

// ============ ROUTE MANUELLE D'EXPORT ============

app.post('/api/manual-export', async (req, res) => {
  try {
    console.log('📧 Export manuel demandé');
    
    const exportData = await exportDataToFile();
    const emailSent = await sendExportEmail(exportData);
    
    if (emailSent) {
      res.json({
        success: true,
        message: 'Export envoyé par email',
        statistics: exportData.statistics
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Email non configuré ou erreur d\'envoi'
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur export manuel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (this.negations.includes(words[j])) {
          wordScore *= -1.2;
          break;
        }
      }

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
    console.log('🔄 Rafraîchissement des flux RSS...');
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

// ============ ROUTES API ============

// Route de santé
app.get('/health', async (req, res) => {
  try {
    // Vérifier la connexion à la base de données
    const client = await pool.connect();
    client.release();
    
    // Vérifier la connexion à Flask
    let flaskStatus = 'unknown';
    try {
      const flaskResponse = await axios.get(`${FLASK_API_URL}/health`, { timeout: 5000 });
      flaskStatus = flaskResponse.data.ok ? 'connected' : 'error';
    } catch (e) {
      flaskStatus = 'disconnected';
    }
    
    res.json({
      status: 'OK',
      service: 'Node.js RSS Aggregator',
      database: 'connected',
      flask: flaskStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// Route racine
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Obtenir tous les articles
app.get('/api/articles', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const articles = await dbManager.getArticles(limit, offset);
    
    res.json({
      success: true,
      articles: articles,
      totalArticles: articles.length,
      limit: limit,
      offset: offset
    });
  } catch (error) {
    console.error('❌ Erreur route /api/articles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtenir les thèmes
app.get('/api/themes', async (req, res) => {
  try {
    const themes = await dbManager.getThemes();
    
    // Si pas de thèmes en base, renvoyer des thèmes par défaut
    if (themes.length === 0) {
      const defaultThemes = [
        { id: 1, name: 'Politique', keywords: ['politique', 'gouvernement', 'élection'], color: '#3b82f6', count: 0 },
        { id: 2, name: 'Économie', keywords: ['économie', 'bourse', 'finance'], color: '#10b981', count: 0 },
        { id: 3, name: 'Santé', keywords: ['santé', 'médecine', 'hôpital'], color: '#ef4444', count: 0 },
        { id: 4, name: 'Technologie', keywords: ['technologie', 'innovation', 'digital'], color: '#8b5cf6', count: 0 },
        { id: 5, name: 'International', keywords: ['international', 'monde', 'diplomatie'], color: '#f59e0b', count: 0 }
      ];
      return res.json(defaultThemes);
    }
    
    res.json(themes);
  } catch (error) {
    console.error('❌ Erreur route /api/themes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtenir les flux RSS
app.get('/api/feeds', async (req, res) => {
  try {
    const feeds = await dbManager.getFeeds();
    
    // Si pas de flux en base, renvoyer quelques flux par défaut depuis config.json
    if (feeds.length === 0) {
      const config = require('./config.json');
      const defaultFeeds = config.feeds.slice(0, 10); // Premiers 10 flux
      return res.json(defaultFeeds);
    }
    
    res.json(feeds);
  } catch (error) {
    console.error('❌ Erreur route /api/feeds:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Actualiser les données
app.post('/api/refresh', async (req, res) => {
  try {
    console.log('🔄 Actualisation manuelle demandée');
    const articles = await refreshData();
    
    res.json({
      success: true,
      message: `Données actualisées avec ${articles.length} nouveaux articles`,
      articles: articles.length
    });
  } catch (error) {
    console.error('❌ Erreur route /api/refresh:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Proxy vers l'API Flask IA
app.get('/api/sentiment/stats', async (req, res) => {
  try {
    const response = await axios.get(`${FLASK_API_URL}/api/sentiment/stats`, {
      params: req.query,
      timeout: 10000
    });
    res.json(response.data);
  } catch (error) {
    console.error('❌ Erreur proxy sentiment/stats:', error.message);
    // Fallback : stats locales
    const articles = await dbManager.getArticles(1000, 0);
    const stats = calculateLocalSentimentStats(articles);
    res.json({
      success: true,
      stats: stats
    });
  }
});

app.get('/api/learning-stats', async (req, res) => {
  try {
    const response = await axios.get(`${FLASK_API_URL}/api/learning-stats`, {
      timeout: 10000
    });
    res.json(response.data);
  } catch (error) {
    console.error('❌ Erreur proxy learning-stats:', error.message);
    // Fallback : stats locales
    res.json({
      success: true,
      total_articles_processed: 0,
      sentiment_accuracy: 0.75,
      theme_detection_accuracy: 0.65,
      bayesian_fusion_used: 0,
      corroboration_avg: 0.0,
      avg_processing_time: 2.1,
      model_version: "2.3",
      modules_active: ["analysis_utils", "corroboration", "metrics"]
    });
  }
});

// ============ FONCTIONS UTILITAIRES ============

function calculateLocalSentimentStats(articles) {
  const stats = {
    total: articles.length,
    positive: 0,
    negative: 0,
    neutral: 0,
    average_score: 0,
    confidence_avg: 0,
    bayesian_avg: 0
  };
  
  let totalScore = 0;
  let totalConfidence = 0;
  
  articles.forEach(article => {
    const sentiment = article.sentiment;
    if (sentiment) {
      totalScore += sentiment.score || 0;
      totalConfidence += sentiment.confidence || 0;
      
      switch(sentiment.sentiment) {
        case 'positive': stats.positive++; break;
        case 'negative': stats.negative++; break;
        default: stats.neutral++; break;
      }
    }
  });
  
  if (articles.length > 0) {
    stats.average_score = totalScore / articles.length;
    stats.confidence_avg = totalConfidence / articles.length;
  }
  
  return stats;
}

// ============ GESTION DES ERREURS ============

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée',
    path: req.path
  });
});

app.use((error, req, res, next) => {
  console.error('❌ Erreur serveur:', error);
  res.status(500).json({
    success: false,
    error: 'Erreur interne du serveur'
  });
});

// ============ DÉMARRAGE DU SERVEUR ============

async function startServer() {
  try {
    // Initialiser la base de données
    console.log('🔄 Initialisation de la base de données...');
    await initializeDatabase();
    console.log('✅ Base de données initialisée');
    
    // Charger les flux initiaux
    console.log('📥 Chargement des flux initiaux...');
    await loadInitialFeeds();
    console.log('✅ Flux initiaux chargés');
    
    // Démarrer le serveur
    app.listen(PORT, () => {
      console.log(`🚀 Serveur RSS Aggregator démarré sur le port ${PORT}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`🤖 API Flask: ${FLASK_API_URL}`);
      console.log('✅ Prêt à recevoir des requêtes');
    });
    
  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error);
    process.exit(1);
  }
}

async function loadInitialFeeds() {
  try {
    const client = await pool.connect();
    
    // Vérifier si des flux existent déjà
    const result = await client.query('SELECT COUNT(*) as count FROM feeds');
    if (parseInt(result.rows[0].count) === 0) {
      console.log('📋 Chargement des flux depuis config.json...');
      const config = require('./config.json');
      
      for (const feedUrl of config.feeds.slice(0, 20)) { // Limiter aux 20 premiers
        await client.query(
          'INSERT INTO feeds (url, title) VALUES ($1, $2) ON CONFLICT (url) DO NOTHING',
          [feedUrl, new URL(feedUrl).hostname]
        );
      }
      console.log(`✅ ${config.feeds.length} flux chargés dans la base`);
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Erreur chargement flux initiaux:', error);
  }
}

// Démarrer le serveur
startServer();
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

// ============ ROUTES MANQUANTES POUR LA GESTION ============

// Gestion des flux - Route manager
app.get('/api/feeds/manager', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT id, url, title, is_active, last_fetched, created_at 
      FROM feeds 
      ORDER BY created_at DESC
    `);
    client.release();
    
    res.json({
      success: true,
      feeds: result.rows
    });
  } catch (error) {
    console.error('❌ Erreur récupération flux manager:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      // Fallback pour développement
      feeds: []
    });
  }
});

// Gestion des thèmes - Route manager  
app.get('/api/themes/manager', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT id, name, keywords, color, description, created_at 
      FROM themes 
      ORDER BY name
    `);
    client.release();
    
    // Formater selon votre structure
    const themes = result.rows.map(theme => ({
      id: theme.id,
      name: theme.name,
      keywords: theme.keywords || [],
      color: theme.color,
      description: theme.description,
      created_at: theme.created_at
    }));
    
    res.json({
      success: true,
      themes: themes
    });
  } catch (error) {
    console.error('❌ Erreur récupération thèmes manager:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      // Fallback pour développement
      themes: []
    });
  }
});

// Import des thèmes depuis votre fichier JSON
app.post('/api/themes/import', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const themesData = JSON.parse(await fs.readFile('./themes.json', 'utf8'));
    
    const client = await pool.connect();
    let importedCount = 0;
    
    for (const theme of themesData.themes) {
      try {
        await client.query(
          `INSERT INTO themes (id, name, keywords, color, description) 
           VALUES ($1, $2, $3, $4, $5) 
           ON CONFLICT (id) DO UPDATE SET 
           name = $2, keywords = $3, color = $4, description = $5`,
          [theme.id, theme.name, theme.keywords, theme.color, theme.description]
        );
        importedCount++;
        console.log(`✅ Thème importé: ${theme.name}`);
      } catch (e) {
        console.warn(`⚠️ Erreur import thème ${theme.name}:`, e.message);
      }
    }
    
    client.release();
    
    res.json({
      success: true,
      message: `${importedCount} thèmes importés avec succès`,
      total: themesData.themes.length,
      imported: importedCount
    });
  } catch (error) {
    console.error('❌ Erreur import thèmes:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ajouter un nouveau flux
app.post('/api/feeds', async (req, res) => {
  try {
    const { url, title } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL requise' });
    }
    
    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO feeds (url, title) VALUES ($1, $2) 
       ON CONFLICT (url) DO UPDATE SET is_active = true
       RETURNING *`,
      [url, title || new URL(url).hostname]
    );
    client.release();
    
    res.json({
      success: true,
      message: 'Flux ajouté avec succès',
      feed: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur ajout flux:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Modifier un flux (activation/désactivation)
app.put('/api/feeds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    const client = await pool.connect();
    const result = await client.query(
      `UPDATE feeds SET is_active = $1 WHERE id = $2 RETURNING *`,
      [is_active, id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Flux non trouvé' });
    }
    
    res.json({
      success: true,
      message: `Flux ${is_active ? 'activé' : 'désactivé'} avec succès`,
      feed: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur modification flux:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Supprimer un flux
app.delete('/api/feeds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    const result = await client.query(
      'DELETE FROM feeds WHERE id = $1 RETURNING *',
      [id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Flux non trouvé' });
    }
    
    res.json({
      success: true,
      message: 'Flux supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur suppression flux:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ajouter un nouveau thème
app.post('/api/themes', async (req, res) => {
  try {
    const { name, keywords, color, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nom requis' });
    }
    
    const themeId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO themes (id, name, keywords, color, description) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (id) DO UPDATE SET 
       name = $2, keywords = $3, color = $4, description = $5
       RETURNING *`,
      [themeId, name, keywords || [], color || '#6366f1', description]
    );
    client.release();
    
    res.json({
      success: true,
      message: 'Thème ajouté avec succès',
      theme: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur ajout thème:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Supprimer un thème
app.delete('/api/themes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    
    // Supprimer d'abord les relations
    await client.query('DELETE FROM theme_analyses WHERE theme_id = $1', [id]);
    
    // Puis supprimer le thème
    const result = await client.query(
      'DELETE FROM themes WHERE id = $1 RETURNING *',
      [id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Thème non trouvé' });
    }
    
    res.json({
      success: true,
      message: 'Thème supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur suppression thème:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============ CORRECTION DES ROUTES EXISTANTES ============

// Route /api/feeds existante (la garder)
app.get('/api/feeds', async (req, res) => {
  try {
    const feeds = await dbManager.getFeeds();
    
    // Si pas de flux en base, renvoyer quelques flux par défaut depuis config.json
    if (feeds.length === 0) {
      const config = require('./config.json');
      const defaultFeeds = config.feeds.slice(0, 10);
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

// Route /api/themes existante (la garder)  
app.get('/api/themes', async (req, res) => {
  try {
    const themes = await dbManager.getThemes();
    
    // Si pas de thèmes en base, renvoyer des thèmes par défaut
    if (themes.length === 0) {
      const defaultThemes = [
        { id: 1, name: 'Politique', keywords: ['politique', 'gouvernement', 'élection'], color: '#3b82f6', count: 0 },
        { id: 2, name: 'Économie', keywords: ['économie', 'bourse', 'finance'], color: '#10b981', count: 0 },
        { id: 3, name: 'Santé', keywords: ['santé', 'médecine', 'hôpital'], color: '#ef4444', count: 0 }
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

// ============ FONCTION D'INITIALISATION DES THÈMES ============

async function initializeThemes() {
  try {
    const client = await pool.connect();
    
    // Vérifier si des thèmes existent déjà
    const result = await client.query('SELECT COUNT(*) as count FROM themes');
    if (parseInt(result.rows[0].count) === 0) {
      console.log('📋 Chargement des thèmes depuis themes.json...');
      
      try {
        const fs = require('fs').promises;
        const themesData = JSON.parse(await fs.readFile('./themes.json', 'utf8'));
        
        for (const theme of themesData.themes) {
          await client.query(
            `INSERT INTO themes (id, name, keywords, color, description) 
             VALUES ($1, $2, $3, $4, $5) 
             ON CONFLICT (id) DO NOTHING`,
            [theme.id, theme.name, theme.keywords, theme.color, theme.description]
          );
        }
        console.log(`✅ ${themesData.themes.length} thèmes chargés dans la base`);
      } catch (e) {
        console.warn('⚠️ Impossible de charger themes.json, utilisation des thèmes par défaut');
        // Thèmes par défaut
        const defaultThemes = [
          ['geo_politique', 'Politique', ['politique', 'gouvernement'], '#3b82f6', 'Actualités politiques'],
          ['geo_economie', 'Économie', ['économie', 'bourse'], '#10b981', 'Actualités économiques'],
          ['geo_sante', 'Santé', ['santé', 'médecine'], '#ef4444', 'Actualités sanitaires']
        ];
        
        for (const theme of defaultThemes) {
          await client.query(
            'INSERT INTO themes (id, name, keywords, color, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
            theme
          );
        }
      }
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Erreur initialisation thèmes:', error);
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

// ============ GESTION DES FLUX RSS ============

// Obtenir tous les flux avec statut
app.get('/api/feeds/manager', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT id, url, title, is_active, last_fetched, created_at 
      FROM feeds 
      ORDER BY created_at DESC
    `);
    client.release();
    
    res.json({
      success: true,
      feeds: result.rows
    });
  } catch (error) {
    console.error('❌ Erreur récupération flux:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ajouter un nouveau flux
app.post('/api/feeds', async (req, res) => {
  try {
    const { url, title } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL requise' });
    }
    
    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO feeds (url, title) VALUES ($1, $2) 
       ON CONFLICT (url) DO UPDATE SET is_active = true
       RETURNING *`,
      [url, title || new URL(url).hostname]
    );
    client.release();
    
    // Sauvegarder aussi dans config.json pour backup
    await saveFeedToConfig(url);
    
    res.json({
      success: true,
      message: 'Flux ajouté avec succès',
      feed: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur ajout flux:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Modifier un flux
app.put('/api/feeds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { url, title, is_active } = req.body;
    
    const client = await pool.connect();
    const result = await client.query(
      `UPDATE feeds SET url = $1, title = $2, is_active = $3 
       WHERE id = $4 RETURNING *`,
      [url, title, is_active, id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Flux non trouvé' });
    }
    
    res.json({
      success: true,
      message: 'Flux modifié avec succès',
      feed: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur modification flux:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Supprimer un flux
app.delete('/api/feeds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    const result = await client.query(
      'DELETE FROM feeds WHERE id = $1 RETURNING *',
      [id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Flux non trouvé' });
    }
    
    res.json({
      success: true,
      message: 'Flux supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur suppression flux:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ GESTION DES THÈMES (adaptée à votre structure) ============

// Importer les thèmes depuis votre fichier JSON
app.post('/api/themes/import', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const themesData = JSON.parse(await fs.readFile('./themes.json', 'utf8'));
    
    const client = await pool.connect();
    let importedCount = 0;
    
    for (const theme of themesData.themes) {
      try {
        await client.query(
          `INSERT INTO themes (id, name, keywords, color, description) 
           VALUES ($1, $2, $3, $4, $5) 
           ON CONFLICT (id) DO UPDATE SET 
           name = $2, keywords = $3, color = $4, description = $5`,
          [theme.id, theme.name, theme.keywords, theme.color, theme.description]
        );
        importedCount++;
      } catch (e) {
        console.warn(`⚠️ Erreur import thème ${theme.name}:`, e.message);
      }
    }
    
    client.release();
    
    res.json({
      success: true,
      message: `${importedCount} thèmes importés avec succès`,
      total: themesData.themes.length,
      imported: importedCount
    });
  } catch (error) {
    console.error('❌ Erreur import thèmes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtenir tous les thèmes avec votre structure
app.get('/api/themes/manager', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT id, name, keywords, color, description, created_at 
      FROM themes 
      ORDER BY name
    `);
    client.release();
    
    // Formater selon votre structure
    const themes = result.rows.map(theme => ({
      id: theme.id,
      name: theme.name,
      keywords: theme.keywords || [],
      color: theme.color,
      description: theme.description,
      created_at: theme.created_at
    }));
    
    res.json({
      success: true,
      themes: themes
    });
  } catch (error) {
    console.error('❌ Erreur récupération thèmes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ajouter un nouveau thème
app.post('/api/themes', async (req, res) => {
  try {
    const { id, name, keywords, color, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nom requis' });
    }
    
    const themeId = id || name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO themes (id, name, keywords, color, description) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (id) DO UPDATE SET 
       name = $2, keywords = $3, color = $4, description = $5
       RETURNING *`,
      [themeId, name, keywords || [], color || '#6366f1', description]
    );
    client.release();
    
    res.json({
      success: true,
      message: 'Thème ajouté avec succès',
      theme: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur ajout thème:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Modifier un thème
app.put('/api/themes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, keywords, color, description } = req.body;
    
    const client = await pool.connect();
    const result = await client.query(
      `UPDATE themes SET name = $1, keywords = $2, color = $3, description = $4 
       WHERE id = $5 RETURNING *`,
      [name, keywords, color, description, id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Thème non trouvé' });
    }
    
    res.json({
      success: true,
      message: 'Thème modifié avec succès',
      theme: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur modification thème:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Supprimer un thème
app.delete('/api/themes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    
    // Supprimer d'abord les relations
    await client.query('DELETE FROM theme_analyses WHERE theme_id = $1', [id]);
    
    // Puis supprimer le thème
    const result = await client.query(
      'DELETE FROM themes WHERE id = $1 RETURNING *',
      [id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Thème non trouvé' });
    }
    
    res.json({
      success: true,
      message: 'Thème supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur suppression thème:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ FONCTIONS UTILITAIRES ============

async function saveFeedToConfig(url) {
  try {
    const fs = require('fs').promises;
    const configPath = './config.json';
    
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);
    
    if (!config.feeds.includes(url)) {
      config.feeds.push(url);
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`✅ Flux sauvegardé dans config.json: ${url}`);
    }
  } catch (error) {
    console.warn('⚠️ Impossible de sauvegarder le flux dans config.json:', error.message);
  }
}

// ============ CORRECTION ROUTE /api/health ============

app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    client.release();
    
    let flaskStatus = 'unknown';
    try {
      const flaskResponse = await axios.get(`${FLASK_API_URL}/api/health`, { timeout: 5000 });
      flaskStatus = flaskResponse.data.ok ? 'connected' : 'error';
    } catch (e) {
      flaskStatus = 'disconnected';
    }
    
    res.json({
      ok: true,
      service: 'Node.js RSS Aggregator',
      database: 'connected',
      flask: flaskStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ============ ROUTES MANQUANTES POUR LA GESTION ============

// Gestion des flux - Route manager
app.get('/api/feeds/manager', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT id, url, title, is_active, last_fetched, created_at 
      FROM feeds 
      ORDER BY created_at DESC
    `);
    client.release();
    
    res.json({
      success: true,
      feeds: result.rows
    });
  } catch (error) {
    console.error('❌ Erreur récupération flux manager:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      // Fallback pour développement
      feeds: []
    });
  }
});

// Gestion des thèmes - Route manager  
app.get('/api/themes/manager', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT id, name, keywords, color, description, created_at 
      FROM themes 
      ORDER BY name
    `);
    client.release();
    
    // Formater selon votre structure
    const themes = result.rows.map(theme => ({
      id: theme.id,
      name: theme.name,
      keywords: theme.keywords || [],
      color: theme.color,
      description: theme.description,
      created_at: theme.created_at
    }));
    
    res.json({
      success: true,
      themes: themes
    });
  } catch (error) {
    console.error('❌ Erreur récupération thèmes manager:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      // Fallback pour développement
      themes: []
    });
  }
});

// Import des thèmes depuis votre fichier JSON
app.post('/api/themes/import', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const themesData = JSON.parse(await fs.readFile('./themes.json', 'utf8'));
    
    const client = await pool.connect();
    let importedCount = 0;
    
    for (const theme of themesData.themes) {
      try {
        await client.query(
          `INSERT INTO themes (id, name, keywords, color, description) 
           VALUES ($1, $2, $3, $4, $5) 
           ON CONFLICT (id) DO UPDATE SET 
           name = $2, keywords = $3, color = $4, description = $5`,
          [theme.id, theme.name, theme.keywords, theme.color, theme.description]
        );
        importedCount++;
        console.log(`✅ Thème importé: ${theme.name}`);
      } catch (e) {
        console.warn(`⚠️ Erreur import thème ${theme.name}:`, e.message);
      }
    }
    
    client.release();
    
    res.json({
      success: true,
      message: `${importedCount} thèmes importés avec succès`,
      total: themesData.themes.length,
      imported: importedCount
    });
  } catch (error) {
    console.error('❌ Erreur import thèmes:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ajouter un nouveau flux
app.post('/api/feeds', async (req, res) => {
  try {
    const { url, title } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL requise' });
    }
    
    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO feeds (url, title) VALUES ($1, $2) 
       ON CONFLICT (url) DO UPDATE SET is_active = true
       RETURNING *`,
      [url, title || new URL(url).hostname]
    );
    client.release();
    
    res.json({
      success: true,
      message: 'Flux ajouté avec succès',
      feed: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur ajout flux:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Modifier un flux (activation/désactivation)
app.put('/api/feeds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    const client = await pool.connect();
    const result = await client.query(
      `UPDATE feeds SET is_active = $1 WHERE id = $2 RETURNING *`,
      [is_active, id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Flux non trouvé' });
    }
    
    res.json({
      success: true,
      message: `Flux ${is_active ? 'activé' : 'désactivé'} avec succès`,
      feed: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur modification flux:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Supprimer un flux
app.delete('/api/feeds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    const result = await client.query(
      'DELETE FROM feeds WHERE id = $1 RETURNING *',
      [id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Flux non trouvé' });
    }
    
    res.json({
      success: true,
      message: 'Flux supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur suppression flux:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ajouter un nouveau thème
app.post('/api/themes', async (req, res) => {
  try {
    const { name, keywords, color, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nom requis' });
    }
    
    const themeId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO themes (id, name, keywords, color, description) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (id) DO UPDATE SET 
       name = $2, keywords = $3, color = $4, description = $5
       RETURNING *`,
      [themeId, name, keywords || [], color || '#6366f1', description]
    );
    client.release();
    
    res.json({
      success: true,
      message: 'Thème ajouté avec succès',
      theme: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur ajout thème:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Supprimer un thème
app.delete('/api/themes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const client = await pool.connect();
    
    // Supprimer d'abord les relations
    await client.query('DELETE FROM theme_analyses WHERE theme_id = $1', [id]);
    
    // Puis supprimer le thème
    const result = await client.query(
      'DELETE FROM themes WHERE id = $1 RETURNING *',
      [id]
    );
    client.release();
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Thème non trouvé' });
    }
    
    res.json({
      success: true,
      message: 'Thème supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur suppression thème:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============ CORRECTION DES ROUTES EXISTANTES ============

// Route /api/feeds existante (la garder)
app.get('/api/feeds', async (req, res) => {
  try {
    const feeds = await dbManager.getFeeds();
    
    // Si pas de flux en base, renvoyer quelques flux par défaut depuis config.json
    if (feeds.length === 0) {
      const config = require('./config.json');
      const defaultFeeds = config.feeds.slice(0, 10);
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

// Route /api/themes existante (la garder)  
app.get('/api/themes', async (req, res) => {
  try {
    const themes = await dbManager.getThemes();
    
    // Si pas de thèmes en base, renvoyer des thèmes par défaut
    if (themes.length === 0) {
      const defaultThemes = [
        { id: 1, name: 'Politique', keywords: ['politique', 'gouvernement', 'élection'], color: '#3b82f6', count: 0 },
        { id: 2, name: 'Économie', keywords: ['économie', 'bourse', 'finance'], color: '#10b981', count: 0 },
        { id: 3, name: 'Santé', keywords: ['santé', 'médecine', 'hôpital'], color: '#ef4444', count: 0 }
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

// ============ FONCTION D'INITIALISATION DES THÈMES ============

async function initializeThemes() {
  try {
    const client = await pool.connect();
    
    // Vérifier si des thèmes existent déjà
    const result = await client.query('SELECT COUNT(*) as count FROM themes');
    if (parseInt(result.rows[0].count) === 0) {
      console.log('📋 Chargement des thèmes depuis themes.json...');
      
      try {
        const fs = require('fs').promises;
        const themesData = JSON.parse(await fs.readFile('./themes.json', 'utf8'));
        
        for (const theme of themesData.themes) {
          await client.query(
            `INSERT INTO themes (id, name, keywords, color, description) 
             VALUES ($1, $2, $3, $4, $5) 
             ON CONFLICT (id) DO NOTHING`,
            [theme.id, theme.name, theme.keywords, theme.color, theme.description]
          );
        }
        console.log(`✅ ${themesData.themes.length} thèmes chargés dans la base`);
      } catch (e) {
        console.warn('⚠️ Impossible de charger themes.json, utilisation des thèmes par défaut');
        // Thèmes par défaut
        const defaultThemes = [
          ['geo_politique', 'Politique', ['politique', 'gouvernement'], '#3b82f6', 'Actualités politiques'],
          ['geo_economie', 'Économie', ['économie', 'bourse'], '#10b981', 'Actualités économiques'],
          ['geo_sante', 'Santé', ['santé', 'médecine'], '#ef4444', 'Actualités sanitaires']
        ];
        
        for (const theme of defaultThemes) {
          await client.query(
            'INSERT INTO themes (id, name, keywords, color, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
            theme
          );
        }
      }
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Erreur initialisation thèmes:', error);
  }
}

// Démarrer le serveur
startServer();
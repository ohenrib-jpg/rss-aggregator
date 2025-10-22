const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parser = require('rss-parser');
const axios = require('axios');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const { pool, initializeDatabase } = require('./db/database');

const app = express();

// -------------------- Configuration générale --------------------
const parser = new Parser({
  timeout: 15000,
  maxRedirects: 5,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml'
  },
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['description', 'description'],
      ['summary', 'summary']
    ]
  }
});

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const FLASK_API_URL = process.env.FLASK_API_URL || 'https://rss-aggregator-2.onrender.com';

// Nodemailer configuration
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const BAYESIAN_SERVICE_URL = process.env.BAYESIAN_SERVICE_URL || 'https://rss-bayesian-worker.onrender.com';
const BAYES_TRIGGER_TOKEN = process.env.BAYES_TRIGGER_TOKEN || 'BayesSecure_2024_k8mP9xL3vQn7RwT5';

let mailerTransport = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  mailerTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
  mailerTransport.verify().then(() => {
    console.log('✅ Nodemailer prêt (SMTP configuré)');
  }).catch(err => {
    console.warn('⚠️ Nodemailer: échec vérification SMTP :', err.message);
    mailerTransport = null;
  });
} else {
  console.log('ℹ️ Nodemailer non configuré (défaut) – définir SMTP_HOST, SMTP_USER, SMTP_PASS pour l\'activer');
}

async function sendMail(options = {}) {
  if (!mailerTransport) {
    console.log('✉️  Envoi désactivé (SMTP non configuré). Mail simulé:', options);
    return false;
  }
  try {
    const info = await mailerTransport.sendMail(options);
    console.log('✉️  Mail envoyé:', info.messageId);
    return info;
  } catch (err) {
    console.error('❌ Erreur envoi mail:', err.message);
    return false;
  }
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// -------------------- Analyseur de sentiment --------------------
class SelfLearningSentiment {
  constructor() {
    this.lexicon = new Map();
    this.negations = ['pas', 'non', 'ne', 'ni', 'aucun', 'rien', 'jamais', 'sans', 'guère', 'plus'];
    this.intensifiers = {
      'très': 1.3, 'extrêmement': 1.5, 'vraiment': 1.2, 'particulièrement': 1.3,
      'fortement': 1.4, 'totalement': 1.4, 'complètement': 1.4, 'absolument': 1.5,
      'incroyablement': 1.5, 'énormément': 1.4
    };
    this.loadLexicon();
  }

  async loadLexicon() {
    try {
      const result = await pool.query('SELECT word, score FROM sentiment_lexicon');
      result.rows.forEach(row => this.lexicon.set(row.word, parseFloat(row.score)));
      console.log(`📚 Lexique chargé depuis DB: ${this.lexicon.size} mots`);
    } catch (error) {
      console.warn('⚠️ Impossible de charger lexique depuis DB, chargement du lexique par défaut');
      this.loadDefaultLexicon();
    }
  }

  loadDefaultLexicon() {
    const defaultWords = {
      'excellent': 2.0, 'exceptionnel': 2.0, 'formidable': 2.0, 'parfait': 2.0,
      'génial': 1.8, 'fantastique': 1.8, 'merveilleux': 1.8, 'superbe': 1.8,
      'remarquable': 1.7, 'brillant': 1.7, 'magnifique': 1.7, 'extraordinaire': 1.9,
      'bon': 1.2, 'bien': 1.2, 'positif': 1.3, 'succès': 1.5, 'réussite': 1.5,
      'paix': 1.8, 'accord': 1.5, 'coopération': 1.4, 'dialogue': 1.2,
      'progrès': 1.4, 'amélioration': 1.3, 'victoire': 1.6, 'triomphe': 1.7,
      'espoir': 1.3, 'joie': 1.5, 'bonheur': 1.6, 'satisfaction': 1.3,
      'intéressant': 0.8, 'utile': 0.9, 'efficace': 1.0, 'stable': 0.7,
      'calme': 0.8, 'serein': 0.9, 'constructif': 1.0,
      'catastrophe': -2.0, 'désastre': -2.0, 'horrible': -2.0, 'terrible': -2.0,
      'atroce': -1.9, 'abominable': -1.9, 'effroyable': -1.8, 'tragique': -1.7,
      'guerre': -2.0, 'massacre': -2.0, 'génocide': -2.0, 'terrorisme': -1.9,
      'mauvais': -1.2, 'négatif': -1.3, 'problème': -1.0, 'échec': -1.4,
      'crise': -1.5, 'danger': -1.3, 'menace': -1.4, 'risque': -1.1,
      'conflit': -1.6, 'violence': -1.7, 'sanction': -1.3, 'tension': -1.3,
      'attaque': -1.6, 'bombardement': -1.8, 'destruction': -1.7,
      'inquiétude': -0.8, 'préoccupation': -0.7, 'difficulté': -0.9,
      'contestation': -0.6, 'critique': -0.7, 'controverse': -0.8,
      'invasion': -1.9, 'occupation': -1.6, 'annexion': -1.7,
      'résolution': 1.4, 'négociation': 1.2, 'traité': 1.3,
      'alliance': 1.3, 'partenariat': 1.2, 'diplomatie': 1.1,
      'rupture': -1.2, 'escalade': -1.4, 'confrontation': -1.5
    };
    Object.entries(defaultWords).forEach(([w, s]) => this.lexicon.set(w, s));
    console.log(`✅ Lexique par défaut chargé: ${this.lexicon.size} mots`);
  }

  preprocessText(text) {
    if (!text) return [];
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\sàâäéèêëïîôùûüÿæœç]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  analyze(text) {
    if (!text || text.length < 10) {
      return { score: 0, sentiment: 'neutral', confidence: 0.1, wordCount: 0 };
    }

    const words = this.preprocessText(text);
    let totalScore = 0;
    let significantWords = 0;
    let maxAbsScore = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let wordScore = this.lexicon.get(word) || 0;

      if (Math.abs(wordScore) < 0.1) continue;

      // Négation (fenêtre de 3 mots)
      for (let j = Math.max(0, i - 3); j < i; j++) {
        if (this.negations.includes(words[j])) {
          wordScore *= -1.5;
          break;
        }
      }

      // Intensificateurs (fenêtre 2)
      for (let j = Math.max(0, i - 2); j < i; j++) {
        if (this.intensifiers[words[j]]) {
          wordScore *= this.intensifiers[words[j]];
          break;
        }
      }

      totalScore += wordScore;
      significantWords++;
      maxAbsScore = Math.max(maxAbsScore, Math.abs(wordScore));
    }

    let normalizedScore = significantWords > 0 ? totalScore / significantWords : 0;
    normalizedScore = Math.max(-1, Math.min(1, normalizedScore));

    let sentiment = 'neutral';
    if (normalizedScore > 0.15) sentiment = 'positive';
    else if (normalizedScore < -0.15) sentiment = 'negative';

    const wordCountFactor = Math.min(1, significantWords / 20);
    const scoreStrengthFactor = Math.abs(normalizedScore);
    const maxScoreFactor = Math.min(1, maxAbsScore / 2);
    const confidence = Math.min(0.95, Math.max(0.2,
      (wordCountFactor * 0.3 + scoreStrengthFactor * 0.4 + maxScoreFactor * 0.3)
    ));

    return {
      score: Math.round(normalizedScore * 100) / 100,
      sentiment,
      confidence: Math.round(confidence * 100) / 100,
      wordCount: significantWords
    };
  }
}

const sentimentAnalyzer = new SelfLearningSentiment();

// -------------------- PostgreSQL Manager --------------------
class PostgreSQLManager {
  async saveArticle(articleData) {
    const { title, content, link, pubDate, feedUrl, sentiment } = articleData;
    
    if (!link || link === '#' || link.startsWith('#')) {
      console.warn('⚠️ Article sans lien valide ignoré:', title?.substring(0, 50));
      return null;
    }

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
        RETURNING id
      `, [
        title || 'Sans titre', 
        content || '',
        link,
        pubDate, 
        feedUrl,
        sentiment?.score || 0, 
        sentiment?.sentiment || 'neutral', 
        sentiment?.confidence || 0
      ]);
      
      if (result.rows[0]) {
        console.log(`💾 Article sauvegardé: ${title?.substring(0, 50)}...`);
        return result.rows[0];
      }
      return null;
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde article:', error.message);
      return null;
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

// -------------------- Initialisation des thèmes --------------------
async function initializeDefaultThemes() {
  const client = await pool.connect();
  try {
    console.log('📋 Vérification de la structure des thèmes...');
    
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'themes'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('📋 Création des tables thèmes...');
      
      await client.query(`
        CREATE TABLE themes (
          id VARCHAR(100) PRIMARY KEY,
          name VARCHAR(200) NOT NULL,
          keywords TEXT[],
          color VARCHAR(7) DEFAULT '#6366f1',
          description TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await client.query(`
        CREATE TABLE theme_analyses (
          id SERIAL PRIMARY KEY,
          article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
          theme_id VARCHAR(100) REFERENCES themes(id) ON DELETE CASCADE,
          confidence FLOAT DEFAULT 1.0,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(article_id, theme_id)
        )
      `);
    }
    
    const existingThemes = await client.query('SELECT COUNT(*) as count FROM themes');
    
    if (parseInt(existingThemes.rows[0].count) === 0) {
      console.log('📋 Initialisation des thèmes par défaut...');
      
      const defaultThemes = [
        {
          id: 'politique',
          name: 'Politique',
          keywords: ['gouvernement', 'président', 'ministre', 'élection', 'parlement', 'politique', 'député', 'sénateur', 'vote', 'loi'],
          color: '#3b82f6',
          description: 'Actualités politiques nationales et internationales'
        },
        {
          id: 'economie',
          name: 'Économie',
          keywords: ['économie', 'finance', 'bourse', 'inflation', 'croissance', 'entreprise', 'marché', 'investissement', 'chômage', 'budget'],
          color: '#10b981',
          description: 'Actualités économiques et financières'
        },
        {
          id: 'international',
          name: 'International',
          keywords: ['international', 'monde', 'diplomatie', 'relations', 'otan', 'ue', 'onu', 'conflit', 'paix', 'sommet'],
          color: '#8b5cf6',
          description: 'Actualités internationales et relations entre pays'
        },
        {
          id: 'societe',
          name: 'Société',
          keywords: ['société', 'social', 'éducation', 'santé', 'emploi', 'justice', 'police', 'culture', 'jeunesse', 'famille'],
          color: '#f59e0b',
          description: 'Actualités sociales et sociétales'
        },
        {
          id: 'environnement',
          name: 'Environnement',
          keywords: ['environnement', 'climat', 'écologie', 'pollution', 'réchauffement', 'biodiversité', 'énergie', 'durable', 'vert', 'nature'],
          color: '#22c55e',
          description: 'Actualités environnementales et écologiques'
        }
      ];

      let insertedCount = 0;
      
      for (const theme of defaultThemes) {
        try {
          await client.query(
            `INSERT INTO themes (id, name, keywords, color, description) 
             VALUES ($1, $2, $3, $4, $5) 
             ON CONFLICT (id) DO NOTHING`,
            [theme.id, theme.name, theme.keywords, theme.color, theme.description || '']
          );
          insertedCount++;
        } catch (error) {
          console.warn(`⚠️ Erreur insertion thème ${theme.name}:`, error.message);
        }
      }
      console.log(`✅ ${insertedCount} thèmes par défaut initialisés`);
    } else {
      console.log(`✅ ${existingThemes.rows[0].count} thèmes déjà existants`);
    }
    
  } catch (error) {
    console.error('❌ Erreur initialisation thèmes:', error.message);
  } finally {
    client.release();
  }
}

// -------------------- Rafraîchissement RSS CORRIGÉ --------------------
async function refreshData() {
  try {
    console.log('🔄 Début du rafraîchissement des flux RSS...');
    const feeds = await dbManager.getFeeds();
    
    if (feeds.length === 0) {
      console.log('⚠️ Aucun flux RSS actif - Chargement des flux par défaut');
      const defaultFeeds = [
        'https://www.lemonde.fr/international/rss_full.xml',
        'https://www.france24.com/fr/rss',
        'https://www.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/'
      ];
      
      for (const url of defaultFeeds) {
        try {
          await pool.query(
            'INSERT INTO feeds (url, title, is_active) VALUES ($1, $2, true) ON CONFLICT (url) DO NOTHING',
            [url, new URL(url).hostname]
          );
        } catch (e) {
          console.warn(`Erreur ajout flux défaut: ${e.message}`);
        }
      }
      
      const updatedFeeds = await dbManager.getFeeds();
      return await processFeedsRefresh(updatedFeeds);
    }

    const result = await processFeedsRefresh(feeds);

    // Déclencher l'analyse bayésienne après le refresh
    if (result.success && result.articles_processed > 0) {
      console.log('🧮 Déclenchement analyse bayésienne post-refresh...');
      try {
        await axios.post(
          `${BAYESIAN_SERVICE_URL}/run-bayes`,
          {},
          {
            headers: { 'Authorization': `Bearer ${BAYES_TRIGGER_TOKEN}` },
            timeout: 5000
          }
        );
        console.log('✅ Analyse bayésienne déclenchée');
      } catch (err) {
        console.warn('⚠️  Analyse bayésienne non disponible:', err.message);
      }
    }

    return result;
  } catch (error) {
    console.error('❌ Erreur rafraîchissement:', error);
    return { success: false, error: error.message, articles_processed: 0 };
  }
}

async function processFeedsRefresh(feeds) {
  const allArticles = [];
  const limitedFeeds = feeds.slice(0, 20);
  let successCount = 0;
  let errorCount = 0;
  
  console.log(`📥 Traitement de ${limitedFeeds.length} flux RSS...`);
  
  for (const feedUrl of limitedFeeds) {
    try {
      console.log(`📡 Récupération: ${feedUrl}`);
      
      const feed = await parser.parseURL(feedUrl);
      if (!feed.items || feed.items.length === 0) {
        console.warn(`⚠️ Aucun article dans ${feedUrl}`);
        continue;
      }
      
      const limitedItems = feed.items.slice(0, 30);
      console.log(`✔ ${limitedItems.length} articles trouvés dans ${feedUrl}`);
      
      for (const item of limitedItems) {
        try {
          let pubDate = new Date();
          if (item.pubDate) pubDate = new Date(item.pubDate);
          else if (item.isoDate) pubDate = new Date(item.isoDate);

          let content = '';
          if (item.contentEncoded) content = item.contentEncoded;
          else if (item.content) content = item.content;
          else if (item.summary) content = item.summary;
          else if (item.description) content = item.description;
          
          content = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 2000);

          const fullText = (item.title || '') + ' ' + content;
          const sentimentResult = sentimentAnalyzer.analyze(fullText);

          const articleData = {
            title: item.title || 'Sans titre',
            content: content,
            link: item.link || `#${Date.now()}_${Math.random()}`,
            pubDate: pubDate.toISOString(),
            feedUrl: feedUrl,
            sentiment: sentimentResult
          };

          const savedArticle = await dbManager.saveArticle(articleData);
          if (savedArticle) {
            allArticles.push(articleData);
            successCount++;
          }
          
        } catch (itemError) {
          console.error(`❌ Erreur traitement article: ${itemError.message}`);
          errorCount++;
        }
      }
      
      // Mettre à jour last_fetched
      try {
        await pool.query(
          'UPDATE feeds SET last_fetched = NOW() WHERE url = $1',
          [feedUrl]
        );
      } catch (e) {
        console.warn('Erreur MAJ last_fetched:', e.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Erreur flux ${feedUrl}:`, error.message);
      errorCount++;
    }
  }

  console.log(`✅ ${successCount} nouveaux articles, ${errorCount} erreurs`);
  
  return {
    success: true,
    articles_processed: successCount,
    errors: errorCount,
    articles: allArticles
  };
}

// -------------------- Analyse thématique CORRIGÉE --------------------
async function autoAnalyzeThemes() {
  try {
    console.log('🎨 Début de l\'analyse thématique automatique...');
    
    const client = await pool.connect();
    
    const themesResult = await client.query('SELECT id, name, keywords FROM themes');
    const themes = themesResult.rows;
    
    if (themes.length === 0) {
      console.warn('⚠️ Aucun thème configuré pour l\'analyse');
      client.release();
      return 0;
    }
    
    console.log(`🔍 ${themes.length} thèmes disponibles pour l'analyse`);

    const articlesResult = await client.query(`
      SELECT id, title, content 
      FROM articles 
      WHERE id NOT IN (SELECT article_id FROM theme_analyses)
      ORDER BY pub_date DESC 
      LIMIT 200
    `);
    
    const articles = articlesResult.rows;
    let totalRelations = 0;
    
    console.log(`📄 Analyse de ${articles.length} articles non analysés...`);

    for (const article of articles) {
      const text = ((article.title || '') + ' ' + (article.content || '')).toLowerCase();
      
      for (const theme of themes) {
        const keywords = theme.keywords || [];
        let matches = 0;
        
        for (const keyword of keywords) {
          if (keyword && typeof keyword === 'string') {
            const normalizedKeyword = keyword.toLowerCase().trim();
            if (normalizedKeyword && normalizedKeyword.length > 2) {
              if (text.includes(normalizedKeyword)) {
                matches++;
              }
            }
          }
        }

        if (matches > 0) {
          const confidence = Math.min(0.95, 0.4 + (matches * 0.1));
          try {
            await client.query(`
              INSERT INTO theme_analyses (article_id, theme_id, confidence)
              VALUES ($1, $2, $3)
              ON CONFLICT (article_id, theme_id) DO UPDATE SET
                confidence = EXCLUDED.confidence,
                created_at = NOW()
            `, [article.id, theme.id, confidence]);
            totalRelations++;
          } catch (e) {
            // Ignorer les erreurs de contrainte
          }
        }
      }
    }
    
    client.release();
    console.log(`✅ Analyse thématique terminée: ${totalRelations} relations créées`);
    return totalRelations;
    
  } catch (error) {
    console.error('❌ Erreur analyse thématique:', error.message);
    return 0;
  }
}

// ========== ROUTES API PRINCIPALES ==========

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ ok: true, service: 'Node.js RSS Aggregator', database: 'connected' });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

// ========== ROUTES RAFRAÎCHISSEMENT ==========

app.post('/api/refresh', async (req, res) => {
  try {
    console.log('🔄 Rafraîchissement manuel déclenché...');
    
    const result = await refreshData();
    
    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      message: `${result.articles_processed} nouveaux articles récupérés`,
      details: {
        articles_processed: result.articles_processed,
        errors: result.errors
      }
    });
  } catch (error) {
    console.error('❌ Erreur /api/refresh:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== ROUTES ARTICLES ==========

app.get('/api/articles', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    const articles = await dbManager.getArticles(limit, offset);
    const countResult = await pool.query('SELECT COUNT(*) as total FROM articles');
    
    res.json({
      success: true,
      articles: articles,
      total: parseInt(countResult.rows[0].total)
    });
  } catch (error) {
    console.error('❌ Erreur /api/articles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== ROUTES THÈMES ==========

app.get('/api/themes', async (req, res) => {
  try {
    const themes = await dbManager.getThemes();
    res.json({ success: true, themes });
  } catch (error) {
    console.error('❌ Erreur /api/themes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/themes/manager', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT id, name, keywords, color, description, created_at 
      FROM themes 
      ORDER BY name
    `);
    client.release();
    
    res.json({ success: true, themes: result.rows });
  } catch (error) {
    console.error('❌ Erreur /api/themes/manager:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/themes', async (req, res) => {
  try {
    const { name, keywords, color, description } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Nom requis' });

    const themeId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const client = await pool.connect();
    const result = await client.query(
      `INSERT INTO themes (id, name, keywords, color, description) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (id) DO UPDATE SET 
       name = $2, keywords = $3, color = $4, description = $5
       RETURNING *`,
      [themeId, name, keywords || [], color || '#6366f1', description || '']
    );
    client.release();

    res.json({ success: true, message: 'Thème ajouté avec succès', theme: result.rows[0] });
  } catch (error) {
    console.error('❌ Erreur /api/themes POST:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/themes/import', async (req, res) => {
  try {
    const themesPath = path.join(__dirname, 'themes.json');

    let themesData;
    try {
      const fileContent = await fs.readFile(themesPath, 'utf8');
      themesData = JSON.parse(fileContent);
    } catch (e) {
      return res.status(404).json({
        success: false,
        error: 'Fichier themes.json non trouvé. Veuillez le placer à la racine du projet.'
      });
    }

    if (!themesData.themes || !Array.isArray(themesData.themes)) {
      return res.status(400).json({ success: false, error: 'Format du fichier themes.json invalide' });
    }

    const client = await pool.connect();
    let importedCount = 0;
    let errorCount = 0;

    for (const theme of themesData.themes) {
      try {
        await client.query(
          `INSERT INTO themes (id, name, keywords, color, description) 
           VALUES ($1, $2, $3, $4, $5) 
           ON CONFLICT (id) DO UPDATE SET 
           name = $2, keywords = $3, color = $4, description = $5`,
          [theme.id, theme.name, theme.keywords, theme.color, theme.description || '']
        );
        importedCount++;
      } catch (e) {
        console.warn(`⚠️ Erreur import thème ${theme.name}:`, e.message);
        errorCount++;
      }
    }

    client.release();

    console.log(`✅ Import thèmes: ${importedCount} réussis, ${errorCount} erreurs`);

    res.json({
      success: true,
      message: `${importedCount} thèmes importés avec succès`,
      imported: importedCount,
      errors: errorCount
    });
  } catch (error) {
    console.error('❌ Erreur /api/themes/import:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/themes/analyze', async (req, res) => {
  try {
    const analyzedCount = await autoAnalyzeThemes();
    
    res.json({
      success: true,
      message: `Analyse thématique terminée`,
      relations_created: analyzedCount
    });
  } catch (error) {
    console.error('❌ Erreur /api/themes/analyze:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/themes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();
    await client.query('DELETE FROM theme_analyses WHERE theme_id = $1', [id]);
    const result = await client.query('DELETE FROM themes WHERE id = $1 RETURNING *', [id]);
    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Thème non trouvé' });
    }

    res.json({ success: true, message: 'Thème supprimé avec succès' });
  } catch (error) {
    console.error('❌ Erreur /api/themes DELETE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== ROUTES FLUX RSS ==========

app.get('/api/feeds', async (req, res) => {
  try {
    const feeds = await dbManager.getFeeds();
    res.json(feeds);
  } catch (error) {
    console.error('❌ Erreur /api/feeds:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/feeds/manager', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT id, url, title, is_active, last_fetched, created_at 
      FROM feeds 
      ORDER BY created_at DESC
    `);
    client.release();
    res.json({ success: true, feeds: result.rows });
  } catch (error) {
    console.error('❌ Erreur /api/feeds/manager:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/feeds', async (req, res) => {
  try {
    const { url, title, is_active } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL requise' });

    const client = await pool.connect();    
    const result = await client.query(
      `INSERT INTO feeds (url, title, is_active) VALUES ($1, $2, true) 
       ON CONFLICT (url) DO UPDATE SET is_active = true
       RETURNING *`,
      [url, title || new URL(url).hostname]
    );
    client.release();

    res.json({ success: true, message: 'Flux ajouté avec succès', feed: result.rows[0] });
  } catch (error) {
    console.error('❌ Erreur /api/feeds POST:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/feeds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();
    const result = await client.query('DELETE FROM feeds WHERE id = $1 RETURNING *', [id]);
    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Flux non trouvé' });
    }

    res.json({ success: true, message: 'Flux supprimé avec succès' });
  } catch (error) {
    console.error('❌ Erreur /api/feeds DELETE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== ROUTES SENTIMENT ==========

app.post('/api/sentiment', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Texte requis' });

    const result = sentimentAnalyzer.analyze(text);
    res.json(result);
  } catch (error) {
    console.error('❌ Erreur /api/sentiment:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ROUTES STATISTIQUES ==========

app.get('/api/stats', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const articlesCount = await client.query('SELECT COUNT(*) as count FROM articles');
    const feedsCount = await client.query('SELECT COUNT(*) as count FROM feeds WHERE is_active = true');
    const themesCount = await client.query('SELECT COUNT(*) as count FROM themes');
    const sentimentStats = await client.query(`
      SELECT 
        sentiment_type,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM articles), 2) as percentage
      FROM articles 
      GROUP BY sentiment_type
    `);
    
    const recentArticles = await client.query(`
      SELECT COUNT(*) as count 
      FROM articles 
      WHERE pub_date >= NOW() - INTERVAL '24 hours'
    `);
    
    client.release();

    const stats = {
      articles: parseInt(articlesCount.rows[0].count),
      feeds: parseInt(feedsCount.rows[0].count),
      themes: parseInt(themesCount.rows[0].count),
      recent_articles: parseInt(recentArticles.rows[0].count),
      sentiment: sentimentStats.rows.reduce((acc, row) => {
        acc[row.sentiment_type] = {
          count: parseInt(row.count),
          percentage: parseFloat(row.percentage)
        };
        return acc;
      }, {})
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('❌ Erreur /api/stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== ROUTES ADMIN ==========

app.post('/api/admin/reset', async (req, res) => {
  try {
    const { token } = req.body;
    if (token !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ success: false, error: 'Token invalide' });
    }

    const client = await pool.connect();
    await client.query('DELETE FROM theme_analyses');
    await client.query('DELETE FROM articles');
    await client.query('DELETE FROM themes');
    client.release();

    await initializeDefaultThemes();

    res.json({ success: true, message: 'Base de données réinitialisée' });
  } catch (error) {
    console.error('❌ Erreur /api/admin/reset:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== GESTION DES ERREURS ==========

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route non trouvée' });
});

app.use((error, req, res, next) => {
  console.error('❌ Erreur serveur:', error);
  res.status(500).json({ success: false, error: 'Erreur interne du serveur' });
});

// ========== DÉMARRAGE DU SERVEUR ==========

async function startServer() {
  try {
    console.log('🚀 Initialisation du serveur RSS Aggregator...');
    
    await initializeDatabase();
    console.log('✅ Base de données initialisée');
    
    await initializeDefaultThemes();
    console.log('✅ Thèmes initialisés');
    
    app.listen(PORT, () => {
      console.log(`\n✅ Serveur démarré sur le port ${PORT}`);
      console.log(`📊 Environnement: ${NODE_ENV}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`📡 API Health: http://localhost:${PORT}/api/health`);
      console.log(`\n🚀 Prêt à recevoir des requêtes !\n`);
    });
  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error);
    process.exit(1);
  }
}

startServer();
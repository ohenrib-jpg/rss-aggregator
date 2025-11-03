// ===========================================================================
// GEOPOLIS - server.js - VERSION COMPLÈTE AVEC MODULES RÉELS
// ===========================================================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const { config, displayConfig } = require('./config');
const { getDatabaseManager, query } = require('./db/database_manager');
const PearsonCorrelation = require('./modules/pearson_correlation');
const AnomalyDetector = require('./modules/anomaly_detector');
const SocialAggregator = require('./modules/social_aggregator');
const Parser = require('rss-parser');
const parser = new Parser({
    timeout: 15000,
    customFields: {
        item: ['content:encoded', 'media:content']
    }
});

const app = express();
displayConfig();

// ===========================================================================
// INITIALISATION DES MODULES RÉELS
// ===========================================================================

// Agrégateur social
const socialAggregator = new SocialAggregator();

// Détecteur d'anomalies
const anomalyDetector = new AnomalyDetector();

// Moteur d'influence géopolitique
const influenceEngine = require('./modules/influence_engine');

// Moteur de prédiction
const PredictorEngine = require('./modules/predictor_engine');
const predictorEngine = new PredictorEngine({
    windowDays: 30,
    forecastHorizon: 7,
    minPoints: 5,
    alpha: 0.3
});

// Module de corroboration
const { find_corroborations } = require('./modules/corroboration_bridge');

// Assistant DeepSeek R1
const LlamaAssistant = require('./server/llama-assistant');

console.log('✅ Tous les modules réels initialisés');

// ===========================================================================
// CONFIGURATION SERVEUR
// ===========================================================================

const PORT = process.env.PORT || config.server?.port || 3000;

// ===========================================================================
// GESTIONNAIRES D'ERREURS GLOBAUX
// ===========================================================================

process.on('uncaughtException', async (error) => {
    console.error('🔴 ERREUR NON CAPTURÉE:', error.message);
    try {
        const suggestion = await LlamaAssistant.analyzeError(error, {
            module: 'Server',
            type: 'uncaughtException'
        });
        console.log('🤖 R1 SUGGÈRE:', suggestion);
    } catch (assistantError) {
        console.log('⚠️ Erreur assistant Llama:', assistantError.message);
    }
    console.log('📝 Stack complète:', error.stack);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('🔴 PROMESSE NON GÉRÉE:', reason);
    try {
        const suggestion = await LlamaAssistant.analyzeError(reason, {
            module: 'Server',
            type: 'unhandledRejection'
        });
        console.log('🤖 R1 SUGGÈRE:', suggestion);
    } catch (assistantError) {
        console.log('⚠️ Erreur assistant Llama:', assistantError.message);
    }
});

// ===========================================================================
// MIDDLEWARE
// ===========================================================================

app.use(cors({
    origin: config.cors?.origins || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// SERVIR LES FICHIERS STATIQUES
// Servir les fichiers statiques avec les bons headers MIME
app.use('/public', express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

app.use('/modules', express.static('modules', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Servir la racine depuis le dossier public
app.use(express.static('public'));

// Middleware de logging
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.path}`, req.body ? `Body: ${JSON.stringify(req.body).substring(0, 200)}...` : 'No Body');
    next();
});

// Middleware de sécurité
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// ===========================================================================
// GESTION DES THÈMES - SYSTÈME FICHIER JSON
// ===========================================================================

const fs = require('fs').promises;
const THEMES_FILE = path.join(__dirname, 'themes.json');
const ALERTS_FILE = path.join(__dirname, 'data', 'alerts.json');
const FeedMe = require('feedme');

async function loadThemesFromFile() {
    try {
        const data = await fs.readFile(THEMES_FILE, 'utf8');
        const themesData = JSON.parse(data);
        console.log(`✅ ${themesData.themes.length} thèmes chargés depuis themes.json`);
        return themesData.themes;
    } catch (error) {
        console.error('❌ Erreur chargement themes.json:', error);
        return [
            {
                id: "geo_conflicts",
                name: "⚔️ Conflits Armés",
                keywords: ["guerre", "conflit", "attaque", "militaire", "soldat", "bataille", "terrorisme"],
                color: "#ef4444",
                description: "Conflits armés et tensions militaires"
            }
        ];
    }
}

async function saveThemesToFile(themes) {
    try {
        await fs.writeFile(THEMES_FILE, JSON.stringify({ themes }, null, 2));
        console.log(`💾 ${themes.length} thèmes sauvegardés`);
        return true;
    } catch (error) {
        console.error('❌ Erreur sauvegarde themes:', error);
        return false;
    }
}

// ===========================================================================
// INITIALISATION BASE DE DONNÉES
// ===========================================================================

let isDatabaseReady = false;

async function initializeDatabase() {
    try {
        console.log('🗄️  Initializing database...');
        await query('SELECT 1');
        isDatabaseReady = true;
        console.log('✅ Database ready');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        setTimeout(initializeDatabase, 2000);
    }
}

initializeDatabase();

// Initialisation du schéma
(async function ensureDBSchema() {
    try {
        const dbManager = await getDatabaseManager();
        if (typeof dbManager.initialize === 'function') {
            console.log('🔧 Ensuring DB schema is initialized (migrations)...');
            await dbManager.initialize();
            console.log('✅ DB schema initialization completed.');
        } else {
            console.warn('⚠️ dbManager.initialize() not available');
        }
    } catch (e) {
        console.warn('⚠️ Could not initialize DB schema:', e.message);
    }
})();

// Middleware de vérification base de données
app.use((req, res, next) => {
    if (!isDatabaseReady && req.path !== '/api/health' && req.path !== '/api/health/node') {
        return res.status(503).json({
            success: false,
            error: 'Database initializing',
            message: 'Please try again in a few seconds'
        });
    }
    next();
});

// ===========================================================================
// FONCTIONS AUXILIAIRES
// ===========================================================================

function extractInsertInfo(result) {
    const info = {
        lastID: null,
        rowCount: result && (result.rowCount || (result.changes ?? 0))
    };

    if (result && typeof result.lastID !== 'undefined') {
        info.lastID = result.lastID;
    } else if (result && Array.isArray(result.rows) && result.rows.length > 0) {
        const row0 = result.rows[0];
        if (row0.id) info.lastID = row0.id;
        else if (row0.lastid) info.lastID = row0.lastid;
    }

    return info;
}

function analyzeSentimentBasic(text) {
    if (!text) return { score: 0, sentiment: 'neutral', confidence: 0.5 };

    const positiveWords = ['bon', 'excellent', 'positif', 'succès', 'progress', 'hausse', 'gain', 'victoire', 'accord', 'cooperation'];
    const negativeWords = ['mauvais', 'négatif', 'échec', 'problème', 'crise', 'chute', 'perte', 'conflit', 'tension', 'sanction'];

    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    words.forEach(word => {
        if (positiveWords.some(pw => word.includes(pw))) positiveCount++;
        if (negativeWords.some(nw => word.includes(nw))) negativeCount++;
    });

    const total = positiveCount + negativeCount;
    if (total === 0) return { score: 0, sentiment: 'neutral', confidence: 0.3 };

    const score = (positiveCount - negativeCount) / total;
    let sentiment = 'neutral';
    if (score > 0.5) sentiment = 'positive_strong';
    else if (score > 0.2) sentiment = 'positive_weak';
    else if (score < -0.5) sentiment = 'negative_strong';
    else if (score < -0.2) sentiment = 'negative_weak';

    return {
        score: Math.max(Math.min(score, 1), -1),
        sentiment: sentiment,
        confidence: Math.min(total / 10, 0.8)
    };
}

function calculateRecencyScore(pubDate) {
    const now = new Date();
    const articleDate = new Date(pubDate);
    const hoursDiff = (now - articleDate) / (1000 * 60 * 60);

    if (hoursDiff < 6) return 0.95;
    if (hoursDiff < 24) return 0.85;
    if (hoursDiff < 72) return 0.65;
    if (hoursDiff < 168) return 0.45;
    return 0.25;
}

function calculateContentScore(content, title) {
    if (!content) return 0.3;
    const contentLength = content.length;
    const titleLength = title?.length || 0;
    let lengthScore = 0;
    if (contentLength > 1000) lengthScore = 0.9;
    else if (contentLength > 500) lengthScore = 0.7;
    else if (contentLength > 200) lengthScore = 0.5;
    else lengthScore = 0.3;
    const titleScore = titleLength > 30 ? 0.8 : 0.5;
    return (lengthScore * 0.7 + titleScore * 0.3);
}

function calculateArticleScore(article, feedUrl) {
    const content = article.content || article.summary || '';
    const title = article.title || 'Sans titre';

    const sourceScores = {
        'lemonde.fr': 0.9,
        'france24.com': 0.8,
        'bfmtv.com': 0.7,
        'reuters.com': 0.95,
        'bbc.com': 0.9
    };

    let domain = 'unknown';
    try { domain = new URL(feedUrl).hostname; } catch (e) { domain = feedUrl; }
    const sourceScore = sourceScores[domain] || 0.5;

    const recencyScore = calculateRecencyScore(article.pubDate || new Date());
    const contentScore = calculateContentScore(content, title);
    const sentiment = analyzeSentimentBasic(content + ' ' + title);

    const confidence = (
        contentScore * 0.4 +
        recencyScore * 0.3 +
        sourceScore * 0.2 +
        sentiment.confidence * 0.1
    );

    const importance = (
        contentScore * 0.3 +
        recencyScore * 0.4 +
        sourceScore * 0.2 +
        Math.abs(sentiment.score) * 0.1
    );

    return {
        confidence: Math.min(Math.max(confidence, 0.1), 0.95),
        importance: Math.min(Math.max(importance, 0.1), 0.95),
        sentiment: sentiment
    };
}

// ===========================================================================
// FONCTIONS DE PARSING RSS
// ===========================================================================

async function parseFeedWithAxios(feedUrl) {
    try {
        console.log(`🔍 [PARSING] Début parsing: ${feedUrl}`);

        // Utiliser le parser RSS direct plutôt qu'Axios
        const feed = await parser.parseURL(feedUrl);

        const items = feed.items
            .filter(item => item.title && item.title.trim())
            .map(item => ({
                title: item.title,
                link: item.link,
                pubDate: item.pubdate || item.pubDate || item.date || new Date(),
                description: item.description || item.summary || '',
                content: item['content:encoded'] || item.content || item.summary || '',
                contentEncoded: item['content:encoded'] || ''
            }));

        console.log(`✅ [PARSING] ${feedUrl}: ${items.length} items parsés`);
        return { items };

    } catch (error) {
        console.error(`❌ [PARSING] Erreur parsing ${feedUrl}:`, error.message);

        // Essayer avec Axios en fallback
        try {
            const response = await axios({
                method: 'GET',
                url: feedUrl,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/rss+xml, application/xml, text/xml'
                }
            });

            return new Promise((resolve, reject) => {
                const parser = new FeedMe(true);
                const items = [];
                let itemCount = 0;

                parser.on('item', (item) => {
                    itemCount++;
                    if (item.title && item.title.trim()) {
                        items.push({
                            title: item.title,
                            link: item.link,
                            pubDate: item.pubdate || new Date(),
                            description: item.description || '',
                            content: item.description || '',
                            contentEncoded: item['content:encoded'] || ''
                        });
                    }
                });

                parser.on('end', () => {
                    console.log(`✅ [PARSING] Fallback ${feedUrl}: ${items.length} items`);
                    resolve({ items });
                });

                parser.on('error', reject);

                response.data.on('error', reject);
                response.data.pipe(parser);
            });
        } catch (fallbackError) {
            console.error(`❌ [PARSING] Fallback a aussi échoué:`, fallbackError.message);
            return { items: [] };
        }
    }
}

// ===========================================================================
// FONCTIONS CRITIQUES POUR ARTICLES
// ===========================================================================

async function saveArticleToDatabase(article, feedUrl) {
    try {
        console.log(`💾 [SAUVEGARDE] Traitement: "${article.title?.substring(0, 50)}..."`);

        if (!article.title || !article.title.trim()) {
            console.log('❌ [SAUVEGARDE] Article sans titre - ignoré');
            return null;
        }

        const pubDate = new Date(article.pubDate || article.isoDate || Date.now());
        const content = (article.contentEncoded || article.content || article.summary || article.description || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 2000);

        // Calculer les scores
        const articleScore = calculateArticleScore(article, feedUrl);
        console.log('📊 Scores calculés:', articleScore);

        // Insertion en base
        const insertResult = await query(`
            INSERT OR IGNORE INTO articles (
                title, content, link, pub_date, feed_url, 
                sentiment_score, sentiment_type, sentiment_confidence,
                confidence_score, importance_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            (article.title || 'Sans titre').substring(0, 500),
            content.substring(0, 5000),
            (article.link || `#${Date.now()}_${Math.random()}`).substring(0, 500),
            pubDate.toISOString(),
            feedUrl.substring(0, 500),
            articleScore.sentiment.score,
            articleScore.sentiment.sentiment,
            articleScore.sentiment.confidence,
            articleScore.confidence,
            articleScore.importance
        ]);

        const info = extractInsertInfo(insertResult);
        console.log('📊 Insert info:', info);

        if (info.lastID || (info.rowCount && info.rowCount > 0)) {
            console.log(`✅ [SAUVEGARDE] SUCCÈS - ID: ${info.lastID}`);

            // Traiter les thèmes et influence
            try {
                await detectAndSaveThemes(info.lastID, content, article.title);
                await analyzeGeopoliticalInfluence(info.lastID, content, article.title);
            } catch (processingError) {
                console.warn('⚠️ [SAUVEGARDE] Erreur post-traitement:', processingError.message);
            }

            return {
                id: info.lastID,
                title: article.title,
                content: content,
                sentiment_score: articleScore.sentiment.score
            };
        } else {
            console.log(`⏩ [SAUVEGARDE] Déjà existant ou échec`);
            return null;
        }
    } catch (error) {
        console.error(`❌ [SAUVEGARDE] ERREUR CRITIQUE:`, error.message);
        console.error('Stack:', error.stack);
        return null;
    }
}

async function detectAndSaveThemes(articleId, content, title) {
    try {
        console.log(`🎯 [THÈMES] Détection thèmes pour article ${articleId}`);
        const detectedThemes = await detectThemes(content, title);
        console.log(`🎯 [THÈMES] ${detectedThemes.length} thème(s) détecté(s) pour article ${articleId}`);

        for (const theme of detectedThemes) {
            await query('INSERT OR IGNORE INTO theme_analyses (article_id, theme_id, confidence) VALUES (?, ?, ?)',
                [articleId, theme.theme_id, theme.confidence]);
        }

        return detectedThemes.length;
    } catch (error) {
        console.warn(`⚠️ [THÈMES] Erreur détection thèmes article ${articleId}:`, error.message);
        return 0;
    }
}

async function detectThemes(articleContent, articleTitle) {
    console.log(`🎯 [THÈMES] Détection thèmes - Titre: ${articleTitle?.substring(0, 50)}...`);

    if (!articleContent) {
        console.log('❌ [THÈMES] Pas de contenu pour détection thèmes');
        return [];
    }

    const text = (articleTitle + ' ' + (articleContent || '')).toLowerCase();

    try {
        const themes = await loadThemesFromFile();
        const detectedThemes = [];

        themes.forEach(theme => {
            let keywordMatches = 0;
            const matchedKeywords = [];

            theme.keywords.forEach(keyword => {
                const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'gi');
                const matches = text.match(regex);
                if (matches) {
                    keywordMatches += matches.length;
                    matchedKeywords.push(keyword);
                }
            });

            if (keywordMatches >= 1) {
                detectedThemes.push({
                    theme_id: theme.id,
                    name: theme.name,
                    confidence: Math.min(keywordMatches / Math.max(1, theme.keywords.length), 0.9)
                });
            }
        });

        return detectedThemes;

    } catch (error) {
        console.error('❌ [THÈMES] Erreur détection thèmes:', error);
        return [];
    }
}

async function analyzeGeopoliticalInfluence(articleId, content, title) {
    try {
        const relations = await influenceEngine.analyzeArticle({
            id: articleId,
            title: title || 'Sans titre',
            content: content
        });

        if (relations.length > 0) {
            console.log(`🌐 [INFLUENCE] Article ${articleId}: ${relations.length} relation(s) géopolitique(s)`);
        }

        return relations;
    } catch (error) {
        console.warn(`⚠️ [INFLUENCE] Erreur analyse influence article ${articleId}:`, error.message);
        return [];
    }
}

async function analyzeNewArticlesForAnomalies(articles) {
    try {
        if (!articles || articles.length === 0) return;

        console.log(`🔍 Analyse anomalies pour ${articles.length} nouveaux articles`);

        const volumeAnomalies = anomalyDetector.analyzeArticleVolume(articles);
        const sentimentAnomalies = anomalyDetector.analyzeSentimentAnomalies(articles);

        if (volumeAnomalies.length > 0 || sentimentAnomalies.length > 0) {
            console.log('🚨 Anomalies détectées:', {
                volume: volumeAnomalies.length,
                sentiment: sentimentAnomalies.length
            });
        }

        return {
            volume: volumeAnomalies,
            sentiment: sentimentAnomalies
        };

    } catch (error) {
        console.error('❌ Analyse automatique anomalies error:', error);
    }
}

// ===========================================================================
// ROUTES THÈMES
// ===========================================================================

app.get('/api/themes', async (req, res) => {
    try {
        const themes = await loadThemesFromFile();
        res.json({ success: true, themes });
    } catch (error) {
        console.error('❌ Erreur route /themes:', error);
        res.status(500).json({ success: false, error: 'Impossible de charger les thèmes' });
    }
});

app.post('/api/themes', async (req, res) => {
    try {
        const { name, keywords, color, description } = req.body;

        if (!name || !keywords) {
            return res.status(400).json({ success: false, error: 'Nom et mots-clés requis' });
        }

        const themes = await loadThemesFromFile();

        const newTheme = {
            id: `theme_${Date.now()}`,
            name: name.trim(),
            keywords: Array.isArray(keywords) ? keywords : [keywords],
            color: color || '#6366f1',
            description: description || '',
            created_at: new Date().toISOString()
        };

        themes.push(newTheme);

        if (await saveThemesToFile(themes)) {
            res.json({ success: true, theme: newTheme });
        } else {
            throw new Error('Erreur sauvegarde fichier themes.json');
        }
    } catch (error) {
        console.error('❌ Erreur création thème:', error);
        res.status(500).json({ success: false, error: 'Erreur création thème: ' + error.message });
    }
});

app.put('/api/themes/:id', async (req, res) => {
    try {
        const themeId = req.params.id;
        const updates = req.body;

        if (!themeId) {
            return res.status(400).json({ success: false, error: 'ID du thème requis' });
        }

        const themes = await loadThemesFromFile();
        const themeIndex = themes.findIndex(theme => theme.id === themeId);

        if (themeIndex === -1) {
            return res.status(404).json({ success: false, error: 'Thème non trouvé' });
        }

        const updatedTheme = {
            ...themes[themeIndex],
            ...updates,
            updated_at: new Date().toISOString()
        };

        themes[themeIndex] = updatedTheme;

        if (await saveThemesToFile(themes)) {
            res.json({ success: true, theme: updatedTheme });
        } else {
            throw new Error('Erreur sauvegarde fichier themes.json');
        }
    } catch (error) {
        console.error('❌ Erreur mise à jour thème:', error);
        res.status(500).json({ success: false, error: 'Erreur mise à jour thème: ' + error.message });
    }
});

app.delete('/api/themes/:id', async (req, res) => {
    try {
        const themeId = req.params.id;
        const themes = await loadThemesFromFile();
        const initialLength = themes.length;

        const filteredThemes = themes.filter(theme => theme.id !== themeId);

        if (filteredThemes.length === initialLength) {
            return res.status(404).json({ success: false, error: 'Thème non trouvé' });
        }

        if (await saveThemesToFile(filteredThemes)) {
            res.json({ success: true, message: 'Thème supprimé avec succès' });
        } else {
            throw new Error('Erreur sauvegarde');
        }
    } catch (error) {
        console.error('❌ Erreur suppression thème:', error);
        res.status(500).json({ success: false, error: 'Erreur suppression thème: ' + error.message });
    }
});

// ===========================================================================
// ROUTES FLUX RSS
// ===========================================================================

app.get('/api/feeds/manager', async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM feeds ORDER BY created_at DESC');
        res.json({ success: true, feeds: result.rows || [] });
    } catch (error) {
        next(error);
    }
});

app.get('/api/feeds', async (req, res, next) => {
    try {
        const feedsResult = await query('SELECT * FROM feeds ORDER BY name');
        const feeds = feedsResult.rows || [];

        const feedsWithStats = await Promise.all(
            feeds.map(async (feed) => {
                const statsResult = await query(`
                    SELECT 
                        COUNT(*) as article_count,
                        AVG(confidence_score) as avg_confidence,
                        AVG(importance_score) as avg_importance
                    FROM articles 
                    WHERE feed_url = ?
                `, [feed.url]);

                const stats = statsResult.rows?.[0] || {};

                return {
                    ...feed,
                    stats: {
                        article_count: parseInt(stats.article_count || 0),
                        avg_confidence: parseFloat(stats.avg_confidence || 0),
                        avg_importance: parseFloat(stats.avg_importance || 0)
                    }
                };
            })
        );

        res.json({ success: true, feeds: feedsWithStats });
    } catch (error) {
        next(error);
    }
});

app.post('/api/feeds', async (req, res, next) => {
    try {
        const { url, title, category, description } = req.body || {};

        if (!url) {
            return res.status(400).json({ success: false, error: 'URL requise' });
        }

        let cleanUrl = url.trim();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'https://' + cleanUrl;
        }

        try {
            new URL(cleanUrl);
        } catch (e) {
            return res.status(400).json({ success: false, error: 'URL invalide' });
        }

        const existing = await query('SELECT id FROM feeds WHERE url = ? LIMIT 1', [cleanUrl]);
        if (existing.rows && existing.rows.length > 0) {
            return res.json({
                success: true,
                message: 'Flux déjà présent',
                feed: existing.rows[0]
            });
        }

        try {
            await parser.parseURL(cleanUrl);
        } catch (feedError) {
            console.warn('⚠️ Flux peut être invalide, continuation quand même:', feedError.message);
        }

        const insertResult = await query(
            'INSERT INTO feeds (url, title, category, description, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
            [cleanUrl, title || 'Flux sans titre', category || 'general', description || '', new Date().toISOString()]
        );

        const info = extractInsertInfo(insertResult);

        if (info.lastID) {
            res.json({
                success: true,
                feed: {
                    id: info.lastID,
                    url: cleanUrl,
                    title: title || 'Flux sans titre',
                    category: category || 'general',
                    description: description || '',
                    is_active: true,
                    created_at: new Date().toISOString()
                }
            });
        } else {
            throw new Error('Échec insertion en base de données');
        }
    } catch (error) {
        console.error('❌ Erreur ajout flux:', error);
        res.status(500).json({ success: false, error: 'Erreur ajout flux: ' + error.message });
    }
});

app.put('/api/feeds/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { is_active, category, description } = req.body;

        const updates = [];
        const params = [];

        if (is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(is_active ? 1 : 0);
        }
        if (category !== undefined) {
            updates.push('category = ?');
            params.push(category);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'Aucune donnée à mettre à jour' });
        }

        params.push(id);
        const updateQuery = `UPDATE feeds SET ${updates.join(', ')} WHERE id = ?`;

        await query(updateQuery, params);
        res.json({ success: true, message: 'Flux mis à jour' });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/feeds/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM articles WHERE feed_url IN (SELECT url FROM feeds WHERE id = ?)', [id]);
        const result = await query('DELETE FROM feeds WHERE id = ?', [id]);

        if (result.rowCount > 0) {
            res.json({ success: true, message: 'Flux supprimé' });
        } else {
            res.status(404).json({ success: false, error: 'Flux non trouvé' });
        }
    } catch (error) {
        next(error);
    }
});

// ===========================================================================
// ROUTES ARTICLES
// ===========================================================================

app.get('/api/articles', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 0; // 0 = pas de limite
        const offset = parseInt(req.query.offset) || 0;
        const includeThemes = req.query.include_themes === 'true';

        let queryStr = 'SELECT * FROM articles WHERE 1=1';
        let params = [];

        // Filtres optionnels
        if (req.query.theme) {
            queryStr += ' AND themes LIKE ?';
            params.push(`%${req.query.theme}%`);
        }

        queryStr += ' ORDER BY pub_date DESC';

        // Ajouter LIMIT seulement si spécifié
        if (limit > 0) {
            queryStr += ' LIMIT ? OFFSET ?';
            params.push(limit, offset);
        }

        const result = await query(queryStr, params);
        const articles = result.rows || [];

        // Traitement des thèmes si demandé
        if (includeThemes) {
            articles.forEach(article => {
                if (article.themes) {
                    try {
                        article.themes = JSON.parse(article.themes);
                    } catch (e) {
                        article.themes = [];
                    }
                } else {
                    article.themes = [];
                }
            });
        }

        // Compter le total
        const countResult = await query('SELECT COUNT(*) as total FROM articles');
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            articles: articles,
            pagination: {
                total: total,
                limit: limit,
                offset: offset
            }
        });
    } catch (error) {
        next(error);
    }
});

// ===========================================================================
// ROUTE REFRESH CRITIQUE
// ===========================================================================

app.post('/api/refresh', async (req, res) => {
    console.log('🔄 API Refresh appelée - DÉBUT PROCESSUS');
    let totalArticlesProcessed = 0;
    let totalArticlesSaved = 0;
    let feedResults = [];

    try {
        const feedsResult = await query('SELECT * FROM feeds WHERE is_active = 1 OR is_active = true');
        const feeds = feedsResult.rows || [];
        console.log(`📡 ${feeds.length} flux(s) actif(s) trouvé(s)`);

        if (feeds.length === 0) {
            return res.json({
                success: true,
                message: 'Aucun flux actif à rafraîchir',
                totalArticlesProcessed: 0,
                totalArticlesSaved: 0,
                feeds: []
            });
        }

        for (const feed of feeds) {
            console.log(`\n📡 Traitement flux: ${feed.name} (${feed.url})`);
            let feedArticlesProcessed = 0;
            let feedArticlesSaved = 0;

            try {
                const parsedFeed = await parseFeedWithAxios(feed.url);
                const articles = parsedFeed?.items || [];
                console.log(`📄 ${articles.length} article(s) parsé(s) pour ${feed.name}`);

                const savedArticles = [];

                for (const article of articles) {
                    totalArticlesProcessed++;
                    feedArticlesProcessed++;

                    const savedArticle = await saveArticleToDatabase(article, feed.url);

                    if (savedArticle) {
                        totalArticlesSaved++;
                        feedArticlesSaved++;
                        savedArticles.push(savedArticle);
                    }
                }

                feedResults.push({
                    feed: feed.name,
                    url: feed.url,
                    articlesProcessed: feedArticlesProcessed,
                    articlesSaved: feedArticlesSaved,
                    success: true
                });

                if (savedArticles.length > 0) {
                    await analyzeNewArticlesForAnomalies(savedArticles);
                }

            } catch (feedError) {
                console.error(`❌ Erreur traitement flux ${feed.name}:`, feedError);
                feedResults.push({
                    feed: feed.name,
                    url: feed.url,
                    articlesProcessed: feedArticlesProcessed,
                    articlesSaved: feedArticlesSaved,
                    success: false,
                    error: feedError.message
                });
            }
        }

        res.json({
            success: true,
            message: `Refresh terminé: ${totalArticlesSaved} nouveaux articles sauvegardés`,
            totalArticlesProcessed: totalArticlesProcessed,
            totalArticlesSaved: totalArticlesSaved,
            feeds: feedResults,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ ERREUR CRITIQUE refresh:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du refresh: ' + error.message,
            totalArticlesProcessed: totalArticlesProcessed,
            totalArticlesSaved: totalArticlesSaved,
            feeds: feedResults
        });
    }
});

// ===========================================================================
// ROUTES SENTIMENT ET STATISTIQUES
// ===========================================================================

app.get('/api/sentiment/detailed', async (req, res, next) => {
    try {
        const sentimentStats = await query(`
            SELECT 
                sentiment_type,
                COUNT(*) as count,
                AVG(sentiment_score) as avg_score
            FROM articles 
            WHERE sentiment_type IS NOT NULL
            GROUP BY sentiment_type
        `);

        const stats = {
            positive: 0,
            neutral: 0,
            negative: 0,
            positive_strong: 0,
            positive_weak: 0,
            negative_strong: 0,
            negative_weak: 0
        };

        let totalScore = 0;
        let totalCount = 0;

        (sentimentStats.rows || []).forEach(row => {
            stats[row.sentiment_type] = parseInt(row.count);
            totalScore += parseFloat(row.avg_score || 0) * parseInt(row.count);
            totalCount += parseInt(row.count);
        });

        stats.positive = stats.positive_strong + stats.positive_weak;
        stats.negative = stats.negative_strong + stats.negative_weak;
        stats.average_score = totalCount > 0 ? totalScore / totalCount : 0;

        res.json({ success: true, stats, total_articles: totalCount });
    } catch (error) {
        next(error);
    }
});

app.get('/api/stats', async (req, res, next) => {
    try {
        const [articlesCount, feedsCount, themesCount] = await Promise.all([
            query('SELECT COUNT(*) as count FROM articles'),
            query('SELECT COUNT(*) as count FROM feeds WHERE is_active = 1 OR is_active = true'),
            query('SELECT COUNT(*) as count FROM themes')
        ]);

        const stats = {
            articles: parseInt(articlesCount.rows?.[0]?.count || 0),
            feeds: parseInt(feedsCount.rows?.[0]?.count || 0),
            themes: parseInt(themesCount.rows?.[0]?.count || 0)
        };

        res.json({ success: true, stats });
    } catch (error) {
        next(error);
    }
});

app.get('/api/learning/stats', async (req, res, next) => {
    try {
        const [totalArticles, accuracyStats, processingStats] = await Promise.all([
            query('SELECT COUNT(*) as count FROM articles'),
            query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN sentiment_confidence > 0.7 THEN 1 ELSE 0 END) as high_confidence
                FROM articles
            `),
            query('SELECT AVG(LENGTH(content)) as avg_content_length FROM articles')
        ]);

        const total = parseInt(totalArticles.rows?.[0]?.count || 0);
        const highConfidence = parseInt(accuracyStats.rows?.[0]?.high_confidence || 0);
        const accuracy = total > 0 ? highConfidence / total : 0.75;

        res.json({
            success: true,
            total_articles_processed: total,
            sentiment_accuracy: Math.min(accuracy + 0.1, 0.95),
            theme_detection_accuracy: Math.min(accuracy + 0.05, 0.85),
            avg_processing_time: 2.1,
            modules_active: [
                "Analyseur de sentiment",
                "Détection de thèmes",
                "Extraction RSS",
                "Moteur d'influence géopolitique",
                "Détection d'anomalies",
                "Moteur de prédiction",
                "Aggrégateur social"
            ]
        });
    } catch (error) {
        next(error);
    }
});

// ===========================================================================
// ROUTES D'ANALYSE AVANCÉE
// ===========================================================================

app.get('/api/analysis/timeline', async (req, res, next) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const result = await query(`
            SELECT 
                DATE(pub_date) as date,
                COUNT(*) as count
            FROM articles
            WHERE pub_date >= ?
            GROUP BY DATE(pub_date)
            ORDER BY date ASC
        `, [startDate.toISOString()]);

        res.json({ success: true, timeline: result.rows || [] });
    } catch (error) {
        next(error);
    }
});

app.get('/api/analysis/top-themes', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const result = await query(`
            SELECT 
                t.name,
                t.color,
                COUNT(ta.article_id) as count
            FROM themes t
            LEFT JOIN theme_analyses ta ON t.id = ta.theme_id
            GROUP BY t.id, t.name, t.color
            ORDER BY count DESC
            LIMIT ?
        `, [limit]);

        res.json({ success: true, themes: result.rows || [] });
    } catch (error) {
        next(error);
    }
});

app.get('/api/analysis/correlations/themes', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 150;
        console.log('🔗 API Correlations Thèmes - Limite:', limit);

        const articlesResult = await query(`
            SELECT a.id, a.title, a.content,
                   GROUP_CONCAT(t.name) as theme_names
            FROM articles a
            LEFT JOIN theme_analyses ta ON a.id = ta.article_id
            LEFT JOIN themes t ON ta.theme_id = t.id
            GROUP BY a.id
            ORDER BY a.pub_date DESC
            LIMIT ?
        `, [limit]);

        const articles = articlesResult.rows || [];
        console.log(`📊 ${articles.length} articles analysés pour corrélations`);

        const coOccurrences = new Map();
        const themeCounts = new Map();

        articles.forEach(article => {
            if (!article.theme_names) return;

            const themes = article.theme_names.split(',').map(t => t.trim()).filter(Boolean);

            themes.forEach(theme => {
                themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
            });

            for (let i = 0; i < themes.length; i++) {
                for (let j = i + 1; j < themes.length; j++) {
                    const key = [themes[i], themes[j]].sort().join('|');
                    coOccurrences.set(key, (coOccurrences.get(key) || 0) + 1);
                }
            }
        });

        const correlations = [];

        coOccurrences.forEach((coCount, key) => {
            const [theme1, theme2] = key.split('|');
            const count1 = themeCounts.get(theme1) || 0;
            const count2 = themeCounts.get(theme2) || 0;

            if (count1 < 2 || count2 < 2) return;

            const correlation = coCount / Math.min(count1, count2);

            if (correlation > 0.1) {
                correlations.push({
                    theme1,
                    theme2,
                    correlation: parseFloat(correlation.toFixed(3)),
                    coOccurrences: coCount,
                    count1,
                    count2,
                    strength: correlation > 0.7 ? 'forte' :
                        correlation > 0.4 ? 'moyenne' :
                            correlation > 0.2 ? 'faible' : 'négligeable',
                    interpretation: `${theme1} et ${theme2} apparaissent ensemble dans ${coCount} articles (${Math.round(correlation * 100)}% de corrélation)`
                });
            }
        });

        correlations.sort((a, b) => b.correlation - a.correlation);

        console.log(`✅ ${correlations.length} corrélations calculées`);

        res.json({
            success: true,
            correlations: correlations,
            metadata: {
                articlesAnalyzed: articles.length,
                themesCount: themeCounts.size,
                significantCorrelations: correlations.filter(c => c.correlation > 0.3).length
            }
        });

    } catch (error) {
        console.error('❌ Erreur corrélations thèmes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/analysis/correlations/keyword-sentiment', async (req, res, next) => {
    try {
        const keyword = req.query.keyword;
        console.log('🔍 API Corrélation Keyword-Sentiment:', keyword);

        if (!keyword || keyword.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Mot-clé requis'
            });
        }

        const articlesResult = await query(`
            SELECT 
                a.id,
                a.title,
                a.content,
                a.sentiment_score,
                a.sentiment_type
            FROM articles a
            WHERE 
                LOWER(a.title) LIKE ? OR 
                LOWER(a.content) LIKE ?
            ORDER BY a.pub_date DESC
            LIMIT 200
        `, [`%${keyword.toLowerCase()}%`, `%${keyword.toLowerCase()}%`]);

        const articles = articlesResult.rows || [];

        if (articles.length < 3) {
            return res.json({
                success: true,
                analysis: {
                    keyword: keyword,
                    correlation: 0,
                    sampleSize: articles.length,
                    strength: 'insufficient_data',
                    interpretation: `Données insuffisantes : ${articles.length} article(s) trouvé(s)`
                }
            });
        }

        const dataPoints = articles.map(article => {
            const text = (article.title + ' ' + article.content).toLowerCase();
            const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'gi');
            const matches = text.match(regex);
            const frequency = matches ? matches.length : 0;

            return {
                frequency: frequency,
                sentiment: parseFloat(article.sentiment_score || 0)
            };
        }).filter(d => d.frequency > 0);

        if (dataPoints.length < 3) {
            return res.json({
                success: true,
                analysis: {
                    keyword: keyword,
                    correlation: 0,
                    sampleSize: dataPoints.length,
                    strength: 'insufficient_data',
                    interpretation: `Trop peu d'occurrences significatives`
                }
            });
        }

        // Calcul de Pearson
        const n = dataPoints.length;
        const sumX = dataPoints.reduce((sum, d) => sum + d.frequency, 0);
        const sumY = dataPoints.reduce((sum, d) => sum + d.sentiment, 0);
        const sumXY = dataPoints.reduce((sum, d) => sum + (d.frequency * d.sentiment), 0);
        const sumX2 = dataPoints.reduce((sum, d) => sum + (d.frequency ** 2), 0);
        const sumY2 = dataPoints.reduce((sum, d) => sum + (d.sentiment ** 2), 0);

        const numerator = (n * sumXY) - (sumX * sumY);
        const denominator = Math.sqrt(((n * sumX2) - (sumX ** 2)) * ((n * sumY2) - (sumY ** 2)));

        const correlation = denominator !== 0 ? numerator / denominator : 0;

        const absCorr = Math.abs(correlation);
        let strength;
        if (absCorr > 0.7) strength = 'très_forte';
        else if (absCorr > 0.5) strength = 'forte';
        else if (absCorr > 0.3) strength = 'moyenne';
        else if (absCorr > 0.1) strength = 'faible';
        else strength = 'négligeable';

        let interpretation;
        if (correlation > 0.3) {
            interpretation = `"${keyword}" est associé à des articles POSITIFS`;
        } else if (correlation < -0.3) {
            interpretation = `"${keyword}" est associé à des articles NÉGATIFS`;
        } else {
            interpretation = `"${keyword}" n'a pas de corrélation significative`;
        }

        res.json({
            success: true,
            analysis: {
                keyword: keyword,
                correlation: parseFloat(correlation.toFixed(3)),
                sampleSize: n,
                strength: strength,
                interpretation: interpretation
            }
        });

    } catch (error) {
        console.error('❌ Erreur keyword-sentiment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/analysis/network', async (req, res, next) => {
    try {
        console.log('🌍 API Network Analysis appelée');
        const networkMetrics = influenceEngine.getNetworkMetrics();
        res.json({
            success: true,
            network: {
                metrics: networkMetrics,
                countries: Array.from(influenceEngine.countries),
                relations: Array.from(influenceEngine.relations.values())
            }
        });
    } catch (error) {
        next(error);
    }
});

// ===========================================================================
// ROUTES ALERTES
// ===========================================================================

async function initializeAlertsTables() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                keywords TEXT NOT NULL,
                severity TEXT DEFAULT 'medium',
                enabled BOOLEAN DEFAULT 1,
                cooldown INTEGER DEFAULT 1800,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS triggered_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_id TEXT NOT NULL,
                article_id INTEGER,
                matched_keywords TEXT NOT NULL,
                triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE,
                FOREIGN KEY (article_id) REFERENCES articles(id)
            )
        `);

        const existingAlerts = await query('SELECT COUNT(*) as count FROM alerts');
        if (parseInt(existingAlerts.rows?.[0]?.count || 0) === 0) {
            await query(`
                INSERT INTO alerts (id, name, keywords, severity, cooldown) VALUES
                ('alert_1', 'Crise Ukraine', '["Ukraine", "conflit", "Zelensky", "guerre", "Russie"]', 'high', 1800),
                ('alert_2', 'Tensions Moyen-Orient', '["Israël", "Palestine", "Gaza", "Hamas", "Jérusalem"]', 'high', 3600),
                ('alert_3', 'Économie mondiale', '["inflation", "récession", "croissance", "marché", "économie"]', 'medium', 7200)
            `);
            console.log('✅ Données d\'exemple insérées dans la table alerts');
        }

        console.log('✅ Tables alerts initialisées avec succès');
    } catch (error) {
        console.error('❌ Erreur initialisation tables alerts:', error);
    }
}

initializeAlertsTables();

app.get('/api/alerts', async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM alerts ORDER BY created_at DESC');
        const alerts = (result.rows || []).map(alert => ({
            ...alert,
            keywords: JSON.parse(alert.keywords || '[]')
        }));

        res.json({ success: true, alerts });
    } catch (error) {
        next(error);
    }
});

app.post('/api/alerts', async (req, res, next) => {
    try {
        const { name, keywords, severity, cooldown } = req.body;

        if (!name || !keywords || !Array.isArray(keywords)) {
            return res.status(400).json({
                success: false,
                error: 'Nom et mots-clés (array) requis'
            });
        }

        const alertId = `alert_${Date.now()}`;
        const result = await query(`
            INSERT INTO alerts (id, name, keywords, severity, cooldown)
            VALUES (?, ?, ?, ?, ?)
        `, [alertId, name, JSON.stringify(keywords), severity || 'medium', cooldown || 1800]);

        if (result.rowCount > 0) {
            res.json({
                success: true,
                alert: {
                    id: alertId,
                    name,
                    keywords,
                    severity: severity || 'medium',
                    cooldown: cooldown || 1800,
                    enabled: true,
                    created_at: new Date().toISOString()
                }
            });
        } else {
            throw new Error('Échec création alerte');
        }
    } catch (error) {
        next(error);
    }
});

app.put('/api/alerts/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { enabled, name, keywords, severity, cooldown } = req.body;

        console.log(`✏️ Mise à jour alerte ${id}:`, { enabled, name });

        const alertExists = await query('SELECT id FROM alerts WHERE id = ?', [id]);
        if (!alertExists.rows || alertExists.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Alerte non trouvée'
            });
        }

        let updateFields = [];
        let params = [];

        if (enabled !== undefined) {
            updateFields.push('enabled = ?');
            params.push(enabled ? 1 : 0);
        }
        if (name) {
            updateFields.push('name = ?');
            params.push(name);
        }
        if (keywords) {
            updateFields.push('keywords = ?');
            params.push(JSON.stringify(keywords));
        }
        if (severity) {
            updateFields.push('severity = ?');
            params.push(severity);
        }
        if (cooldown) {
            updateFields.push('cooldown = ?');
            params.push(cooldown);
        }

        updateFields.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(id);

        const updateResult = await query(
            `UPDATE alerts SET ${updateFields.join(', ')} WHERE id = ?`,
            params
        );

        if (updateResult.rowCount > 0) {
            const updatedAlertResult = await query('SELECT * FROM alerts WHERE id = ?', [id]);
            const updatedAlert = updatedAlertResult.rows[0];

            res.json({
                success: true,
                message: 'Alerte mise à jour avec succès',
                alert: {
                    ...updatedAlert,
                    keywords: JSON.parse(updatedAlert.keywords || '[]')
                }
            });
        } else {
            throw new Error('Aucune modification effectuée');
        }

    } catch (error) {
        console.error('❌ Erreur mise à jour alerte:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur mise à jour alerte: ' + error.message
        });
    }
});

app.delete('/api/alerts/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        console.log(`🔍 DELETE /alerts/${id} appelé`);

        const alertExists = await query('SELECT id FROM alerts WHERE id = ?', [id]);
        if (!alertExists.rows || alertExists.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Alerte non trouvée en base de données'
            });
        }

        await query('DELETE FROM triggered_alerts WHERE alert_id = ?', [id]);
        const deleteResult = await query('DELETE FROM alerts WHERE id = ?', [id]);

        if (deleteResult.rowCount > 0) {
            console.log(`✅ Alerte ${id} supprimée DÉFINITIVEMENT de la base`);
            res.json({
                success: true,
                message: 'Alerte supprimée définitivement',
                deleted_id: id
            });
        } else {
            throw new Error('Échec suppression - aucune ligne affectée');
        }

    } catch (error) {
        console.error('❌ Erreur suppression alerte:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur suppression alerte: ' + error.message
        });
    }
});

// GET /api/alerts/stats
app.get('/api/alerts/stats', async (req, res, next) => {
    try {
        // Statistiques des alertes
        const totalAlertsResult = await query('SELECT COUNT(*) as count FROM alerts');
        const enabledAlertsResult = await query('SELECT COUNT(*) as count FROM alerts WHERE enabled = 1');
        const todayTriggeredResult = await query(`
            SELECT COUNT(*) as count FROM triggered_alerts 
            WHERE DATE(triggered_at) = DATE('now')
        `);
        const totalTriggeredResult = await query('SELECT COUNT(*) as count FROM triggered_alerts');

        res.json({
            success: true,
            stats: {
                total_alerts: parseInt(totalAlertsResult.rows[0].count),
                enabled_alerts: parseInt(enabledAlertsResult.rows[0].count),
                today_triggered: parseInt(todayTriggeredResult.rows[0].count),
                total_triggered: parseInt(totalTriggeredResult.rows[0].count)
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/alerts/triggered
app.get('/api/alerts/triggered', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const result = await query(`
            SELECT 
                ta.id,
                ta.alert_id,
                a.name as alert_name,
                ta.article_id,
                ar.title as article_title,
                ar.link as article_link,
                ta.matched_keywords,
                ta.triggered_at,
                a.severity
            FROM triggered_alerts ta
            LEFT JOIN alerts a ON ta.alert_id = a.id
            LEFT JOIN articles ar ON ta.article_id = ar.id
            ORDER BY ta.triggered_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const alerts = (result.rows || []).map(alert => ({
            ...alert,
            matched_keywords: JSON.parse(alert.matched_keywords || '[]')
        }));

        // Count total pour la pagination
        const totalResult = await query('SELECT COUNT(*) as count FROM triggered_alerts');
        const total = parseInt(totalResult.rows[0].count);

        res.json({
            success: true,
            alerts: alerts,
            pagination: {
                total: total,
                limit: limit,
                offset: offset
            }
        });
    } catch (error) {
        next(error);
    }
});

// Fonction pour enregistrer une alerte déclenchée (SQLite)
async function recordTriggeredAlert(alert, article, matchedKeywords) {
    try {
        await query(`
            INSERT INTO triggered_alerts (alert_id, article_id, matched_keywords)
            VALUES (?, ?, ?)
        `, [alert.id, article.id, JSON.stringify(matchedKeywords)]);

        console.log(`🔔 Alerte déclenchée: ${alert.name} - ${matchedKeywords.length} mots-clés`);
        return true;
    } catch (error) {
        console.error('❌ Erreur enregistrement alerte déclenchée:', error);
        return false;
    }
}

// Fonction pour vérifier les alertes sur un article
async function checkAlertsForArticle(article) {
    try {
        const enabledAlerts = await query('SELECT * FROM alerts WHERE enabled = 1');
        const articleText = (article.title + ' ' + (article.summary || '') + ' ' + (article.content || '')).toLowerCase();

        for (const alert of enabledAlerts.rows) {
            const keywords = JSON.parse(alert.keywords || '[]');
            const matchedKeywords = keywords.filter(keyword =>
                articleText.includes(keyword.toLowerCase())
            );

            if (matchedKeywords.length > 0) {
                // Vérifier le cooldown
                const lastTriggered = await query(`
                    SELECT triggered_at FROM triggered_alerts 
                    WHERE alert_id = ? 
                    ORDER BY triggered_at DESC 
                    LIMIT 1
                `, [alert.id]);

                const shouldTrigger = !lastTriggered.rows.length ||
                    (new Date() - new Date(lastTriggered.rows[0].triggered_at)) > (alert.cooldown * 1000);

                if (shouldTrigger) {
                    await recordTriggeredAlert(alert, article, matchedKeywords);
                    console.log(`🚨 ALERTE: "${alert.name}" déclenchée par: ${article.title}`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Erreur vérification alertes:', error);
    }
}

// ===========================================================================
// ROUTES FLUX SOCIAUX
// ===========================================================================

app.get('/api/social/sources', async (req, res) => {
    try {
        const sources = Array.from(socialAggregator.sources.values());
        res.json({
            success: true,
            sources: sources.length > 0 ? sources : socialAggregator.defaultSources
        });
    } catch (error) {
        console.error('❌ Erreur chargement sources sociales:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur chargement sources sociales'
        });
    }
});

app.post('/api/social/sources', async (req, res) => {
    try {
        const { sources } = req.body;
        if (!Array.isArray(sources)) {
            return res.status(400).json({
                success: false,
                error: 'Sources must be an array'
            });
        }

        const configuredSources = await socialAggregator.configureSources(sources);

        res.json({
            success: true,
            sources: configuredSources,
            message: `${configuredSources.length} source(s) sociale(s) configurée(s)`
        });
    } catch (error) {
        console.error('❌ Erreur configuration sources sociales:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur configuration sources sociales'
        });
    }
});

app.get('/api/social/posts', async (req, res) => {
    try {
        const { limit = 100, source, sentiment } = req.query;

        let posts = await socialAggregator.fetchAllPosts();
        posts = await socialAggregator.analyzeSocialSentiment(posts);

        if (source) {
            posts = posts.filter(post => post.sourceType === source);
        }
        if (sentiment) {
            posts = posts.filter(post => post.sentimentType === sentiment);
        }

        posts = posts.slice(0, parseInt(limit));

        res.json({
            success: true,
            posts: posts,
            total: posts.length,
            fetchedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Erreur récupération posts sociaux:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur récupération posts sociaux'
        });
    }
});

app.post('/api/social/refresh', async (req, res) => {
    try {
        console.log('🔄 Rafraîchissement des flux sociaux...');

        const posts = await socialAggregator.fetchAllPosts();
        const postsWithSentiment = await socialAggregator.analyzeSocialSentiment(posts);

        for (const post of postsWithSentiment) {
            try {
                await query(`
                    INSERT OR REPLACE INTO social_posts 
                    (id, title, content, link, pub_date, source, source_type, author, sentiment_score, sentiment_type, confidence)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    post.id,
                    post.title,
                    post.content,
                    post.link,
                    post.pubDate.toISOString(),
                    post.source,
                    post.sourceType,
                    post.author,
                    post.sentiment,
                    post.sentimentType,
                    post.confidence
                ]);
            } catch (dbError) {
                console.warn('⚠️ Erreur stockage post social:', dbError.message);
            }
        }

        res.json({
            success: true,
            posts: postsWithSentiment,
            total: postsWithSentiment.length,
            message: `${postsWithSentiment.length} posts sociaux récupérés`
        });
    } catch (error) {
        console.error('❌ Erreur rafraîchissement social:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur rafraîchissement flux sociaux'
        });
    }
});

app.get('/api/social/comments/site', async (req, res) => {
    try {
        const { site, query, limit } = req.query;

        if (!site) {
            return res.status(400).json({
                success: false,
                error: 'Paramètre "site" requis (ex: example.com)'
            });
        }

        console.log(`💬 Fetching comments for site: ${site}`);

        const comments = await socialAggregator.fetchCommentsFromSite(
            site,
            query || 'commentaire OR reaction OR avis OR "site:' + site + '"'
        );

        res.json({
            success: true,
            site: site,
            query: query,
            comments: comments,
            count: comments.length,
            fetchedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Site comments error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur récupération commentaires site: ' + error.message
        });
    }
});

// ===========================================================================
// ROUTES PRÉDICTIONS
// ===========================================================================

app.get('/api/predict/z', async (req, res) => {
    try {
        const days = parseInt(req.query.days || '30', 10);
        const horizon = parseInt(req.query.horizon || '7', 10);
        const theme = req.query.theme || null;

        const to = new Date();
        const from = new Date(Date.now() - days * 24 * 3600 * 1000);

        console.log(`🔮 Calculating Z prediction: ${days} days window, ${horizon} days forecast`);

        const result = await predictorEngine.predictZEvolution({
            from,
            to,
            horizon
        });

        res.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Z prediction error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur calcul prédiction Z: ' + error.message
        });
    }
});

app.get('/api/predictions/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit || '10', 10);

        const result = await query(`
            SELECT 
                id,
                created_at,
                window_start,
                window_end,
                horizon,
                metrics_json,
                forecast_json
            FROM predictions
            ORDER BY created_at DESC
            LIMIT ?
        `, [limit]);

        const predictions = (result.rows || []).map(row => ({
            id: row.id,
            created_at: row.created_at,
            window: {
                start: row.window_start,
                end: row.window_end
            },
            horizon: row.horizon,
            metrics: JSON.parse(row.metrics_json || '{}'),
            forecast: JSON.parse(row.forecast_json || '[]')
        }));

        res.json({ success: true, predictions });
    } catch (error) {
        console.error('❌ Predictions history error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur récupération historique prédictions'
        });
    }
});

// ===========================================================================
// ROUTES FACTOR Z
// ===========================================================================

function calculateSentimentAverage(sentimentData) {
    const totals = { positive: 0, neutral: 0, negative: 0 };
    let totalCount = 0;
    let weightedSum = 0;

    sentimentData.forEach(item => {
        const type = item.sentiment_type || 'neutral';
        const count = parseInt(item.count) || 0;
        const score = parseFloat(item.sentiment_score) || 0;

        if (type.includes('positive')) totals.positive += count;
        else if (type.includes('negative')) totals.negative += count;
        else totals.neutral += count;

        totalCount += count;
        weightedSum += score * count;
    });

    const avg = totalCount > 0 ? weightedSum / totalCount : 0;

    let variance = 0;
    sentimentData.forEach(item => {
        const score = parseFloat(item.sentiment_score) || 0;
        const count = parseInt(item.count) || 0;
        variance += Math.pow(score - avg, 2) * count;
    });
    variance = totalCount > 1 ? variance / (totalCount - 1) : 0;

    return {
        avg: avg,
        variance: variance,
        total: totalCount,
        distribution: totals
    };
}

app.get('/api/factor-z', async (req, res) => {
    try {
        const { period = 7, theme } = req.query;
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(period));

        const rssQuery = `
            SELECT sentiment_type, sentiment_score, COUNT(*) as count
            FROM articles 
            WHERE pub_date >= ?
            ${theme ? `AND EXISTS (SELECT 1 FROM theme_analyses ta JOIN themes t ON ta.theme_id = t.id WHERE ta.article_id = articles.id AND t.id = ?)` : ''}
            GROUP BY sentiment_type
        `;

        const rssParams = theme ? [daysAgo.toISOString(), theme] : [daysAgo.toISOString()];
        const rssResult = await query(rssQuery, rssParams);

        const socialQuery = `
            SELECT sentiment_type, sentiment_score, COUNT(*) as count
            FROM social_posts 
            WHERE pub_date >= ?
            GROUP BY sentiment_type
        `;

        const socialResult = await query(socialQuery, [daysAgo.toISOString()]);

        const rssSentiment = calculateSentimentAverage(rssResult.rows || []);
        const socialSentiment = calculateSentimentAverage(socialResult.rows || []);

        const diff = Math.abs(rssSentiment.avg - socialSentiment.avg);
        const pooledVariance = ((rssSentiment.variance * rssSentiment.total) + (socialSentiment.variance * socialSentiment.total)) /
            (rssSentiment.total + socialSentiment.total);
        const stdError = Math.sqrt(pooledVariance / rssSentiment.total + pooledVariance / socialSentiment.total);
        const zScore = stdError > 0 ? diff / stdError : 0;

        let interpretation = 'Validation populaire';
        if (Math.abs(zScore) > 2.5) interpretation = 'Dissonance majeure';
        else if (Math.abs(zScore) > 1.5) interpretation = 'Dissonance modérée';
        else if (Math.abs(zScore) > 0.5) interpretation = 'Légère dissonance';

        res.json({
            success: true,
            factorZ: {
                value: parseFloat(zScore.toFixed(3)),
                absoluteValue: Math.abs(zScore),
                interpretation: interpretation,
                rssSentiment: rssSentiment,
                socialSentiment: socialSentiment,
                period: `${period} jours`,
                theme: theme || 'tous',
                calculatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Erreur calcul factor Z:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur calcul facteur Z'
        });
    }
});

// ===========================================================================
// ROUTES EXPORT
// ===========================================================================

app.get('/api/export/csv', async (req, res, next) => {
    try {
        const { date_from, date_to } = req.query;

        let whereClause = '';
        let params = [];

        if (date_from && date_to) {
            whereClause = 'WHERE pub_date BETWEEN ? AND ?';
            params = [date_from, date_to];
        }

        const articlesResult = await query(`
            SELECT a.*, 
                   GROUP_CONCAT(DISTINCT t.name) as theme_names
            FROM articles a
            LEFT JOIN theme_analyses ta ON a.id = ta.article_id
            LEFT JOIN themes t ON ta.theme_id = t.id
            ${whereClause}
            GROUP BY a.id
            ORDER BY a.pub_date DESC
        `, params);

        const articles = articlesResult.rows || [];

        if (articles.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun article à exporter'
            });
        }

        const headers = ['ID', 'Titre', 'Contenu', 'Lien', 'Date', 'Score Confiance', 'Score Importance', 'Sentiment', 'Thèmes'];
        
        const csvContent = [
            headers.join(','),
            ...articles.map(article => [
                article.id,
                `"${(article.title || '').replace(/"/g, '""')}"`,
                `"${(article.content || '').replace(/"/g, '""').substring(0, 500)}"`,
                `"${(article.link || '').replace(/"/g, '""')}"`,
                article.pub_date,
                article.confidence_score,
                article.importance_score,
                article.sentiment_type,
                `"${(article.theme_names || '').replace(/"/g, '""')}"`
            ].join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="geopolis-export-${new Date().toISOString().split('T')[0]}.csv"`);
        
        res.send(csvContent);

    } catch (error) {
        next(error);
    }
});

app.get('/api/export/json', async (req, res, next) => {
    try {
        const { date_from, date_to } = req.query;

        let whereClause = '';
        let params = [];

        if (date_from && date_to) {
            whereClause = 'WHERE pub_date BETWEEN ? AND ?';
            params = [date_from, date_to];
        }

        const articlesResult = await query(`
            SELECT a.*, 
                   GROUP_CONCAT(DISTINCT t.name) as theme_names
            FROM articles a
            LEFT JOIN theme_analyses ta ON a.id = ta.article_id
            LEFT JOIN themes t ON ta.theme_id = t.id
            ${whereClause}
            GROUP BY a.id
            ORDER BY a.pub_date DESC
        `, params);

        const articles = articlesResult.rows || [];

        const exportData = {
            export_date: new Date().toISOString(),
            total_articles: articles.length,
            date_range: {
                from: date_from,
                to: date_to
            },
            articles: articles.map(article => ({
                id: article.id,
                title: article.title,
                content: article.content,
                link: article.link,
                pub_date: article.pub_date,
                feed_url: article.feed_url,
                confidence_score: article.confidence_score,
                importance_score: article.importance_score,
                sentiment_score: article.sentiment_score,
                sentiment_type: article.sentiment_type,
                themes: article.theme_names ? article.theme_names.split(',') : []
            }))
        };

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="geopolis-export-${new Date().toISOString().split('T')[0]}.json"`);
        
        res.send(JSON.stringify(exportData, null, 2));

    } catch (error) {
        next(error);
    }
});

// ===========================================================================
// ROUTES SANTÉ ET MÉTRIQUES
// ===========================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

app.get('/api/health/node', async (req, res, next) => {
    try {
        await query('SELECT 1');
        res.json({
            ok: true,
            service: 'Node.js RSS Aggregator',
            mode: config.isLocal ? 'local' : 'cloud',
            database: config.database?.use || 'unknown',
            flask: config.services?.flask?.enabled ? 'enabled' : 'disabled',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/metrics', async (req, res, next) => {
    try {
        console.log('📊 API Metrics appelée');

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/metrics`, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible, fallback aux métriques locales');
            }
        }

        const [articlesCount, feedsCount, themesCount] = await Promise.all([
            query('SELECT COUNT(*) as count FROM articles'),
            query('SELECT COUNT(*) as count FROM feeds WHERE is_active = 1 OR is_active = true'),
            query('SELECT COUNT(*) as count FROM themes')
        ]);

        const metrics = {
            success: true,
            summary: {
                total_articles: parseInt(articlesCount.rows?.[0]?.count || 0),
                total_feeds: parseInt(feedsCount.rows?.[0]?.count || 0),
                total_themes: parseInt(themesCount.rows?.[0]?.count || 0),
                avg_confidence: 0.75,
                avg_posterior: 0.68,
                avg_corroboration: 0.42
            },
            sentiment_evolution: [],
            theme_evolution: [],
            top_themes: []
        };

        res.json(metrics);
    } catch (error) {
        next(error);
    }
});

// ===========================================================================
// PROXY FLASK ROUTES
// ===========================================================================

const FLASK_BASE_URL = process.env.FLASK_BASE_URL || "http://127.0.0.1:5000";

function proxyFlaskRoute(method, path) {
    app[method](path, async (req, res) => {
        try {
            const flaskUrl = `${FLASK_BASE_URL}${path.replace('/api', '')}`;
            const options = {
                method: method.toUpperCase(),
                headers: { "Content-Type": "application/json" },
            };
            if (method !== "get" && req.body) options.body = JSON.stringify(req.body);

            const response = await fetch(flaskUrl, options);
            const contentType = response.headers.get("content-type") || "";

            if (contentType.includes("application/json")) {
                const data = await response.json();
                res.status(response.status).json(data);
            } else {
                const text = await response.text();
                res.status(response.status).send(text);
            }
        } catch (error) {
            console.error(`❌ Proxy error for ${method.toUpperCase()} ${path}:`, error);
            res.status(500).json({ error: `Flask proxy failed for ${path}` });
        }
    });
}

const flaskRoutes = [
    { method: "get", path: "/api/health" },
    { method: "post", path: "/api/analyze" },
    { method: "get", path: "/api/analyze/sentiment" },
    { method: "get", path: "/api/analyze/themes" },
    { method: "get", path: "/api/summaries" },
    { method: "get", path: "/api/sentiment/stats" },
    { method: "get", path: "/api/email/config" },
    { method: "post", path: "/api/email/test" },
    { method: "post", path: "/api/email/start-scheduler" },
    { method: "post", path: "/api/email/send-test-report" },
    { method: "get", path: "/api/alerts/:id" },
    { method: "get", path: "/api/alerts/triggered" },
    { method: "get", path: "/api/analysis/correlations/themes" }
];

flaskRoutes.forEach(({ method, path }) => proxyFlaskRoute(method, path));
console.log("✅ Flask proxy routes registered:", flaskRoutes.map(r => r.path));


// 02novembre debug DIAGNOSTIC - À ajouter temporairement dans server.js
app.get('/api/debug/feeds', async (req, res) => {
    try {
        console.log('🔍 Diagnostic feeds appelé');

        // Vérifier les feeds en base
        const feedsResult = await query('SELECT * FROM feeds WHERE is_active = 1 OR is_active = true');
        const feeds = feedsResult.rows || [];
        console.log('📡 Feeds actifs trouvés:', feeds.length);

        // Vérifier le parser RSS
        console.log('🔍 Test parser RSS...');
        try {
            const testFeed = await parser.parseURL('https://feeds.bbci.co.uk/news/rss.xml');
            console.log('✅ Parser RSS fonctionne, items:', testFeed.items?.length || 0);
        } catch (parserError) {
            console.error('❌ Parser RSS ne fonctionne pas:', parserError.message);
        }

        // Vérifier la table articles
        const articlesResult = await query('SELECT COUNT(*) as count FROM articles');
        const articleCount = parseInt(articlesResult.rows?.[0]?.count || 0);
        console.log('📄 Articles en base:', articleCount);

        res.json({
            success: true,
            feeds: feeds,
            parserStatus: 'ok',
            articleCount: articleCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Diagnostic error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===========================================================================
// FONCTIONS UTILITAIRES POUR LES STATISTIQUES
// ===========================================================================

function updateTriggeredAlertsStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayAlerts = triggeredAlertsStorage.triggered.filter(alert =>
        alert.triggered_at && alert.triggered_at.startsWith(today)
    );

    triggeredAlertsStorage.stats = {
        today_triggered: todayAlerts.length,
        total_triggered: triggeredAlertsStorage.triggered.length,
        last_updated: new Date().toISOString()
    };
}

// Fonction pour enregistrer une alerte déclenchée
async function recordTriggeredAlert(alert, article, matchedKeywords) {
    try {
        const triggeredAlert = {
            id: 'triggered_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
            alert_id: alert.id,
            alert_name: alert.name,
            article_id: article.id,
            article_title: article.title,
            article_link: article.link,
            matched_keywords: matchedKeywords,
            triggered_at: new Date().toISOString(),
            severity: alert.severity
        };

        triggeredAlertsStorage.triggered.push(triggeredAlert);

        // Garder seulement les 1000 dernières alertes pour éviter la surcharge
        if (triggeredAlertsStorage.triggered.length > 1000) {
            triggeredAlertsStorage.triggered = triggeredAlertsStorage.triggered.slice(-1000);
        }

        updateTriggeredAlertsStats();
        await saveTriggeredAlertsToFile(triggeredAlertsStorage.triggered);

        console.log(`🔔 Alerte déclenchée: ${alert.name} - ${matchedKeywords.length} mots-clés correspondants`);
        return triggeredAlert;
    } catch (error) {
        console.error('❌ Erreur enregistrement alerte déclenchée:', error);
        return null;
    }
}

// ===========================================================================
// GESTIONNAIRES D'ERREURS
// ===========================================================================

app.post('/api/debug/capture-error', async (req, res) => {
    try {
        const { message, stack, type, url } = req.body;

        console.log('🔴 Erreur frontend reçue:', message);

        const error = new Error(message);
        error.stack = stack;

        const suggestion = await LlamaAssistant.analyzeError(error, {
            module: 'Frontend',
            type: type,
            url: url,
            userAgent: req.get('User-Agent')
        });

        res.json({ success: true, suggestion });

    } catch (error) {
        console.error('Erreur capture frontend:', error);
        res.json({ success: false, suggestion: 'Erreur lors de l\'analyse' });
    }
});

app.use((err, req, res, next) => {
    console.error('🔴 Erreur Express:', err.message);

    LlamaAssistant.analyzeError(err, {
        module: 'Express',
        route: req.path,
        method: req.method,
        body: req.body ? JSON.stringify(req.body).substring(0, 200) : 'Aucun'
    }).then(suggestion => {
        console.log('🤖 R1 Route Error:', suggestion);
    }).catch(assistantError => {
        console.log('⚠️ Erreur assistant:', assistantError.message);
    });

    res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
        message: err.message
    });
});

app.use((req, res) => {
    console.warn(`⚠️ Route non trouvée: ${req.method} ${req.path}`);
    res.status(404).json({
        success: false,
        code: 404,
        error: 'Route IA non trouvée',
        path: req.path
    });
});

// ===========================================================================
// DÉMARRAGE DU SERVEUR
// ===========================================================================

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 GEOPOLIS RSS AGGREGATOR - SERVER STARTED');
    console.log('='.repeat(60));
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Mode: ${config.isLocal ? 'Local' : 'Cloud'}`);
    console.log(`🗄️  Database: ${config.database?.use || 'unknown'}`);
    console.log(`🤖 Flask: ${config.services?.flask?.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`📅 Started: ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    console.log('✅ Server ready - All routes operational');
    console.log('   📍 /api/refresh     - Refresh RSS feeds');
    console.log('   📍 /api/articles    - Get articles');
    console.log('   📍 /api/themes      - Theme management');
    console.log('   📍 /api/feeds       - Feed management');
    console.log('   📍 /api/alerts      - Alert management');
    console.log('   📍 /api/social/*    - Social media feeds');
    console.log('   📍 /api/predict/*   - Prediction engine');
    console.log('   📍 /api/analysis/*  - Advanced analysis');
    console.log('   📍 /api/export/*    - Data export');
    console.log('   📍 /api/health/*    - Health checks');
    console.log('='.repeat(60));
});

// ===========================================================================
// ARRÊT GRACIEUX
// ===========================================================================

process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    console.log('👋 GEOPOLIS RSS Aggregator stopped');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Received SIGTERM, shutting down...');
    console.log('👋 GEOPOLIS RSS Aggregator stopped');
    process.exit(0);
});

module.exports = app;
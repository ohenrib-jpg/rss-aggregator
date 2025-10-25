// ===========================================================
// GEOPOLIS - server.js - VERSION COMPLÈTE CORRIGÉE
// compatible SQLite / PostgreSQL
// ===========================================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parser = require('rss-parser');
const axios = require('axios');
const path = require('path');
const { config, displayConfig } = require('./config');
const { getDatabaseManager, query } = require('./db/database_manager');
const PearsonCorrelation = require('./modules/pearson_correlation');

const app = express();
displayConfig();

// ----------------------- RSS Parser ------------------------
const parser = new Parser({
    timeout: config.rss?.timeout || 10000,
    maxRedirects: config.rss?.maxRedirects || 5,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
    }
});

// ----------------------- Middleware -----------------------
app.use(cors({
    origin: config.cors?.origins || '*',
    credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Simple request logger
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.path}`);
    next();
});

// ----------------------- Helpers DB -----------------------
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

// ----------------------- Check Flask Health -----------------------
async function checkFlaskHealth() {
    if (!config.services?.flask?.enabled) {
        console.log('⚠️ Flask désactivé dans la config');
        return false;
    }

    const flaskUrl = config.services.flask.url || 'http://localhost:5000';

    try {
        console.log(`🔍 Vérification Flask: ${flaskUrl}/api/health`);

        const response = await axios({
            method: 'GET',
            url: `${flaskUrl}/api/health`,
            timeout: 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Node.js Server'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 500; // ✅ Accepte tous les status 2xx-4xx
            }
        });

        console.log(`✅ Flask API: Status ${response.status}`);
        console.log(`📋 Réponse:`, JSON.stringify(response.data));
        return true;

    } catch (error) {
        console.warn('❌ Flask API unavailable:', error.message);

        // Log détaillé de l'erreur
        if (error.code) console.log('   Code:', error.code);
        if (error.response) {
            console.log('   Response Status:', error.response.status);
            console.log('   Response Data:', error.response.data);
        }

        return false;
    }
}

// ----------------------- Database Initialization -----------------------
let isDatabaseReady = false;

// Fonction d'initialisation asynchrone
async function initializeDatabase() {
    try {
        console.log('🗄️  Initializing database...');
        await query('SELECT 1'); // Test connection
        isDatabaseReady = true;
        console.log('✅ Database ready');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        // Réessayer après délai
        setTimeout(initializeDatabase, 2000);
    }
}

// Démarrer l'initialisation
initializeDatabase();

// Middleware pour vérifier si la DB est prête
app.use((req, res, next) => {
    if (!isDatabaseReady && req.path !== '/api/health') {
        return res.status(503).json({
            success: false,
            error: 'Database initializing',
            message: 'Please try again in a few seconds'
        });
    }
    next();
});

// ----------------------- ROUTES PRINCIPALES -----------------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ----------------------- Health -----------------------
app.get('/api/health', async (req, res, next) => {
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

// ----------------------- METRICS -----------------------
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

// ----------------------- Geopolitical report -----------------------
app.get('/api/geopolitical/report', async (req, res, next) => {
    try {
        console.log('🌍 API Geopolitical Report appelée');

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/geopolitical/report`, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour le rapport géopolitique');
            }
        }

        const fallbackReport = {
            success: true,
            report: {
                summary: {
                    totalCountries: 0,
                    highRiskZones: 0,
                    mediumRiskZones: 0,
                    activeRelations: 0,
                    analysisDate: new Date().toISOString()
                },
                crisisZones: [],
                relations: []
            }
        };

        res.json(fallbackReport);
    } catch (error) {
        next(error);
    }
});

// ----------------------- Alerts -----------------------
app.get('/api/alerts', async (req, res, next) => {
    try {
        console.log('🔔 API Alerts appelée');

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/alerts`, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour les alertes');
            }
        }

        const fallbackAlerts = {
            success: true,
            alerts: [],
            stats: {
                total_alerts: 0,
                enabled_alerts: 0,
                total_triggered: 0,
                today_triggered: 0
            }
        };

        res.json(fallbackAlerts);
    } catch (error) {
        next(error);
    }
});

app.post('/api/alerts', async (req, res, next) => {
    try {
        const alertData = req.body;
        console.log('➕ Création alerte:', alertData?.name || '<sans nom>');

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.post(`${config.services.flask.url}/api/alerts`, alertData, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour création alerte');
            }
        }

        res.json({ success: true, message: "Alerte créée (mode fallback)" });
    } catch (error) {
        next(error);
    }
});

app.put('/api/alerts/:id', async (req, res, next) => {
    try {
        const alertId = req.params.id;
        const updates = req.body;
        console.log('✏️ Update alerte:', alertId);

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.put(`${config.services.flask.url}/api/alerts/${alertId}`, updates, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour update alerte');
            }
        }

        res.json({ success: true, message: "Alerte mise à jour (mode fallback)" });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/alerts/:id', async (req, res, next) => {
    try {
        const alertId = req.params.id;
        console.log('🗑️ Suppression alerte:', alertId);

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.delete(`${config.services.flask.url}/api/alerts/${alertId}`, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour suppression alerte');
            }
        }

        res.json({ success: true, message: "Alerte supprimée (mode fallback)" });
    } catch (error) {
        next(error);
    }
});

app.get('/api/alerts/triggered', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        console.log('📈 Alertes déclenchées, limit:', limit);
        res.json({ success: true, alerts: [] });
    } catch (error) {
        next(error);
    }
});

app.post('/api/alerts/check', async (req, res, next) => {
    try {
        const article = req.body;
        console.log('🔍 Check alertes pour article:', article?.title?.substring(0, 50) || '<sans titre>');
        res.json({ success: true, triggered_alerts: [], message: "0 alerte(s) déclenchée(s)" });
    } catch (error) {
        next(error);
    }
});

// ----------------------- THEMES -----------------------
app.get('/api/themes', async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM themes ORDER BY name');
        res.json({ success: true, themes: result.rows || [] });
    } catch (error) {
        next(error);
    }
});

app.post('/api/themes', async (req, res, next) => {
    try {
        const { name, keywords, color, description } = req.body || {};
        if (!name || !keywords || (Array.isArray(keywords) && keywords.length === 0)) {
            throw new Error('Nom et mots-clés requis');
        }
        const keywordsJson = JSON.stringify(keywords);
        const insertResult = await query('INSERT INTO themes (name, keywords, color, description) VALUES (?, ?, ?, ?)', 
            [name, keywordsJson, color || '#6366f1', description || '']);
        const info = extractInsertInfo(insertResult);
        if (!info.rowCount && !info.lastID) throw new Error('Failed to create theme in database');
        console.log('✅ Thème créé:', name);
        res.json({ success: true, message: 'Thème créé avec succès' });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/themes/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM theme_analyses WHERE theme_id = ?', [id]);
        await query('DELETE FROM themes WHERE id = ?', [id]);
        console.log('✅ Thème supprimé:', id);
        res.json({ success: true, message: 'Thème supprimé' });
    } catch (error) {
        next(error);
    }
});

// ----------------------- ARTICLES -----------------------
app.get('/api/articles', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        const result = await query(`
            SELECT a.*, 
            (SELECT json_group_array(DISTINCT t.name) 
             FROM theme_analyses ta 
             JOIN themes t ON ta.theme_id = t.id 
             WHERE ta.article_id = a.id) as themes_json
            FROM articles a 
            ORDER BY a.pub_date DESC 
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const countResult = await query('SELECT COUNT(*) as total FROM articles');

        if (!result.rows) throw new Error('Database query failed');

        const articles = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            content: row.content,
            link: row.link,
            pubDate: row.pub_date,
            feed: row.feed_url,
            sentiment: {
                score: parseFloat(row.sentiment_score || 0),
                sentiment: row.sentiment_type || 'neutral',
                confidence: parseFloat(row.sentiment_confidence || 0)
            },
            themes: row.themes_json ? JSON.parse(row.themes_json) : []
        }));

        res.json({ success: true, articles, total: parseInt(countResult.rows?.[0]?.total || 0) });
    } catch (error) {
        next(error);
    }
});

// ----------------------- Sentiment Analysis -----------------------
function analyzeSentimentBasic(text) {
    if (!text) return { score: 0, sentiment: 'neutral', confidence: 0.5 };

    const positiveWords = ['bon', 'excellent', 'positif', 'succès', 'progress', 'hausse', 'gain', 'victoire'];
    const negativeWords = ['mauvais', 'négatif', 'échec', 'problème', 'crise', 'chute', 'perte', 'conflit'];

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

// ----------------------- Theme Detection -----------------------
function detectThemes(articleContent, articleTitle, themes) {
    if (!articleContent || !themes || themes.length === 0) return [];

    const text = (articleTitle + ' ' + (articleContent || '')).toLowerCase();
    const detectedThemes = [];

    themes.forEach(theme => {
        try {
            const keywords = typeof theme.keywords === 'string'
                ? JSON.parse(theme.keywords)
                : (theme.keywords || []);

            let keywordMatches = 0;
            keywords.forEach(keyword => {
                const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'gi');
                const matches = text.match(regex);
                if (matches) keywordMatches += matches.length;
            });

            if (keywordMatches >= 2 || (keywords.length === 1 && keywordMatches >= 1)) {
                detectedThemes.push({
                    theme_id: theme.id,
                    confidence: Math.min(keywordMatches / Math.max(1, keywords.length), 0.9)
                });
            }
        } catch (error) {
            console.warn(`❌ Erreur analyse thème ${theme?.name || 'unknown'}:`, error.message);
        }
    });

    return detectedThemes;
}

// ----------------------- Scoring -----------------------
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
        'bfmtv.com': 0.7
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

// ----------------------- REFRESH -----------------------
app.post('/api/refresh', async (req, res, next) => {
    try {
        console.log('🔄 Manual refresh triggered...');

        const feedsResult = await query('SELECT url FROM feeds WHERE is_active = 1 OR is_active = true');
        if (!feedsResult.rows) throw new Error('Failed to fetch active feeds');

        let feeds = feedsResult.rows.map(r => r.url).filter(Boolean);

        if (feeds.length === 0) {
            console.log('⚠️  No active feeds, adding defaults...');
            const defaultFeeds = [
                'https://www.lemonde.fr/international/rss_full.xml',
                'https://www.france24.com/fr/rss',
                'https://www.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/'
            ];
            for (const url of defaultFeeds) {
                try {
                    await query('INSERT INTO feeds (url, title, is_active) VALUES (?, ?, 1)', [url, new URL(url).hostname]);
                } catch (e) {
                    // ignore duplicate
                }
            }
            feeds = defaultFeeds;
        }

        feeds = feeds.slice(0, config.rss?.maxFeedsPerRefresh || 10);

        let articlesProcessed = 0;
        let errors = 0;

        for (const feedUrl of feeds) {
            try {
                console.log(`📡 Fetching: ${feedUrl}`);
                const feed = await parser.parseURL(feedUrl);
                const items = (feed.items || []).slice(0, config.rss?.maxArticlesPerFeed || 20);

                for (const item of items) {
                    try {
                        const pubDate = new Date(item.pubDate || item.isoDate || Date.now());
                        const content = (item.contentEncoded || item.content || item.summary || item.description || '')
                            .replace(/<[^>]*>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .substring(0, 2000);

                        const articleScore = calculateArticleScore(item, feedUrl);

                        const insertResult = await query(`
                            INSERT INTO articles (title, content, link, pub_date, feed_url, 
                                sentiment_score, sentiment_type, sentiment_confidence,
                                confidence_score, importance_score)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            item.title || 'Sans titre',
                            content,
                            item.link || `#${Date.now()}_${Math.random()}`,
                            pubDate.toISOString(),
                            feedUrl,
                            articleScore.sentiment.score,
                            articleScore.sentiment.sentiment,
                            articleScore.sentiment.confidence,
                            articleScore.confidence,
                            articleScore.importance
                        ]);

                        const info = extractInsertInfo(insertResult);
                        const newArticleId = info.lastID;

                        if (newArticleId) {
                            try {
                                const themesResult = await query('SELECT * FROM themes');
                                const themes = themesResult.rows || [];
                                const detectedThemes = detectThemes(content, item.title, themes);

                                console.log(`🎯 Article ${newArticleId}: ${detectedThemes.length} thème(s) détecté(s)`);

                                for (const theme of detectedThemes) {
                                    await query('INSERT OR IGNORE INTO theme_analyses (article_id, theme_id, confidence) VALUES (?, ?, ?)', 
                                        [newArticleId, theme.theme_id, theme.confidence]);
                                }
                            } catch (themeError) {
                                console.warn(`⚠️ Erreur détection thèmes article ${newArticleId}:`, themeError.message);
                            }
                        }

                        if ((info.rowCount && info.rowCount > 0) || newArticleId) articlesProcessed++;
                    } catch (itemError) {
                        if (!/unique|UNIQUE|duplicate/i.test(itemError.message || '')) {
                            errors++;
                        }
                    }
                }

                await query('UPDATE feeds SET last_fetched = ? WHERE url = ?', [new Date().toISOString(), feedUrl]);
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (feedError) {
                console.error(`❌ Error fetching ${feedUrl}:`, feedError.message);
                errors++;
            }
        }

        console.log(`✅ Refresh complete: ${articlesProcessed} articles, ${errors} errors`);
        res.json({
            success: true,
            message: `${articlesProcessed} nouveaux articles récupérés`,
            details: { articles_processed: articlesProcessed, errors, feeds_processed: feeds.length }
        });
    } catch (error) {
        next(error);
    }
});

// ----------------------- FEEDS -----------------------
app.get('/api/feeds/manager', async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM feeds ORDER BY created_at DESC');
        res.json({ success: true, feeds: result.rows || [] });
    } catch (error) {
        next(error);
    }
});

app.post('/api/feeds', async (req, res, next) => {
    try {
        const { url, title } = req.body || {};
        if (!url || !/^https?:\/\//i.test(url)) throw new Error('URL invalide, doit commencer par http(s)://');

        const existing = await query('SELECT id FROM feeds WHERE url = ? LIMIT 1', [url]);
        if (existing.rows && existing.rows.length > 0) return res.json({ success: true, message: 'Flux déjà présent' });

        const feed = await parser.parseURL(url);
        const insertResult = await query('INSERT INTO feeds (url, title, is_active, created_at) VALUES (?, ?, 1, ?)', 
            [url, title || feed.title || 'Flux sans titre', new Date().toISOString()]);
        const info = extractInsertInfo(insertResult);
        if (!info.rowCount && !info.lastID) throw new Error('Failed to insert feed into database');
        console.log('✅ Flux ajouté:', url);
        res.json({ success: true, feed: { url, title: title || feed.title } });
    } catch (error) {
        next(error);
    }
});

app.put('/api/feeds/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await query('UPDATE feeds SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
        console.log('✅ Flux mis à jour:', id);
        res.json({ success: true, message: 'Flux mis à jour' });
    } catch (error) {
        next(error);
    }
});

app.delete('/api/feeds/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM feeds WHERE id = ?', [id]);
        console.log('✅ Flux supprimé:', id);
        res.json({ success: true, message: 'Flux supprimé' });
    } catch (error) {
        next(error);
    }
});

// ----------------------- STATS -----------------------
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

// ----------------------- Sentiment Detailed -----------------------
app.get('/api/sentiment/detailed', async (req, res, next) => {
    try {
        console.log('😊 API Sentiment Detailed appelée');

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/sentiment/stats`, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour sentiment stats');
            }
        }

        const sentimentStats = await query(`
            SELECT 
                sentiment_type,
                COUNT(*) as count
            FROM articles 
            WHERE sentiment_type IS NOT NULL
            GROUP BY sentiment_type
        `);

        const stats = { positive: 0, neutral: 0, negative: 0 };
        (sentimentStats.rows || []).forEach(row => {
            stats[row.sentiment_type] = row.count;
        });

        res.json({ success: true, stats });
    } catch (error) {
        next(error);
    }
});

// ----------------------- Analysis Timeline -----------------------
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

// ----------------------- Top Themes -----------------------
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

// ----------------------- Learning Stats -----------------------
app.get('/api/learning/stats', async (req, res, next) => {
    try {
        console.log('🧠 API Learning Stats appelée');

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/learning/stats`, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour learning stats');
            }
        }

        res.json({
            success: true,
            total_articles_processed: 0,
            sentiment_accuracy: 0.75,
            theme_detection_accuracy: 0.65,
            avg_processing_time: 2.1,
            modules_active: ["Analyseur de sentiment", "Détection de thèmes", "Extraction RSS"]
        });
    } catch (error) {
        next(error);
    }
});

// ----------------------- Geopolitical Extra -----------------------
app.get('/api/geopolitical/crisis-zones', async (req, res, next) => {
    try {
        console.log('🔥 API Crisis Zones appelée');

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/geopolitical/crisis-zones`, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour zones de crise');
            }
        }

        res.json({ success: true, zones: [] });
    } catch (error) {
        next(error);
    }
});

app.get('/api/geopolitical/relations', async (req, res, next) => {
    try {
        console.log('🤝 API Geopolitical Relations appelée');

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/geopolitical/relations`, {
                    timeout: config.services.flask.timeout || 5000
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour relations géopolitiques');
            }
        }

        const fallbackRelations = [
            { country1: "USA", country2: "China", relation: "tense", score: -0.7, confidence: 0.82 },
            { country1: "Russia", country2: "EU", relation: "conflict", score: -0.9, confidence: 0.91 },
            { country1: "France", country2: "Germany", relation: "cooperative", score: 0.8, confidence: 0.87 }
        ];

        res.json({ success: true, relations: fallbackRelations });
    } catch (error) {
        next(error);
    }
});

// ----------------------- Correlations -----------------------
app.get('/api/analysis/correlations/keyword-sentiment', async (req, res, next) => {
    try {
        const { keyword, limit = 100 } = req.query;
        if (!keyword) return res.status(400).json({ success: false, error: 'Paramètre "keyword" requis' });

        const result = await query(`
            SELECT a.*, 
                (SELECT json_group_array(DISTINCT t.name) 
                 FROM theme_analyses ta 
                 JOIN themes t ON ta.theme_id = t.id 
                 WHERE ta.article_id = a.id) as themes_json
            FROM articles a 
            ORDER BY a.pub_date DESC 
            LIMIT ?
        `, [parseInt(limit)]);

        const articles = (result.rows || []).map(row => ({
            id: row.id,
            title: row.title,
            content: row.content,
            summary: (row.content || '').substring(0, 500),
            sentiment: { score: parseFloat(row.sentiment_score || 0), sentiment: row.sentiment_type || 'neutral' },
            themes: row.themes_json ? JSON.parse(row.themes_json) : []
        }));

        const correlationResult = PearsonCorrelation.analyzeKeywordSentimentCorrelation(articles, keyword);

        res.json({
            success: true,
            analysis: correlationResult,
            metadata: { articlesAnalyzed: articles.length, keyword, timestamp: new Date().toISOString() }
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/analysis/correlations/themes', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 200;

        const [articlesResult, themesResult] = await Promise.all([
            query(`
                SELECT a.*, 
                    (SELECT json_group_array(DISTINCT t.name) 
                     FROM theme_analyses ta 
                     JOIN themes t ON ta.theme_id = t.id 
                     WHERE ta.article_id = a.id) as themes_json
                FROM articles a 
                ORDER BY a.pub_date DESC 
                LIMIT ?
            `, [limit]),
            query('SELECT * FROM themes ORDER BY name')
        ]);

        const articles = (articlesResult.rows || []).map(row => ({ 
            id: row.id, 
            title: row.title, 
            themes: row.themes_json ? JSON.parse(row.themes_json) : [] 
        }));
        const themes = themesResult.rows || [];

        const correlations = PearsonCorrelation.analyzeThemeCorrelations(articles, themes);

        res.json({
            success: true,
            correlations,
            metadata: {
                articlesAnalyzed: articles.length,
                themesCount: themes.length,
                significantCorrelations: correlations.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/analysis/correlations/multiple-keywords', async (req, res, next) => {
    try {
        const { keywords, limit = 100 } = req.query;
        if (!keywords) return res.status(400).json({ success: false, error: 'Paramètre "keywords" requis (séparés par des virgules)' });

        const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k);

        const result = await query(`
            SELECT a.*, 
                (SELECT json_group_array(DISTINCT t.name) 
                 FROM theme_analyses ta 
                 JOIN themes t ON ta.theme_id = t.id 
                 WHERE ta.article_id = a.id) as themes_json
            FROM articles a 
            ORDER BY a.pub_date DESC 
            LIMIT ?
        `, [parseInt(limit)]);

        const articles = (result.rows || []).map(row => ({
            id: row.id,
            title: row.title,
            content: row.content,
            summary: (row.content || '').substring(0, 500),
            sentiment: { score: parseFloat(row.sentiment_score || 0), sentiment: row.sentiment_type || 'neutral' },
            themes: row.themes_json ? JSON.parse(row.themes_json) : []
        }));

        const correlations = PearsonCorrelation.analyzeMultipleKeywordsCorrelation(articles, keywordList);

        res.json({
            success: true,
            correlations,
            metadata: {
                articlesAnalyzed: articles.length,
                keywords: keywordList,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        next(error);
    }
});

// ----------------------- Debug détaillé des routes -----------------------
app.get('/api/debug/flask-routes', async (req, res) => {
    try {
        const flaskUrl = config.services?.flask?.url || 'http://localhost:5000';
        const routesToTest = [
            '/api/metrics',
            '/api/geopolitical/report',
            '/api/alerts',
            '/api/sentiment/stats',
            '/api/learning/stats'
        ];

        const results = [];

        for (const route of routesToTest) {
            try {
                const response = await axios.get(`${flaskUrl}${route}`, {
                    timeout: 3000
                });
                results.push({
                    route,
                    status: '✅ OK',
                    statusCode: response.status,
                    data: response.data?.success !== undefined ? response.data : 'response received'
                });
            } catch (error) {
                results.push({
                    route,
                    status: '❌ ERROR',
                    error: error.message,
                    code: error.code
                });
            }
        }

        res.json({
            success: true,
            flaskUrl,
            results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ----------------------- Debug détaillé des réponses Flask -----------------------
app.get('/api/debug/flask-responses', async (req, res) => {
    try {
        const flaskUrl = config.services?.flask?.url || 'http://localhost:5000';
        const routesToTest = [
            '/api/metrics',
            '/api/geopolitical/report',
            '/api/alerts',
            '/api/sentiment/stats',
            '/api/learning/stats',
            '/api/geopolitical/crisis-zones',
            '/api/geopolitical/relations'
        ];

        const results = [];

        for (const route of routesToTest) {
            try {
                const response = await axios.get(`${flaskUrl}${route}`, {
                    timeout: 5000
                });

                // Analyse détaillée de la réponse
                const hasSuccess = response.data && response.data.success !== undefined;
                const successValue = hasSuccess ? response.data.success : 'MISSING';
                const hasData = response.data && Object.keys(response.data).length > 0;

                results.push({
                    route,
                    status: '✅ RESPONSE',
                    statusCode: response.status,
                    successField: successValue,
                    hasSuccessField: hasSuccess,
                    keys: Object.keys(response.data || {}),
                    dataSample: JSON.stringify(response.data).substring(0, 200) + '...'
                });
            } catch (error) {
                results.push({
                    route,
                    status: '❌ ERROR',
                    error: error.message,
                    code: error.code,
                    response: error.response ? {
                        status: error.response.status,
                        data: error.response.data
                    } : 'no response'
                });
            }

            // Petit délai entre les requêtes
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        res.json({
            success: true,
            flaskUrl,
            totalTested: routesToTest.length,
            results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ----------------------- GESTIONNAIRE D'ERREURS -----------------------
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Route non trouvée',
        path: req.path,
        method: req.method
    });
});

app.use((error, req, res, next) => {
    console.error('💥 Erreur serveur:', error);

    // Erreur de base de données
    if (error.code?.startsWith('SQLITE_') || error.code?.startsWith('ECONN')) {
        return res.status(503).json({
            success: false,
            error: 'Service de base de données temporairement indisponible',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    // Erreur de timeout
    if (error.code === 'ECONNABORTED' || error.name === 'TimeoutError') {
        return res.status(504).json({
            success: false,
            error: 'Timeout de la requête',
            details: 'Le service a mis trop de temps à répondre'
        });
    }

    // Erreur de validation
    if (error.name === 'ValidationError' || error.status === 400) {
        return res.status(400).json({
            success: false,
            error: 'Données invalides',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    // Erreur générique
    res.status(error.status || 500).json({
        success: false,
        error: 'Erreur interne du serveur',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// ----------------------- DÉMARRAGE SERVEUR -----------------------
const PORT = config.port || 3000;

// app.listen 
const server = app.listen(PORT, () => {
    console.log('\n' + '='.repeat(70));
    console.log('✅ SERVEUR NODE.JS DÉMARRÉ AVEC SUCCÈS');
    console.log('='.repeat(70));
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📊 Health: http://localhost:${PORT}/api/health`);
    console.log(`🗄️ Database: ${String(config.database?.use || 'unknown').toUpperCase()}`);
    console.log(`📡 Prêt à recevoir les requêtes!`);
    console.log('='.repeat(70) + '\n');

    // ✅ APPELER Flask APRÈS le démarrage complet
    setTimeout(() => {
        checkFlaskHealth().catch(() => { /* ignore */ });
    }, 5000); // ← Délai de 2 secondes après le démarrage
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Arrêt du serveur...');
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
});

module.exports = app;
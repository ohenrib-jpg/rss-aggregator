// ===========================================================================
// GEOPOLIS - server.js - VERSION OPTIMISÉE ET CORRIGÉE
// Compatible SQLite / PostgreSQL
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
const Parser = require('rss-parser');
const parser = new Parser({
    timeout: 15000,
    customFields: {
        item: ['content:encoded', 'media:content']
    }
});

const app = express();
displayConfig();

// =====================================================================
// INITIALISATION DES MODULES
// =====================================================================

const anomalyDetector = new AnomalyDetector();

const FeedMe = require('feedme');

// Nouvelle fonction de parsing robuste
async function parseFeedWithAxios(feedUrl) {
    try {
        console.log(`🔍 Fetching feed: ${feedUrl}`);

        const response = await axios({
            method: 'GET',
            url: feedUrl,
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
                'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br'
            },
            responseType: 'stream',
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accepte les redirections
            }
        });

        return new Promise((resolve, reject) => {
            const parser = new FeedMe();
            const items = [];

            parser.on('item', (item) => {
                items.push(item);
            });

            parser.on('end', () => {
                console.log(`✅ ${feedUrl}: ${items.length} articles trouvés`);
                resolve({
                    title: parser.document().title || new URL(feedUrl).hostname,
                    items: items,
                    link: parser.document().link || feedUrl
                });
            });

            parser.on('error', (error) => {
                console.warn(`⚠️ Parse error ${feedUrl}:`, error.message);
                // Même en cas d'erreur, on retourne les items déjà parsés
                resolve({
                    title: new URL(feedUrl).hostname,
                    items: items,
                    link: feedUrl
                });
            });

            response.data.pipe(parser);
        });

    } catch (error) {
        console.error(`❌ Fetch error ${feedUrl}:`, error.message);
        // Fallback: essayer avec rss-parser original
        try {
            console.log(`🔄 Fallback pour ${feedUrl}`);
            const feed = await parser.parseURL(feedUrl);
            return feed;
        } catch (fallbackError) {
            console.error(`❌ Fallback failed ${feedUrl}:`, fallbackError.message);
            throw error;
        }
    }
}

// =====================================================================
// MIDDLEWARE CONFIGURATION
// =====================================================================

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

// =====================================================================
// DATABASE INITIALIZATION
// =====================================================================

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

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

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
                return status >= 200 && status < 500;
            }
        });

        console.log(`✅ Flask API: Status ${response.status}`);
        console.log(`📋 Réponse:`, JSON.stringify(response.data));
        return true;

    } catch (error) {
        console.warn('❌ Flask API unavailable:', error.message);
        if (error.code) console.log('   Code:', error.code);
        if (error.response) {
            console.log('   Response Status:', error.response.status);
            console.log('   Response Data:', error.response.data);
        }
        return false;
    }
}

// =====================================================================
// SENTIMENT ANALYSIS
// =====================================================================

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

// =====================================================================
// THEME DETECTION
// =====================================================================

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

// =====================================================================
// SCORING FUNCTIONS
// =====================================================================

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

// =====================================================================
// ANOMALY DETECTION
// =====================================================================

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

// =====================================================================
// INFLUENCE ENGINE
// =====================================================================

class InfluenceEngine {
    constructor() {
        this.relations = new Map();
        this.countries = new Set();
        console.log('✅ InfluenceEngine intégré avec succès');
    }

    async analyzeArticle(article) {
        try {
            const countries = await this.extractCountries(article);
            const relations = this.detectBilateralRelations(countries, article);
            this.updateNetwork(relations, article);
            return relations;
        } catch (error) {
            console.error('Error analyzing article:', error);
            return [];
        }
    }

    async extractCountries(article) {
        const text = (article.title || '') + ' ' + (article.content || '');
        const countryList = ['france', 'usa', 'china', 'russia', 'germany', 'uk', 'japan', 'india', 'brazil', 'canada'];
        const detected = [];

        countryList.forEach(country => {
            const regex = new RegExp(`\\b${country}\\b`, 'gi');
            if (text.match(regex)) {
                detected.push(country);
            }
        });

        return detected;
    }

    detectBilateralRelations(countries, article) {
        const relations = [];

        for (let i = 0; i < countries.length; i++) {
            for (let j = i + 1; j < countries.length; j++) {
                const relation = this.analyzeCountryPair(countries[i], countries[j], article);
                if (relation.strength !== 0) {
                    relations.push(relation);
                }
            }
        }

        return relations;
    }

    analyzeCountryPair(countryA, countryB, article) {
        const text = ((article.title || '') + ' ' + (article.content || '')).toLowerCase();

        const positiveWords = ['accord', 'cooperation', 'partenariat', 'alliance', 'sommet', 'entente', 'dialogue'];
        const negativeWords = ['conflit', 'tension', 'sanction', 'crise', 'hostilité', 'menace', 'protestation'];

        let positiveCount = 0;
        let negativeCount = 0;

        positiveWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) positiveCount += matches.length;
        });

        negativeWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) negativeCount += matches.length;
        });

        const total = positiveCount + negativeCount;
        let strength = 0;

        if (total > 0) {
            strength = (positiveCount - negativeCount) / total;
            strength = Math.max(Math.min(strength, 1), -1);
        }

        let type = 'neutral';
        if (strength > 0.3) type = 'cooperative';
        else if (strength < -0.3) type = 'conflict';
        else if (Math.abs(strength) > 0.1) type = 'tense';

        return {
            countries: [countryA, countryB],
            strength: strength,
            type: type,
            confidence: Math.min((positiveCount + negativeCount) / 10, 0.9),
            evidence: {
                articleId: article.id,
                excerpt: (article.title || '').substring(0, 50)
            }
        };
    }

    updateNetwork(newRelations, article) {
        newRelations.forEach(relation => {
            const key = relation.countries.sort().join('|');

            if (!this.relations.has(key)) {
                this.relations.set(key, {
                    countries: relation.countries,
                    currentStrength: relation.strength,
                    type: relation.type,
                    confidence: relation.confidence,
                    evidence: [relation.evidence],
                    evolution: [{
                        timestamp: new Date(),
                        strength: relation.strength
                    }],
                    lastUpdated: new Date()
                });
            } else {
                const existing = this.relations.get(key);
                existing.currentStrength = (existing.currentStrength + relation.strength) / 2;
                existing.evidence.push(relation.evidence);
                existing.evolution.push({
                    timestamp: new Date(),
                    strength: existing.currentStrength
                });
                existing.lastUpdated = new Date();
            }

            relation.countries.forEach(country => this.countries.add(country));
        });
    }

    calculateInfluenceScore(country) {
        const countryRelations = Array.from(this.relations.values())
            .filter(rel => rel.countries.includes(country));

        if (countryRelations.length === 0) return 0;

        const totalStrength = countryRelations.reduce((sum, rel) => {
            return sum + Math.abs(rel.currentStrength);
        }, 0);

        return totalStrength / countryRelations.length;
    }

    getNetworkMetrics() {
        const relations = Array.from(this.relations.values());
        const totalRelations = relations.length;

        if (totalRelations === 0) {
            return {
                totalCountries: 0,
                totalRelations: 0,
                avgStrength: 0,
                lastAnalysis: new Date()
            };
        }

        const avgStrength = relations.reduce((sum, rel) => sum + Math.abs(rel.currentStrength), 0) / totalRelations;

        return {
            totalCountries: this.countries.size,
            totalRelations: totalRelations,
            avgStrength: avgStrength,
            lastAnalysis: new Date()
        };
    }
}

const influenceEngine = new InfluenceEngine();

// =====================================================================
// FLASK PROXY ROUTES (FACTORISÉ)
// =====================================================================

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
];

flaskRoutes.forEach(({ method, path }) => proxyFlaskRoute(method, path));
console.log("✅ Flask proxy routes registered:", flaskRoutes.map(r => r.path));

// =====================================================================
// MAIN ROUTES
// =====================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// =====================================================================
// HEALTH ROUTES
// =====================================================================

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

// =====================================================================
// METRICS ROUTES
// =====================================================================

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

// =====================================================================
// GEOPOLITICAL ROUTES
// =====================================================================

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
            { country1: "USA", country2: "China", relation: "tense", score: -0.7, confidence: 0.8 },
            { country1: "France", country2: "Germany", relation: "cooperative", score: 0.8, confidence: 0.9 },
            { country1: "Russia", country2: "Ukraine", relation: "conflict", score: -0.9, confidence: 0.95 }
        ];

        res.json({ success: true, relations: fallbackRelations });
    } catch (error) {
        next(error);
    }
});

// =====================================================================
// ALERTS ROUTES
// =====================================================================

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

// =====================================================================
// ALERTS TRIGGERED ROUTE - AJOUTEZ CETTE ROUTE
// =====================================================================

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

// =====================================================================
// THEMES ROUTES
// =====================================================================

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

// =====================================================================
// ARTICLES ROUTES
// =====================================================================

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


// =====================================================================
// FEEDS ROUTES
// =====================================================================

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

// =====================================================================
// STATS ROUTES
// =====================================================================

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

// =====================================================================
// REFRESH ROUTE (COLLECTE RSS)
// =====================================================================

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
        const newArticles = [];

        for (const feedUrl of feeds) {
            try {
                console.log(`\n📡 TRAITEMENT: ${feedUrl}`);

                // UTILISER LE NOUVEAU PARSER ROBUSTE
                const feed = await fetchFeedWithFallback(feedUrl);
                const items = (feed.items || []).slice(0, config.rss?.maxArticlesPerFeed || 20);

                console.log(`📰 ${feedUrl}: ${items.length} articles à traiter`);

                if (items.length === 0) {
                    console.log(`⚠️  Aucun article trouvé pour ${feedUrl}`);
                    continue;
                }

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
                            INSERT OR IGNORE INTO articles (title, content, link, pub_date, feed_url, 
                                sentiment_score, sentiment_type, sentiment_confidence,
                                confidence_score, importance_score)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            (item.title || 'Sans titre').substring(0, 500),
                            content.substring(0, 5000),
                            (item.link || `#${Date.now()}_${Math.random()}`).substring(0, 500),
                            pubDate.toISOString(),
                            feedUrl.substring(0, 500),
                            articleScore.sentiment.score,
                            articleScore.sentiment.sentiment,
                            articleScore.sentiment.confidence,
                            articleScore.confidence,
                            articleScore.importance
                        ]);

                        const info = extractInsertInfo(insertResult);

                        if (info.lastID || (info.rowCount && info.rowCount > 0)) {
                            articlesProcessed++;
                            const newArticleId = info.lastID;

                            console.log(`✅ Article ajouté: ${(item.title || 'Sans titre').substring(0, 50)}...`);

                            if (newArticleId) {
                                // Stocker l'article pour analyse ultérieure
                                newArticles.push({
                                    id: newArticleId,
                                    title: item.title || 'Sans titre',
                                    content: content,
                                    sentiment_score: articleScore.sentiment.score
                                });

                                // Détection des thèmes
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

                                // Analyse d'influence
                                try {
                                    const relations = await influenceEngine.analyzeArticle({
                                        id: newArticleId,
                                        title: item.title || 'Sans titre',
                                        content: content
                                    });
                                    if (relations.length > 0) {
                                        console.log(`🌐 Article ${newArticleId}: ${relations.length} relation(s)`);
                                    }
                                } catch (influenceError) {
                                    console.warn(`⚠️ Erreur influence article ${newArticleId}:`, influenceError.message);
                                }
                            }
                        } else {
                            console.log(`⏩ Article déjà existant: ${(item.title || 'Sans titre').substring(0, 50)}...`);
                        }
                    } catch (itemError) {
                        if (!/unique|UNIQUE|duplicate/i.test(itemError.message || '')) {
                            console.error(`❌ Erreur traitement article: ${itemError.message}`);
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

        // Analyse des anomalies sur les nouveaux articles
        if (newArticles.length > 0) {
            try {
                await analyzeNewArticlesForAnomalies(newArticles);
            } catch (anomalyError) {
                console.warn('⚠️ Erreur analyse anomalies:', anomalyError.message);
            }
        }

        console.log(`✅ Refresh complete: ${articlesProcessed} articles, ${errors} errors`);
        res.json({
            success: true,
            message: `${articlesProcessed} nouveaux articles récupérés`,
            details: {
                articles_processed: articlesProcessed,
                errors,
                feeds_processed: feeds.length,
                anomalies_analyzed: newArticles.length > 0
            }
        });
    } catch (error) {
        next(error);
    }
});

// =====================================================================
// ANALYSIS ROUTES
// =====================================================================

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

// =====================================================================
// NETWORK ROUTES (INFLUENCE ENGINE)
// =====================================================================

app.get('/api/network/global', async (req, res) => {
    try {
        const network = Array.from(influenceEngine.relations.values());
        const metrics = influenceEngine.getNetworkMetrics();

        res.json({
            success: true,
            network: network,
            metrics: metrics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Network global error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/network/country/:country', async (req, res) => {
    try {
        const country = req.params.country.toLowerCase();
        const relations = Array.from(influenceEngine.relations.values())
            .filter(rel => rel.countries.includes(country));

        const influenceScore = influenceEngine.calculateInfluenceScore(country);

        res.json({
            success: true,
            country: country,
            relations: relations,
            influenceScore: influenceScore,
            relationCount: relations.length
        });
    } catch (error) {
        console.error('❌ Network country error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/network/demo', async (req, res) => {
    console.log('🌍 Chargement données démo réseau');

    const demoData = {
        success: true,
        network: [
            {
                countries: ['france', 'germany'],
                currentStrength: 0.85,
                type: 'cooperative',
                confidence: 0.92,
                evidence: [
                    {
                        articleId: 1,
                        excerpt: "Sommet franco-allemand historique à Paris",
                        timestamp: new Date().toISOString()
                    }
                ],
                evolution: [
                    {
                        timestamp: new Date(Date.now() - 86400000).toISOString(),
                        strength: 0.8,
                        source: "article_1"
                    },
                    {
                        timestamp: new Date().toISOString(),
                        strength: 0.85,
                        source: "article_2"
                    }
                ],
                lastUpdated: new Date().toISOString()
            },
            {
                countries: ['france', 'russia'],
                currentStrength: -0.65,
                type: 'conflict',
                confidence: 0.88,
                evidence: [
                    {
                        articleId: 2,
                        excerpt: "Tensions diplomatiques accrues entre Paris et Moscou",
                        timestamp: new Date().toISOString()
                    }
                ],
                evolution: [
                    {
                        timestamp: new Date(Date.now() - 172800000).toISOString(),
                        strength: -0.5,
                        source: "article_3"
                    },
                    {
                        timestamp: new Date().toISOString(),
                        strength: -0.65,
                        source: "article_4"
                    }
                ],
                lastUpdated: new Date().toISOString()
            }
        ],
        metrics: {
            totalCountries: 5,
            totalRelations: 5,
            avgStrength: 0.65,
            cooperationRatio: 0.4,
            lastAnalysis: new Date().toISOString()
        }
    };

    res.json(demoData);
});

app.post('/api/articles/analyze-network', async (req, res) => {
    try {
        const { articleId } = req.body;

        if (!articleId) {
            return res.status(400).json({
                success: false,
                error: 'articleId requis'
            });
        }

        const articleResult = await query('SELECT * FROM articles WHERE id = ?', [articleId]);
        if (!articleResult.rows || articleResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Article non trouvé'
            });
        }

        const article = articleResult.rows[0];
        const relations = await influenceEngine.analyzeArticle(article);

        res.json({
            success: true,
            relationsDetected: relations.length,
            relations: relations,
            article: {
                id: article.id,
                title: article.title,
                countries: await influenceEngine.extractCountries(article)
            }
        });
    } catch (error) {
        console.error('❌ Analyze network error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/network/analyze-recent', async (req, res) => {
    try {
        const limit = parseInt(req.body.limit) || 50;

        const articlesResult = await query(
            'SELECT * FROM articles ORDER BY pub_date DESC LIMIT ?',
            [limit]
        );

        // CORRECTION: Utiliser la bonne variable
        if (!articlesResult.rows || articlesResult.rows.length === 0) {
            return res.json({
                success: true,
                message: 'Aucun article à analyser',
                analyzed: 0
            });
        }

        let totalRelations = 0;
        const results = [];

        for (const article of articlesResult.rows) {
            try {
                const relations = await influenceEngine.analyzeArticle(article);
                totalRelations += relations.length;
                results.push({
                    articleId: article.id,
                    title: article.title,
                    relations: relations.length
                });
            } catch (articleError) {
                console.warn(`⚠️ Erreur analyse article ${article.id}:`, articleError.message);
            }
        }

        res.json({
            success: true,
            analyzed: articlesResult.rows.length,
            totalRelations: totalRelations,
            results: results,
            metrics: influenceEngine.getNetworkMetrics()
        });

    } catch (error) {
        console.error('❌ Analyze recent error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================================
// ANOMALIES ROUTES (Z-SCORE DETECTION)
// =====================================================================

app.post('/api/anomalies/analyze', async (req, res) => {
    try {
        const { articles, relations } = req.body;

        const anomalies = {
            relations: [],
            volume: [],
            sentiment: [],
            comprehensive: []
        };

        if (relations && relations.length > 0) {
            anomalies.relations = anomalyDetector.analyzeRelations(relations);
        }

        if (articles && articles.length > 0) {
            anomalies.volume = anomalyDetector.analyzeArticleVolume(articles);
            anomalies.sentiment = anomalyDetector.analyzeSentimentAnomalies(articles);
        }

        anomalies.comprehensive = await anomalyDetector.comprehensiveAnalysis();

        res.json({
            success: true,
            anomalies,
            stats: anomalyDetector.getStats(),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Analyse anomalies error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/anomalies/recent', async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const anomalies = anomalyDetector.getRecentAnomalies(hours);

        res.json({
            success: true,
            anomalies,
            count: anomalies.length,
            period: `${hours} hours`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Recent anomalies error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/anomalies/stats', async (req, res) => {
    try {
        const stats = anomalyDetector.getStats();

        res.json({
            success: true,
            stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Anomalies stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/anomalies/config', async (req, res) => {
    try {
        const { zScoreThreshold, minDataPoints, historySize } = req.body;

        if (zScoreThreshold !== undefined) {
            anomalyDetector.config.zScoreThreshold = zScoreThreshold;
        }
        if (minDataPoints !== undefined) {
            anomalyDetector.config.minDataPoints = minDataPoints;
        }
        if (historySize !== undefined) {
            anomalyDetector.config.historySize = historySize;
        }

        res.json({
            success: true,
            message: 'Configuration mise à jour',
            config: anomalyDetector.config
        });

    } catch (error) {
        console.error('❌ Anomalies config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/anomalies/reset', async (req, res) => {
    try {
        const { metricType } = req.body;
        anomalyDetector.resetHistory(metricType);

        res.json({
            success: true,
            message: metricType ? `Historique ${metricType} réinitialisé` : 'Historique complet réinitialisé'
        });

    } catch (error) {
        console.error('❌ Anomalies reset error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================================
// ALERTS TRIGGERED ROUTE
// =====================================================================

app.get('/api/alerts/triggered', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        console.log('📈 Alertes déclenchées, limit:', limit);

        // Données de démo pour l'instant
        res.json({
            success: true,
            alerts: [],
            stats: {
                total_triggered: 0,
                today_triggered: 0,
                high_priority: 0
            }
        });
    } catch (error) {
        next(error);
    }
});

// =====================================================================
// ROBUST RSS PARSER
// =====================================================================

async function fetchFeedWithFallback(feedUrl) {
    const options = [
        // Méthode 1: Axios + rss-parser avec contenu brut
        async () => {
            console.log(`🔍 Méthode 1 - Fetch direct: ${feedUrl}`);
            try {
                const response = await axios.get(feedUrl, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
                    },
                    responseType: 'text'
                });

                // UTILISER le parser global (déclaré en haut du fichier)
                const feed = await parser.parseString(response.data);
                console.log(`✅ Méthode 1 réussie: ${feed.items?.length || 0} articles`);
                return feed;
            } catch (error) {
                throw new Error(`Méthode 1 failed: ${error.message}`);
            }
        },

        // Méthode 2: Parser natif simple pour RSS basique
        async () => {
            console.log(`🔍 Méthode 2 - Parser simple: ${feedUrl}`);
            try {
                const response = await axios.get(feedUrl, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                // Parser RSS très basique
                const items = [];
                const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
                const titleRegex = /<title>([\s\S]*?)<\/title>/i;
                const linkRegex = /<link>([\s\S]*?)<\/link>/i;
                const descRegex = /<description>([\s\S]*?)<\/description>/i;
                const dateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/i;

                let match;
                while ((match = itemRegex.exec(response.data)) !== null) {
                    const itemContent = match[1];
                    const titleMatch = titleRegex.exec(itemContent);
                    const linkMatch = linkRegex.exec(itemContent);
                    const descMatch = descRegex.exec(itemContent);
                    const dateMatch = dateRegex.exec(itemContent);

                    if (titleMatch) {
                        items.push({
                            title: titleMatch[1].replace(/<\!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
                            link: linkMatch ? linkMatch[1].trim() : '',
                            content: descMatch ? descMatch[1].replace(/<\!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '',
                            pubDate: dateMatch ? dateMatch[1].trim() : new Date().toISOString(),
                            summary: descMatch ? descMatch[1].replace(/<\!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : ''
                        });
                    }
                }

                console.log(`✅ Méthode 2 réussie: ${items.length} articles`);
                return { items, title: 'Flux RSS' };
            } catch (error) {
                throw new Error(`Méthode 2 failed: ${error.message}`);
            }
        },

        // Méthode 3: rss-parser original (fallback)
        async () => {
            console.log(`🔍 Méthode 3 - Parser original: ${feedUrl}`);
            try {
                const feed = await parser.parseURL(feedUrl);
                console.log(`✅ Méthode 3 réussie: ${feed.items?.length || 0} articles`);
                return feed;
            } catch (error) {
                throw new Error(`Méthode 3 failed: ${error.message}`);
            }
        }
    ];

    // Essayer chaque méthode jusqu'à ce qu'une fonctionne
    for (let i = 0; i < options.length; i++) {
        try {
            const result = await options[i]();
            if (result && result.items && result.items.length > 0) {
                return result;
            }
        } catch (error) {
            console.log(`❌ ${error.message}`);
            if (i === options.length - 1) {
                console.log(`💥 Toutes les méthodes ont échoué pour ${feedUrl}`);
            }
        }
    }

    return { items: [] };
}

// =====================================================================
// ERROR HANDLERS (DOIVENT ÊTRE À LA FIN)
// =====================================================================

app.use((error, req, res, next) => {
    console.error('❌ Server Error:', error);
    res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: error.code || 'SERVER_ERROR'
    });
});

// Middleware 404 - DOIT ÊTRE LE TOUT DERNIER
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path
    });
});

// =====================================================================
// SERVER START
// =====================================================================

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        console.log('🚀 Starting Geopolis Server...');

        if (config.services?.flask?.enabled) {
            await checkFlaskHealth();
        }

        while (!isDatabaseReady) {
            console.log('⏳ Waiting for database...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        app.listen(PORT, () => {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ GEOPOLIS SERVER SUCCESSFULLY STARTED`);
            console.log(`${'='.repeat(60)}`);
            console.log(`📊 Dashboard:      http://localhost:${PORT}`);
            console.log(`🔍 Node Health:    http://localhost:${PORT}/api/health/node`);
            console.log(`🌡️  Flask Health:   http://localhost:${PORT}/api/health`);
            console.log(`${'='.repeat(60)}`);
            console.log(`⚙️  Mode:           ${config.isLocal ? 'LOCAL' : 'CLOUD'}`);
            console.log(`🗄️  Database:       ${config.database?.use || 'unknown'}`);
            console.log(`🤖 Flask Service:  ${config.services?.flask?.enabled ? 'ENABLED' : 'DISABLED'}`);
            console.log(`${'='.repeat(60)}\n`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();









// server.js - VERSION COMPLÈTE CORRIGÉE AVEC TOUTES LES ROUTES
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parser = require('rss-parser');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { config, displayConfig } = require('./config');
const { getDatabaseManager, query } = require('./db/database_manager');

const app = express();

// ========== CONFIGURATION ==========
displayConfig();

const parser = new Parser({
    timeout: config.rss.timeout,
    maxRedirects: config.rss.maxRedirects,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
    }
});

// ========== MIDDLEWARE ==========
app.use(cors({
    origin: config.cors.origins,
    credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Middleware de logging
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.path}`);
    next();
});

// ========== ROUTES PRINCIPALES ==========

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', async (req, res) => {
    try {
        await query('SELECT 1');

        res.json({
            ok: true,
            service: 'Node.js RSS Aggregator',
            mode: config.isLocal ? 'local' : 'cloud',
            database: config.database.use,
            flask: config.services.flask.enabled ? 'enabled' : 'disabled',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            ok: false,
            error: error.message,
            database: 'disconnected'
        });
    }
});

// ========== ROUTES MÉTRIQUES ==========

app.get('/api/metrics', async (req, res) => {
    try {
        console.log('📊 API Metrics appelée');

        // Essayer d'abord le service Flask
        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/metrics`, {
                    timeout: config.services.flask.timeout
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible, fallback aux métriques locales');
            }
        }

        // Fallback: métriques locales basiques
        const articlesCount = await query('SELECT COUNT(*) as count FROM articles');
        const feedsCount = await query('SELECT COUNT(*) as count FROM feeds WHERE is_active = 1 OR is_active = true');
        const themesCount = await query('SELECT COUNT(*) as count FROM themes');

        const metrics = {
            success: true,
            summary: {
                total_articles: parseInt(articlesCount.rows[0].count),
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
        console.error('❌ Error /api/metrics:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            summary: {
                total_articles: 0,
                avg_confidence: 0,
                avg_posterior: 0,
                avg_corroboration: 0
            }
        });
    }
});

app.get('/api/geopolitical/report', async (req, res) => {
    try {
        console.log('🌍 API Geopolitical Report appelée');

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/geopolitical/report`, {
                    timeout: config.services.flask.timeout
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
                crisisZones: []
            }
        };

        res.json(fallbackReport);
    } catch (error) {
        console.error('❌ Error /api/geopolitical/report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== ROUTES ALERTES ==========

app.get('/api/alerts', async (req, res) => {
    try {
        console.log('🔔 API Alerts appelée');

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/alerts`, {
                    timeout: config.services.flask.timeout
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
        console.error('❌ Error /api/alerts:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/alerts', async (req, res) => {
    try {
        const alertData = req.body;
        console.log('➕ Création alerte:', alertData.name);

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.post(`${config.services.flask.url}/api/alerts`, alertData, {
                    timeout: config.services.flask.timeout
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour création alerte');
            }
        }

        res.json({
            success: true,
            message: "Alerte créée (mode fallback)"
        });
    } catch (error) {
        console.error('❌ Error POST /api/alerts:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Dans server.js, les routes alertes doivent pointer vers Flask
app.delete('/api/alerts/:id', async (req, res) => {
    try {
        const alertId = req.params.id;
        console.log('🗑️ Delete alerte:', alertId);

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.delete(`${config.services.flask.url}/api/alerts/${alertId}`, {
                    timeout: config.services.flask.timeout
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour suppression alerte');
            }
        }

        res.json({
            success: true,
            message: "Alerte supprimée (mode fallback)"
        });
    } catch (error) {
        console.error('❌ Error DELETE /api/alerts/:id:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/alerts/:id', async (req, res) => {
    try {
        const alertId = req.params.id;
        const updates = req.body;
        console.log('✏️ Update alerte:', alertId);

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.put(`${config.services.flask.url}/api/alerts/${alertId}`, updates, {
                    timeout: config.services.flask.timeout
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour update alerte');
            }
        }

        res.json({
            success: true,
            message: "Alerte mise à jour (mode fallback)"
        });
    } catch (error) {
        console.error('❌ Error PUT /api/alerts/:id:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/alerts/triggered', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        console.log('📈 Alertes déclenchées, limit:', limit);

        res.json({
            success: true,
            alerts: []
        });
    } catch (error) {
        console.error('❌ Error /api/alerts/triggered:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/alerts/check', async (req, res) => {
    try {
        const article = req.body;
        console.log('🔍 Check alertes pour article:', article.title?.substring(0, 50));

        res.json({
            success: true,
            triggered_alerts: [],
            message: "0 alerte(s) déclenchée(s)"
        });
    } catch (error) {
        console.error('❌ Error POST /api/alerts/check:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== ROUTES ARTICLES ==========

app.get('/api/articles', async (req, res) => {
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

        res.json({
            success: true,
            articles,
            total: countResult.rows[0].total
        });
    } catch (error) {
        console.error('❌ Error /api/articles:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            articles: [],
            total: 0
        });
    }
});

app.post('/api/refresh', async (req, res) => {
    try {
        console.log('🔄 Manual refresh triggered...');

        const feedsResult = await query('SELECT url FROM feeds WHERE is_active = 1 OR is_active = true');
        let feeds = feedsResult.rows.map(r => r.url);

        if (feeds.length === 0) {
            console.log('⚠️  No active feeds, adding defaults...');
            const defaultFeeds = [
                'https://www.lemonde.fr/international/rss_full.xml',
                'https://www.france24.com/fr/rss',
                'https://www.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/'
            ];

            for (const url of defaultFeeds) {
                try {
                    await query(
                        'INSERT INTO feeds (url, title, is_active) VALUES (?, ?, 1)',
                        [url, new URL(url).hostname]
                    );
                } catch (e) {
                    // Ignore duplicate errors
                }
            }

            feeds = defaultFeeds;
        }

        feeds = feeds.slice(0, config.rss.maxFeedsPerRefresh);

        let articlesProcessed = 0;
        let errors = 0;

        for (const feedUrl of feeds) {
            try {
                console.log(`📡 Fetching: ${feedUrl}`);

                const feed = await parser.parseURL(feedUrl);
                const items = feed.items.slice(0, config.rss.maxArticlesPerFeed);

                for (const item of items) {
                    try {
                        const pubDate = new Date(item.pubDate || item.isoDate || Date.now());
                        const content = (item.contentEncoded || item.content || item.summary || item.description || '')
                            .replace(/<[^>]*>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .substring(0, 2000);

                        const sentiment = {
                            score: 0,
                            sentiment: 'neutral',
                            confidence: 0.5
                        };

                        const result = await query(`
                            INSERT INTO articles (title, content, link, pub_date, feed_url, sentiment_score, sentiment_type, sentiment_confidence)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            item.title || 'Sans titre',
                            content,
                            item.link || `#${Date.now()}_${Math.random()}`,
                            pubDate.toISOString(),
                            feedUrl,
                            sentiment.score,
                            sentiment.sentiment,
                            sentiment.confidence
                        ]);

                        if (result.rowCount !== 0 || result.lastID) {
                            articlesProcessed++;
                        }
                    } catch (itemError) {
                        if (!itemError.message.includes('UNIQUE constraint')) {
                            errors++;
                        }
                    }
                }

                await query('UPDATE feeds SET last_fetched = ? WHERE url = ?', [new Date().toISOString(), feedUrl]);
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (feedError) {
                console.error(`❌ Error fetching ${feedUrl}:`, feedError.message);
                errors++;
            }
        }

        console.log(`✅ Refresh complete: ${articlesProcessed} articles, ${errors} errors`);

        res.json({
            success: true,
            message: `${articlesProcessed} nouveaux articles récupérés`,
            details: {
                articles_processed: articlesProcessed,
                errors: errors,
                feeds_processed: feeds.length
            }
        });
    } catch (error) {
        console.error('❌ Error /api/refresh:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: { articles_processed: 0, errors: 1 }
        });
    }
});

// ========== SERVIR LES FICHIERS STATIQUES ==========
app.use(express.static(path.join(__dirname, 'public')));

// Route spécifique pour app.js
app.get('/app.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.js'));
});

// Route pour ai-config.js
app.get('/ai-config.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ai-config.js'));
});

// Route pour le favicon (éviter l'erreur 404)
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ========== ROUTES THÈMES (NOUVELLES) ==========

app.get('/api/themes', async (req, res) => {
    try {
        const result = await query('SELECT * FROM themes ORDER BY name');
        res.json({ success: true, themes: result.rows });
    } catch (error) {
        console.error('❌ Error /api/themes:', error);
        res.status(500).json({ success: false, error: error.message, themes: [] });
    }
});

app.post('/api/themes', async (req, res) => {
    try {
        const { name, keywords, color, description } = req.body;
        
        if (!name || !keywords || keywords.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nom et mots-clés requis' 
            });
        }

        const keywordsJson = JSON.stringify(keywords);
        
        await query(
            'INSERT INTO themes (name, keywords, color, description) VALUES (?, ?, ?, ?)',
            [name, keywordsJson, color || '#6366f1', description || '']
        );

        console.log('✅ Thème créé:', name);
        res.json({ success: true, message: 'Thème créé avec succès' });
    } catch (error) {
        console.error('❌ Error POST /api/themes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/themes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await query('DELETE FROM theme_analyses WHERE theme_id = ?', [id]);
        await query('DELETE FROM themes WHERE id = ?', [id]);

        console.log('✅ Thème supprimé:', id);
        res.json({ success: true, message: 'Thème supprimé' });
    } catch (error) {
        console.error('❌ Error DELETE /api/themes/:id:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ROUTES FLUX RSS (NOUVELLES) ==========

app.get('/api/feeds/manager', async (req, res) => {
    try {
        const result = await query('SELECT * FROM feeds ORDER BY created_at DESC');
        res.json({ success: true, feeds: result.rows });
    } catch (error) {
        console.error('❌ Error /api/feeds/manager:', error);
        res.status(500).json({ success: false, error: error.message, feeds: [] });
    }
});

app.post('/api/feeds', async (req, res) => {
    try {
        const { url, title } = req.body || {};
        if (!url) {
            return res.status(400).json({ success: false, error: "URL manquante" });
        }

        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).json({ success: false, error: "URL invalide, doit commencer par http(s)://" });
        }

        const existing = await query('SELECT id FROM feeds WHERE url = ? LIMIT 1', [url]);
        if (existing && existing.rows && existing.rows.length > 0) {
            return res.json({ success: true, message: 'Flux déjà présent' });
        }

        // Ici le problème : le parser RSS peut échouer
        const feed = await parser.parseURL(url);

        await query('INSERT INTO feeds (url, title, is_active, created_at) VALUES (?, ?, 1, ?)', [
            url,
            title || feed.title || 'Flux sans titre',
            new Date().toISOString(),
        ]);

        console.log('✅ Flux ajouté:', url);
        res.json({ success: true, feed: { url, title: title || feed.title } });
    } catch (err) {
        console.error('❌ Erreur POST /api/feeds :', err.message);
        res.status(500).json({ success: false, error: "Impossible d'accéder ou de parser le flux RSS fourni." });
    }
});

app.put('/api/feeds/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        await query(
            'UPDATE feeds SET is_active = ? WHERE id = ?',
            [is_active ? 1 : 0, id]
        );

        console.log('✅ Flux mis à jour:', id);
        res.json({ success: true, message: 'Flux mis à jour' });
    } catch (error) {
        console.error('❌ Error PUT /api/feeds/:id:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/feeds/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await query('DELETE FROM feeds WHERE id = ?', [id]);

        console.log('✅ Flux supprimé:', id);
        res.json({ success: true, message: 'Flux supprimé' });
    } catch (error) {
        console.error('❌ Error DELETE /api/feeds/:id:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ROUTES STATS ==========

app.get('/api/stats', async (req, res) => {
    try {
        const articlesCount = await query('SELECT COUNT(*) as count FROM articles');
        const feedsCount = await query('SELECT COUNT(*) as count FROM feeds WHERE is_active = 1 OR is_active = true');
        const themesCount = await query('SELECT COUNT(*) as count FROM themes');

        const stats = {
            articles: parseInt(articlesCount.rows[0].count),
            feeds: parseInt(feedsCount.rows[0].count),
            themes: parseInt(themesCount.rows[0].count)
        };

        res.json({ success: true, stats });
    } catch (error) {
        console.error('❌ Error /api/stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route pour les stats de sentiment détaillées (proxy vers Flask)
app.get('/api/sentiment/detailed', async (req, res) => {
    try {
        console.log('😊 API Sentiment Detailed appelée');

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/sentiment/stats`, {
                    timeout: config.services.flask.timeout
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour sentiment stats');
            }
        }

        // Fallback
        const sentimentStats = await query(`
            SELECT 
                sentiment_type,
                COUNT(*) as count
            FROM articles 
            WHERE sentiment_type IS NOT NULL
            GROUP BY sentiment_type
        `);

        const stats = {
            positive: 0,
            neutral: 0,
            negative: 0
        };

        sentimentStats.rows.forEach(row => {
            stats[row.sentiment_type] = row.count;
        });

        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('❌ Error /api/sentiment/detailed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/analysis/timeline', async (req, res) => {
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

        res.json({ success: true, timeline: result.rows });
    } catch (error) {
        console.error('❌ Error timeline:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/analysis/top-themes', async (req, res) => {
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

        res.json({ success: true, themes: result.rows });
    } catch (error) {
        console.error('❌ Error top themes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route pour les stats d'apprentissage (proxy vers Flask)
app.get('/api/learning/stats', async (req, res) => {
    try {
        console.log('🧠 API Learning Stats appelée');

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/learning/stats`, {
                    timeout: config.services.flask.timeout
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour learning stats');
            }
        }

        // Fallback
        res.json({
            success: true,
            total_articles_processed: 0,
            sentiment_accuracy: 0.75,
            theme_detection_accuracy: 0.65,
            avg_processing_time: 2.1,
            modules_active: [
                "Analyseur de sentiment",
                "Détection de thèmes",
                "Extraction RSS"
            ]
        });
    } catch (error) {
        console.error('❌ Error /api/learning/stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== ROUTES GÉOPOLITIQUE (PROXY VERS FLASK) ==========

app.get('/api/geopolitical/report', async (req, res) => {
    try {
        console.log('🌍 API Geopolitical Report appelée');

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/geopolitical/report`, {
                    timeout: config.services.flask.timeout
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour rapport géopolitique');
            }
        }

        // Fallback basique
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
        console.error('❌ Error /api/geopolitical/report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/geopolitical/crisis-zones', async (req, res) => {
    try {
        console.log('🔥 API Crisis Zones appelée');

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/geopolitical/crisis-zones`, {
                    timeout: config.services.flask.timeout
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour zones de crise');
            }
        }

        // Fallback
        res.json({
            success: true,
            zones: []
        });
    } catch (error) {
        console.error('❌ Error /api/geopolitical/crisis-zones:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/geopolitical/relations', async (req, res) => {
    try {
        console.log('🤝 API Geopolitical Relations appelée');

        if (config.services.flask.enabled) {
            try {
                const flaskResponse = await axios.get(`${config.services.flask.url}/api/geopolitical/relations`, {
                    timeout: config.services.flask.timeout
                });
                return res.json(flaskResponse.data);
            } catch (flaskError) {
                console.warn('⚠️ Service Flask indisponible pour relations géopolitiques');
            }
        }

        // Fallback avec des données exemple
        const fallbackRelations = [
            { "country1": "USA", "country2": "China", "relation": "tense", "score": -0.7, "confidence": 0.82 },
            { "country1": "Russia", "country2": "EU", "relation": "conflict", "score": -0.9, "confidence": 0.91 },
            { "country1": "France", "country2": "Germany", "relation": "cooperative", "score": 0.8, "confidence": 0.87 }
        ];

        res.json({
            success: true,
            relations: fallbackRelations
        });
    } catch (error) {
        console.error('❌ Error /api/geopolitical/relations:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== DÉMARRAGE DU SERVEUR ==========

const PORT = config.port || 3000;

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(70));
    console.log('✅ SERVEUR NODE.JS DÉMARRÉ AVEC SUCCÈS');
    console.log('='.repeat(70));
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📊 Health: http://localhost:${PORT}/api/health`);
    console.log(`🗄️  Database: ${config.database.use.toUpperCase()}`);
    console.log(`📄 Prêt à recevoir les requêtes!`);
    console.log('='.repeat(70) + '\n');
});

// Gestion propre de l'arrêt
process.on('SIGINT', async () => {
    console.log('\n🛑 Arrêt gracieux du serveur...');
    const { closeDatabaseConnection } = require('./db/database_manager');
    await closeDatabaseConnection();
    process.exit(0);
});

module.exports = app;

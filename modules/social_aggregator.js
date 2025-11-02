// modules/social_aggregator.js
const axios = require('axios');
const cheerio = require('cheerio');
const { JSDOM } = require('jsdom');

// Instances Nitter avec rotation automatique
const NITTER_INSTANCES = [
    'https://nitter.net',
    'https://nitter.it',
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
    'https://nitter.tiekoetter.com'
];

class SocialAggregator {
    constructor() {
        this.sources = new Map();
        this.currentNitterInstance = NITTER_INSTANCES[0];
        this.defaultSources = [
            {
                id: 'nitter_global',
                name: 'Nitter (Global)',
                type: 'nitter',
                url: 'https://nitter.net',
                enabled: true,
                config: {
                    query: 'geopolitics OR diplomacy OR worldnews',
                    lang: 'en',
                    include_rts: false,
                    include_replies: true,
                    type: 'search' // 'search' ou 'comments'
                }
            },
            {
                id: 'reddit_worldnews',
                name: 'Reddit WorldNews',
                type: 'reddit',
                url: 'https://www.reddit.com/r/worldnews',
                enabled: true,
                config: {
                    limit: 50,
                    sort: 'hot'
                }
            },
            {
                id: 'ria_ru',
                name: 'RIA Novosti',
                type: 'ria',
                url: 'https://ria.ru',
                enabled: true,
                config: {
                    sections: ['world', 'politics'],
                    limit: 50
                }
            }
        ];
    }

    // Configuration des sources sociales
    async configureSources(sources) {
        this.sources.clear();
        sources.forEach(source => {
            this.sources.set(source.id, source);
        });
        return Array.from(this.sources.values());
    }

    // Gestion des erreurs avec rotation d'instances
    async withNitterRetry(operation, maxRetries = 3) {
        let attempts = 0;

        while (attempts < maxRetries) {
            try {
                return await operation(this.currentNitterInstance);
            } catch (error) {
                console.warn(`❌ Nitter error (attempt ${attempts + 1}):`, error.message);

                if (error.response?.status === 429 || error.response?.status === 403) {
                    // Rotation d'instance
                    const oldInstance = this.currentNitterInstance;
                    this.currentNitterInstance = this.rotateNitterInstance();
                    console.log(`🔄 Rotating Nitter instance: ${oldInstance} → ${this.currentNitterInstance}`);
                    attempts++;
                    continue;
                }

                throw error;
            }
        }

        throw new Error(`Nitter failed after ${maxRetries} attempts`);
    }

    rotateNitterInstance() {
        const currentIndex = NITTER_INSTANCES.indexOf(this.currentNitterInstance);
        const nextIndex = (currentIndex + 1) % NITTER_INSTANCES.length;
        return NITTER_INSTANCES[nextIndex];
    }

    // Récupération depuis Nitter - VERSION PARAMÉTRABLE
    async fetchFromNitter(source) {
        return this.withNitterRetry(async (baseUrl) => {
            const posts = [];
            const config = source.config || {};

            try {
                // Construction des paramètres de recherche
                const params = {
                    f: config.type === 'comments' ? 'c' : 'tweets',
                    q: config.query || 'geopolitics',
                    ...(config.lang && { lang: config.lang }),
                    ...(config.since && { since: config.since }),
                    ...(config.until && { until: config.until }),
                    ...(config.include_rts !== undefined && { include_rts: config.include_rts }),
                    ...(config.include_replies !== undefined && { include_replies: config.include_replies })
                };

                const url = `${baseUrl}/search`;
                console.log(`🔍 Fetching Nitter: ${url} with params:`, params);

                const response = await axios.get(url, {
                    params,
                    headers: {
                        'User-Agent': 'GEOPOLIS/1.0 (+https://github.com/geopolis)',
                        'Accept': 'application/rss+xml, application/xml, text/xml, application/json, */*'
                    },
                    timeout: 15000,
                    validateStatus: status => status < 500
                });

                if (response.headers['content-type']?.includes('application/json')) {
                    // Format JSON (certaines instances)
                    const data = response.data || {};
                    const items = (Array.isArray(data) ? data : data.items || data.tweets || []).slice(0, config.limit || 50);

                    items.forEach((item, index) => {
                        posts.push({
                            id: item.id || item.id_str || `nitter_${Date.now()}_${index}`,
                            title: item.title || item.text || item.full_text || '',
                            content: item.text || item.full_text || item.description || '',
                            link: item.link || item.url || `${baseUrl}/i/web/status/${item.id}`,
                            pubDate: this.parseNitterDate(item.created_at || item.date),
                            source: source.name,
                            sourceType: 'nitter',
                            author: item.user?.username || item.user?.screen_name || item.username || 'unknown',
                            engagement: this.extractEngagement(item.text || ''),
                            raw: item
                        });
                    });
                } else {
                    // Format RSS/XML
                    const $ = cheerio.load(response.data, { xmlMode: true });

                    $('item').each((i, item) => {
                        if (i >= (config.limit || 50)) return false;

                        const $item = $(item);
                        const title = $item.find('title').text().trim();
                        const description = $item.find('description').text().trim();
                        const link = $item.find('link').text().trim();
                        const pubDate = $item.find('pubDate').text().trim();
                        const author = $item.find('author').text().trim() || 'unknown';

                        if (title && link) {
                            posts.push({
                                id: link,
                                title: title,
                                content: this.cleanTwitterContent(title + ' ' + description),
                                link,
                                pubDate: this.parseNitterDate(pubDate),
                                source: source.name,
                                sourceType: 'nitter',
                                author,
                                engagement: this.extractEngagement(description)
                            });
                        }
                    });
                }

                console.log(`✅ Nitter fetch success: ${posts.length} posts from ${baseUrl}`);
                return posts;

            } catch (error) {
                console.error(`❌ Nitter fetch error:`, error.message);
                throw error;
            }
        });
    }

    // Parseur de dates Nitter
    parseNitterDate(dateText) {
        if (!dateText) return new Date();

        try {
            // Formats: "Tue Dec 10 12:34:56 +0000 2024" ou ISO
            if (dateText.includes('+')) {
                return new Date(dateText);
            }

            // Formats relatifs simplifiés
            if (dateText.includes('minutes ago')) {
                const minutes = parseInt(dateText) || 1;
                return new Date(Date.now() - minutes * 60000);
            }

            if (dateText.includes('hours ago')) {
                const hours = parseInt(dateText) || 1;
                return new Date(Date.now() - hours * 3600000);
            }

            return new Date(dateText);
        } catch (error) {
            return new Date();
        }
    }

    // Récupération depuis Reddit (améliorée)
    async fetchFromReddit(source) {
        try {
            const config = source.config || {};
            const limit = config.limit || 50;
            const sort = config.sort || 'hot';

            const response = await axios.get(`${source.url}/${sort}.json?limit=${limit}`, {
                headers: {
                    'User-Agent': 'GEOPOLIS/1.0 (+https://github.com/geopolis)'
                },
                timeout: 15000
            });

            const posts = response.data.data.children.map(child => {
                const post = child.data;
                return {
                    id: `reddit_${post.id}`,
                    title: post.title,
                    content: post.selftext || post.title,
                    link: `https://www.reddit.com${post.permalink}`,
                    pubDate: new Date(post.created_utc * 1000),
                    source: source.name,
                    sourceType: 'reddit',
                    author: post.author,
                    engagement: {
                        upvotes: post.ups,
                        comments: post.num_comments,
                        ratio: post.upvote_ratio
                    }
                };
            });

            console.log(`✅ Reddit fetch success: ${posts.length} posts`);
            return posts;

        } catch (error) {
            console.error(`❌ Reddit fetch error:`, error.message);
            return [];
        }
    }

    // Récupération depuis RIA.ru (corrigée)
    async fetchFromRIA(source) {
        try {
            const config = source.config || {};
            const sections = config.sections || ['world'];
            const limit = config.limit || 50;
            const posts = [];

            for (const section of sections) {
                const url = section === 'world' ? source.url : `${source.url}/${section}`;

                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; GEOPOLIS/1.0)'
                    },
                    timeout: 15000
                });

                const $ = cheerio.load(response.data);

                // Sélecteurs plus robustes pour RIA
                $('.list-item, .rubric-listing__item, .rubric-list__item').each((i, element) => {
                    if (posts.length >= limit) return false;

                    const $item = $(element);
                    const title = $item.find('.list-item__title, .rubric-listing__title, .rubric-list__title').text().trim() ||
                        $item.find('h2, h3').first().text().trim() ||
                        $item.find('a').first().text().trim();
                    const link = $item.find('a').first().attr('href');
                    const timeText = $item.find('.list-item__date, .rubric-listing__date').text().trim() ||
                        $item.find('time').text().trim() ||
                        $item.find('[datetime]').attr('datetime') || '';

                    if (title && link) {
                        posts.push({
                            id: `ria_${Date.now()}_${posts.length}`,
                            title: title,
                            content: title,
                            link: link.startsWith('http') ? link : `https://ria.ru${link}`,
                            pubDate: this.parseRIADate(timeText),
                            source: source.name,
                            sourceType: 'ria',
                            author: 'RIA Novosti',
                            engagement: {}
                        });
                    }
                });

                if (posts.length >= limit) break;
            }

            console.log(`✅ RIA fetch success: ${posts.length} posts`);
            return posts;

        } catch (error) {
            console.error(`❌ RIA fetch error:`, error.message);
            return [];
        }
    }

    // Nettoyage du contenu Twitter/Nitter
    cleanTwitterContent(content) {
        return content
            .replace(/RT\s+/g, '')
            .replace(/@\w+/g, '')
            .replace(/#\w+/g, '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Extraction des métriques d'engagement
    extractEngagement(description) {
        const likes = (description.match(/❤️|🤍|👍|★/g) || []).length;
        const retweets = (description.match(/🔁|↻|retweet/gi) || []).length;
        const comments = (description.match(/💬|comment/gi) || []).length;

        return {
            likes: likes,
            retweets: retweets,
            comments: comments
        };
    }

    // Parseur de dates RIA (corrigé)
    parseRIADate(dateText) {
        if (!dateText) return new Date();

        const now = new Date();

        // Format ISO ou date complète
        if (dateText.match(/\d{4}-\d{2}-\d{2}/)) {
            return new Date(dateText);
        }

        // Formats relatifs en russe
        if (dateText.includes('минут')) {
            const minutes = parseInt(dateText.match(/\d+/)?.[0]) || 1;
            return new Date(now.getTime() - minutes * 60000);
        }

        if (dateText.includes('час') || dateText.includes('часа')) {
            const hours = parseInt(dateText.match(/\d+/)?.[0]) || 1;
            return new Date(now.getTime() - hours * 3600000);
        }

        if (dateText.includes('дней') || dateText.includes('день')) {
            const days = parseInt(dateText.match(/\d+/)?.[0]) || 1;
            return new Date(now.getTime() - days * 24 * 3600000);
        }

        return now;
    }

    // Récupération depuis toutes les sources
    async fetchAllPosts() {
        const allPosts = [];
        const sources = Array.from(this.sources.values()).filter(s => s.enabled);

        for (const source of sources) {
            console.log(`📡 Fetching from ${source.name} (${source.type})`);

            let posts = [];

            try {
                switch (source.type) {
                    case 'nitter':
                        posts = await this.fetchFromNitter(source);
                        break;
                    case 'reddit':
                        posts = await this.fetchFromReddit(source);
                        break;
                    case 'ria':
                        posts = await this.fetchFromRIA(source);
                        break;
                }

                allPosts.push(...posts);
                console.log(`✅ ${source.name}: ${posts.length} posts`);

            } catch (error) {
                console.error(`❌ Error fetching from ${source.name}:`, error.message);
            }
        }

        console.log(`📊 Total posts collected: ${allPosts.length}`);
        return allPosts.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    }

    // Analyse de sentiment pour les posts sociaux
    async analyzeSocialSentiment(posts) {
        const postsWithSentiment = posts.map(post => {
            const sentiment = this.analyzeSentimentBasic(post.content || '');

            return {
                ...post,
                sentiment: sentiment.score,
                sentimentType: sentiment.sentiment,
                confidence: sentiment.confidence
            };
        });

        return postsWithSentiment;
    }

    // Analyse de sentiment basique (améliorée)
    analyzeSentimentBasic(text) {
        const positiveWords = ['excellent', 'positif', 'succès', 'bien', 'génial', 'amour', 'paix', 'accord', 'coopération', 'victoire', 'progrès'];
        const negativeWords = ['mauvais', 'négatif', 'échec', 'guerre', 'crise', 'mort', 'haine', 'colère', 'conflit', 'tension', 'sanction', 'menace'];

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
        if (score > 0.3) sentiment = 'positive';
        else if (score < -0.3) sentiment = 'negative';

        return {
            score: Math.max(Math.min(score, 1), -1),
            sentiment: sentiment,
            confidence: Math.min(total / 10, 0.8)
        };
    }

    // MÉTHODE POUR LES COMMENTAIRES DE SITES
    // Permet de parser les commentaires via Nitter (type 'comments')
    async fetchCommentsFromSite(siteUrl, searchQuery = '') {
        const commentSource = {
            id: `comments_${Date.now()}`,
            name: `Comments from ${siteUrl}`,
            type: 'nitter',
            url: this.currentNitterInstance,
            enabled: true,
            config: {
                query: `site:${siteUrl} ${searchQuery}`,
                type: 'comments',
                limit: 30,
                include_replies: true
            }
        };

        return this.fetchFromNitter(commentSource);
    }
}

module.exports = SocialAggregator;

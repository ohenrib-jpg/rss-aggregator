-- ===========================================================================
-- SCHEMA SQLITE GEOPOLIS - VERSION COMPLÈTE CORRIGÉE
-- ===========================================================================

-- Table des flux RSS
CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    title TEXT,
    category TEXT DEFAULT 'general',
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    last_fetched DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table des articles (VERSION CORRIGÉE)
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    link TEXT UNIQUE NOT NULL,
    pub_date DATETIME,
    feed_url TEXT,
    sentiment_score REAL DEFAULT 0,
    sentiment_type TEXT DEFAULT 'neutral',
    sentiment_confidence REAL DEFAULT 0,
    confidence_score REAL DEFAULT 0.5,
    importance_score REAL DEFAULT 0.5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feed_url) REFERENCES feeds(url)
);

-- Table des thèmes
CREATE TABLE IF NOT EXISTS themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    keywords TEXT,
    color TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table d'analyse des thèmes par article
CREATE TABLE IF NOT EXISTS theme_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER,
    theme_id TEXT,
    confidence REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE,
    UNIQUE(article_id, theme_id)
);

-- Table des posts sociaux
CREATE TABLE IF NOT EXISTS social_posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    link TEXT,
    pub_date DATETIME,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL,
    author TEXT,
    sentiment_score REAL,
    sentiment_type TEXT,
    confidence REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table des alertes
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    keywords TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    enabled BOOLEAN DEFAULT 1,
    cooldown INTEGER DEFAULT 1800,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table des alertes déclenchées
CREATE TABLE IF NOT EXISTS triggered_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT NOT NULL,
    article_id INTEGER,
    matched_keywords TEXT NOT NULL,
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES articles(id)
);

-- Tables bayésiennes (pour l'analyse avancée)
CREATE TABLE IF NOT EXISTS bayes_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    value REAL DEFAULT 0.5,
    confidence REAL DEFAULT 0.5,
    meta TEXT DEFAULT '{}',
    processed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bayes_priors (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    mu REAL DEFAULT 0.5,
    sigma REAL DEFAULT 0.3,
    alpha REAL,
    beta REAL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (entity_type, entity_id)
);

-- Table des prédictions
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    window_start DATETIME,
    window_end DATETIME,
    horizon INTEGER,
    metrics_json TEXT,
    forecast_json TEXT
);

-- ===========================================================================
-- INDEXES CRITIQUES
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link);
CREATE INDEX IF NOT EXISTS idx_articles_feed_url ON articles(feed_url);
CREATE INDEX IF NOT EXISTS idx_articles_sentiment ON articles(sentiment_type);
CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url);
CREATE INDEX IF NOT EXISTS idx_feeds_active ON feeds(is_active);
CREATE INDEX IF NOT EXISTS idx_theme_analyses_article ON theme_analyses(article_id);
CREATE INDEX IF NOT EXISTS idx_theme_analyses_theme ON theme_analyses(theme_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_date ON social_posts(pub_date);
CREATE INDEX IF NOT EXISTS idx_social_posts_source ON social_posts(source_type);
CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_alert ON triggered_alerts(alert_id);
CREATE INDEX IF NOT EXISTS idx_bayes_evidence_entity ON bayes_evidence(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_bayes_evidence_processed ON bayes_evidence(processed);

-- ===========================================================================
-- DONNÉES PAR DÉFAUT
-- ===========================================================================

-- Thèmes par défaut
INSERT OR IGNORE INTO themes (id, name, keywords, color, description) VALUES 
('geo_conflicts', '⚔️ Conflits Armés', '["guerre", "conflit", "attaque", "militaire", "soldat", "bataille", "terrorisme"]', '#ef4444', 'Conflits armés et tensions militaires'),
('diplomacy', '🤝 Diplomatie', '["diplomatie", "sommet", "traité", "accord", "relations", "ambassade", "négociation"]', '#3b82f6', 'Relations diplomatiques et accords internationaux'),
('economy', '💸 Économie', '["économie", "finance", "marché", "inflation", "croissance", "récession", "commerce"]', '#10b981', 'Actualités économiques et financières'),
('politics', '🏛️ Politique', '["président", "gouvernement", "élection", "politique", "ministre", "parlement"]', '#8b5cf6', 'Actualités politiques nationales et internationales');

-- Alertes par défaut
INSERT OR IGNORE INTO alerts (id, name, keywords, severity, cooldown) VALUES 
('alert_1', 'Crise Ukraine', '["Ukraine", "conflit", "Zelensky", "guerre", "Russie"]', 'high', 1800),
('alert_2', 'Tensions Moyen-Orient', '["Israël", "Palestine", "Gaza", "Hamas", "Jérusalem"]', 'high', 3600),
('alert_3', 'Économie mondiale', '["inflation", "récession", "croissance", "marché", "économie"]', 'medium', 7200);

-- Flux RSS par défaut
INSERT OR IGNORE INTO feeds (url, title, category, is_active) VALUES 
('https://www.lemonde.fr/international/rss_full.xml', 'Le Monde - International', 'news', 1),
('https://www.france24.com/fr/rss', 'France 24', 'news', 1),
('https://www.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/', 'BFMTV', 'news', 1),
('https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World', 'news', 1),
('https://rss.cnn.com/rss/edition.rss', 'CNN International', 'news', 1);
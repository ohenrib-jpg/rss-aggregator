-- ===========================================================================
-- SCHEMA POSTGRESQL GEOPOLIS - VERSION RENDER
-- ===========================================================================

-- Table des flux RSS
CREATE TABLE IF NOT EXISTS feeds (
    id SERIAL PRIMARY KEY,
    url VARCHAR(500) UNIQUE NOT NULL,
    title VARCHAR(300),
    category VARCHAR(100) DEFAULT 'general',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    last_fetched TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table des articles
CREATE TABLE IF NOT EXISTS articles (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    link VARCHAR(500) UNIQUE NOT NULL,
    pub_date TIMESTAMP,
    feed_url VARCHAR(500),
    sentiment_score FLOAT DEFAULT 0,
    sentiment_type VARCHAR(20) DEFAULT 'neutral',
    sentiment_confidence FLOAT DEFAULT 0,
    confidence_score FLOAT DEFAULT 0.5,
    importance_score FLOAT DEFAULT 0.5,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table des thèmes
CREATE TABLE IF NOT EXISTS themes (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    keywords TEXT,
    color VARCHAR(7),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table d'analyse des thèmes
CREATE TABLE IF NOT EXISTS theme_analyses (
    id SERIAL PRIMARY KEY,
    article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
    theme_id VARCHAR(100) REFERENCES themes(id) ON DELETE CASCADE,
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(article_id, theme_id)
);

-- Table des posts sociaux
CREATE TABLE IF NOT EXISTS social_posts (
    id VARCHAR(100) PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    link VARCHAR(500),
    pub_date TIMESTAMP,
    source VARCHAR(100) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    author VARCHAR(200),
    sentiment_score FLOAT,
    sentiment_type VARCHAR(20),
    confidence FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table des alertes
CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    keywords TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium',
    enabled BOOLEAN DEFAULT true,
    cooldown INTEGER DEFAULT 1800,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Table des alertes déclenchées
CREATE TABLE IF NOT EXISTS triggered_alerts (
    id SERIAL PRIMARY KEY,
    alert_id VARCHAR(100) REFERENCES alerts(id) ON DELETE CASCADE,
    article_id INTEGER REFERENCES articles(id),
    matched_keywords TEXT NOT NULL,
    triggered_at TIMESTAMP DEFAULT NOW()
);

-- Tables bayésiennes
CREATE TABLE IF NOT EXISTS bayes_evidence (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    evidence_type VARCHAR(50) NOT NULL,
    value FLOAT DEFAULT 0.5,
    confidence FLOAT DEFAULT 0.5,
    meta TEXT DEFAULT '{}',
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bayes_priors (
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    mu FLOAT DEFAULT 0.5,
    sigma FLOAT DEFAULT 0.3,
    alpha FLOAT,
    beta FLOAT,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (entity_type, entity_id)
);

-- Table des prédictions
CREATE TABLE IF NOT EXISTS predictions (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    window_start TIMESTAMP,
    window_end TIMESTAMP,
    horizon INTEGER,
    metrics_json TEXT,
    forecast_json TEXT
);

-- ===========================================================================
-- INDEXES POSTGRESQL
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_articles_pub_date_desc ON articles(pub_date DESC);
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
-- DONNÉES PAR DÉFAUT POSTGRESQL
-- ===========================================================================

INSERT INTO themes (id, name, keywords, color, description) VALUES 
('geo_conflicts', '⚔️ Conflits Armés', '["guerre", "conflit", "attaque", "militaire", "soldat", "bataille", "terrorisme"]', '#ef4444', 'Conflits armés et tensions militaires')
ON CONFLICT (id) DO NOTHING;

INSERT INTO themes (id, name, keywords, color, description) VALUES 
('diplomacy', '🤝 Diplomatie', '["diplomatie", "sommet", "traité", "accord", "relations", "ambassade", "négociation"]', '#3b82f6', 'Relations diplomatiques et accords internationaux')
ON CONFLICT (id) DO NOTHING;

INSERT INTO themes (id, name, keywords, color, description) VALUES 
('economy', '💸 Économie', '["économie", "finance", "marché", "inflation", "croissance", "récession", "commerce"]', '#10b981', 'Actualités économiques et financières')
ON CONFLICT (id) DO NOTHING;

INSERT INTO alerts (id, name, keywords, severity, cooldown) VALUES 
('alert_1', 'Crise Ukraine', '["Ukraine", "conflit", "Zelensky", "guerre", "Russie"]', 'high', 1800)
ON CONFLICT (id) DO NOTHING;

INSERT INTO alerts (id, name, keywords, severity, cooldown) VALUES 
('alert_2', 'Tensions Moyen-Orient', '["Israël", "Palestine", "Gaza", "Hamas", "Jérusalem"]', 'high', 3600)
ON CONFLICT (id) DO NOTHING;

INSERT INTO feeds (url, title, category, is_active) VALUES 
('https://www.lemonde.fr/international/rss_full.xml', 'Le Monde - International', 'news', true)
ON CONFLICT (url) DO NOTHING;

INSERT INTO feeds (url, title, category, is_active) VALUES 
('https://www.france24.com/fr/rss', 'France 24', 'news', true)
ON CONFLICT (url) DO NOTHING;
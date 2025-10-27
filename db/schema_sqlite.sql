-- ===========================================================================
-- SCHEMA SQLITE GEOPOLIS - VERSION SIMPLIFIÉE
-- ===========================================================================

-- Supprimer les tables existantes (commencez propre)
DROP TABLE IF EXISTS bayes_priors;
DROP TABLE IF EXISTS bayes_evidence;
DROP TABLE IF EXISTS sentiment_lexicon;
DROP TABLE IF EXISTS theme_analyses;
DROP TABLE IF EXISTS themes;
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS feeds;

-- Table des flux RSS
CREATE TABLE feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    title TEXT,
    is_active INTEGER DEFAULT 1,
    last_fetched TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Table des articles
CREATE TABLE articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    link TEXT UNIQUE NOT NULL,
    pub_date TEXT,
    feed_url TEXT,
    sentiment_score REAL DEFAULT 0,
    sentiment_type TEXT DEFAULT 'neutral',
    sentiment_confidence REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    confidence_score REAL DEFAULT 0.5,
    importance_score REAL DEFAULT 0.5,
    FOREIGN KEY (feed_url) REFERENCES feeds(url) ON DELETE SET NULL
);

-- Table des thèmes - CORRIGÉE
CREATE TABLE themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    keywords TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Table d'analyse thèmes-articles
CREATE TABLE theme_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER,
    theme_id INTEGER,
    confidence REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(article_id, theme_id),
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
);

-- Table lexique des sentiments
CREATE TABLE sentiment_lexicon (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT UNIQUE NOT NULL,
    score REAL NOT NULL,
    language TEXT DEFAULT 'fr',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Tables bayésiennes
CREATE TABLE bayes_evidence (
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

CREATE TABLE bayes_priors (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    mu REAL DEFAULT 0.5,
    sigma REAL DEFAULT 0.3,
    alpha REAL,
    beta REAL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (entity_type, entity_id)
);

-- ===========================================================================
-- INDEXES
-- ===========================================================================

CREATE INDEX idx_articles_link ON articles(link);
CREATE INDEX idx_articles_pub_date ON articles(pub_date);
CREATE INDEX idx_articles_feed_url ON articles(feed_url);
CREATE INDEX idx_feeds_url ON feeds(url);
CREATE INDEX idx_theme_analyses_article ON theme_analyses(article_id);
CREATE INDEX idx_theme_analyses_theme ON theme_analyses(theme_id);
CREATE INDEX idx_bayes_evidence_entity ON bayes_evidence(entity_type, entity_id);
CREATE INDEX idx_bayes_evidence_processed ON bayes_evidence(processed);

-- ===========================================================================
-- DONNÉES PAR DÉFAUT
-- ===========================================================================

-- Thèmes par défaut
INSERT INTO themes (name, keywords, color, description) VALUES 
('Politique', '["président", "gouvernement", "élection", "politique", "ministre", "parlement", "vote"]', '#3b82f6', 'Actualités politiques'),
('Économie', '["économie", "inflation", "croissance", "marché", "entreprise", "finance", "investissement"]', '#10b981', 'Actualités économiques'),
('International', '["international", "monde", "europe", "usa", "chine", "relations", "diplomatie", "sommet"]', '#f59e0b', 'Actualités internationales'),
('Conflits', '["guerre", "conflit", "ukraine", "gaza", "paix", "négociation", "crise", "tension"]', '#ef4444', 'Zones de conflits');

-- Flux RSS par défaut
INSERT INTO feeds (url, title, is_active) VALUES 
('https://www.lemonde.fr/international/rss_full.xml', 'lemonde.fr', 1),
('https://www.france24.com/fr/rss', 'france24.com', 1),
('https://www.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/', 'bfmtv.com', 1);
-- db/schema.sql - Structure complète de la base de données

-- Table des flux RSS
CREATE TABLE IF NOT EXISTS feeds (
    id SERIAL PRIMARY KEY,
    url VARCHAR(500) UNIQUE NOT NULL,
    title VARCHAR(300),
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
    feed_url VARCHAR(500) REFERENCES feeds(url) ON DELETE SET NULL,
    sentiment_score FLOAT DEFAULT 0,
    sentiment_type VARCHAR(20) DEFAULT 'neutral',
    sentiment_confidence FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table des thèmes
CREATE TABLE IF NOT EXISTS themes (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    keywords TEXT[],
    color VARCHAR(7) DEFAULT '#6366f1',
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table de relation articles-thèmes
CREATE TABLE IF NOT EXISTS theme_analyses (
    id SERIAL PRIMARY KEY,
    article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
    theme_id VARCHAR(100) REFERENCES themes(id) ON DELETE CASCADE,
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(article_id, theme_id)
);

-- Table du lexique de sentiment
CREATE TABLE IF NOT EXISTS sentiment_lexicon (
    id SERIAL PRIMARY KEY,
    word VARCHAR(100) UNIQUE NOT NULL,
    score FLOAT NOT NULL,
    language VARCHAR(10) DEFAULT 'fr',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index basiques pour les performances
CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link);
CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_feed_url ON articles(feed_url);
CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url);
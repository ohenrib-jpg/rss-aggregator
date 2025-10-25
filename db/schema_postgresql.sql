-- Schéma optimisé pour PostgreSQL
CREATE TABLE IF NOT EXISTS feeds (
    id SERIAL PRIMARY KEY,
    url VARCHAR(500) UNIQUE NOT NULL,
    title VARCHAR(300),
    is_active BOOLEAN DEFAULT true,
    last_fetched TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

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
    created_at TIMESTAMP DEFAULT NOW(),
    confidence_score REAL DEFAULT 0.5,
    importance_score REAL DEFAULT 0.5
);
-- Tables bayésiennes pour PostgreSQL
CREATE TABLE IF NOT EXISTS bayes_evidence (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    evidence_type VARCHAR(100) NOT NULL,
    value FLOAT DEFAULT 0.5,
    confidence FLOAT DEFAULT 0.5,
    meta JSONB DEFAULT '{}',
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bayes_priors (
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    mu FLOAT DEFAULT 0.5,
    sigma FLOAT DEFAULT 0.3,
    alpha FLOAT,
    beta FLOAT,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (entity_type, entity_id)
);
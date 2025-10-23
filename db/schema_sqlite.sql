-- Schéma SQLite optimisé
CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    title TEXT,
    is_active INTEGER DEFAULT 1,
    last_fetched TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    link TEXT UNIQUE NOT NULL,
    pub_date TEXT,
    feed_url TEXT,
    sentiment_score REAL DEFAULT 0,
    sentiment_type TEXT DEFAULT 'neutral',
    sentiment_confidence REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    keywords TEXT,
    color TEXT DEFAULT '#6366f1',
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS theme_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER,
    theme_id TEXT,
    confidence REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(article_id, theme_id),
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sentiment_lexicon (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT UNIQUE NOT NULL,
    score REAL NOT NULL,
    language TEXT DEFAULT 'fr',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Tables bayésiennes SQLite
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
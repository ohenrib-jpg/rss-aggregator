-- 📍 Index pour les recherches par date (CRITIQUE)
CREATE INDEX IF NOT EXISTS idx_articles_pub_date_desc ON articles(pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at);

-- 📍 Index pour les recherches par flux
CREATE INDEX IF NOT EXISTS idx_articles_feed_url ON articles(feed_url);

-- 📍 Index pour l'analyse de sentiment
CREATE INDEX IF NOT EXISTS idx_articles_sentiment_score ON articles(sentiment_score);
CREATE INDEX IF NOT EXISTS idx_articles_sentiment_type ON articles(sentiment_type);

-- 📍 Index pour éviter les doublons
CREATE INDEX IF NOT EXISTS idx_articles_link_unique ON articles(link);

-- 📍 Index pour les thèmes
CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(name);
CREATE INDEX IF NOT EXISTS idx_feeds_url ON feeds(url);
CREATE INDEX IF NOT EXISTS idx_feeds_active ON feeds(is_active) WHERE is_active = true;
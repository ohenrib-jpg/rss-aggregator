-- Tables pour le système bayésien
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

CREATE INDEX IF NOT EXISTS idx_bayes_evidence_entity ON bayes_evidence(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_bayes_evidence_processed ON bayes_evidence(processed);

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

CREATE INDEX IF NOT EXISTS idx_bayes_priors_updated ON bayes_priors(updated_at);
CREATE TABLE IF NOT EXISTS bayes_priors (
  entity_type VARCHAR(50) NOT NULL,
  entity_id   VARCHAR(200) NOT NULL,
  mu          DOUBLE PRECISION,
  sigma       DOUBLE PRECISION,
  alpha       INTEGER,
  beta        INTEGER,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS bayes_evidence (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50),
  entity_id   VARCHAR(200),
  evidence_type VARCHAR(50),
  value       DOUBLE PRECISION,
  confidence  DOUBLE PRECISION,
  meta        JSONB DEFAULT '{}' ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  processed   BOOLEAN DEFAULT FALSE
);
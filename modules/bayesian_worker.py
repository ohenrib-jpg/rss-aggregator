#!/usr/bin/env python3
import os
import psycopg2
import psycopg2.extras
import logging
from collections import defaultdict
from bayesienappre import BayesianLearningSystem

logger = logging.getLogger("bayes_worker")
logging.basicConfig(level=logging.INFO)

DSN = os.getenv("DATABASE_URL")  # ex: postgres://user:pass@host:5432/db
BATCH_LIMIT = int(os.getenv("BAYES_BATCH_LIMIT", "200"))

def run_batch():
    conn = psycopg2.connect(DSN)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Récupérer evidences non traitées en verrouillant les lignes pour éviter duplications
    cur.execute("""
        SELECT id, entity_type, entity_id, evidence_type, value, confidence, meta
        FROM bayes_evidence
        WHERE processed = false
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT %s
    """, (BATCH_LIMIT,))
    rows = cur.fetchall()
    if not rows:
        logger.info("Aucune evidence nouvelle à traiter")
        cur.close()
        conn.close()
        return

    # Grouper par entité
    groups = defaultdict(list)
    ids_to_mark = []
    for r in rows:
        ids_to_mark.append(r['id'])
        key = (r['entity_type'], r['entity_id'])
        groups[key].append({
            'type': r['evidence_type'],
            'value': float(r['value']) if r['value'] is not None else 0.5,
            'confidence': float(r['confidence']) if r['confidence'] is not None else 0.5
        })

    engine = BayesianLearningSystem()

    # Traiter chaque groupe et mettre à jour bayes_priors
    for (etype, eid), evidences in groups.items():
        try:
            out = engine.bayesian_fusion_multiple(evidences)
            posterior = float(out.get('posterior', 0.5))
            confidence = float(out.get('confidence', 0.0))

            # stocker posterior dans mu, sigma approximé depuis confidence
            sigma = max(0.01, 1.0 - confidence)

            # Upsert into bayes_priors
            cur.execute("""
                INSERT INTO bayes_priors(entity_type, entity_id, mu, sigma, alpha, beta, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT(entity_type, entity_id) DO UPDATE
                SET mu = EXCLUDED.mu, sigma = EXCLUDED.sigma, alpha = EXCLUDED.alpha, beta = EXCLUDED.beta, updated_at = EXCLUDED.updated_at
            """, (etype, eid, posterior, sigma, None, None))
        except Exception as e:
            logger.exception("Erreur traitement groupe %s:%s -> %s", etype, eid, e)

    # Marquer evidences traitées
    cur.execute("UPDATE bayes_evidence SET processed = true WHERE id = ANY(%s)", (ids_to_mark,))
    conn.commit()
    cur.close()
    conn.close()
    logger.info("Batch bayésien traité : %d évidences, %d groupes", len(ids_to_mark), len(groups))

if __name__ == "__main__":
    run_batch()
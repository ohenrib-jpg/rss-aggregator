// ./modules/predictor_engine.js
"use strict";

const { query } = require('../db/database_manager');

class PredictorEngine {
    constructor(options = {}) {
        this.windowDays = options.windowDays || 30;    // fenêtrage d’apprentissage
        this.forecastHorizon = options.forecastHorizon || 7; // jours à prédire
        this.minPoints = options.minPoints || 5;       // points min pour faire une prédiction
        this.alpha = options.alpha || 0.3;             // smoothing EMA
        this.lastTraining = null;
        this.logger = options.logger || console;
    }

    // Calcule la moyenne de sentiment par bucket (RSS vs Social)
    // sentiment_score moyen sur la période
    async computeSentimentMeans({ from, to }) {
        const fromISO = new Date(from).toISOString();
        const toISO = new Date(to).toISOString();

        // RSS
        const rssRows = await query(
            `SELECT AVG(CAST(sentiment_score AS REAL)) as avg
             FROM articles
             WHERE pub_date BETWEEN ? AND ? AND sentiment_score IS NOT NULL`,
            [fromISO, toISO]
        );

        // Social (social_posts). Si la table n'existe pas encore, rssRows peut être null/[].
        const socialRows = await query(
            `SELECT AVG(CAST(sentiment_score AS REAL)) as avg
             FROM social_posts
             WHERE pub_date BETWEEN ? AND ? AND sentiment_score IS NOT NULL`,
            [fromISO, toISO]
        );

        const rssMean = rssRows && rssRows.rows && rssRows.rows[0] && rssRows.rows[0].avg != null
            ? Number(rssRows.rows[0].avg) : 0;
        const socialMean = socialRows && socialRows.rows && socialRows.rows[0] && socialRows.rows[0].avg != null
            ? Number(socialRows.rows[0].avg) : 0;

        return { rssMean, socialMean };
    }

    // Calcule la série Z par jour entre [from, to]
    async computeZSeries({ from, to }) {
        const start = new Date(from);
        const end = new Date(to);
        const dayMs = 24 * 60 * 60 * 1000;
        const points = [];

        for (let t = new Date(start); t <= end; t = new Date(t.getTime() + dayMs)) {
            const dayFrom = new Date(t);
            const dayTo = new Date(t.getTime() + dayMs - 1);

            const { rssMean, socialMean } = await this.computeSentimentMeans({
                from: dayFrom,
                to: dayTo
            });

            const z = rssMean - socialMean;
            points.push({
                date: dayFrom.toISOString().slice(0, 10),
                rssMean,
                socialMean,
                z
            });
        }

        return points;
    }

    // Lissage EMA
    static ema(series, alpha = 0.3) {
        if (!series || series.length === 0) return [];
        const smoothed = [];
        let prev = series[0];
        smoothed.push(prev);
        for (let i = 1; i < series.length; i++) {
            const next = alpha * series[i] + (1 - alpha) * prev;
            smoothed.push(next);
            prev = next;
        }
        return smoothed;
    }

    // Détection d'anomalies simples: points au-delà de k * écart-type
    static detectAnomalies(series, k = 2) {
        const values = series.map(p => p.z);
        const mean = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(values.length - 1, 1);
        const std = Math.sqrt(variance);

        return series
            .map(p => ({ ...p, anomaly: Math.abs(p.z - mean) > k * std }))
            .map(p => ({ ...p, zScore: std > 0 ? (p.z - mean) / std : 0, mean, std }));
    }

    // Prédiction naïve: prolonge la tendance (différence des 2 derniers EMA)
    forecast(points, horizon = 7, alpha = 0.3) {
        if (!points || points.length < 2) return [];

        const ema = PredictorEngine.ema(points.map(p => p.z), alpha);
        const last = ema[ema.length - 1];
        const prev = ema[ema.length - 2];
        const trend = last - prev;

        const forecasts = [];
        for (let i = 1; i <= horizon; i++) {
            forecasts.push({
                date: new Date(Date.now() + i * 24 * 3600 * 1000).toISOString().slice(0, 10),
                predictedZ: last + i * trend
            });
        }
        return { lastZ: last, trend, forecasts };
    }

    async ensurePredictionsTable() {
        await query(`
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                window_start DATETIME,
                window_end DATETIME,
                horizon INTEGER,
                points_json TEXT,
                anomalies_json TEXT,
                forecast_json TEXT,
                metrics_json
            )
        `);
    }

    // Point d’entrée principal: calcule, détecte anomalies, prédis et persiste
    async predictZEvolution({ from, to, horizon = this.forecastHorizon }) {
        try {
            await this.ensurePredictionsTable();

            const points = await this.computeZSeries({ from, to });
            const anomalies = PredictorEngine.detectAnomalies(points);

            const { lastZ, trend, forecasts } = this.forecast(points, horizon, this.alpha);

            // Confiance: nombre de points valides + densité temporelle
            const validPoints = points.filter(p => Number.isFinite(p.z));
            const confidence = Math.max(
                0.3,
                Math.min(0.95, validPoints.length / (Math.max(points.length, 1) * 0.8))
            );

            const metrics = {
                lastZ,
                trend,
                pointCount: points.length,
                anomalyCount: anomalies.filter(a => a.anomaly).length,
                confidence
            };

            const insert = await query(
                `INSERT INTO predictions (window_start, window_end, horizon, points_json, anomalies_json, forecast_json, metrics_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    new Date(from).toISOString(),
                    new Date(to).toISOString(),
                    horizon,
                    JSON.stringify(points),
                    JSON.stringify(anomalies),
                    JSON.stringify(forecasts),
                    JSON.stringify(metrics)
                ]
            );

            const info = insert && insert.lastID ? insert.lastID : null;
            this.lastTraining = new Date();

            return {
                id: info,
                window: { from, to },
                horizon,
                points,
                anomalies,
                forecast: forecasts,
                metrics
            };
        } catch (err) {
            this.logger.error('predictZEvolution error:', err);
            throw err;
        }
    }
}

module.exports = PredictorEngine;

// modules/anomaly_detector.js - VERSION COMPLÉTÉE

class AnomalyDetector {
    constructor() {
        this.config = {
            zScoreThreshold: 2.5,
            minDataPoints: 10,
            historySize: 1000
        };

        this.history = {
            volume: [],
            sentiment: [],
            relations: []
        };

        this.anomalies = [];
        console.log('✅ AnomalyDetector initialisé');
    }

    analyzeArticleVolume(articles) {
        try {
            if (!articles || articles.length === 0) return [];

            const hourlyCounts = this.groupArticlesByHour(articles);
            const volumes = Object.values(hourlyCounts);

            if (volumes.length < this.config.minDataPoints) return [];

            const mean = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
            const stdDev = Math.sqrt(
                volumes.reduce((sum, vol) => sum + Math.pow(vol - mean, 2), 0) / volumes.length
            );

            const anomalies = [];

            Object.entries(hourlyCounts).forEach(([hour, count]) => {
                const zScore = stdDev > 0 ? Math.abs((count - mean) / stdDev) : 0;

                if (zScore > this.config.zScoreThreshold) {
                    anomalies.push({
                        type: 'volume_spike',
                        hour: hour,
                        count: count,
                        zScore: zScore,
                        threshold: this.config.zScoreThreshold,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            // Mettre à jour l'historique
            this.history.volume.push({
                timestamp: new Date().toISOString(),
                totalArticles: articles.length,
                anomalies: anomalies.length
            });

            // Garder seulement les derniers éléments
            if (this.history.volume.length > this.config.historySize) {
                this.history.volume = this.history.volume.slice(-this.config.historySize);
            }

            return anomalies;

        } catch (error) {
            console.error('❌ Erreur analyse volume:', error);
            return [];
        }
    }

    analyzeSentimentAnomalies(articles) {
        try {
            if (!articles || articles.length === 0) return [];

            const sentiments = articles
                .map(a => a.sentiment_score || 0)
                .filter(score => score !== null && score !== undefined);

            if (sentiments.length < this.config.minDataPoints) return [];

            const mean = sentiments.reduce((sum, score) => sum + score, 0) / sentiments.length;
            const stdDev = Math.sqrt(
                sentiments.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / sentiments.length
            );

            const anomalies = [];

            articles.forEach(article => {
                const score = article.sentiment_score || 0;
                const zScore = stdDev > 0 ? Math.abs((score - mean) / stdDev) : 0;

                if (zScore > this.config.zScoreThreshold) {
                    anomalies.push({
                        type: 'sentiment_extreme',
                        articleId: article.id,
                        title: article.title?.substring(0, 50) || 'Sans titre',
                        sentiment: score,
                        zScore: zScore,
                        threshold: this.config.zScoreThreshold,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            // Mettre à jour l'historique
            this.history.sentiment.push({
                timestamp: new Date().toISOString(),
                avgSentiment: mean,
                anomalies: anomalies.length
            });

            if (this.history.sentiment.length > this.config.historySize) {
                this.history.sentiment = this.history.sentiment.slice(-this.config.historySize);
            }

            return anomalies;

        } catch (error) {
            console.error('❌ Erreur analyse sentiment:', error);
            return [];
        }
    }

    // MÉTHODES MANQUANTES AJOUTÉES
    analyzeRelations(relations) {
        try {
            if (!relations || relations.length === 0) return [];

            const strengths = relations.map(r => r.strength || 0);
            const mean = strengths.reduce((sum, s) => sum + s, 0) / strengths.length;
            const stdDev = Math.sqrt(
                strengths.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / strengths.length
            );

            const anomalies = [];

            relations.forEach(relation => {
                const strength = relation.strength || 0;
                const zScore = stdDev > 0 ? Math.abs((strength - mean) / stdDev) : 0;

                if (zScore > this.config.zScoreThreshold) {
                    anomalies.push({
                        type: 'relation_extreme',
                        countries: relation.countries,
                        strength: strength,
                        zScore: zScore,
                        threshold: this.config.zScoreThreshold,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            // Mettre à jour l'historique
            this.history.relations.push({
                timestamp: new Date().toISOString(),
                avgStrength: mean,
                anomalies: anomalies.length
            });

            if (this.history.relations.length > this.config.historySize) {
                this.history.relations = this.history.relations.slice(-this.config.historySize);
            }

            return anomalies;

        } catch (error) {
            console.error('❌ Erreur analyse relations:', error);
            return [];
        }
    }

    async comprehensiveAnalysis() {
        try {
            const comprehensiveAnomalies = [];

            // Analyser les tendances combinées
            const recentVolumeAnomalies = this.history.volume
                .slice(-24)
                .filter(item => item.anomalies > 0)
                .length;

            const recentSentimentAnomalies = this.history.sentiment
                .slice(-24)
                .filter(item => item.anomalies > 0)
                .length;

            // Détecter les patterns complexes
            if (recentVolumeAnomalies > 5 && recentSentimentAnomalies > 3) {
                comprehensiveAnomalies.push({
                    type: 'complex_pattern',
                    description: 'Pics de volume et sentiment détectés simultanément',
                    volumeAnomalies: recentVolumeAnomalies,
                    sentimentAnomalies: recentSentimentAnomalies,
                    severity: 'high',
                    timestamp: new Date().toISOString()
                });
            }

            // Vérifier les tendances temporelles
            if (this.history.volume.length >= 10) {
                const recentVolumes = this.history.volume.slice(-10).map(v => v.totalArticles);
                const trend = this.calculateTrend(recentVolumes);

                if (Math.abs(trend) > 0.5) {
                    comprehensiveAnomalies.push({
                        type: 'volume_trend',
                        description: trend > 0 ? 'Augmentation significative du volume' : 'Diminution significative du volume',
                        trend: trend,
                        severity: 'medium',
                        timestamp: new Date().toISOString()
                    });
                }
            }

            return comprehensiveAnomalies;

        } catch (error) {
            console.error('❌ Erreur analyse complète:', error);
            return [];
        }
    }

    getRecentAnomalies(hours = 24) {
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

        return this.anomalies.filter(anomaly =>
            new Date(anomaly.timestamp) > cutoffTime
        );
    }

    resetHistory(metricType = null) {
        if (metricType) {
            this.history[metricType] = [];
        } else {
            this.history = {
                volume: [],
                sentiment: [],
                relations: []
            };
        }
        console.log('✅ Historique anomalies réinitialisé');
    }

    getStats() {
        const totalAnomalies = this.anomalies.length;
        const recentAnomalies = this.getRecentAnomalies(24).length;

        return {
            totalAnomalies: totalAnomalies,
            recentAnomalies: recentAnomalies,
            historySizes: {
                volume: this.history.volume.length,
                sentiment: this.history.sentiment.length,
                relations: this.history.relations.length
            },
            config: this.config
        };
    }

    // Méthodes utilitaires
    groupArticlesByHour(articles) {
        const hourlyCounts = {};

        articles.forEach(article => {
            const date = new Date(article.pubDate || Date.now());
            const hourKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:00`;

            hourlyCounts[hourKey] = (hourlyCounts[hourKey] || 0) + 1;
        });

        return hourlyCounts;
    }

    calculateTrend(data) {
        if (data.length < 2) return 0;

        const n = data.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = data;

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
        const sumXX = x.reduce((a, b) => a + b * b, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return slope;
    }
}

module.exports = AnomalyDetector;
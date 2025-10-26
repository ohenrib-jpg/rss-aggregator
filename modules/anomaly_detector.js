class AnomalyDetector {
    constructor() {
        this.history = new Map(); // Stocke l'historique des métriques par type
        this.anomalies = [];
        this.config = {
            zScoreThreshold: 2.5, // Seuil d'alerte
            minDataPoints: 10,    // Minimum de points pour calcul fiable
            historySize: 100,     // Taille max de l'historique
            alertCooldown: 300000 // 5 minutes entre alertes similaires
        };
        console.log('✅ AnomalyDetector initialisé');
    }

    /**
     * Calcule le Z-score pour une nouvelle valeur
     * Zi = (Xi - μ) / σ
     */
    calculateZScore(newValue, values) {
        if (values.length < this.config.minDataPoints) {
            return 0; // Pas assez de données
        }

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev === 0) return 0; // Évite division par zéro

        return (newValue - mean) / stdDev;
    }

    /**
     * Détecte les anomalies pour une métrique
     */
    detectAnomaly(metricType, newValue, metadata = {}) {
        if (!this.history.has(metricType)) {
            this.history.set(metricType, []);
        }

        const history = this.history.get(metricType);
        const zScore = this.calculateZScore(newValue, history);

        // Ajoute la nouvelle valeur à l'historique
        history.push(newValue);
        
        // Garde seulement les N dernières valeurs
        if (history.length > this.config.historySize) {
            history.shift();
        }

        // Vérifie si c'est une anomalie
        const isAnomaly = Math.abs(zScore) > this.config.zScoreThreshold;
        
        if (isAnomaly) {
            const anomaly = {
                id: this.generateId(),
                metricType,
                value: newValue,
                zScore: Math.abs(zScore),
                direction: zScore > 0 ? 'high' : 'low',
                timestamp: new Date(),
                metadata
            };

            // Vérifie le cooldown pour éviter les doublons
            if (!this.isDuplicateAnomaly(anomaly)) {
                this.anomalies.unshift(anomaly);
                console.log(`🚨 ANOMALIE DÉTECTÉE: ${metricType} - Z-score: ${zScore.toFixed(2)}`);
                return anomaly;
            }
        }

        return null;
    }

    /**
     * Évite les alertes en double récentes
     */
    isDuplicateAnomaly(newAnomaly) {
        const recent = Date.now() - this.config.alertCooldown;
        return this.anomalies.some(anomaly => 
            anomaly.metricType === newAnomaly.metricType &&
            anomaly.direction === newAnomaly.direction &&
            new Date(anomaly.timestamp).getTime() > recent
        );
    }

    /**
     * Détecte les anomalies dans les relations géopolitiques
     */
    analyzeRelations(relations) {
        const anomalies = [];

        relations.forEach(relation => {
            // Anomalie de force de relation
            const strengthAnomaly = this.detectAnomaly(
                `relation_strength_${relation.countries.join('_')}`,
                relation.currentStrength,
                {
                    countries: relation.countries,
                    type: relation.type,
                    confidence: relation.confidence
                }
            );

            if (strengthAnomaly) {
                anomalies.push(strengthAnomaly);
            }

            // Anomalie de confiance
            const confidenceAnomaly = this.detectAnomaly(
                `relation_confidence_${relation.countries.join('_')}`,
                relation.confidence,
                {
                    countries: relation.countries,
                    strength: relation.currentStrength
                }
            );

            if (confidenceAnomaly) {
                anomalies.push(confidenceAnomaly);
            }
        });

        return anomalies;
    }

    /**
     * Détecte les anomalies dans le volume d'articles
     */
    analyzeArticleVolume(articles, timeWindow = 'hourly') {
        const volume = articles.length;
        const anomaly = this.detectAnomaly(
            `article_volume_${timeWindow}`,
            volume,
            { timeWindow, articlesCount: volume }
        );

        return anomaly ? [anomaly] : [];
    }

    /**
     * Détecte les anomalies de sentiment
     */
    analyzeSentimentAnomalies(articles) {
        const sentiments = articles.map(article => article.sentiment?.score || 0);
        const avgSentiment = sentiments.reduce((sum, score) => sum + score, 0) / sentiments.length;

        const anomaly = this.detectAnomaly(
            'average_sentiment',
            avgSentiment,
            { 
                articlesAnalyzed: articles.length,
                sentimentRange: `${Math.min(...sentiments)} to ${Math.max(...sentiments)}`
            }
        );

        return anomaly ? [anomaly] : [];
    }

    /**
     * Analyse complète du système
     */
    async comprehensiveAnalysis() {
        try {
            const analysis = {
                timestamp: new Date(),
                anomalies: [],
                metrics: {
                    totalAnomalies: this.anomalies.length,
                    activeAlerts: this.getRecentAnomalies(24).length,
                    detectionRate: this.calculateDetectionRate()
                }
            };

            // Ici on intégrera les appels aux données réelles
            // Pour l'instant, retourne les anomalies récentes
            analysis.anomalies = this.getRecentAnomalies(24);

            return analysis;
        } catch (error) {
            console.error('❌ Erreur analyse anomalies:', error);
            return { timestamp: new Date(), anomalies: [], metrics: {} };
        }
    }

    /**
     * Récupère les anomalies récentes
     */
    getRecentAnomalies(hours = 24) {
        const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
        return this.anomalies.filter(anomaly => 
            new Date(anomaly.timestamp) > cutoff
        );
    }

    /**
     * Calcule le taux de détection
     */
    calculateDetectionRate() {
        const totalChecks = Array.from(this.history.values())
            .reduce((sum, history) => sum + history.length, 0);
        const anomalyRate = this.anomalies.length / Math.max(totalChecks, 1);
        return Math.min(anomalyRate * 100, 100); // Pourcentage
    }

    /**
     * Réinitialise l'historique
     */
    resetHistory(metricType = null) {
        if (metricType) {
            this.history.delete(metricType);
        } else {
            this.history.clear();
        }
        console.log('🔄 Historique anomalies réinitialisé');
    }

    generateId() {
        return `anom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Statistiques du détecteur
     */
    getStats() {
        return {
            totalAnomalies: this.anomalies.length,
            activeAlerts: this.getRecentAnomalies(24).length,
            monitoredMetrics: this.history.size,
            detectionRate: this.calculateDetectionRate(),
            config: this.config
        };
    }
}

module.exports = AnomalyDetector;
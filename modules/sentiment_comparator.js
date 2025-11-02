// ===========================================================================
// SENTIMENT COMPARATOR - Comparaison RSS / Réseaux Sociaux
// ===========================================================================
// Module de comparaison entre les sentiments des médias traditionnels (RSS)
// et des réseaux sociaux pour calculer le Facteur Z (dissonance médiatique)

class SentimentComparator {
    constructor() {
        this.comparisonHistory = [];
        this.thresholds = {
            low: 0.5,      // Divergence faible
            medium: 1.5,   // Divergence modérée
            high: 2.5      // Divergence forte
        };
        console.log('✅ SentimentComparator initialized');
    }

    /**
     * Compare les sentiments entre articles RSS et posts sociaux
     * @param {Array} rssArticles - Articles des flux RSS
     * @param {Array} socialPosts - Posts des réseaux sociaux
     * @returns {Object} Résultat de la comparaison
     */
    compareSentiments(rssArticles, socialPosts) {
        try {
            console.log(`📊 Comparaison sentiments: ${rssArticles.length} RSS vs ${socialPosts.length} social`);

            if (!rssArticles || rssArticles.length === 0 || !socialPosts || socialPosts.length === 0) {
                return {
                    success: false,
                    error: 'Données insuffisantes pour la comparaison',
                    rssCount: rssArticles?.length || 0,
                    socialCount: socialPosts?.length || 0
                };
            }

            // Analyse des sentiments RSS
            const rssAnalysis = this.analyzeSentimentDistribution(rssArticles, 'rss');

            // Analyse des sentiments sociaux
            const socialAnalysis = this.analyzeSentimentDistribution(socialPosts, 'social');

            // Calcul de la divergence
            const divergence = this.calculateDivergence(rssAnalysis, socialAnalysis);

            // Calcul du Facteur Z
            const factorZ = this.calculateFactorZ(rssAnalysis, socialAnalysis);

            // Génération des recommandations
            const recommendations = this.generateRecommendations(divergence, factorZ);

            // Stockage dans l'historique
            const comparison = {
                timestamp: new Date(),
                rss: rssAnalysis,
                social: socialAnalysis,
                divergence: divergence,
                factorZ: factorZ,
                recommendations: recommendations
            };

            this.comparisonHistory.push(comparison);

            // Garder uniquement les 100 dernières comparaisons
            if (this.comparisonHistory.length > 100) {
                this.comparisonHistory.shift();
            }

            console.log(`✅ Comparaison terminée: Facteur Z = ${factorZ.value.toFixed(3)}`);

            return {
                success: true,
                comparison: comparison,
                summary: {
                    rssSentiment: rssAnalysis.average,
                    socialSentiment: socialAnalysis.average,
                    divergence: divergence.absolute,
                    factorZ: factorZ.value,
                    interpretation: factorZ.interpretation
                }
            };

        } catch (error) {
            console.error('❌ Erreur compareSentiments:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Analyse la distribution des sentiments dans un ensemble de données
     * @param {Array} items - Articles ou posts à analyser
     * @param {String} type - Type de source ('rss' ou 'social')
     * @returns {Object} Statistiques de distribution
     */
    analyzeSentimentDistribution(items, type = 'unknown') {
        const distribution = {
            positive: 0,
            neutral: 0,
            negative: 0,
            total: 0,
            scores: []
        };

        let totalScore = 0;
        let totalWeightedScore = 0;

        items.forEach(item => {
            // Extraction du score de sentiment
            let score = 0;
            let sentimentType = 'neutral';

            if (type === 'rss') {
                // Pour les articles RSS
                score = parseFloat(item.sentiment_score || item.sentiment?.score || 0);
                sentimentType = item.sentiment_type || item.sentiment?.sentiment || 'neutral';
            } else if (type === 'social') {
                // Pour les posts sociaux
                score = parseFloat(item.sentiment || item.sentimentScore || 0);
                sentimentType = item.sentimentType || 'neutral';
            }

            distribution.scores.push(score);
            totalScore += score;

            // Pondération par confiance si disponible
            const confidence = parseFloat(item.confidence || item.sentiment?.confidence || 1);
            totalWeightedScore += score * confidence;

            // Comptage par type
            if (sentimentType.includes('positive') || score > 0.1) {
                distribution.positive++;
            } else if (sentimentType.includes('negative') || score < -0.1) {
                distribution.negative++;
            } else {
                distribution.neutral++;
            }

            distribution.total++;
        });

        // Calcul des moyennes
        const average = distribution.total > 0 ? totalScore / distribution.total : 0;
        const weightedAverage = distribution.total > 0 ? totalWeightedScore / distribution.total : 0;

        // Calcul de la variance et écart-type
        let variance = 0;
        distribution.scores.forEach(score => {
            variance += Math.pow(score - average, 2);
        });
        variance = distribution.total > 1 ? variance / (distribution.total - 1) : 0;
        const stdDev = Math.sqrt(variance);

        return {
            type: type,
            total: distribution.total,
            distribution: {
                positive: distribution.positive,
                neutral: distribution.neutral,
                negative: distribution.negative,
                positivePercent: distribution.total > 0 ? (distribution.positive / distribution.total * 100).toFixed(1) : 0,
                neutralPercent: distribution.total > 0 ? (distribution.neutral / distribution.total * 100).toFixed(1) : 0,
                negativePercent: distribution.total > 0 ? (distribution.negative / distribution.total * 100).toFixed(1) : 0
            },
            average: parseFloat(average.toFixed(4)),
            weightedAverage: parseFloat(weightedAverage.toFixed(4)),
            variance: parseFloat(variance.toFixed(4)),
            stdDev: parseFloat(stdDev.toFixed(4)),
            min: Math.min(...distribution.scores),
            max: Math.max(...distribution.scores)
        };
    }

    /**
     * Calcule la divergence entre deux distributions de sentiments
     * @param {Object} rssAnalysis - Analyse des sentiments RSS
     * @param {Object} socialAnalysis - Analyse des sentiments sociaux
     * @returns {Object} Métriques de divergence
     */
    calculateDivergence(rssAnalysis, socialAnalysis) {
        // Différence absolue des moyennes
        const meanDifference = Math.abs(rssAnalysis.average - socialAnalysis.average);

        // Différence relative (en pourcentage)
        const relativeDifference = rssAnalysis.average !== 0 
            ? Math.abs((socialAnalysis.average - rssAnalysis.average) / rssAnalysis.average * 100)
            : 0;

        // Divergence des distributions (Kullback-Leibler simplifiée)
        const distributionDivergence = this.calculateKLDivergence(
            rssAnalysis.distribution,
            socialAnalysis.distribution
        );

        // Classification de la divergence
        let level = 'low';
        if (meanDifference > this.thresholds.high) {
            level = 'high';
        } else if (meanDifference > this.thresholds.medium) {
            level = 'medium';
        }

        return {
            absolute: parseFloat(meanDifference.toFixed(4)),
            relative: parseFloat(relativeDifference.toFixed(2)),
            distribution: parseFloat(distributionDivergence.toFixed(4)),
            level: level,
            rssAverage: rssAnalysis.average,
            socialAverage: socialAnalysis.average
        };
    }

    /**
     * Calcule une divergence Kullback-Leibler simplifiée entre deux distributions
     * @param {Object} dist1 - Première distribution
     * @param {Object} dist2 - Deuxième distribution
     * @returns {Number} Score de divergence
     */
    calculateKLDivergence(dist1, dist2) {
        const p1 = [
            parseFloat(dist1.positivePercent) / 100,
            parseFloat(dist1.neutralPercent) / 100,
            parseFloat(dist1.negativePercent) / 100
        ];

        const p2 = [
            parseFloat(dist2.positivePercent) / 100,
            parseFloat(dist2.neutralPercent) / 100,
            parseFloat(dist2.negativePercent) / 100
        ];

        let divergence = 0;
        for (let i = 0; i < 3; i++) {
            if (p1[i] > 0 && p2[i] > 0) {
                divergence += p1[i] * Math.log(p1[i] / p2[i]);
            }
        }

        return Math.abs(divergence);
    }

    /**
     * Calcule le Facteur Z (score standardisé de divergence)
     * @param {Object} rssAnalysis - Analyse RSS
     * @param {Object} socialAnalysis - Analyse sociale
     * @returns {Object} Facteur Z et interprétation
     */
    calculateFactorZ(rssAnalysis, socialAnalysis) {
        // Différence des moyennes
        const meanDiff = Math.abs(rssAnalysis.average - socialAnalysis.average);

        // Variance poolée (combinée)
        const n1 = rssAnalysis.total;
        const n2 = socialAnalysis.total;
        const pooledVariance = ((rssAnalysis.variance * n1) + (socialAnalysis.variance * n2)) / (n1 + n2);

        // Erreur standard
        const standardError = Math.sqrt(pooledVariance / n1 + pooledVariance / n2);

        // Calcul du Z-score
        const zScore = standardError > 0 ? meanDiff / standardError : 0;

        // Interprétation
        let interpretation = 'Validation populaire';
        let confidence = 'high';

        if (Math.abs(zScore) > 2.5) {
            interpretation = 'Dissonance majeure';
            confidence = 'very_high';
        } else if (Math.abs(zScore) > 1.5) {
            interpretation = 'Dissonance modérée';
            confidence = 'high';
        } else if (Math.abs(zScore) > 0.5) {
            interpretation = 'Légère dissonance';
            confidence = 'medium';
        } else {
            interpretation = 'Validation populaire';
            confidence = 'low';
        }

        return {
            value: parseFloat(zScore.toFixed(4)),
            absoluteValue: Math.abs(zScore),
            interpretation: interpretation,
            confidence: confidence,
            meanDifference: parseFloat(meanDiff.toFixed(4)),
            standardError: parseFloat(standardError.toFixed(4)),
            pooledVariance: parseFloat(pooledVariance.toFixed(4))
        };
    }

    /**
     * Génère des recommandations basées sur la divergence
     * @param {Object} divergence - Métriques de divergence
     * @param {Object} factorZ - Facteur Z calculé
     * @returns {Array} Liste de recommandations
     */
    generateRecommendations(divergence, factorZ) {
        const recommendations = [];

        if (factorZ.absoluteValue > 2.5) {
            recommendations.push({
                level: 'critical',
                message: 'Divergence majeure détectée entre médias et réseaux sociaux',
                action: 'Analyser les causes de la dissonance et vérifier les sources'
            });
        }

        if (divergence.level === 'high') {
            recommendations.push({
                level: 'warning',
                message: 'Écart significatif dans les sentiments exprimés',
                action: 'Comparer les thèmes abordés par chaque source'
            });
        }

        if (divergence.distribution > 0.5) {
            recommendations.push({
                level: 'info',
                message: 'Distribution des sentiments très différente',
                action: 'Identifier les sujets polarisants'
            });
        }

        if (factorZ.absoluteValue < 0.5) {
            recommendations.push({
                level: 'success',
                message: 'Convergence des opinions médiatiques et populaires',
                action: 'Consensus général sur les sujets traités'
            });
        }

        // Recommandation par défaut
        if (recommendations.length === 0) {
            recommendations.push({
                level: 'info',
                message: 'Divergence modérée observée',
                action: 'Surveillance continue recommandée'
            });
        }

        return recommendations;
    }

    /**
     * Analyse les tendances temporelles de divergence
     * @param {Number} days - Nombre de jours à analyser
     * @returns {Object} Tendances historiques
     */
    analyzeTrends(days = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const recentComparisons = this.comparisonHistory.filter(
            comp => comp.timestamp >= cutoffDate
        );

        if (recentComparisons.length === 0) {
            return {
                success: false,
                message: 'Pas assez de données historiques'
            };
        }

        // Calcul des moyennes sur la période
        const avgFactorZ = recentComparisons.reduce((sum, comp) => sum + comp.factorZ.value, 0) / recentComparisons.length;
        const avgDivergence = recentComparisons.reduce((sum, comp) => sum + comp.divergence.absolute, 0) / recentComparisons.length;

        // Détection de tendance (croissante, décroissante, stable)
        const firstHalf = recentComparisons.slice(0, Math.floor(recentComparisons.length / 2));
        const secondHalf = recentComparisons.slice(Math.floor(recentComparisons.length / 2));

        const avgFirstHalf = firstHalf.reduce((sum, comp) => sum + comp.factorZ.value, 0) / firstHalf.length;
        const avgSecondHalf = secondHalf.reduce((sum, comp) => sum + comp.factorZ.value, 0) / secondHalf.length;

        let trend = 'stable';
        if (avgSecondHalf > avgFirstHalf + 0.5) {
            trend = 'increasing';
        } else if (avgSecondHalf < avgFirstHalf - 0.5) {
            trend = 'decreasing';
        }

        return {
            success: true,
            period: days,
            comparisons: recentComparisons.length,
            averageFactorZ: parseFloat(avgFactorZ.toFixed(3)),
            averageDivergence: parseFloat(avgDivergence.toFixed(3)),
            trend: trend,
            trendChange: parseFloat((avgSecondHalf - avgFirstHalf).toFixed(3)),
            dataPoints: recentComparisons.map(comp => ({
                timestamp: comp.timestamp,
                factorZ: comp.factorZ.value,
                divergence: comp.divergence.absolute
            }))
        };
    }

    /**
     * Compare les sentiments par thème
     * @param {Array} rssArticles - Articles RSS
     * @param {Array} socialPosts - Posts sociaux
     * @param {String} theme - Thème à analyser
     * @returns {Object} Comparaison par thème
     */
    compareByTheme(rssArticles, socialPosts, theme) {
        try {
            // Filtrage par thème
            const rssFiltered = rssArticles.filter(article => 
                article.themes && article.themes.includes(theme)
            );

            const socialFiltered = socialPosts.filter(post =>
                (post.title + ' ' + post.content).toLowerCase().includes(theme.toLowerCase())
            );

            if (rssFiltered.length === 0 || socialFiltered.length === 0) {
                return {
                    success: false,
                    message: `Pas assez de données pour le thème "${theme}"`,
                    rssCount: rssFiltered.length,
                    socialCount: socialFiltered.length
                };
            }

            return this.compareSentiments(rssFiltered, socialFiltered);

        } catch (error) {
            console.error('❌ Erreur compareByTheme:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Obtient un résumé de l'état actuel
     * @returns {Object} Résumé des comparaisons
     */
    getSummary() {
        const historyLength = this.comparisonHistory.length;

        if (historyLength === 0) {
            return {
                success: false,
                message: 'Aucune comparaison effectuée'
            };
        }

        const latest = this.comparisonHistory[historyLength - 1];
        const trends = this.analyzeTrends(7);

        return {
            success: true,
            latestComparison: {
                timestamp: latest.timestamp,
                factorZ: latest.factorZ.value,
                interpretation: latest.factorZ.interpretation,
                divergence: latest.divergence.absolute
            },
            trends: trends,
            totalComparisons: historyLength,
            thresholds: this.thresholds
        };
    }

    /**
     * Réinitialise l'historique des comparaisons
     */
    reset() {
        this.comparisonHistory = [];
        console.log('🔄 Historique des comparaisons réinitialisé');
    }
}

// Export du module
module.exports = new SentimentComparator();

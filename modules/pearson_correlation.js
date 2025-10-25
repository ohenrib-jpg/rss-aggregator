// modules/pearson_correlation.js
class PearsonCorrelation {
    
    /**
     * Calcule la corrélation de Pearson entre deux tableaux de nombres
     * @param {number[]} x - Premier tableau de valeurs
     * @param {number[]} y - Second tableau de valeurs  
     * @returns {number} Coefficient de corrélation (-1 à 1)
     */
    static calculate(x, y) {
        if (x.length !== y.length) {
            throw new Error('Les tableaux doivent avoir la même longueur');
        }
        
        if (x.length < 2) {
            return 0; // Pas assez de données
        }

        const n = x.length;
        
        // Calcul des sommes
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
        const sumY2 = y.reduce((sum, val) => sum + val * val, 0);

        // Formule Pearson
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt(
            (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
        );

        if (denominator === 0) return 0;
        
        return numerator / denominator;
    }

    /**
     * Analyse la corrélation entre fréquence de mots-clés et sentiment
     * @param {Array} articles - Liste des articles analysés
     * @param {string} keyword - Mot-clé à analyser
     * @returns {Object} Résultats de corrélation
     */
    static analyzeKeywordSentimentCorrelation(articles, keyword) {
        const frequencies = [];
        const sentiments = [];
        
        articles.forEach(article => {
            if (!article.content && !article.summary) return;
            
            const text = (article.content || article.summary).toLowerCase();
            const keywordCount = (text.match(new RegExp(keyword, 'gi')) || []).length;
            const textLength = text.split(/\s+/).length;
            
            // Fréquence normalisée
            const frequency = textLength > 0 ? keywordCount / textLength : 0;
            const sentiment = article.sentiment?.score || 0;
            
            frequencies.push(frequency);
            sentiments.push(sentiment);
        });
        
        if (frequencies.length < 3) {
            return {
                correlation: 0,
                strength: 'insufficient_data',
                sampleSize: frequencies.length,
                keyword: keyword
            };
        }
        
        const correlation = this.calculate(frequencies, sentiments);
        
        return {
            correlation: parseFloat(correlation.toFixed(3)),
            strength: this.interpretStrength(correlation),
            sampleSize: frequencies.length,
            keyword: keyword,
            interpretation: this.interpretCorrelation(correlation, keyword)
        };
    }

    /**
     * Analyse les corrélations entre différents thèmes
     * @param {Array} articles - Articles analysés
     * @param {Array} themes - Liste des thèmes
     * @returns {Array} Matrice de corrélations
     */
    static analyzeThemeCorrelations(articles, themes) {
        const correlations = [];
        
        // Préparer les données de fréquence par thème
        const themeFrequencies = themes.map(theme => {
            return articles.map(article => {
                const articleThemes = article.themes || [];
                return articleThemes.includes(theme.name) ? 1 : 0;
            });
        });
        
        // Calculer les corrélations entre chaque paire de thèmes
        for (let i = 0; i < themes.length; i++) {
            for (let j = i + 1; j < themes.length; j++) {
                const correlation = this.calculate(
                    themeFrequencies[i], 
                    themeFrequencies[j]
                );
                
                // Ne garder que les corrélations significatives
                if (Math.abs(correlation) > 0.2) {
                    correlations.push({
                        theme1: themes[i].name,
                        theme2: themes[j].name,
                        correlation: parseFloat(correlation.toFixed(3)),
                        strength: this.interpretStrength(correlation),
                        interpretation: this.interpretThemeCorrelation(correlation)
                    });
                }
            }
        }
        
        // Trier par force de corrélation
        return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    }

    /**
     * Interprète la force de la corrélation
     */
    static interpretStrength(correlation) {
        const absCorr = Math.abs(correlation);
        if (absCorr >= 0.8) return 'very_strong';
        if (absCorr >= 0.6) return 'strong';
        if (absCorr >= 0.4) return 'moderate';
        if (absCorr >= 0.2) return 'weak';
        return 'very_weak';
    }

    /**
     * Interprète la corrélation mot-clé/sentiment
     */
    static interpretCorrelation(correlation, keyword) {
        const absCorr = Math.abs(correlation);
        if (absCorr < 0.2) return `Pas de lien significatif entre "${keyword}" et le sentiment`;
        
        const direction = correlation > 0 ? 'positif' : 'négatif';
        const strength = this.interpretStrength(correlation);
        
        const strengthText = {
            'weak': 'faible',
            'moderate': 'modéré', 
            'strong': 'fort',
            'very_strong': 'très fort'
        }[strength];
        
        return `Corrélation ${direction} ${strengthText} : "${keyword}" est associé à des sentiments ${direction}s`;
    }

    /**
     * Interprète la corrélation entre thèmes
     */
    static interpretThemeCorrelation(correlation) {
        const absCorr = Math.abs(correlation);
        if (absCorr < 0.2) return 'Peu de co-occurrence';
        
        const direction = correlation > 0 ? 'sont souvent mentionnés ensemble' : 'sont rarement mentionnés ensemble';
        const strength = this.interpretStrength(correlation);
        
        const strengthText = {
            'weak': 'légèrement',
            'moderate': 'modérément',
            'strong': 'fréquemment', 
            'very_strong': 'très fréquemment'
        }[strength];
        
        return `Ces thèmes ${strengthText} ${direction}`;
    }
}

module.exports = PearsonCorrelation;
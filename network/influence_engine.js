// ===========================================================================
// MOTEUR D'INFLUENCE GÉOPOLITIQUE
// ===========================================================================

class InfluenceEngine {
    constructor() {
        this.relations = new Map();
        this.countries = new Set();
        console.log('✅ InfluenceEngine intégré avec succès');
    }

    async analyzeArticle(article) {
        try {
            const countries = await this.extractCountries(article);
            const relations = this.detectBilateralRelations(countries, article);
            this.updateNetwork(relations, article);
            return relations;
        } catch (error) {
            console.error('Error analyzing article:', error);
            return [];
        }
    }

    async extractCountries(article) {
        const text = (article.title || '') + ' ' + (article.content || '');
        const countryList = ['france', 'usa', 'china', 'russia', 'germany', 'uk', 'japan', 'india', 'brazil', 'canada', 'ukraine', 'israel', 'palestine', 'iran'];
        const detected = [];

        countryList.forEach(country => {
            const regex = new RegExp(`\\b${country}\\b`, 'gi');
            if (text.match(regex)) {
                detected.push(country);
            }
        });

        return detected;
    }

    detectBilateralRelations(countries, article) {
        const relations = [];

        for (let i = 0; i < countries.length; i++) {
            for (let j = i + 1; j < countries.length; j++) {
                const relation = this.analyzeCountryPair(countries[i], countries[j], article);
                if (relation.strength !== 0) {
                    relations.push(relation);
                }
            }
        }

        return relations;
    }

    analyzeCountryPair(countryA, countryB, article) {
        const text = ((article.title || '') + ' ' + (article.content || '')).toLowerCase();

        const positiveWords = ['accord', 'cooperation', 'partenariat', 'alliance', 'sommet', 'entente', 'dialogue', 'paix'];
        const negativeWords = ['conflit', 'tension', 'sanction', 'crise', 'hostilité', 'menace', 'protestation', 'guerre'];

        let positiveCount = 0;
        let negativeCount = 0;

        positiveWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) positiveCount += matches.length;
        });

        negativeWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) negativeCount += matches.length;
        });

        const total = positiveCount + negativeCount;
        let strength = 0;

        if (total > 0) {
            strength = (positiveCount - negativeCount) / total;
            strength = Math.max(Math.min(strength, 1), -1);
        }

        let type = 'neutral';
        if (strength > 0.3) type = 'cooperative';
        else if (strength < -0.3) type = 'conflict';
        else if (Math.abs(strength) > 0.1) type = 'tense';

        return {
            countries: [countryA, countryB],
            strength: strength,
            type: type,
            confidence: Math.min((positiveCount + negativeCount) / 10, 0.9),
            evidence: {
                articleId: article.id,
                excerpt: (article.title || '').substring(0, 50)
            }
        };
    }

    updateNetwork(newRelations, article) {
        newRelations.forEach(relation => {
            const key = relation.countries.sort().join('|');

            if (!this.relations.has(key)) {
                this.relations.set(key, {
                    countries: relation.countries,
                    currentStrength: relation.strength,
                    type: relation.type,
                    confidence: relation.confidence,
                    evidence: [relation.evidence],
                    evolution: [{
                        timestamp: new Date(),
                        strength: relation.strength
                    }],
                    lastUpdated: new Date()
                });
            } else {
                const existing = this.relations.get(key);
                existing.currentStrength = (existing.currentStrength + relation.strength) / 2;
                existing.evidence.push(relation.evidence);
                existing.evolution.push({
                    timestamp: new Date(),
                    strength: existing.currentStrength
                });
                existing.lastUpdated = new Date();
            }

            relation.countries.forEach(country => this.countries.add(country));
        });
    }

    calculateInfluenceScore(country) {
        const countryRelations = Array.from(this.relations.values())
            .filter(rel => rel.countries.includes(country));

        if (countryRelations.length === 0) return 0;

        const totalStrength = countryRelations.reduce((sum, rel) => {
            return sum + Math.abs(rel.currentStrength);
        }, 0);

        return totalStrength / countryRelations.length;
    }

    getNetworkMetrics() {
        const relations = Array.from(this.relations.values());
        const totalRelations = relations.length;

        if (totalRelations === 0) {
            return {
                totalCountries: 0,
                totalRelations: 0,
                avgStrength: 0,
                lastAnalysis: new Date()
            };
        }

        const avgStrength = relations.reduce((sum, rel) => sum + Math.abs(rel.currentStrength), 0) / totalRelations;

        return {
            totalCountries: this.countries.size,
            totalRelations: totalRelations,
            avgStrength: avgStrength,
            lastAnalysis: new Date()
        };
    }
}

module.exports = new InfluenceEngine();
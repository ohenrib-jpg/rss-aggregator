
class InfluenceEngine {
    constructor() {
        this.relations = new Map();
        this.countries = new Set();
        this.evidence = [];
    }

    // 🎯 Détection des relations dans un article
    async analyzeArticle(article) {
        const countries = await this.extractCountries(article);
        const relations = this.detectBilateralRelations(countries, article);
        this.updateNetwork(relations, article);
        return relations;
    }

    // 🌍 Extraction des entités pays
    async extractCountries(article) {
        // Utilisation combine : regex + ML Flask
        const text = article.title + ' ' + article.content;

        if (config.services?.flask?.enabled) {
            try {
                const flaskResponse = await axios.post(
                    `${config.services.flask.url}/api/analyze/entities`,
                    { text }
                );
                return flaskResponse.data.countries || [];
            } catch (error) {
                console.warn('Flask indisponible, fallback regex');
            }
        }

        // Fallback : détection par regex
        return this.extractCountriesRegex(text);
    }

    extractCountriesRegex(text) {
        const countryPatterns = {
            'france': /\b(france|français|française|paris)\b/gi,
            'usa': /\b(usa|états-unis|amérique|washington)\b/gi,
            'china': /\b(chine|chinois|pékin|beijing)\b/gi,
            'russia': /\b(russie|russe|moscou|poutine)\b/gi,
            'germany': /\b(allemagne|allemand|berlin)\b/gi,
            // ... à compléter avec tous les pays
        };

        const detected = [];
        for (const [country, pattern] of Object.entries(countryPatterns)) {
            if (text.match(pattern)) {
                detected.push(country);
            }
        }
        return [...new Set(detected)]; // Déduplication
    }
}

    detectBilateralRelations(countries, article) {
        const relations = [];
        
        // Analyse chaque paire de pays mentionnés
        for (let i = 0; i < countries.length; i++) {
            for (let j = i + 1; j < countries.length; j++) {
                const relation = this.analyzeCountryPair(
                    countries[i], 
                    countries[j], 
                    article
                );
                if (relation.strength !== 0) {
                    relations.push(relation);
                }
            }
        }
        return relations;
    }

    analyzeCountryPair(countryA, countryB, article) {
        const context = article.content.toLowerCase();
        const title = article.title.toLowerCase();
        const fullText = title + ' ' + context;

        // Mots-clés indicateurs de relations
        const cooperativeKeywords = [
            'accord', 'coopération', 'partenariat', 'alliance', 'sommet',
            'entente', 'dialogue', 'commerce', 'investissement', 'visite'
        ];

        const conflictKeywords = [
            'conflit', 'tension', 'sanction', 'crise', 'hostilité',
            'affrontement', 'menace', 'protestation', 'condamnation'
        ];

        // Calcul du score de relation
        let cooperativeScore = this.countKeywords(fullText, cooperativeKeywords);
        let conflictScore = this.countKeywords(fullText, conflictKeywords);

        // Normalisation et pondération
        const totalKeywords = cooperativeScore + conflictScore;
        let strength = 0;

        if (totalKeywords > 0) {
            strength = (cooperativeScore - conflictScore) / totalKeywords;
            // Pondération par la confiance de l'article
            strength *= (article.confidence_score || 0.5);
        }

        // Classification du type de relation
        let type = 'neutral';
        if (strength > 0.3) type = 'cooperative';
        else if (strength < -0.3) type = 'conflict';
        else if (Math.abs(strength) > 0.1) type = 'tense';

        return {
            countries: [countryA, countryB],
            strength: Math.max(Math.min(strength, 1), -1), // Clamp [-1, 1]
            type: type,
            confidence: this.calculateConfidence(article, totalKeywords),
            evidence: {
                articleId: article.id,
                excerpt: article.title,
                timestamp: article.pubDate || new Date()
            }
        };
    }

    countKeywords(text, keywords) {
        return keywords.reduce((count, keyword) => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const matches = text.match(regex);
            return count + (matches ? matches.length : 0);
        }, 0);
    }

    calculateConfidence(article, keywordCount) {
        // Confiance basée sur la qualité de l'article + preuves trouvées
        const baseConfidence = article.confidence_score || 0.5;
        const keywordConfidence = Math.min(keywordCount / 5, 1); // Max 1.0
        return (baseConfidence * 0.6 + keywordConfidence * 0.4);
    }

    updateNetwork(newRelations, article) {
        newRelations.forEach(relation => {
            const key = this.getRelationKey(relation.countries[0], relation.countries[1]);
            
            if (!this.relations.has(key)) {
                // Nouvelle relation
                this.relations.set(key, {
                    countries: relation.countries,
                    currentStrength: relation.strength,
                    confidence: relation.confidence,
                    type: relation.type,
                    evidence: [relation.evidence],
                    evolution: [{
                        timestamp: new Date(),
                        strength: relation.strength,
                        source: article.id
                    }],
                    lastUpdated: new Date()
                });
            } else {
                // Mise à jour relation existante
                const existing = this.relations.get(key);
                
                // Moyenne pondérée avec décroissance temporelle
                const timeFactor = this.calculateTimeFactor(existing.lastUpdated);
                const newStrength = (existing.currentStrength * timeFactor + relation.strength) / (timeFactor + 1);
                
                existing.currentStrength = newStrength;
                existing.confidence = Math.max(existing.confidence, relation.confidence);
                existing.evidence.push(relation.evidence);
                existing.evolution.push({
                    timestamp: new Date(),
                    strength: newStrength,
                    source: article.id
                });
                existing.lastUpdated = new Date();
                
                // Mise à jour du type
                existing.type = this.classifyRelationType(newStrength);
            }
        });
    }

    getRelationKey(countryA, countryB) {
        return [countryA, countryB].sort().join('|');
    }

    calculateTimeFactor(lastUpdate) {
        const hoursDiff = (new Date() - new Date(lastUpdate)) / (1000 * 60 * 60);
        return Math.max(1, 24 / (hoursDiff + 1)); // Décroissance sur 24h
    }

    classifyRelationType(strength) {
        if (strength > 0.6) return 'alliance';
        if (strength > 0.3) return 'cooperative';
        if (strength > 0.1) return 'positive';
        if (strength > -0.1) return 'neutral';
        if (strength > -0.3) return 'tense';
        if (strength > -0.6) return 'conflict';
        return 'hostile';
    }


/* -------------------------------------------------------------
 * analysis-engine.js
 * Moteur d'analyse basé sur l'ancien code fonctionnel
 * ------------------------------------------------------------- */

class AnalysisEngine {
    constructor() {
        this.currentAnalysis = null;
        this.state = window.app?.state;
    }

    // ANALYSE DE SENTIMENT - Méthodes principales
    updateSentimentAnalysis() {
        console.log('Mise à jour de l\'analyse de sentiment');
        if (!this.currentAnalysis) {
            console.log('Aucune analyse disponible');
            return;
        }
        // Vérifier d'abord si les éléments existent
        const hasRequiredElements = document.getElementById('sentimentOverview') ||
            document.getElementById('sentimentByTheme') ||
            document.getElementById('positiveArticles') ||
            document.getElementById('negativeArticles');

        if (!hasRequiredElements) {
            console.log('❌ Éléments d\'analyse non trouvés - section analyse probablement non chargée');
            return;
        }

        this.updateSentimentOverview();
        this.updateSentimentByTheme();
        this.updateSentimentArticles();
    }

    updateSentimentOverview() {
        const sentimentOverview = document.getElementById('sentimentOverview');
        if (!sentimentOverview) {
            console.log('❌ Élément sentimentOverview non trouvé');
            return;
        }

        let totalPositive = 0;
        let totalNegative = 0;
        let totalNeutral = 0;
        let totalArticles = 0;

        // Calcul plus précis des sentiments
        Object.keys(this.currentAnalysis.themes).forEach(themeName => {
            const theme = this.currentAnalysis.themes[themeName];
            if (theme.sentiment && theme.sentiment.articles) {
                theme.sentiment.articles.forEach(article => {
                    const sentiment = article.sentiment || { sentiment: "neutral" };
                    switch (sentiment.sentiment) {
                        case 'positive':
                        case 'positive_strong':
                        case 'positive_weak':
                            totalPositive++;
                            break;
                        case 'negative':
                        case 'negative_strong':
                        case 'negative_weak':
                            totalNegative++;
                            break;
                        default:
                            totalNeutral++;
                            break;
                    }
                    totalArticles++;
                });
            }
        });

        console.log('📊 Sentiment détaillé:', {
            totalPositive,
            totalNegative,
            totalNeutral,
            totalArticles
        });

        if (totalArticles === 0) {
            sentimentOverview.innerHTML = '<div class="loading">Aucune donnée de sentiment disponible</div>';
            return;
        }

        const positivePercent = Math.round((totalPositive / totalArticles) * 100);
        const negativePercent = Math.round((totalNegative / totalArticles) * 100);
        const neutralPercent = Math.round((totalNeutral / totalArticles) * 100);

        sentimentOverview.innerHTML = `
        <div class="sentiment-overview">
            <div class="sentiment-stats">
                <div class="sentiment-item positive">
                    <span class="sentiment-emoji">😊</span>
                    <span class="sentiment-label">Positif</span>
                    <span class="sentiment-value">${positivePercent}%</span>
                    <small>${totalPositive} articles</small>
                </div>
                <div class="sentiment-item neutral">
                    <span class="sentiment-emoji">😐</span>
                    <span class="sentiment-label">Neutre</span>
                    <span class="sentiment-value">${neutralPercent}%</span>
                    <small>${totalNeutral} articles</small>
                </div>
                <div class="sentiment-item negative">
                    <span class="sentiment-emoji">😞</span>
                    <span class="sentiment-label">Négatif</span>
                    <span class="sentiment-value">${negativePercent}%</span>
                    <small>${totalNegative} articles</small>
                </div>
            </div>
            <div class="sentiment-chart">
                <div class="sentiment-bar">
                    <div class="sentiment-fill positive" style="width: ${positivePercent}%" title="Positif: ${positivePercent}%"></div>
                    <div class="sentiment-fill neutral" style="width: ${neutralPercent}%" title="Neutre: ${neutralPercent}%"></div>
                    <div class="sentiment-fill negative" style="width: ${negativePercent}%" title="Négatif: ${negativePercent}%"></div>
                </div>
                <div class="sentiment-legend">
                    <span>😊 Positif</span>
                    <span>😐 Neutre</span>
                    <span>😞 Négatif</span>
                </div>
            </div>
        </div>
    `;
    }

    updateSentimentByTheme() {
        const sentimentByTheme = document.getElementById('sentimentByTheme');
        if (!sentimentByTheme) {
            console.log('Élément sentimentByTheme non trouvé');
            return;
        }

        const themes = Object.keys(this.currentAnalysis.themes).filter(theme => {
            const themeData = this.currentAnalysis.themes[theme];
            return themeData.sentiment && themeData.sentiment.articles && themeData.sentiment.articles.length > 0;
        });

        console.log('Thèmes avec données de sentiment:', themes);

        if (themes.length === 0) {
            sentimentByTheme.innerHTML = '<div class="loading">Aucune donnée de sentiment par thème</div>';
            return;
        }

        let html = '<div class="themes-sentiment-grid">';

        themes.forEach(themeName => {
            const theme = this.currentAnalysis.themes[themeName];
            const sentiment = theme.sentiment;

            if (!sentiment.articles || sentiment.articles.length === 0) return;

            const totalArticles = sentiment.articles.length;
            const positivePercent = Math.round((sentiment.positive / totalArticles) * 100) || 0;
            const negativePercent = Math.round((sentiment.negative / totalArticles) * 100) || 0;
            const neutralPercent = Math.round((sentiment.neutral / totalArticles) * 100) || 0;

            const getSentimentIcon = (score) => {
                if (score > 0.3) return '😊';
                if (score < -0.3) return '😞';
                return '😐';
            };

            const getSentimentLabel = (score) => {
                if (score > 0.3) return 'Évolution positive';
                if (score < -0.3) return 'Évolution Négative';
                return 'Neutre';
            };

            html += `
            <div class="theme-sentiment-card">
                <div class="theme-sentiment-header">
                    <span class="theme-color-indicator" style="background-color: ${theme.color || '#6366f1'}"></span>
                    <span class="theme-name">${this.escapeHtml(themeName)}</span>
                    <span class="sentiment-icon" title="${getSentimentLabel(sentiment.averageScore || 0)}">${getSentimentIcon(sentiment.averageScore || 0)}</span>
                </div>
                <div class="sentiment-breakdown">
                    <div class="sentiment-detail">
                        <span class="sentiment-dot positive"></span>
                        <span>Évolution positive: ${positivePercent}% (${sentiment.positive})</span>
                    </div>
                    <div class="sentiment-detail">
                        <span class="sentiment-dot neutral"></span>
                        <span>Neutre: ${neutralPercent}% (${sentiment.neutral})</span>
                    </div>
                    <div class="sentiment-detail">
                        <span class="sentiment-dot negative"></span>
                        <span>Évolution Négative: ${negativePercent}% (${sentiment.negative})</span>
                    </div>
                </div>
                <div class="sentiment-score">
                    Score moyen: <strong>${(sentiment.averageScore || 0).toFixed(2)}</strong>
                    <br>
                    <small>Confiance: ${(sentiment.averageConfidence || 0).toFixed(2)}</small>
                    <br>
                    <small>Total: ${totalArticles} articles</small>
                </div>
            </div>
        `;
        });

        html += '</div>';
        sentimentByTheme.innerHTML = html;
    }

    updateSentimentArticles() {
        this.updatePositiveArticles();
        this.updateNegativeArticles();
    }

    updatePositiveArticles() {
        const positiveArticles = document.getElementById('positiveArticles');
        if (!positiveArticles) {
            console.log('❌ Élément positiveArticles non trouvé - ignoré');
            return;
        }

        let allPositiveArticles = [];
        
        Object.keys(this.currentAnalysis.themes).forEach(themeName => {
            const theme = this.currentAnalysis.themes[themeName];
            if (theme.sentiment && theme.sentiment.articles) {
                const positiveArticlesInTheme = theme.sentiment.articles.filter(article => 
                    article.sentiment && article.sentiment.sentiment === 'positive'
                );
                allPositiveArticles.push(...positiveArticlesInTheme);
            }
        });

        // Dédoublonner et trier
        allPositiveArticles = allPositiveArticles.filter((article, index, self) =>
            index === self.findIndex(a => a.title === article.title)
        );
        allPositiveArticles.sort((a, b) => (b.sentiment?.score || 0) - (a.sentiment?.score || 0));
        const topPositive = allPositiveArticles.slice(0, 5);

        console.log('Articles positifs trouvés:', topPositive.length);

        if (topPositive.length === 0) {
            positiveArticles.innerHTML = '<div class="loading">Aucun article positif</div>';
            return;
        }

        positiveArticles.innerHTML = topPositive.map(article => `
            <div class="article-item positive">
                <h4><a href="${article.link || '#'}" target="_blank">${this.escapeHtml(article.title)}</a></h4>
                <p>${this.escapeHtml((article.content || '').substring(0, 100))}...</p>
                <div class="article-meta">
                    <small>Source: ${this.escapeHtml(article.feed)} • ${new Date(article.date).toLocaleDateString('fr-FR')}</small>
                </div>
                <div class="sentiment-badge positive">
                    😊 Score: ${(article.sentiment?.score || 0).toFixed(2)} | Confiance: ${(article.sentiment?.confidence || 0).toFixed(2)}
                </div>
            </div>
        `).join('');
    }

    updateNegativeArticles() {
        const negativeArticles = document.getElementById('negativeArticles');
        if (!negativeArticles) {
            console.log('❌ Élément negativeArticles non trouvé - ignoré');
            return;
        }

        let allNegativeArticles = [];
        
        Object.keys(this.currentAnalysis.themes).forEach(themeName => {
            const theme = this.currentAnalysis.themes[themeName];
            if (theme.sentiment && theme.sentiment.articles) {
                const negativeArticlesInTheme = theme.sentiment.articles.filter(article => 
                    article.sentiment && article.sentiment.sentiment === 'negative'
                );
                allNegativeArticles.push(...negativeArticlesInTheme);
            }
        });

        // Dédoublonner et trier
        allNegativeArticles = allNegativeArticles.filter((article, index, self) =>
            index === self.findIndex(a => a.title === article.title)
        );
        allNegativeArticles.sort((a, b) => (a.sentiment?.score || 0) - (b.sentiment?.score || 0));
        const topNegative = allNegativeArticles.slice(0, 5);

        console.log('Articles négatifs trouvés:', topNegative.length);

        if (topNegative.length === 0) {
            negativeArticles.innerHTML = '<div class="loading">Aucun article négatif</div>';
            return;
        }

        negativeArticles.innerHTML = topNegative.map(article => `
            <div class="article-item negative">
                <h4><a href="${article.link || '#'}" target="_blank">${this.escapeHtml(article.title)}</a></h4>
                <p>${this.escapeHtml((article.content || '').substring(0, 100))}...</p>
                <div class="article-meta">
                    <small>Source: ${this.escapeHtml(article.feed)} • ${new Date(article.date).toLocaleDateString('fr-FR')}</small>
                </div>
                <div class="sentiment-badge negative">
                    😞 Score: ${(article.sentiment?.score || 0).toFixed(2)} | Confiance: ${(article.sentiment?.confidence || 0).toFixed(2)}
                </div>
            </div>
        `).join('');
    }

    // APPRENTISSAGE AUTOMATIQUE - Méthodes
    async updateLearningTab() {
        await this.updateLearningStats();
        this.updateLearnedWords();
    }

    async updateLearningStats() {
        const learningStats = document.getElementById('learningStats');
        if (!learningStats) return;

        try {
            const response = await this.apiCall('GET', '/api/sentiment/stats');
            
            if (response.success) {
                const stats = response.learningStats;
                learningStats.innerHTML = `
                    <div class="learning-stats-grid">
                        <div class="learning-stat">
                            <div class="stat-number">${stats.totalWords}</div>
                            <div class="stat-label">Mots dans le lexique</div>
                        </div>
                        <div class="learning-stat">
                            <div class="stat-number">${stats.learnedWords}</div>
                            <div class="stat-label">Mots appris</div>
                        </div>
                        <div class="learning-stat">
                            <div class="stat-number">${stats.totalUsage}</div>
                            <div class="stat-label">Utilisations totales</div>
                        </div>
                        <div class="learning-stat">
                            <div class="stat-number">${stats.averageConfidence}</div>
                            <div class="stat-label">Confiance moyenne</div>
                        </div>
                        <div class="learning-stat">
                            <div class="stat-number">${stats.learningRate}</div>
                            <div class="stat-label">Taux d'apprentissage</div>
                        </div>
                        <div class="learning-stat">
                            <div class="stat-date">${new Date(stats.lastUpdated).toLocaleDateString('fr-FR')}</div>
                            <div class="stat-label">Dernière mise à jour</div>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Erreur stats apprentissage:', error);
            learningStats.innerHTML = '<div class="error">Erreur de chargement des statistiques</div>';
        }
    }

    async updateLearnedWords() {
        const learnedWords = document.getElementById('learnedWords');
        if (!learnedWords) return;

        try {
            const response = await this.apiCall('GET', '/api/sentiment/stats');
            
            if (response.success && response.lexiconInfo.usageStats) {
                const usageStats = response.lexiconInfo.usageStats;
                const learnedWordsList = Object.entries(usageStats)
                    .filter(([word, stats]) => stats.usageCount > 2)
                    .sort((a, b) => b[1].usageCount - a[1].usageCount)
                    .slice(0, 20);

                if (learnedWordsList.length === 0) {
                    learnedWords.innerHTML = '<div class="loading">Aucun mot appris pour le moment</div>';
                    return;
                }

                learnedWords.innerHTML = `
                    <div class="learned-words-list">
                        ${learnedWordsList.map(([word, stats]) => `
                            <div class="learned-word-item">
                                <span class="word">"${this.escapeHtml(word)}"</span>
                                <span class="usage-count">${stats.usageCount} utilisations</span>
                                <span class="confidence">Confiance: ${this.calculateWordConfidence(stats).toFixed(2)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        } catch (error) {
            console.error('Erreur mots appris:', error);
            learnedWords.innerHTML = '<div class="error">Erreur de chargement des mots appris</div>';
        }
    }

    calculateWordConfidence(stats) {
        const usageCount = stats.usageCount || 0;
        const consistency = stats.consistency || 0.5;
        return Math.min(0.95, 0.3 + (Math.min(usageCount, 20) * 0.03) + (consistency * 0.4));
    }

    async learnFromCorrection() {
        const textInput = document.getElementById('learningText');
        const scoreInput = document.getElementById('expectedScore');
        const resultDiv = document.getElementById('learningResult');

        if (!textInput || !scoreInput || !resultDiv) return;

        const text = textInput.value.trim();
        const expectedScore = parseFloat(scoreInput.value);

        if (!text) {
            this.showMessage('❌ Veuillez entrer un texte', 'error');
            return;
        }

        try {
            resultDiv.innerHTML = '<div class="loading">Apprentissage en cours...</div>';
            
            const response = await this.apiCall('POST', '/api/sentiment/learn', {
                text, 
                expectedScore 
            });

            if (response.success) {
                const errorDisplay = response.error ? response.error.toFixed(3) : 'N/A';
                
                resultDiv.innerHTML = `
                    <div class="success">
                        ✅ Correction appliquée! 
                        <br>Erreur: ${errorDisplay}
                    </div>
                `;
                this.showMessage('🎓 Apprentissage réussi!', 'success');
                await this.updateLearningStats();
                await this.updateLearnedWords();
                
                // Vider le champ de texte après apprentissage
                textInput.value = '';
            } else {
                throw new Error(response.error || 'Erreur inconnue');
            }
        } catch (error) {
            console.error('Erreur apprentissage:', error);
            resultDiv.innerHTML = `<div class="error">❌ Erreur: ${error.message}</div>`;
            this.showMessage('❌ Erreur lors de l\'apprentissage', 'error');
        }
    }

    async resetLearning() {
        if (!confirm('Êtes-vous sûr de vouloir réinitialiser l\'apprentissage ? Toutes les statistiques seront perdues.')) {
            return;
        }

        try {
            const response = await this.apiCall('POST', '/api/sentiment/reset');
            
            if (response.success) {
                this.showMessage('🔄 Apprentissage réinitialisé!', 'success');
                await this.updateLearningStats();
                await this.updateLearnedWords();
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error('Erreur réinitialisation:', error);
            this.showMessage('❌ Erreur lors de la réinitialisation', 'error');
        }
    }

    async showLearningStats() {
        const modal = document.getElementById('learningStatsModal');
        const modalContent = document.getElementById('modalLearningStats');

        if (!modal || !modalContent) return;

        try {
            modalContent.innerHTML = '<div class="loading">Chargement...</div>';
            modal.style.display = 'block';

            const response = await this.apiCall('GET', '/api/sentiment/stats');

            if (response.success) {
                const stats = response.learningStats;
                modalContent.innerHTML = `
                    <div class="detailed-stats">
                        <div class="stat-item">
                            <strong>Version du lexique:</strong> ${stats.version}
                        </div>
                        <div class="stat-item">
                            <strong>Mots total:</strong> ${stats.totalWords}
                        </div>
                        <div class="stat-item">
                            <strong>Mots appris:</strong> ${stats.learnedWords}
                        </div>
                        <div class="stat-item">
                            <strong>Utilisations totales:</strong> ${stats.totalUsage}
                        </div>
                        <div class="stat-item">
                            <strong>Confiance moyenne:</strong> ${stats.averageConfidence}
                        </div>
                        <div class="stat-item">
                            <strong>Taux d'apprentissage:</strong> ${stats.learningRate}
                        </div>
                        <div class="stat-item">
                            <strong>Dernière mise à jour:</strong> ${new Date(stats.lastUpdated).toLocaleString('fr-FR')}
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Erreur stats détaillées:', error);
            modalContent.innerHTML = '<div class="error">Erreur de chargement</div>';
        }
    }

    // Méthodes utilitaires
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showMessage(message, type = 'info') {
        if (window.app && window.app.setMessage) {
            window.app.setMessage(message, type);
        } else {
            console.log(`${type}: ${message}`);
        }
    }

    async apiCall(method, endpoint, data = null) {
        // Utilise l'apiCall de app.js si disponible, sinon fait un fetch direct
        if (window.app && window.app.apiCall) {
            return await window.app.apiCall(method, endpoint, data);
        } else {
            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: data ? JSON.stringify(data) : null
            });
            return await response.json();
        }
    }

    // Analyse des articles - méthode principale
    analyzeArticles(articles, themes) {
        console.log('🔍 Analyse des articles avec le moteur hérité...');
        
        this.currentAnalysis = {
            themes: {},
            summary: {
                totalArticles: articles.length,
                totalPositive: 0,
                totalNegative: 0,
                totalNeutral: 0
            }
        };

        // Initialiser la structure des thèmes
        themes.forEach(theme => {
            this.currentAnalysis.themes[theme.name] = {
                name: theme.name,
                color: theme.color,
                sentiment: {
                    positive: 0,
                    negative: 0,
                    neutral: 0,
                    articles: [],
                    averageScore: 0,
                    averageConfidence: 0
                }
            };
        });

        // Analyser chaque article
        articles.forEach(article => {
            this.processArticle(article);
        });

        // Calculer les moyennes
        this.calculateAverages();

        console.log('✅ Analyse terminée avec le moteur hérité');
        return this.currentAnalysis;
    }

    processArticle(article) {
        // Récupérer le sentiment de manière plus robuste
        let sentiment = article.sentiment || { sentiment: "neutral", score: 0, confidence: 0.5 };

        // Si pas de sentiment défini, essayer de le calculer
        if (!sentiment.sentiment || sentiment.sentiment === "neutral") {
            sentiment = this.calculateSentimentFromContent(article);
        }
        
        // Mettre à jour les totaux globaux
        switch (sentiment.sentiment) {
            case 'positive':
            case 'positive_strong':
            case 'positive_weak':
                this.currentAnalysis.summary.totalPositive++;
                break;
            case 'negative':
            case 'negative_strong':
            case 'negative_weak':
                this.currentAnalysis.summary.totalNegative++;
                break;
            default:
                this.currentAnalysis.summary.totalNeutral++;
                break;
        }

        // Associer l'article à ses thèmes
        (article.themes || []).forEach(themeName => {
            if (this.currentAnalysis.themes[themeName]) {
                const theme = this.currentAnalysis.themes[themeName];

                theme.sentiment.articles.push({
                    ...article,
                    sentiment: sentiment // Utiliser le sentiment calculé
                });
                
                // Ajouter l'article au thème
                theme.sentiment.articles.push(article);

                // Mettre à jour les compteurs avec la nouvelle logique
                switch (sentiment.sentiment) {
                    case 'positive':
                    case 'positive_strong':
                    case 'positive_weak':
                        theme.sentiment.positive++;
                        break;
                    case 'negative':
                    case 'negative_strong':
                    case 'negative_weak':
                        theme.sentiment.negative++;
                        break;
                    default:
                        theme.sentiment.neutral++;
                        break;
                }
            }
        });
    }

    // AJOUTER cette fonction pour calculer le sentiment depuis le contenu
    calculateSentimentFromContent(article) {
        const text = (article.title + ' ' + (article.summary || '') + ' ' + (article.content || '')).toLowerCase();

        // Listes étendues de mots-clés avec poids
        const positivePatterns = [
            { words: ['succès', 'réussite', 'victoire', 'triomphe', 'accomplissement'], weight: 2 },
            { words: ['progrès', 'amélioration', 'croissance', 'développement', 'innovation'], weight: 1.5 },
            { words: ['paix', 'accord', 'coopération', 'collaboration', 'entente'], weight: 1.5 },
            { words: ['bon', 'excellent', 'remarquable', 'exceptionnel', 'formidable'], weight: 1 },
            { words: ['hausse', 'augmentation', 'montée', 'croissance'], weight: 1 }
        ];

        const negativePatterns = [
            { words: ['guerre', 'conflit', 'combat', 'affrontement', 'hostilités'], weight: 3 },
            { words: ['crise', 'catastrophe', 'désastre', 'tragédie', 'calamité'], weight: 2.5 },
            { words: ['mort', 'décès', 'victime', 'blessé', 'tué'], weight: 2.5 },
            { words: ['attaque', 'assaut', 'raid', 'offensive', 'agression'], weight: 2 },
            { words: ['tension', 'conflit', 'dispute', 'controverse', 'polémique'], weight: 1.5 },
            { words: ['problème', 'difficulté', 'obstacle', 'échec', 'échec'], weight: 1 }
        ];

        let positiveScore = 0;
        let negativeScore = 0;

        // Calcul des scores avec poids
        positivePatterns.forEach(pattern => {
            pattern.words.forEach(word => {
                if (text.includes(word)) {
                    positiveScore += pattern.weight;
                }
            });
        });

        negativePatterns.forEach(pattern => {
            pattern.words.forEach(word => {
                if (text.includes(word)) {
                    negativeScore += pattern.weight;
                }
            });
        });

        // Score final
        const totalScore = positiveScore + negativeScore;
        if (totalScore === 0) {
            return { sentiment: "neutral", score: 0, confidence: 0.3 };
        }

        const normalizedScore = (positiveScore - negativeScore) / totalScore;

        // Seuils ajustés
        if (normalizedScore > 0.3) {
            return { sentiment: "positive", score: normalizedScore, confidence: 0.8 };
        } else if (normalizedScore < -0.3) {
            return { sentiment: "negative", score: normalizedScore, confidence: 0.8 };
        } else {
            return { sentiment: "neutral", score: normalizedScore, confidence: 0.5 };
        }
    }

    calculateAverages() {
        Object.values(this.currentAnalysis.themes).forEach(theme => {
            const sentiment = theme.sentiment;
            if (sentiment.articles.length > 0) {
                const totalScore = sentiment.articles.reduce((sum, article) => 
                    sum + (article.sentiment?.score || 0), 0);
                const totalConfidence = sentiment.articles.reduce((sum, article) => 
                    sum + (article.sentiment?.confidence || 0), 0);
                
                sentiment.averageScore = totalScore / sentiment.articles.length;
                sentiment.averageConfidence = totalConfidence / sentiment.articles.length;
            }
        });
    }
}


// Export global
window.AnalysisEngine = AnalysisEngine;
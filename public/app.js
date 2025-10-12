// Déclarer les fonctions globales d'abord
function showTab(tabName, event) {
    console.log('Changement d\'onglet:', tabName);
    
    // Masquer tous les onglets
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Afficher l'onglet sélectionné
    const tabElement = document.getElementById(tabName + 'Tab');
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    // Utiliser event.currentTarget pour l'élément cliqué
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // Charger les données spécifiques à l'onglet
    if (window.app) {
        if (tabName === 'feeds') {
            window.app.loadFeeds();
        } else if (tabName === 'themes') {
            window.app.loadThemes();
        } else if (tabName === 'trends' || tabName === 'metrics') {
            window.app.updateAdvancedMetrics();
        } else if (tabName === 'sentiment') {
            window.app.updateSentimentAnalysis();
        } else if (tabName === 'learning') {
            window.app.updateLearningTab();
        }
    }
}

function addFeed() {
    if (window.app) {
        window.app.addFeed();
    } else {
        console.error('App non initialisée');
        alert('Erreur: Application non initialisée. Rechargez la page.');
    }
}

function addTheme() {
    if (window.app) {
        window.app.addTheme();
    } else {
        console.error('App non initialisée');
        alert('Erreur: Application non initialisée. Rechargez la page.');
    }
}

// Classe principale avec analyse de sentiment
class RSSAggregator {
    constructor() {
        this.themeChart = null;
        this.timelineChart = null;
        this.autoRefreshInterval = null;
        this.currentAnalysis = null;
        console.log('RSSAggregator initialisé avec analyse de sentiment');
    }

    async init() {
        console.log('Démarrage de l\'application...');
        try {
            this.setupColorPresets();
            this.setupLearningSlider();
            this.setupModal();
            await this.loadData();
            this.setupEventListeners();
            this.startAutoRefresh();
            this.showMessage('✅ Application prête! Analyse de sentiment activée.', 'success');
        } catch (error) {
            console.error('Erreur initialisation:', error);
            this.showMessage('❌ Erreur lors de l\'initialisation: ' + error.message, 'error');
        }
    }

    setupColorPresets() {
        const presets = document.querySelectorAll('.color-preset');
        const colorInput = document.getElementById('themeColor');
        
        if (!colorInput || !presets.length) return;
        
        presets.forEach(preset => {
            preset.addEventListener('click', () => {
                const color = preset.getAttribute('data-color');
                colorInput.value = color;
                
                presets.forEach(p => p.classList.remove('active'));
                preset.classList.add('active');
            });
        });
    }

    setupLearningSlider() {
        const slider = document.getElementById('expectedScore');
        const valueDisplay = document.getElementById('scoreValue');
        
        if (slider && valueDisplay) {
            slider.addEventListener('input', () => {
                valueDisplay.textContent = parseFloat(slider.value).toFixed(2);
            });
        }
    }

    setupModal() {
        const modal = document.getElementById('learningStatsModal');
        const closeBtn = modal.querySelector('.close');
        
        closeBtn.onclick = () => modal.style.display = 'none';
        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    async loadData() {
        try {
            this.showLoading();
            console.log('Chargement des données...');
            
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/articles');
            } catch (e) {
                response = await fetch('./api/articles');
            }
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Données reçues:', data);
            
            this.currentAnalysis = data.analysis;
            this.updateStats(data.analysis);
            this.updateCharts(data.analysis);
            this.displayArticles(data.articles);
            this.updateLastUpdate(data.lastUpdate);
            this.updateRefreshButton(false);
            this.updateAdvancedMetrics();
            this.updateSentimentAnalysis();
            
        } catch (error) {
            console.error('Erreur lors du chargement:', error);
            this.showMessage('❌ Erreur de chargement: ' + error.message, 'error');
            
            // CORRECTION : Afficher des données par défaut en cas d'erreur
            this.currentAnalysis = {
                themes: {},
                timeline: {},
                totalArticles: 0,
                trends: {},
                metrics: {
                    keywordEffectiveness: {},
                    correlations: {},
                    seasonality: {},
                    sentiment: {},
                    learningStats: {}
                }
            };
            this.updateStats(this.currentAnalysis);
            this.updateCharts(this.currentAnalysis);
        }
    }

    // méthode deeplearning mots-cles
    async refreshLearningStats() {
        await this.updateLearningStats();
        await this.updateLearnedWords();
    }

    async manualRefresh() {
        try {
            this.updateRefreshButton(true);
            this.showMessage('🔄 Actualisation...', 'info');
            
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/refresh', { method: 'POST' });
            } catch (e) {
                response = await fetch('./api/refresh', { method: 'POST' });
            }
            
            const result = await response.json();

            if (result.success) {
                await this.loadData();
                this.showMessage('✅ Actualisé! Tendances recalculées.', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Erreur rafraîchissement:', error);
            this.showMessage('❌ Erreur lors du rafraîchissement', 'error');
            this.updateRefreshButton(false);
        }
    }

    async exportData(format) {
        try {
            this.showMessage(`📤 Préparation de l'export ${format.toUpperCase()}...`, 'info');
            
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch(`/api/export/${format}`);
            } catch (e) {
                response = await fetch(`./api/export/${format}`);
            }
            
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `rss-export.${format}`;
            
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showMessage(`✅ Export ${format.toUpperCase()} téléchargé!`, 'success');
            
        } catch (error) {
            console.error('Erreur export:', error);
            this.showMessage(`❌ Erreur lors de l'export ${format.toUpperCase()}`, 'error');
        }
    }

    // ANALYSE DE SENTIMENT - Méthodes principales
    updateSentimentAnalysis() {
        console.log('Mise à jour de l\'analyse de sentiment');
        if (!this.currentAnalysis) {
            console.log('Aucune analyse disponible');
            return;
        }

        this.updateSentimentOverview();
        this.updateSentimentByTheme();
        this.updateSentimentArticles();
    }

    updateSentimentOverview() {
        const sentimentOverview = document.getElementById('sentimentOverview');
        if (!sentimentOverview) {
            console.log('Élément sentimentOverview non trouvé');
            return;
        }

        let totalPositive = 0;
        let totalNegative = 0;
        let totalNeutral = 0;
        let totalArticles = 0;

        Object.keys(this.currentAnalysis.themes).forEach(themeName => {
            const theme = this.currentAnalysis.themes[themeName];
            if (theme.sentiment) {
                totalPositive += theme.sentiment.positive || 0;
                totalNegative += theme.sentiment.negative || 0;
                totalNeutral += theme.sentiment.neutral || 0;
                totalArticles += theme.sentiment.articles?.length || 0;
            }
        });

        console.log('Sentiment Overview calculé:', { totalPositive, totalNegative, totalNeutral, totalArticles });

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
                        <span class="sentiment-label">Évolution positive</span>
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
                        <span class="sentiment-label">Évolution Négative</span>
                        <span class="sentiment-value">${negativePercent}%</span>
                        <small>${totalNegative} articles</small>
                    </div>
                </div>
                <div class="sentiment-chart">
                    <div class="sentiment-bar">
                        <div class="sentiment-fill positive" style="width: ${positivePercent}%" title="Évolution positive: ${positivePercent}%"></div>
                        <div class="sentiment-fill neutral" style="width: ${neutralPercent}%" title="Neutre: ${neutralPercent}%"></div>
                        <div class="sentiment-fill negative" style="width: ${negativePercent}%" title="Évolution Négative: ${negativePercent}%"></div>
                    </div>
                    <div class="sentiment-legend">
                        <span>😊 Évolution positive</span>
                        <span>😐 Neutre</span>
                        <span>😞 Évolution Négative</span>
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
            console.log('Élément positiveArticles non trouvé');
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
            console.log('Élément negativeArticles non trouvé');
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
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/sentiment/stats');
            } catch (e) {
                response = await fetch('./api/sentiment/stats');
            }
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            
            if (data.success) {
                const stats = data.learningStats;
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
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/sentiment/stats');
            } catch (e) {
                response = await fetch('./api/sentiment/stats');
            }
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            
            if (data.success && data.lexiconInfo.usageStats) {
                const usageStats = data.lexiconInfo.usageStats;
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
            
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/sentiment/learn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, expectedScore })
                });
            } catch (e) {
                response = await fetch('./api/sentiment/learn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, expectedScore })
                });
            }

            const result = await response.json();

            if (result.success) {
                const errorDisplay = result.error ? result.error.toFixed(3) : 'N/A';
                
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
                throw new Error(result.error || 'Erreur inconnue');
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
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/sentiment/reset', { method: 'POST' });
            } catch (e) {
                response = await fetch('./api/sentiment/reset', { method: 'POST' });
            }
            
            const result = await response.json();

            if (result.success) {
                this.showMessage('🔄 Apprentissage réinitialisé!', 'success');
                await this.updateLearningStats();
                await this.updateLearnedWords();
            } else {
                throw new Error(result.error);
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

            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/sentiment/stats');
            } catch (e) {
                response = await fetch('./api/sentiment/stats');
            }
            
            const data = await response.json();

            if (data.success) {
                const stats = data.learningStats;
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

    // MÉTHODES EXISTANTES
    showLoading() {
        const statsGrid = document.getElementById('statsGrid');
        const articlesList = document.getElementById('articlesList');
        
        if (statsGrid) statsGrid.innerHTML = '<div class="loading">Chargement...</div>';
        if (articlesList) articlesList.innerHTML = '<div class="loading">Chargement...</div>';
    }

    showMessage(message, type = 'info') {
        const container = document.getElementById('messageContainer');
        if (!container) {
            console.log('Message:', message);
            return;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = type === 'error' ? 'error' : type === 'success' ? 'success' : 'info';
        messageDiv.textContent = message;
        
        container.appendChild(messageDiv);
        
        setTimeout(() => messageDiv.remove(), 5000);
    }

    updateLastUpdate(timestamp) {
        const element = document.getElementById('lastUpdate');
        if (element && timestamp) {
            const date = new Date(timestamp);
            element.textContent = `Dernière actualisation: ${date.toLocaleString('fr-FR')}`;
        }
    }

    updateRefreshButton(isLoading) {
        const btn = document.getElementById('refreshBtn');
        if (btn) {
            if (isLoading) {
                btn.innerHTML = '⏳ Génération...';
                btn.disabled = true;
            } else {
                btn.innerHTML = '🔄 Générer';
                btn.disabled = false;
            }
        }
    }

    updateStats(analysis) {
        const statsGrid = document.getElementById('statsGrid');
        if (!statsGrid) return;

        const totalThemes = Object.keys(analysis.themes || {}).length;
        const themesWithData = Object.keys(analysis.themes || {}).filter(theme => analysis.themes[theme].count > 0).length;
        const totalMatches = Object.values(analysis.themes || {}).reduce((sum, theme) => sum + theme.count, 0);

        // Compter les articles avec sentiment
        let positiveArticles = 0;
        let negativeArticles = 0;
        let neutralArticles = 0;

        Object.keys(analysis.themes || {}).forEach(themeName => {
            const theme = analysis.themes[themeName];
            if (theme.sentiment) {
                positiveArticles += theme.sentiment.positive || 0;
                negativeArticles += theme.sentiment.negative || 0;
                neutralArticles += theme.sentiment.neutral || 0;
            }
        });

        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-number">${analysis.totalArticles || 0}</div>
                <div>Articles analysés</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${themesWithData}/${totalThemes}</div>
                <div>Thèmes actifs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${totalMatches}</div>
                <div>Correspondances</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${positiveArticles}</div>
                <div>Articles positifs</div>
            </div>
        `;
    }

    updateCharts(analysis) {
  console.log('📈 Mise à jour des graphiques:', analysis);
  
  // CORRECTION : Vérifier que les données existent
  if (!analysis || !analysis.themes) {
    console.warn('❌ Aucune donnée pour les graphiques');
    return;
  }
  
  this.updateThemeChart(analysis.themes);
  this.updateTimelineChart(analysis.timeline);
}

updateThemeChart(themes) {
  const ctx = document.getElementById('themeChart');
  if (!ctx) {
    console.log('❌ Canvas themeChart non trouvé');
    return;
  }

  const themeNames = Object.keys(themes || {});
  const themeCounts = themeNames.map(name => themes[name].count);
  const themeColors = themeNames.map(name => themes[name].color || '#6366f1');

  const validThemes = themeNames.filter((name, index) => themeCounts[index] > 0);
  const validCounts = themeCounts.filter(count => count > 0);
  const validColors = themeColors.filter((color, index) => themeCounts[index] > 0);

  if (this.themeChart) this.themeChart.destroy();

  if (validThemes.length === 0) {
    ctx.parentElement.innerHTML = '<p class="loading">Aucune donnée de thème disponible</p>';
    console.log('📊 Aucun thème avec des données');
    return;
  }

  console.log(`📊 Création du graphique thèmes: ${validThemes.length} thèmes valides`);

  this.themeChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: validThemes,
      datasets: [{
        data: validCounts,
        backgroundColor: validColors,
        borderColor: 'white',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 20
          }
        }
      }
    }
  });
}

updateTimelineChart(timeline) {
  const ctx = document.getElementById('timelineChart');
  if (!ctx) {
    console.log('❌ Canvas timelineChart non trouvé');
    return;
  }

  const dates = Object.keys(timeline || {}).sort((a, b) => new Date(a) - new Date(b));
  if (dates.length === 0) {
    ctx.parentElement.innerHTML = '<p class="loading">Aucune donnée temporelle disponible</p>';
    console.log('📊 Aucune donnée de timeline');
    return;
  }

  const themesWithData = new Set();
  dates.forEach(date => {
    Object.keys(timeline[date]).forEach(theme => {
      if (timeline[date][theme] > 0) {
        themesWithData.add(theme);
      }
    });
  });

  const themes = Array.from(themesWithData);
  
  if (this.timelineChart) this.timelineChart.destroy();

  const formattedDates = dates.map(date => {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  });

  const themeColors = themes.map(theme => 
    this.currentAnalysis?.themes[theme]?.color || this.getRandomColor()
  );

  const datasets = themes.map((theme, index) => {
    return {
      label: theme,
      data: dates.map(date => timeline[date][theme] || 0),
      borderColor: themeColors[index],
      backgroundColor: themeColors[index] + '20',
      tension: 0.3,
      fill: false,
      borderWidth: 3
    };
  });

  console.log(`📊 Création du graphique timeline: ${dates.length} dates, ${themes.length} thèmes`);

  this.timelineChart = new Chart(ctx, {
    type: 'line',
    data: { labels: formattedDates, datasets: datasets },
    options: {
      responsive: true,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Nombre d\'articles'
          },
          ticks: {
            stepSize: 1
          }
        },
        x: {
          title: {
            display: true,
            text: 'Date'
          }
        }
      }
    }
  });
}

    getRandomColor() {
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    displayArticles(articles) {
        const articlesList = document.getElementById('articlesList');
        if (!articlesList) return;

        const recentArticles = articles.slice(0, 10);
        
        if (recentArticles.length === 0) {
            articlesList.innerHTML = '<div class="loading">Aucun article</div>';
            return;
        }

        articlesList.innerHTML = recentArticles.map(article => {
            const sentiment = article.sentiment;
            const sentimentClass = sentiment ? `sentiment-${sentiment.sentiment}` : '';
            const sentimentBadge = sentiment ? `
                <div class="sentiment-badge ${sentimentClass}">
                    ${sentiment.sentiment === 'positive' ? '😊' : sentiment.sentiment === 'negative' ? '😞' : '😐'} 
                    Score: ${(sentiment.score || 0).toFixed(2)}
                </div>
            ` : '';

            return `
                <div class="article-item ${sentimentClass}">
                    <h4><a href="${article.link}" target="_blank">${this.escapeHtml(article.title)}</a></h4>
                    <p>${this.escapeHtml((article.content || '').substring(0, 100))}...</p>
                    <div class="article-meta">
                        <small>Source: ${this.escapeHtml(article.feed)} • ${new Date(article.pubDate).toLocaleDateString('fr-FR')}</small>
                    </div>
                    ${sentimentBadge}
                </div>
            `;
        }).join('');
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async loadFeeds() {
        try {
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/feeds');
            } catch (e) {
                response = await fetch('./api/feeds');
            }
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const feeds = await response.json();
            const feedsList = document.getElementById('feedsList');
            
            if (!feedsList) return;
            
            if (feeds.length === 0) {
                feedsList.innerHTML = '<div class="loading">Aucun flux</div>';
                return;
            }
            
            feedsList.innerHTML = feeds.map(feed => `
                <div class="feed-item">
                    <div class="feed-url">${this.escapeHtml(feed)}</div>
                    <button class="delete" onclick="window.app.removeFeed('${this.escapeHtml(feed)}')">Supprimer</button>
                </div>
            `).join('');
        } catch (error) {
            console.error('Erreur flux:', error);
            this.showMessage('❌ Erreur lors du chargement des flux', 'error');
        }
    }

    async loadThemes() {
        try {
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/themes');
            } catch (e) {
                response = await fetch('./api/themes');
            }
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const themes = await response.json();
            const themesList = document.getElementById('themesList');
            
            if (!themesList) return;
            
            if (themes.length === 0) {
                themesList.innerHTML = '<div class="loading">Aucun thème</div>';
                return;
            }
            
            themesList.innerHTML = themes.map(theme => `
                <div class="theme-item" style="--theme-color: ${theme.color || '#6366f1'}">
                    <div style="flex-grow: 1;">
                        <div class="theme-header">
                            <span class="theme-color-indicator" style="background-color: ${theme.color || '#6366f1'}"></span>
                            <span class="theme-name">${this.escapeHtml(theme.name)}</span>
                        </div>
                        <p style="margin: 0.5rem 0 0 0;">Mots-clés: ${theme.keywords.map(kw => 
                            `<span class="theme-tag" style="background-color: ${theme.color || '#6366f1'}">${this.escapeHtml(kw)}</span>`
                        ).join('')}</p>
                    </div>
                    <button class="delete" onclick="window.app.removeTheme('${theme.id}')">Supprimer</button>
                </div>
            `).join('');
        } catch (error) {
            console.error('Erreur thèmes:', error);
            this.showMessage('❌ Erreur lors du chargement des thèmes', 'error');
        }
    }

    async addFeed() {
        const urlInput = document.getElementById('feedUrl');
        const url = urlInput?.value.trim();

        if (!url) {
            this.showMessage('❌ URL requise', 'error');
            return;
        }

        try {
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/feeds', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
            } catch (e) {
                response = await fetch('./api/feeds', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
            }

            const result = await response.json();

            if (result.success) {
                if (urlInput) urlInput.value = '';
                this.showMessage('✅ Flux ajouté!', 'success');
                await this.loadFeeds();
                await this.loadData();
            } else {
                this.showMessage('❌ Erreur: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Erreur ajout flux:', error);
            this.showMessage('❌ Erreur lors de l\'ajout du flux', 'error');
        }
    }

    async removeFeed(url) {
        if (!confirm('Supprimer ce flux?')) return;

        try {
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/feeds', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
            } catch (e) {
                response = await fetch('./api/feeds', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
            }

            if (!response.ok) throw new Error('Erreur réseau');

            const result = await response.json();
            
            if (result.success) {
                this.showMessage('✅ Flux supprimé!', 'success');
                await this.loadFeeds();
                await this.loadData();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Erreur suppression flux:', error);
            this.showMessage('❌ Erreur lors de la suppression du flux', 'error');
        }
    }

    async addTheme() {
        const nameInput = document.getElementById('themeName');
        const keywordsInput = document.getElementById('themeKeywords');
        const colorInput = document.getElementById('themeColor');

        const name = nameInput?.value.trim();
        const keywords = keywordsInput?.value.trim();
        const color = colorInput?.value;

        if (!name || !keywords) {
            this.showMessage('❌ Nom et mots-clés requis', 'error');
            return;
        }

        try {
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/themes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, keywords, color })
                });
            } catch (e) {
                response = await fetch('./api/themes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, keywords, color })
                });
            }

            const result = await response.json();

            if (result.success) {
                if (nameInput) nameInput.value = '';
                if (keywordsInput) keywordsInput.value = '';
                if (colorInput) colorInput.value = '#6366f1';
                this.showMessage('✅ Thème créé!', 'success');
                await this.loadThemes();
                await this.loadData();
            } else {
                this.showMessage('❌ Erreur: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Erreur ajout thème:', error);
            this.showMessage('❌ Erreur lors de la création du thème', 'error');
        }
    }

    async removeTheme(id) {
        if (!confirm('Supprimer ce thème?')) return;

        try {
            // CORRECTION : Essayer différents chemins d'API
            let response;
            try {
                response = await fetch('/api/themes/' + id, { method: 'DELETE' });
            } catch (e) {
                response = await fetch('./api/themes/' + id, { method: 'DELETE' });
            }
            
            if (!response.ok) throw new Error('Erreur réseau');

            const result = await response.json();
            
            if (result.success) {
                this.showMessage('✅ Thème supprimé!', 'success');
                await this.loadThemes();
                await this.loadData();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Erreur suppression thème:', error);
            this.showMessage('❌ Erreur lors de la suppression du thème', 'error');
        }
    }

    startAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        
        this.autoRefreshInterval = setInterval(() => {
            this.loadData();
        }, 30000);
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.manualRefresh();
            }
        });
    }

    // MÉTHODES DES MÉTRIQUES AVANCÉES
    updateAdvancedMetrics() {
        if (!this.currentAnalysis) return;

        this.updateTrendsTable();
        this.updateGrowthAnalysis();
        this.updateKeywordMetrics();
        this.updateCorrelations();
        this.updateSeasonality();
    }

    updateTrendsTable() {
        const trendsTable = document.getElementById('trendsTable');
        if (!trendsTable || !this.currentAnalysis.trends) return;

        const themes = Object.keys(this.currentAnalysis.themes).filter(theme => 
            this.currentAnalysis.themes[theme].count > 0
        );

        if (themes.length === 0) {
            trendsTable.innerHTML = '<div class="loading">Aucun thème avec des données</div>';
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Thème</th>
                        <th>Articles</th>
                        <th>Tendance</th>
                        <th>Évolution</th>
                        <th>Précédent</th>
                    </tr>
                </thead>
                <tbody>
        `;

        themes.forEach(themeName => {
            const theme = this.currentAnalysis.themes[themeName];
            const trend = this.currentAnalysis.trends[themeName];
            
            let trendIndicator = '';
            let trendClass = 'trend-stable';
            
            if (trend) {
                if (trend.trend === 'up') {
                    trendIndicator = `🔼 +${trend.growth}%`;
                    trendClass = 'trend-up';
                } else if (trend.trend === 'down') {
                    trendIndicator = `🔽 ${trend.growth}%`;
                    trendClass = 'trend-down';
                } else {
                    trendIndicator = '➡️ Stable';
                }
            } else {
                trendIndicator = '🆕 Nouveau';
                trendClass = 'trend-up';
            }

            html += `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span class="theme-color-indicator" style="background-color: ${theme.color || '#6366f1'}"></span>
                            ${this.escapeHtml(themeName)}
                        </div>
                    </td>
                    <td><strong>${theme.count}</strong></td>
                    <td>
                        <span class="trend-indicator ${trendClass}">
                            ${trendIndicator}
                        </span>
                    </td>
                    <td>${trend ? `${trend.growth}%` : 'N/A'}</td>
                    <td>${trend ? trend.previousCount : '0'}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        trendsTable.innerHTML = html;
    }

    updateGrowthAnalysis() {
        const growthThemes = document.getElementById('growthThemes');
        const declineThemes = document.getElementById('declineThemes');
        
        if (!growthThemes || !declineThemes || !this.currentAnalysis.trends) return;

        const themes = Object.keys(this.currentAnalysis.themes).filter(theme => 
            this.currentAnalysis.themes[theme].count > 0
        );

        const growthItems = [];
        const declineItems = [];

        themes.forEach(themeName => {
            const theme = this.currentAnalysis.themes[themeName];
            const trend = this.currentAnalysis.trends[themeName];
            
            if (!trend) {
                growthItems.push({
                    name: themeName,
                    count: theme.count,
                    growth: 100,
                    color: theme.color
                });
            } else if (trend.trend === 'up' && trend.growth > 5) {
                growthItems.push({
                    name: themeName,
                    count: theme.count,
                    growth: trend.growth,
                    color: theme.color
                });
            } else if (trend.trend === 'down' && trend.growth < -5) {
                declineItems.push({
                    name: themeName,
                    count: theme.count,
                    growth: trend.growth,
                    color: theme.color
                });
            }
        });

        growthItems.sort((a, b) => b.growth - a.growth);
        declineItems.sort((a, b) => a.growth - b.growth);

        if (growthItems.length > 0) {
            growthThemes.innerHTML = growthItems.map(item => `
                <div class="trend-item growth">
                    <div class="trend-info">
                        <div class="trend-name">
                            <span class="theme-color-indicator" style="background-color: ${item.color}"></span>
                            ${this.escapeHtml(item.name)}
                        </div>
                        <div class="trend-stats">
                            ${item.count} articles • +${item.growth}% de croissance
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            growthThemes.innerHTML = '<div class="loading">Aucun thème en croissance significative</div>';
        }

        if (declineItems.length > 0) {
            declineThemes.innerHTML = declineItems.map(item => `
                <div class="trend-item decline">
                    <div class="trend-info">
                        <div class="trend-name">
                            <span class="theme-color-indicator" style="background-color: ${item.color}"></span>
                            ${this.escapeHtml(item.name)}
                        </div>
                        <div class="trend-stats">
                            ${item.count} articles • ${item.growth}% de baisse
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            declineThemes.innerHTML = '<div class="loading">Aucun thème en baisse significative</div>';
        }
    }

    updateKeywordMetrics() {
        const keywordMetrics = document.getElementById('keywordMetrics');
        if (!keywordMetrics || !this.currentAnalysis.metrics?.keywordEffectiveness) return;

        const themes = Object.keys(this.currentAnalysis.themes).filter(theme => 
            this.currentAnalysis.themes[theme].count > 0
        );

        if (themes.length === 0) {
            keywordMetrics.innerHTML = '<div class="loading">Aucune donnée disponible</div>';
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Thème</th>
                        <th>Mot-clé</th>
                        <th>Articles capturés</th>
                        <th>Efficacité</th>
                    </tr>
                </thead>
                <tbody>
        `;

        themes.forEach(themeName => {
            const theme = this.currentAnalysis.themes[themeName];
            const keywordData = this.currentAnalysis.metrics.keywordEffectiveness[themeName];
            
            if (keywordData) {
                const keywords = Object.keys(keywordData).sort((a, b) => 
                    keywordData[b].matches - keywordData[a].matches
                ).slice(0, 3);

                keywords.forEach((keyword, index) => {
                    const data = keywordData[keyword];
                    const effectiveness = parseFloat(data.effectiveness) || 0;
                    
                    html += `
                        <tr>
                            ${index === 0 ? `<td rowspan="${keywords.length}">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span class="theme-color-indicator" style="background-color: ${theme.color || '#6366f1'}"></span>
                                    ${this.escapeHtml(themeName)}
                                </div>
                            </td>` : ''}
                            <td><strong>${this.escapeHtml(keyword)}</strong></td>
                            <td>${data.matches}</td>
                            <td>
                                <span class="keyword-effectiveness">
                                    ${effectiveness}% des articles
                                </span>
                            </td>
                        </tr>
                    `;
                });
            }
        });

        html += '</tbody></table>';
        keywordMetrics.innerHTML = html;
    }

    updateCorrelations() {
        const correlationsMatrix = document.getElementById('correlationsMatrix');
        if (!correlationsMatrix || !this.currentAnalysis.metrics?.correlations) return;

        const themes = Object.keys(this.currentAnalysis.themes).filter(theme => 
            this.currentAnalysis.themes[theme].count > 0
        );

        if (themes.length < 2) {
            correlationsMatrix.innerHTML = '<div class="loading">Au moins 2 thèmes requis pour l\'analyse des corrélations</div>';
            return;
        }

        const strongCorrelations = [];
        
        themes.forEach(theme1 => {
            themes.forEach(theme2 => {
                if (theme1 !== theme2) {
                    const correlation = this.currentAnalysis.metrics.correlations[theme1]?.[theme2] || 0;
                    if (correlation > 0) {
                        strongCorrelations.push({
                            theme1,
                            theme2,
                            strength: correlation
                        });
                    }
                }
            });
        });

        strongCorrelations.sort((a, b) => b.strength - a.strength);
        const topCorrelations = strongCorrelations.slice(0, 6);

        if (topCorrelations.length > 0) {
            correlationsMatrix.innerHTML = topCorrelations.map(corr => {
                const theme1Color = this.currentAnalysis.themes[corr.theme1]?.color || '#6366f1';
                const theme2Color = this.currentAnalysis.themes[corr.theme2]?.color || '#6366f1';
                
                return `
                    <div class="correlation-item">
                        <div class="correlation-themes">
                            <span style="color: ${theme1Color}">${this.escapeHtml(corr.theme1)}</span>
                            <br>↔<br>
                            <span style="color: ${theme2Color}">${this.escapeHtml(corr.theme2)}</span>
                        </div>
                        <div class="correlation-strength">
                            ${corr.strength}x
                        </div>
                        <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.5rem;">
                            co-occurrences
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            correlationsMatrix.innerHTML = '<div class="loading">Aucune corrélation significative détectée</div>';
        }
    }

    updateSeasonality() {
        const seasonalityAnalysis = document.getElementById('seasonalityAnalysis');
        if (!seasonalityAnalysis || !this.currentAnalysis.metrics?.seasonality) return;

        const monthlyData = this.currentAnalysis.metrics.seasonality;
        const months = Object.keys(monthlyData).sort().slice(-6);

        if (months.length === 0) {
            seasonalityAnalysis.innerHTML = '<div class="loading">Données insuffisantes pour l\'analyse saisonnière</div>';
            return;
        }

        const monthlyTotals = months.map(month => {
            const total = Object.values(monthlyData[month]).reduce((sum, count) => sum + count, 0);
            return { month, total };
        });

        const maxTotal = Math.max(...monthlyTotals.map(m => m.total));

        let html = '<div class="seasonality-analysis">';
        
        monthlyTotals.forEach(({ month, total }) => {
            const percentage = maxTotal > 0 ? (total / maxTotal * 100) : 0;
            const monthName = new Date(month + '-01').toLocaleDateString('fr-FR', { 
                month: 'long', 
                year: 'numeric' 
            });
            
            html += `
                <div class="seasonality-item">
                    <div class="seasonality-period">${monthName}</div>
                    <div class="seasonality-bar">
                        <div class="seasonality-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="seasonality-count">${total}</div>
                </div>
            `;
        });

        html += '</div>';
        seasonalityAnalysis.innerHTML = html;
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM chargé, initialisation...');
    window.app = new RSSAggregator();
    window.app.init().catch(error => {
        console.error('Erreur initialisation:', error);
        alert('Erreur lors du chargement de l\'application. Vérifiez la console pour plus de détails.');
    });
});
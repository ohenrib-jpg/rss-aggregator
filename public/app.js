// Application principale - Agrégateur RSS Thématique + IA V.2.3
const app = {
    // Configuration et état
    config: {
        apiUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:3000' 
            : 'https://rss-aggregator-l7qj.onrender.com',
        refreshInterval: 300000, // 5 minutes
        autoRefresh: true
    },
    
    // Données
    articles: [],
    themes: [],
    feeds: [],
    stats: {},
    charts: {},
    chartManager: null,
    
    // Initialisation
    init: function() {
        console.log('🚀 Initialisation de l\'application...');
        this.loadData();
        this.setupEventListeners();
        this.initializeCharts();
        this.startAutoRefresh();
        this.showMessage('Application chargée avec succès!', 'success');
    },
    
    // Chargement des données depuis l'API
    loadData: function() {
        this.loadThemes();
        this.loadFeeds();
        this.loadArticles();
    },
    
    loadThemes: function() {
    fetch(`${this.config.apiUrl}/api/themes`)
        .then(response => response.json())
        .then(themes => {
            this.themes = themes.map(theme => ({
                name: theme.name,
                keywords: theme.keywords || [],
                color: theme.color || '#6366f1',
                description: theme.description || ''
            }));
            console.log(`📚 ${this.themes.length} thèmes chargés depuis PostgreSQL`);
            this.updateThemesList();
            if (this.chartManager) {
                this.chartManager.updateThemeSelector();
            }
        })
        .catch(error => {
            console.error('❌ Erreur chargement thèmes:', error);
            // Fallback vers localStorage si API échoue
            const savedThemes = localStorage.getItem('themes');
            if (savedThemes) {
                this.themes = JSON.parse(savedThemes);
                console.log(`📚 ${this.themes.length} thèmes chargés depuis localStorage (fallback)`);
            }
        });
},
    
    // Chargement des flux RSS depuis PostgreSQL (au lieu de localStorage)
loadFeeds: function() {
    fetch(`${this.config.apiUrl}/api/feeds`)
        .then(response => response.json())
        .then(feeds => {
            this.feeds = feeds;
            console.log(`📰 ${this.feeds.length} flux RSS chargés depuis PostgreSQL`);
            this.updateFeedsList();
        })
        .catch(error => {
            console.error('❌ Erreur chargement flux:', error);
            // Fallback vers localStorage si API échoue
            const savedFeeds = localStorage.getItem('feeds');
            if (savedFeeds) {
                this.feeds = JSON.parse(savedFeeds);
                console.log(`📰 ${this.feeds.length} flux chargés depuis localStorage (fallback)`);
            }
        });
},

// Chargement des articles depuis PostgreSQL (au lieu de localStorage)
loadArticles: function() {
    fetch(`${this.config.apiUrl}/api/articles`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.articles = data.articles;
                this.stats = {
                    totalArticles: data.totalArticles,
                    lastUpdate: data.lastUpdate
                };
                console.log(`📄 ${this.articles.length} articles chargés depuis PostgreSQL`);
                this.updateDashboard();
                this.updateLastUpdate();
            }
        })
        .catch(error => {
            console.error('❌ Erreur chargement articles:', error);
            // Fallback vers localStorage si API échoue
            const savedArticles = localStorage.getItem('articles');
            if (savedArticles) {
                this.articles = JSON.parse(savedArticles);
                console.log(`📄 ${this.articles.length} articles chargés depuis localStorage (fallback)`);
                this.updateDashboard();
            }
        });
},

// === fonctions saveThemes et saveFeeds ===

saveThemes: function() {
    // Ne plus sauvegarder dans localStorage, c'est géré par PostgreSQL
    console.log('💾 Thèmes gérés par PostgreSQL');
},

saveFeeds: function() {
    // Ne plus sauvegarder dans localStorage, c'est géré par PostgreSQL
    console.log('💾 Flux gérés par PostgreSQL');
},

saveArticles: function() {
    // Ne plus sauvegarder dans localStorage, c'est géré par PostgreSQL
    console.log('💾 Articles gérés par PostgreSQL');
    this.updateLastUpdate();
},
    
    // Initialisation des graphiques
    initializeCharts: function() {
        console.log("📊 Initialisation des graphiques avancés...");
        
        // Initialiser le gestionnaire de graphiques
        if (typeof ChartManager !== 'undefined') {
            this.chartManager = new ChartManager(this);
            console.log("✅ Gestionnaire de graphiques initialisé");
        }
        
        this.createThemeChart();
        this.createTimelineChart();
    },
    
    // Graphique de répartition par thème
    createThemeChart: function() {
        const ctx = document.getElementById('themeChart');
        if (!ctx) return;
        
        const themeData = this.getThemeDistribution();
        
        if (this.charts.themeChart) {
            this.charts.themeChart.destroy();
        }
        
        this.charts.themeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: themeData.labels,
                datasets: [{
                    data: themeData.values,
                    backgroundColor: themeData.colors,
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            usePointStyle: true,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    },
    
    // Graphique d'évolution temporelle
    createTimelineChart: function() {
        const ctx = document.getElementById('timelineChart');
        if (!ctx) return;
        
        const chartData = this.chartManager ? this.chartManager.prepareChartData() : this.prepareBasicTimelineData();
        
        if (this.charts.timelineChart) {
            this.charts.timelineChart.destroy();
        }
        
        this.charts.timelineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.dates,
                datasets: chartData.themes.map(theme => ({
                    label: theme.name,
                    data: theme.values,
                    borderColor: theme.color,
                    backgroundColor: this.hexToRgba(theme.color, 0.1),
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 8,
                    pointBackgroundColor: theme.color,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    intersect: false,
                    axis: 'x'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            boxWidth: 12,
                            padding: 15,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleFont: { size: 12 },
                        bodyFont: { size: 11 },
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return `${label}: ${value} article${value !== 1 ? 's' : ''}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        title: {
                            display: true,
                            text: this.getTimeScaleLabel(),
                            color: '#64748b',
                            font: { size: 12 }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: "Nombre d'articles",
                            color: '#64748b',
                            font: { size: 12 }
                        },
                        ticks: {
                            precision: 0,
                            callback: function(value) {
                                if (value % 1 === 0) {
                                    return value;
                                }
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    }
                }
            }
        });
    },
    
    // Mettre à jour le graphique avec de nouvelles données
    updateTimelineChart: function(chartData) {
        if (!this.charts.timelineChart) {
            this.createTimelineChart();
            return;
        }
        
        this.charts.timelineChart.data.labels = chartData.dates;
        this.charts.timelineChart.data.datasets = chartData.themes.map(theme => ({
            label: theme.name,
            data: theme.values,
            borderColor: theme.color,
            backgroundColor: this.hexToRgba(theme.color, 0.1),
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 8,
            pointBackgroundColor: theme.color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2
        }));
        
        this.charts.timelineChart.options.scales.x.title.text = this.getTimeScaleLabel();
        this.charts.timelineChart.update('none');
    },
    
    // Méthodes utilitaires pour les graphiques
    getTimeScaleLabel: function() {
        if (!this.chartManager) return 'Période';
        
        const scales = {
            'day': 'Date',
            'week': 'Semaine',
            'month': 'Mois',
            'quarter': 'Trimestre'
        };
        return scales[this.chartManager.timeScale] || 'Période';
    },
    
    hexToRgba: function(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    
    // Préparation basique des données (fallback)
    prepareBasicTimelineData: function() {
        if (!this.articles || this.articles.length === 0) {
            return { dates: [], themes: [] };
        }
        
        const dateGroups = {};
        this.articles.forEach(article => {
            const date = new Date(article.pubDate || article.date).toISOString().split('T')[0];
            if (!dateGroups[date]) dateGroups[date] = { themes: {} };
            
            article.themes?.forEach(theme => {
                dateGroups[date].themes[theme] = (dateGroups[date].themes[theme] || 0) + 1;
            });
        });
        
        const dates = Object.keys(dateGroups).sort();
        const themes = this.themes.slice(0, 8);
        
        return {
            dates: dates,
            themes: themes.map(theme => ({
                name: theme.name,
                color: theme.color,
                values: dates.map(date => dateGroups[date]?.themes[theme.name] || 0)
            }))
        };
    },
    
    // Distribution des thèmes pour le graphique circulaire
    getThemeDistribution: function() {
        const themeCounts = {};
        
        this.articles.forEach(article => {
            article.themes?.forEach(theme => {
                themeCounts[theme] = (themeCounts[theme] || 0) + 1;
            });
        });
        
        const themeData = this.themes
            .filter(theme => themeCounts[theme.name] > 0)
            .map(theme => ({
                name: theme.name,
                count: themeCounts[theme.name] || 0,
                color: theme.color
            }))
            .sort((a, b) => b.count - a.count);
        
        return {
            labels: themeData.map(t => t.name),
            values: themeData.map(t => t.count),
            colors: themeData.map(t => t.color)
        };
    },
    
    // Configuration des écouteurs d'événements
    setupEventListeners: function() {
        // Les écouteurs sont gérés par onclick dans le HTML
    },
    
    // Actualisation manuelle
    manualRefresh: function() {
        console.log('🔄 Actualisation manuelle...');
        this.showMessage('Actualisation en cours...', 'info');
        
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '⏳ Chargement...';
        }
        
        fetch(`${this.config.apiUrl}/api/refresh`, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.showMessage('Données actualisées!', 'success');
                    this.loadArticles();
                }
            })
            .catch(error => {
                this.showMessage('Erreur actualisation', 'error');
                console.error('❌ Erreur:', error);
            })
            .finally(() => {
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = '🔄 Actualiser';
                }
            });
    },
    
    // Mise à jour du tableau de bord
    updateDashboard: function() {
        this.updateStatsGrid();
        this.updateArticlesList();
        this.updateFeedsList();
        this.updateThemesList();
        
        // Actualiser les graphiques
        if (this.charts.themeChart) {
            this.createThemeChart();
        }
        
        if (this.chartManager) {
            this.chartManager.refreshChart();
        }
    },
    
    // Mise à jour de la grille de statistiques
    updateStatsGrid: function() {
        const statsGrid = document.getElementById('statsGrid');
        if (!statsGrid) return;
        
        const sentimentDist = this.getSentimentDistribution();
        
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-number">${this.articles.length}</div>
                <div class="stat-label">Articles analysés</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${this.themes.length}</div>
                <div class="stat-label">Thèmes actifs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${this.feeds.length}</div>
                <div class="stat-label">Flux RSS</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${sentimentDist.positive}</div>
                <div class="stat-label">Articles positifs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${sentimentDist.negative}</div>
                <div class="stat-label">Articles négatifs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${Object.values(this.getArticlesByTheme()).reduce((a, b) => a + b, 0)}</div>
                <div class="stat-label">Assignations de thèmes</div>
            </div>
        `;
        
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            lastUpdate.textContent = `Dernière mise à jour: ${new Date().toLocaleString()}`;
        }
    },
    
    // Distribution des sentiments
    getSentimentDistribution: function() {
        const sentiments = this.articles.map(article => parseFloat(article.sentiment?.score) || 0);
        return {
            positive: sentiments.filter(s => s > 0.1).length,
            neutral: sentiments.filter(s => s >= -0.1 && s <= 0.1).length,
            negative: sentiments.filter(s => s < -0.1).length
        };
    },
    
    // Distribution des articles par thème
    getArticlesByTheme: function() {
        const distribution = {};
        this.themes.forEach(theme => {
            distribution[theme.name] = this.articles.filter(article => 
                article.themes?.includes(theme.name)
            ).length;
        });
        return distribution;
    },
    
    // Mise à jour de la liste des articles
    updateArticlesList: function() {
        const articlesList = document.getElementById('articlesList');
        if (!articlesList) return;
        
        const recentArticles = this.articles.slice(0, 20);
        
        if (recentArticles.length === 0) {
            articlesList.innerHTML = '<div class="loading">Aucun article disponible</div>';
            return;
        }
        
        articlesList.innerHTML = recentArticles.map(article => {
            const sentimentClass = this.getSentimentClass(article.sentiment?.score);
            const sentimentBadge = this.getSentimentBadge(article.sentiment);
            const themesBadges = article.themes?.map(theme => 
                `<span class="theme-tag">${theme}</span>`
            ).join('') || '';
            
            return `
                <div class="article-item ${sentimentClass}">
                    <h4><a href="${article.link}" target="_blank">${article.title}</a></h4>
                    <div class="article-meta">
                        <small>📅 ${new Date(article.pubDate).toLocaleDateString()}</small>
                        ${sentimentBadge}
                    </div>
                    <div class="theme-tags">
                        ${themesBadges}
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Mise à jour de la liste des flux
    updateFeedsList: function() {
        const feedsList = document.getElementById('feedsList');
        if (!feedsList) return;
        
        if (this.feeds.length === 0) {
            feedsList.innerHTML = '<div class="loading">Aucun flux configuré</div>';
            return;
        }
        
        feedsList.innerHTML = this.feeds.map(feed => `
            <div class="feed-item">
                <div class="feed-url">${feed}</div>
                <button onclick="app.removeFeed('${feed}')" class="delete">🗑️</button>
            </div>
        `).join('');
    },
    
    // Mise à jour de la liste des thèmes
    updateThemesList: function() {
        const themesList = document.getElementById('themesList');
        if (!themesList) return;
        
        if (this.themes.length === 0) {
            themesList.innerHTML = '<div class="loading">Aucun thème configuré</div>';
            return;
        }
        
        themesList.innerHTML = this.themes.map(theme => `
            <div class="theme-item" style="--theme-color: ${theme.color}">
                <div class="theme-header">
                    <span class="theme-color-indicator" style="background-color: ${theme.color}"></span>
                    <span class="theme-name">${theme.name}</span>
                </div>
                <div class="theme-keywords">
                    <small>Mots-clés: ${theme.keywords.slice(0, 3).join(', ')}${theme.keywords.length > 3 ? '...' : ''}</small>
                </div>
                <button onclick="app.removeTheme('${theme.name}')" class="delete">🗑️</button>
            </div>
        `).join('');
    },
    
    // Gestion des classes de sentiment
    getSentimentClass: function(score) {
        const s = parseFloat(score) || 0;
        if (s > 0.1) return 'positive';
        if (s < -0.1) return 'negative';
        return 'neutral';
    },
    
    // Génération du badge de sentiment
    getSentimentBadge: function(sentiment) {
        const score = parseFloat(sentiment?.score) || 0;
        let text, emoji;
        
        if (score > 0.1) {
            text = 'Positif';
            emoji = '😊';
        } else if (score < -0.1) {
            text = 'Négatif';
            emoji = '😞';
        } else {
            text = 'Neutre';
            emoji = '😐';
        }
        
        return `<span class="sentiment-badge ${this.getSentimentClass(score)}">${emoji} ${text} (${score.toFixed(2)})</span>`;
    },
    
    // Ajout d'un flux RSS
    addFeed: function() {
        const feedUrl = document.getElementById('feedUrl').value.trim();
        if (!feedUrl) {
            this.showMessage('Veuillez entrer une URL de flux RSS', 'error');
            return;
        }
        
        if (this.feeds.includes(feedUrl)) {
            this.showMessage('Ce flux est déjà configuré', 'error');
            return;
        }
        
        fetch(`${this.config.apiUrl}/api/feeds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: feedUrl })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showMessage('Flux ajouté avec succès', 'success');
                document.getElementById('feedUrl').value = '';
                this.loadFeeds();
            }
        })
        .catch(error => {
            this.showMessage('Erreur ajout flux', 'error');
            console.error('❌ Erreur:', error);
        });
    },
    
    // Suppression d'un flux RSS
    removeFeed: function(feedUrl) {
        fetch(`${this.config.apiUrl}/api/feeds`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: feedUrl })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showMessage('Flux supprimé', 'success');
                this.loadFeeds();
            }
        })
        .catch(error => {
            this.showMessage('Erreur suppression flux', 'error');
            console.error('❌ Erreur:', error);
        });
    },
    
    // Ajout d'un thème
    addTheme: function() {
        const name = document.getElementById('themeName').value.trim();
        const keywords = document.getElementById('themeKeywords').value.split(',').map(k => k.trim()).filter(k => k);
        const color = document.getElementById('themeColor').value;
        
        if (!name || keywords.length === 0) {
            this.showMessage('Veuillez remplir tous les champs', 'error');
            return;
        }
        
        if (this.themes.some(t => t.name === name)) {
            this.showMessage('Un thème avec ce nom existe déjà', 'error');
            return;
        }
        
        fetch(`${this.config.apiUrl}/api/themes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, keywords, color })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showMessage('Thème créé avec succès', 'success');
                document.getElementById('themeName').value = '';
                document.getElementById('themeKeywords').value = '';
                this.loadThemes();
                
                if (this.chartManager) {
                    this.chartManager.updateThemeSelector();
                }
            }
        })
        .catch(error => {
            this.showMessage('Erreur création thème', 'error');
            console.error('❌ Erreur:', error);
        });
    },
    
    // Suppression d'un thème
    removeTheme: function(themeName) {
        this.showMessage('Fonction en développement', 'info');
    },
    
    // Export des données
    exportData: function(format) {
        const data = {
            articles: this.articles,
            themes: this.themes,
            feeds: this.feeds,
            stats: this.stats,
            exportDate: new Date().toISOString()
        };
        
        let content, mimeType, filename;
        
        if (format === 'json') {
            content = JSON.stringify(data, null, 2);
            mimeType = 'application/json';
            filename = `rss-aggregator-${new Date().toISOString().split('T')[0]}.json`;
        } else if (format === 'csv') {
            content = this.convertToCSV(data);
            mimeType = 'text/csv';
            filename = `rss-aggregator-${new Date().toISOString().split('T')[0]}.csv`;
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showMessage(`Données exportées en ${format.toUpperCase()}`, 'success');
    },
    
    // Conversion en CSV
    convertToCSV: function(data) {
        const headers = ['Titre', 'Date', 'Thèmes', 'Sentiment', 'Lien'];
        const rows = data.articles.map(article => [
            `"${article.title.replace(/"/g, '""')}"`,
            article.pubDate,
            `"${(article.themes || []).join(', ')}"`,
            article.sentiment?.score || 0,
            article.link
        ]);
        
        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    },
    
    // Gestion des messages
    showMessage: function(message, type = 'info') {
        const container = document.getElementById('messageContainer');
        if (!container) return;
        
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.innerHTML = `
            <span class="message-icon">${this.getMessageIcon(type)}</span>
            <span class="message-text">${message}</span>
            <button class="message-close" onclick="this.parentElement.remove()">×</button>
        `;
        
        container.appendChild(messageEl);
        
        setTimeout(() => {
            if (messageEl.parentElement) {
                messageEl.remove();
            }
        }, 5000);
    },
    
    // Icônes des messages
    getMessageIcon: function(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || 'ℹ️';
    },
    
    // Actualisation automatique
    startAutoRefresh: function() {
        if (this.config.autoRefresh) {
            setInterval(() => {
                console.log('🔄 Actualisation automatique...');
                this.loadArticles();
            }, this.config.refreshInterval);
        }
    },
    
    // Fonctions IA (placeholders)
    runAIAnalysis: function() {
        this.showMessage('Fonctionnalité IA en cours de développement', 'info');
    },
    
    showLearningStats: function() {
        this.showMessage('Statistiques en cours de développement', 'info');
    }
};

// Fonctions globales
function showTab(tabName, event) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    if (event) {
        event.currentTarget.classList.add('active');
    }
    
    // Actualiser les données spécifiques à l'onglet
    if (tabName === 'articles') {
        app.updateArticlesList();
    } else if (tabName === 'feeds') {
        app.updateFeedsList();
    } else if (tabName === 'themes') {
        app.updateThemesList();
    } else if (tabName === 'analysis' && app.chartManager) {
        setTimeout(() => {
            app.chartManager.refreshChart();
        }, 100);
    }
}

function addFeed() {
    app.addFeed();
}

function addTheme() {
    app.addTheme();
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', function() {
    app.init();
});

// Export global pour le debug
window.app = app;
// Application principale - Agrégateur RSS Thématique + IA V.2.3
const app = {
    // Configuration et état
    config: {
        apiUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:3000' 
            : 'https://votre-app.render.com',
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
        
        // Afficher le message de bienvenue
        this.showMessage('Application chargée avec succès!', 'success');
    },
    
    // Chargement des données
    loadData: function() {
        this.loadThemes();
        this.loadFeeds();
        this.loadArticles();
        this.loadStats();
    },
    
    // Chargement des thèmes
    loadThemes: function() {
        const savedThemes = localStorage.getItem('themes');
        if (savedThemes) {
            this.themes = JSON.parse(savedThemes);
            console.log(`📁 ${this.themes.length} thèmes chargés`);
        } else {
            // Thèmes par défaut
            this.themes = [
                { 
                    name: 'Technologie', 
                    keywords: ['ai', 'intelligence artificielle', 'chatgpt', 'robot', 'programmation', 'code', 'software', 'hardware', 'digital', 'innovation'],
                    color: '#6366f1'
                },
                { 
                    name: 'Science', 
                    keywords: ['recherche', 'étude', 'scientifique', 'découverte', 'espace', 'nasa', 'physique', 'biologie', 'médecine'],
                    color: '#10b981'
                },
                { 
                    name: 'Économie', 
                    keywords: ['économie', 'finance', 'bourse', 'investissement', 'crypto', 'bitcoin', 'market', 'trading', 'banque'],
                    color: '#f59e0b'
                },
                { 
                    name: 'Politique', 
                    keywords: ['politique', 'gouvernement', 'élection', 'président', 'ministre', 'parlement', 'loi', 'réforme'],
                    color: '#ef4444'
                },
                { 
                    name: 'Environnement', 
                    keywords: ['climat', 'écologie', 'environnement', 'réchauffement', 'pollution', 'durable', 'énergie', 'renouvelable'],
                    color: '#84cc16'
                }
            ];
            this.saveThemes();
        }
    },
    
    // Sauvegarde des thèmes
    saveThemes: function() {
        localStorage.setItem('themes', JSON.stringify(this.themes));
    },
    
    // Chargement des flux RSS
    loadFeeds: function() {
        const savedFeeds = localStorage.getItem('feeds');
        if (savedFeeds) {
            this.feeds = JSON.parse(savedFeeds);
            console.log(`📰 ${this.feeds.length} flux chargés`);
        } else {
            // Flux par défaut
            this.feeds = [
                'https://www.lemonde.fr/rss/une.xml',
                'https://www.liberation.fr/arc/outboundfeeds/rss-all/collection/accueil-une/',
                'https://www.lefigaro.fr/rss/figaro_actualites.xml',
                'https://feeds.bbci.co.uk/news/world/rss.xml',
                'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'
            ];
            this.saveFeeds();
        }
    },
    
    // Sauvegarde des flux
    saveFeeds: function() {
        localStorage.setItem('feeds', JSON.stringify(this.feeds));
    },
    
    // Chargement des articles
    loadArticles: function() {
        const savedArticles = localStorage.getItem('articles');
        if (savedArticles) {
            this.articles = JSON.parse(savedArticles);
            console.log(`📄 ${this.articles.length} articles chargés`);
            this.updateLastUpdate();
        }
    },
    
    // Sauvegarde des articles
    saveArticles: function() {
        localStorage.setItem('articles', JSON.stringify(this.articles));
        this.updateLastUpdate();
    },
    
    // Chargement des statistiques
    loadStats: function() {
        const savedStats = localStorage.getItem('stats');
        if (savedStats) {
            this.stats = JSON.parse(savedStats);
        }
    },
    
    // Sauvegarde des statistiques
    saveStats: function() {
        localStorage.setItem('stats', JSON.stringify(this.stats));
    },
    
    // Initialisation des graphiques
    initializeCharts: function() {
        console.log("📊 Initialisation des graphiques avancés...");
        
        // Initialiser le gestionnaire de graphiques
        if (typeof initializeChartManager === 'function') {
            this.chartManager = initializeChartManager(this);
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
        
        if (this.themeChart) {
            this.themeChart.destroy();
        }
        
        this.themeChart = new Chart(ctx, {
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
                            font: {
                                size: 11
                            }
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
    
    // Version améliorée du graphique d'évolution temporelle
    createTimelineChart: function() {
        const ctx = document.getElementById('timelineChart');
        if (!ctx) return;
        
        // Utiliser les données préparées par le ChartManager
        const chartData = this.chartManager ? this.chartManager.prepareChartData() : this.prepareBasicTimelineData();
        
        if (this.timelineChart) {
            this.timelineChart.destroy();
        }
        
        this.timelineChart = new Chart(ctx, {
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
                            font: {
                                size: 11
                            }
                        },
                        onClick: function(e, legendItem, legend) {
                            const index = legendItem.datasetIndex;
                            const chart = legend.chart;
                            const meta = chart.getDatasetMeta(index);
                            
                            meta.hidden = meta.hidden === null ? !chart.data.datasets[index].hidden : null;
                            chart.update();
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
                    },
                    zoom: {
                        zoom: {
                            wheel: {
                                enabled: true,
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                        },
                        pan: {
                            enabled: true,
                            mode: 'x',
                        },
                        limits: {
                            x: { min: 'original', max: 'original' }
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
                            text: this.getYAxisLabel(),
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
                },
                elements: {
                    line: {
                        borderWidth: 2
                    },
                    point: {
                        radius: 4,
                        hoverRadius: 8
                    }
                }
            }
        });
    },
    
    // Mettre à jour le graphique avec de nouvelles données
    updateTimelineChart: function(chartData) {
        if (!this.timelineChart) {
            this.createTimelineChart();
            return;
        }
        
        this.timelineChart.data.labels = chartData.dates;
        this.timelineChart.data.datasets = chartData.themes.map(theme => ({
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
        
        this.timelineChart.options.scales.x.title.text = this.getTimeScaleLabel();
        this.timelineChart.options.scales.y.title.text = this.getYAxisLabel();
        
        this.timelineChart.update('none');
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
    
    getYAxisLabel: function() {
        if (!this.chartManager) return "Nombre d'articles";
        
        const aggregations = {
            'count': "Nombre d'articles",
            'percentage': 'Pourcentage (%)',
            'movingAverage': 'Moyenne mobile'
        };
        return aggregations[this.chartManager.aggregation] || "Nombre d'articles";
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
        
        // Regrouper par date (simplifié)
        const dateGroups = {};
        this.articles.forEach(article => {
            const date = new Date(article.pubDate || article.date).toISOString().split('T')[0];
            if (!dateGroups[date]) dateGroups[date] = { themes: {} };
            
            article.themes?.forEach(theme => {
                dateGroups[date].themes[theme] = (dateGroups[date].themes[theme] || 0) + 1;
            });
        });
        
        const dates = Object.keys(dateGroups).sort();
        const themes = this.getAvailableThemes().slice(0, 8); // Limiter à 8 thèmes
        
        return {
            dates: dates,
            themes: themes.map(theme => ({
                name: theme.name,
                color: theme.color,
                values: dates.map(date => dateGroups[date]?.themes[theme.name] || 0)
            }))
        };
    },
    
    getAvailableThemes: function() {
        if (!this.themes) return [];
        return this.themes.map(theme => ({
            name: theme.name,
            color: theme.color || '#6366f1'
        }));
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
        // Écouteur pour la sélection de couleurs
        document.querySelectorAll('.color-preset').forEach(preset => {
            preset.addEventListener('click', function() {
                const color = this.getAttribute('data-color');
                document.getElementById('themeColor').value = color;
            });
        });
        
        // Écouteur pour le slider de score
        const scoreSlider = document.getElementById('expectedScore');
        if (scoreSlider) {
            scoreSlider.addEventListener('input', function() {
                document.getElementById('scoreValue').textContent = parseFloat(this.value).toFixed(2);
            });
        }
        
        // Fermeture des modals
        document.querySelectorAll('.modal .close').forEach(closeBtn => {
            closeBtn.addEventListener('click', function() {
                this.closest('.modal').style.display = 'none';
            });
        });
        
        // Fermeture des modals en cliquant à l'extérieur
        window.addEventListener('click', function(event) {
            document.querySelectorAll('.modal').forEach(modal => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
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
        
        // Simuler le chargement (remplacer par un appel API réel)
        setTimeout(() => {
            this.refreshData();
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '🔄 Générer';
            }
        }, 1500);
    },
    
    // Actualisation des données
    refreshData: function() {
        console.log('📥 Actualisation des données...');
        
        // Simulation de nouvelles données
        const newArticles = this.generateSampleArticles(5);
        this.articles = [...newArticles, ...this.articles].slice(0, 200); // Garder les 200 derniers
        
        this.analyzeArticles();
        this.updateDashboard();
        this.saveArticles();
        
        // Actualiser les graphiques via le ChartManager
        if (this.chartManager) {
            this.chartManager.refreshChart();
        }
        
        this.showMessage('Données actualisées avec succès!', 'success');
        return true;
    },
    
    // Génération d'articles d'exemple
    generateSampleArticles: function(count = 5) {
        const sampleTitles = [
            "Nouvelle avancée dans l'IA générative",
            "Découverte scientifique majeure en astrophysique",
            "Les marchés financiers en forte croissance",
            "Accord international sur le climat",
            "Innovation technologique révolutionnaire",
            "Étude sur les énergies renouvelables",
            "Réforme politique importante annoncée",
            "Progrès en médecine et santé publique"
        ];
        
        const articles = [];
        const now = new Date();
        
        for (let i = 0; i < count; i++) {
            const title = sampleTitles[Math.floor(Math.random() * sampleTitles.length)];
            const daysAgo = Math.floor(Math.random() * 30);
            const pubDate = new Date(now);
            pubDate.setDate(now.getDate() - daysAgo);
            
            articles.push({
                id: 'sample-' + Date.now() + '-' + i,
                title: title,
                link: '#',
                pubDate: pubDate.toISOString(),
                content: `Article de démonstration: ${title}`,
                themes: this.detectThemes(title),
                sentiment: (Math.random() * 2 - 1).toFixed(2) // Score entre -1 et 1
            });
        }
        
        return articles;
    },
    
    // Analyse des articles pour détecter les thèmes
    analyzeArticles: function() {
        console.log('🔍 Analyse des articles...');
        
        this.articles.forEach(article => {
            if (!article.themes) {
                article.themes = this.detectThemes(article.title + ' ' + (article.content || ''));
            }
            
            if (!article.sentiment) {
                article.sentiment = this.analyzeSentiment(article.title + ' ' + (article.content || ''));
            }
        });
        
        this.updateStats();
    },
    
    // Détection des thèmes
    detectThemes: function(text) {
        if (!text) return [];
        
        const themesFound = [];
        const lowerText = text.toLowerCase();
        
        this.themes.forEach(theme => {
            theme.keywords.forEach(keyword => {
                if (lowerText.includes(keyword.toLowerCase())) {
                    if (!themesFound.includes(theme.name)) {
                        themesFound.push(theme.name);
                    }
                }
            });
        });
        
        return themesFound;
    },
    
    // Analyse de sentiment basique
    analyzeSentiment: function(text) {
        if (!text) return 0;
        
        const positiveWords = ['bon', 'excellent', 'super', 'positif', 'réussite', 'succès', 'innovation', 'progrès', 'avancée', 'meilleur'];
        const negativeWords = ['mauvais', 'négatif', 'échec', 'problème', 'crise', 'difficile', 'inquiétant', 'danger', 'risque', 'chute'];
        
        let score = 0;
        const words = text.toLowerCase().split(/\s+/);
        
        words.forEach(word => {
            if (positiveWords.includes(word)) score += 0.1;
            if (negativeWords.includes(word)) score -= 0.1;
        });
        
        // Limiter entre -1 et 1
        return Math.max(-1, Math.min(1, score));
    },
    
    // Mise à jour des statistiques
    updateStats: function() {
        this.stats = {
            totalArticles: this.articles.length,
            totalThemes: this.themes.length,
            totalFeeds: this.feeds.length,
            lastUpdate: new Date().toISOString(),
            articlesByTheme: this.getArticlesByTheme(),
            sentimentDistribution: this.getSentimentDistribution()
        };
        
        this.saveStats();
        this.updateStatsGrid();
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
    
    // Distribution des sentiments
    getSentimentDistribution: function() {
        const sentiments = this.articles.map(article => parseFloat(article.sentiment) || 0);
        return {
            positive: sentiments.filter(s => s > 0.1).length,
            neutral: sentiments.filter(s => s >= -0.1 && s <= 0.1).length,
            negative: sentiments.filter(s => s < -0.1).length
        };
    },
    
    // Mise à jour du tableau de bord
    updateDashboard: function() {
        this.updateStatsGrid();
        this.updateThemeChart();
        this.updateTimelineChart(this.prepareBasicTimelineData());
        this.updateArticlesList();
        this.updateFeedsList();
        this.updateThemesList();
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
    },
    
    // Mise à jour du graphique des thèmes
    updateThemeChart: function() {
        if (this.themeChart) {
            const themeData = this.getThemeDistribution();
            this.themeChart.data.labels = themeData.labels;
            this.themeChart.data.datasets[0].data = themeData.values;
            this.themeChart.data.datasets[0].backgroundColor = themeData.colors;
            this.themeChart.update();
        }
    },
    
    // Mise à jour de la liste des articles
    updateArticlesList: function() {
        const articlesList = document.getElementById('articlesList');
        if (!articlesList) return;
        
        const recentArticles = this.articles.slice(0, 20); // 20 derniers articles
        
        if (recentArticles.length === 0) {
            articlesList.innerHTML = '<div class="loading">Aucun article disponible</div>';
            return;
        }
        
        articlesList.innerHTML = recentArticles.map(article => {
            const sentimentClass = this.getSentimentClass(article.sentiment);
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
                    <div class="article-themes">
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
    getSentimentClass: function(sentiment) {
        const score = parseFloat(sentiment);
        if (score > 0.1) return 'positive';
        if (score < -0.1) return 'negative';
        return 'neutral';
    },
    
    // Génération du badge de sentiment
    getSentimentBadge: function(sentiment) {
        const score = parseFloat(sentiment);
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
        
        return `<span class="sentiment-badge ${this.getSentimentClass(sentiment)}">${emoji} ${text} (${score.toFixed(2)})</span>`;
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
        
        this.feeds.push(feedUrl);
        this.saveFeeds();
        this.updateFeedsList();
        document.getElementById('feedUrl').value = '';
        this.showMessage('Flux ajouté avec succès', 'success');
    },
    
    // Suppression d'un flux RSS
    removeFeed: function(feedUrl) {
        this.feeds = this.feeds.filter(f => f !== feedUrl);
        this.saveFeeds();
        this.updateFeedsList();
        this.showMessage('Flux supprimé', 'success');
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
        
        this.themes.push({ name, keywords, color });
        this.saveThemes();
        this.updateThemesList();
        
        // Réinitialiser le formulaire
        document.getElementById('themeName').value = '';
        document.getElementById('themeKeywords').value = '';
        
        // Actualiser le sélecteur de thèmes
        if (this.chartManager) {
            this.chartManager.updateThemeSelector();
        }
        
        this.showMessage('Thème créé avec succès', 'success');
    },
    
    // Suppression d'un thème
    removeTheme: function(themeName) {
        this.themes = this.themes.filter(t => t.name !== themeName);
        this.saveThemes();
        this.updateThemesList();
        
        // Actualiser le sélecteur de thèmes
        if (this.chartManager) {
            this.chartManager.updateThemeSelector();
        }
        
        this.showMessage('Thème supprimé', 'success');
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
            article.sentiment,
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
        
        // Auto-suppression après 5 secondes
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
    
    // Mise à jour de la date de dernière modification
    updateLastUpdate: function() {
        const lastUpdateEl = document.getElementById('lastUpdate');
        if (lastUpdateEl) {
            lastUpdateEl.textContent = `Dernière mise à jour: ${new Date().toLocaleString()}`;
        }
    },
    
    // Actualisation automatique
    startAutoRefresh: function() {
        if (this.config.autoRefresh) {
            setInterval(() => {
                this.refreshData();
            }, this.config.refreshInterval);
        }
    },
    
    // Fonctions IA (placeholder)
    runAIAnalysis: function() {
        this.showMessage('Fonctionnalité IA en cours de développement', 'info');
    },
    
    showIAApiKeyModal: function() {
        this.showMessage('Configuration IA en cours de développement', 'info');
    },
    
    closeIAApiKeyModal: function() {
        this.showMessage('Modal IA fermé', 'info');
    },
    
    saveIAApiKey: function() {
        this.showMessage('Clé API IA sauvegardée', 'success');
    },
    
    disableIA: function() {
        this.showMessage('IA désactivée', 'success');
    },
    
    manualIACorrection: function() {
        this.showMessage('Correction IA manuelle en cours', 'info');
    },
    
    configureIA: function() {
        this.showMessage('Configuration IA ouverte', 'info');
    },
    
    showLearningStats: function() {
        this.showMessage('Statistiques d\'apprentissage affichées', 'info');
    },
    
    refreshLearningStats: function() {
        this.showMessage('Statistiques d\'apprentissage actualisées', 'success');
    },
    
    resetLearning: function() {
        this.showMessage('Apprentissage réinitialisé', 'success');
    },
    
    learnFromCorrection: function() {
        this.showMessage('Correction apprise', 'success');
    }
};

// Fonctions globales
function showTab(tabName, event) {
    // Masquer tous les contenus d'onglets
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Désactiver tous les onglets
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Activer l'onglet sélectionné
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
    
    // Redéfinir showTab pour gérer les graphiques
    const originalShowTab = window.showTab;
    window.showTab = function(tabName, event) {
        originalShowTab(tabName, event);
        
        // Recalculer les graphiques quand on revient sur l'onglet Analyse
        if (tabName === 'analysis' && app.chartManager) {
            setTimeout(() => {
                app.chartManager.refreshChart();
            }, 100);
        }
    };
});

// Export global pour le debug
window.app = app;
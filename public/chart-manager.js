// Gestionnaire avancé des graphiques - AMÉLIORATION LISIBILITÉ
class ChartManager {
    constructor(appInstance) {
        this.app = appInstance;
        this.selectedThemes = new Set();
        this.timeScale = 'week';
        this.aggregation = 'count';
        this.showMinorThemes = false;
        this.minorThreshold = 0.02; // 2% du total
        
        this.initialize();
    }
    
    initialize() {
        this.createThemeSelector();
        this.setupEventListeners();
    }
    
    createThemeSelector() {
        const container = document.getElementById('themeSelectorContainer');
        if (!container) return;
        
        const themes = this.getAvailableThemes();
        if (themes.length === 0) {
            container.innerHTML = '<div class="loading">Aucun thème disponible</div>';
            return;
        }
        
        // Si aucun thème n'est sélectionné, sélectionner les 5 premiers par défaut
        if (this.selectedThemes.size === 0) {
            themes.slice(0, 5).forEach(theme => this.selectedThemes.add(theme.name));
        }
        
        const selectorHtml = `
            <div class="theme-selector">
                <h4>📊 Sélection des thèmes à afficher</h4>
                <div class="theme-checkboxes" id="themeCheckboxes">
                    ${this.generateThemeCheckboxes()}
                </div>
                <div class="chart-controls">
                    <button onclick="app.chartManager.selectAllThemes()" class="control-btn">✓ Tout sélectionner</button>
                    <button onclick="app.chartManager.deselectAllThemes()" class="control-btn">✗ Tout désélectionner</button>
                    <button onclick="app.chartManager.selectTopThemes(5)" class="control-btn">🏆 Top 5</button>
                    <button onclick="app.chartManager.selectTopThemes(10)" class="control-btn">🎯 Top 10</button>
                </div>
            </div>
        `;
        
        container.innerHTML = selectorHtml;
    }
    
    generateThemeCheckboxes() {
        const themes = this.getAvailableThemes();
        return themes.map(theme => `
            <label class="theme-checkbox ${!this.selectedThemes.has(theme.name) ? 'disabled' : ''}">
                <input type="checkbox" value="${theme.name}" 
                       ${this.selectedThemes.has(theme.name) ? 'checked' : ''}
                       onchange="app.chartManager.toggleTheme('${theme.name}', this.checked)">
                <span class="theme-color" style="background-color: ${theme.color}"></span>
                <span class="theme-name">${theme.name}</span>
                <span class="theme-count">(${theme.count})</span>
            </label>
        `).join('');
    }
    
    updateThemeSelector() {
        const checkboxesContainer = document.getElementById('themeCheckboxes');
        if (checkboxesContainer) {
            checkboxesContainer.innerHTML = this.generateThemeCheckboxes();
        } else {
            // Recréer le sélecteur complet si le conteneur n'existe pas
            this.createThemeSelector();
        }
    }
    
    getAvailableThemes() {
        if (!this.app.themes || !this.app.articles) return [];
        
        // Compter les occurrences par thème
        const themeCounts = {};
        this.app.articles.forEach(article => {
            article.themes?.forEach(theme => {
                themeCounts[theme] = (themeCounts[theme] || 0) + 1;
            });
        });
        
        return this.app.themes
            .filter(theme => themeCounts[theme.name] > 0)
            .map(theme => ({
                name: theme.name,
                color: theme.color,
                count: themeCounts[theme.name] || 0
            }))
            .sort((a, b) => b.count - a.count);
    }
    
    toggleTheme(themeName, isSelected) {
        if (isSelected) {
            this.selectedThemes.add(themeName);
        } else {
            this.selectedThemes.delete(themeName);
        }
        
        this.updateThemeSelector();
        this.refreshChart();
    }
    
    selectAllThemes() {
        const themes = this.getAvailableThemes();
        this.selectedThemes = new Set(themes.map(theme => theme.name));
        this.updateThemeSelector();
        this.refreshChart();
    }
    
    deselectAllThemes() {
        this.selectedThemes.clear();
        this.updateThemeSelector();
        this.refreshChart();
    }
    
    selectTopThemes(count) {
        const themes = this.getAvailableThemes();
        this.selectedThemes = new Set(themes.slice(0, count).map(theme => theme.name));
        this.updateThemeSelector();
        this.refreshChart();
    }
    
    changeTimeScale(scale) {
        this.timeScale = scale;
        this.refreshChart();
    }
    
    changeAggregation(type) {
        this.aggregation = type;
        this.refreshChart();
    }
    
    toggleMinorThemes() {
        this.showMinorThemes = !this.showMinorThemes;
        const button = document.getElementById('toggleMinorBtn');
        if (button) {
            button.textContent = this.showMinorThemes ? 
                '👁️ Afficher thèmes mineurs' : 
                '👁️ Masquer thèmes mineurs';
        }
        this.refreshChart();
    }
    
    refreshChart() {
        if (this.app && typeof this.app.updateTimelineChart === 'function') {
            const filteredData = this.prepareChartData();
            this.app.updateTimelineChart(filteredData);
        }
    }
    
    prepareChartData() {
        if (!this.app.articles || !this.app.themes || this.app.articles.length === 0) {
            return { dates: ['Aucune donnée'], themes: [] };
        }
        
        // Grouper les données par période
        const periods = this.groupByPeriod(this.app.articles);
        const themesData = this.processThemesData(periods);
        
        return {
            dates: Object.keys(periods).sort(),
            themes: themesData
        };
    }
    
    groupByPeriod(articles) {
        const periods = {};
        
        articles.forEach(article => {
            const date = new Date(article.pubDate || article.date);
            let periodKey;
            
            switch (this.timeScale) {
                case 'day':
                    periodKey = date.toISOString().split('T')[0];
                    break;
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    periodKey = weekStart.toISOString().split('T')[0];
                    break;
                case 'month':
                    periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    break;
                case 'quarter':
                    const quarter = Math.floor(date.getMonth() / 3) + 1;
                    periodKey = `${date.getFullYear()}-Q${quarter}`;
                    break;
                default:
                    periodKey = date.toISOString().split('T')[0];
            }
            
            if (!periods[periodKey]) {
                periods[periodKey] = {
                    date: periodKey,
                    articles: [],
                    themeCounts: {}
                };
            }
            
            periods[periodKey].articles.push(article);
            
            // Compter les thèmes pour cette période
            article.themes?.forEach(theme => {
                periods[periodKey].themeCounts[theme] = (periods[periodKey].themeCounts[theme] || 0) + 1;
            });
        });
        
        return periods;
    }
    
    processThemesData(periods) {
        const availableThemes = this.getAvailableThemes();
        const totalArticles = this.app.articles.length;
        
        // Filtrer et grouper les thèmes
        let themesToShow = availableThemes.filter(theme => 
            this.selectedThemes.has(theme.name)
        );
        
        // Grouper les thèmes mineurs si nécessaire (AMÉLIORATION LISIBILITÉ)
        if (!this.showMinorThemes && themesToShow.length > 8) {
            const majorThemes = [];
            const minorThemes = [];
            
            themesToShow.forEach(theme => {
                if (theme.count / totalArticles >= this.minorThreshold) {
                    majorThemes.push(theme);
                } else {
                    minorThemes.push(theme);
                }
            });
            
            // Grouper les thèmes mineurs en une seule entrée "Autres"
            if (minorThemes.length > 0) {
                majorThemes.push({
                    name: 'Autres thèmes',
                    color: '#94a3b8',
                    isGrouped: true,
                    componentThemes: minorThemes
                });
            }
            
            themesToShow = majorThemes;
        }
        
        // Préparer les données pour chaque thème
        return themesToShow.map(theme => {
            const values = Object.keys(periods)
                .sort()
                .map(period => {
                    if (theme.isGrouped) {
                        // Somme des thèmes groupés
                        return theme.componentThemes.reduce((sum, compTheme) => {
                            return sum + (periods[period].themeCounts[compTheme.name] || 0);
                        }, 0);
                    } else {
                        return periods[period].themeCounts[theme.name] || 0;
                    }
                });
            
            return {
                name: theme.name,
                color: theme.color,
                values: values,
                total: theme.count || values.reduce((a, b) => a + b, 0)
            };
        });
    }
    
    exportChartData() {
        const data = this.prepareChartData();
        const csv = this.convertToCSV(data);
        this.downloadCSV(csv, `evolution-themes-${new Date().toISOString().split('T')[0]}.csv`);
    }
    
    convertToCSV(data) {
        const headers = ['Date', ...data.themes.map(theme => `"${theme.name}"`)];
        const rows = [headers.join(',')];
        
        data.dates.forEach((date, index) => {
            const row = [date, ...data.themes.map(theme => theme.values[index] || 0)];
            rows.push(row.join(','));
        });
        
        return rows.join('\n');
    }
    
    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    setupEventListeners() {
        // Les écouteurs sont déjà attachés via les attributs onclick dans le HTML
    }
}

// === NOUVELLE FONCTION pour ce smurks de sql de mes===

processThemesData(periods) {
    const availableThemes = this.getAvailableThemes();
    const totalArticles = this.app.articles.length;
    
    // Filtrer les thèmes sélectionnés
    let themesToShow = availableThemes.filter(theme => 
        this.selectedThemes.has(theme.name)
    );
    
    // 🎯 AMÉLIORATION : Grouper les thèmes mineurs si trop nombreux
    const MAX_THEMES_DISPLAY = 8; // Maximum de courbes à afficher
    
    if (themesToShow.length > MAX_THEMES_DISPLAY) {
        // Trier par nombre d'articles (décroissant)
        themesToShow.sort((a, b) => b.count - a.count);
        
        // Garder les N premiers thèmes
        const majorThemes = themesToShow.slice(0, MAX_THEMES_DISPLAY - 1);
        const minorThemes = themesToShow.slice(MAX_THEMES_DISPLAY - 1);
        
        // Grouper les thèmes mineurs en une seule courbe "Autres"
        if (minorThemes.length > 0) {
            majorThemes.push({
                name: `Autres (${minorThemes.length} thèmes)`,
                color: '#94a3b8',
                isGrouped: true,
                componentThemes: minorThemes,
                count: minorThemes.reduce((sum, t) => sum + t.count, 0)
            });
        }
        
        themesToShow = majorThemes;
        
        console.log(`📊 Graphique optimisé : ${MAX_THEMES_DISPLAY - 1} thèmes principaux + ${minorThemes.length} groupés en "Autres"`);
    }
    
    // Préparer les données pour chaque thème
    return themesToShow.map(theme => {
        const values = Object.keys(periods)
            .sort()
            .map(period => {
                if (theme.isGrouped) {
                    // Somme des thèmes groupés
                    return theme.componentThemes.reduce((sum, compTheme) => {
                        return sum + (periods[period].themeCounts[compTheme.name] || 0);
                    }, 0);
                } else {
                    return periods[period].themeCounts[theme.name] || 0;
                }
            });
        
        return {
            name: theme.name,
            color: theme.color,
            values: values,
            total: theme.count || values.reduce((a, b) => a + b, 0)
        };
    });
}

// Initialisation globale
let chartManager;

function initializeChartManager(app) {
    chartManager = new ChartManager(app);
    return chartManager;
}
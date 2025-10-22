// Gestionnaire avancé des graphiques - ChartManager (NEXTGEN)
class ChartManager {
    constructor(appInstance) {
        this.app = appInstance;
        this.selectedThemes = new Set();
        this.timeScale = "week";
        this.aggregation = "count";
        this.showMinorThemes = false;
        this.minorThreshold = 0.02; // 2% du total
        this.defaultDays = 30; // plage par défaut pour l'axe temporel
        this.minDays = 7;
        this.maxDays = 180;
        this.customRange = null; // { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
        this.initialize();
    }

    initialize() {
        this.createThemeSelector();
        this.setupEventListeners();
    }

    createThemeSelector() {
        const container = document.getElementById("themeSelectorContainer");
        if (!container) return;

        const themes = this.getAvailableThemes();
        if (themes.length === 0) {
            container.innerHTML = '<div class="loading">Aucun thème disponible</div>';
            return;
        }

        if (this.selectedThemes.size === 0) themes.slice(0, 5).forEach(t => this.selectedThemes.add(t.name));

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
                    <button onclick="app.chartManager.zoomIn()" class="control-btn">🔍+</button>
                    <button onclick="app.chartManager.zoomOut()" class="control-btn">🔍−</button>
                    <button onclick="app.chartManager.resetZoom()" class="control-btn">↺ Réinitialiser zoom</button>
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
                       ${this.selectedThemes.has(theme.name) ? "checked" : ""}
                       onchange="app.chartManager.toggleTheme('${theme.name}', this.checked)">
                <span class="theme-color" style="background-color: ${theme.color}"></span>
                <span class="theme-name">${theme.name}</span>
                <span class="theme-count">(${theme.count})</span>
            </label>
        `).join("");
    }

    updateThemeSelector() {
        const container = document.getElementById("themeCheckboxes");
        if (container) container.innerHTML = this.generateThemeCheckboxes();
        else this.createThemeSelector();
    }

    getAvailableThemes() {
        if (!this.app.themes || !this.app.articles) return [];
        const themeCounts = {};
        (this.app.articles || []).forEach(article => {
            (article.themes || []).forEach(theme => { themeCounts[theme] = (themeCounts[theme] || 0) + 1; });
        });
        return (this.app.themes || []).filter(t => (themeCounts[t.name] || 0) > 0)
            .map(t => ({ name: t.name, color: t.color, count: themeCounts[t.name] || 0 }))
            .sort((a,b) => b.count - a.count);
    }

    toggleTheme(themeName, isSelected) {
        if (isSelected) this.selectedThemes.add(themeName);
        else this.selectedThemes.delete(themeName);
        this.updateThemeSelector();
        this.refreshChart();
    }

    selectAllThemes() {
        this.selectedThemes = new Set(this.getAvailableThemes().map(t => t.name));
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
        this.selectedThemes = new Set(themes.slice(0, count).map(t => t.name));
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
        const button = document.getElementById("toggleMinorBtn");
        if (button) button.textContent = this.showMinorThemes ? "👁️ Afficher thèmes mineurs" : "👁️ Masquer thèmes mineurs";
        this.refreshChart();
    }

    // ---------- ZOOM API ----------
    zoomIn() {
        // réduire la fenêtre temporelle (minDays garanti)
        const newDays = Math.max(this.minDays, Math.ceil(this._currentDays() / 2));
        this.customRange = null;
        this.defaultDays = newDays;
        this.refreshChart();
    }

    zoomOut() {
        // élargir la fenêtre temporelle (maxDays limité)
        const newDays = Math.min(this.maxDays, Math.ceil(this._currentDays() * 2));
        this.customRange = null;
        this.defaultDays = newDays;
        this.refreshChart();
    }

    resetZoom() {
        this.customRange = null;
        this.defaultDays = 30;
        this.refreshChart();
    }

    zoomToRange(startIso, endIso) {
        // startIso / endIso : 'YYYY-MM-DD' ou Date-parseable
        const start = this._toIsoDate(startIso);
        const end = this._toIsoDate(endIso);
        if (!start || !end) return;
        this.customRange = { start: start, end: end };
        this.refreshChart();
    }

    _currentDays() {
        if (this.customRange) {
            const s = new Date(this.customRange.start);
            const e = new Date(this.customRange.end);
            const diff = Math.max(1, Math.round((e - s) / (24*3600*1000)) + 1);
            return Math.min(this.maxDays, Math.max(this.minDays, diff));
        }
        return this.defaultDays;
    }
    // ---------- /ZOOM API ----------

    refreshChart() {
        if (this.app && typeof this.app.updateTimelineChart === "function") {
            const filteredData = this.prepareChartData(this._currentDays());
            this.app.updateTimelineChart(filteredData);
        }
    }

    // utilitaire : parser date robuste -> iso 'YYYY-MM-DD'
    _toIsoDate(obj) {
        if (!obj) return null;
        try {
            const d = new Date(obj);
            if (isNaN(d)) return null;
            return d.toISOString().split("T")[0];
        } catch (e) {
            return null;
        }
    }

    // utilitaire : plage de dates continue (dernier N jours) ou customRange si défini
    _dateRange(days = this.defaultDays) {
        if (this.customRange) {
            const start = new Date(this.customRange.start);
            const end = new Date(this.customRange.end);
            start.setHours(0,0,0,0); end.setHours(0,0,0,0);
            const res = [];
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                res.push(new Date(d).toISOString().split("T")[0]);
                if (res.length > this.maxDays) break;
            }
            return res;
        }
        const res = [];
        const today = new Date();
        today.setHours(0,0,0,0);
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            res.push(d.toISOString().split("T")[0]);
        }
        return res;
    }

    // Prépare les données pour le timeline chart — garantit une plage X stable (dernier N jours ou customRange)
    prepareChartData(days = this.defaultDays) {
        const dates = this._dateRange(days);

        // si pas de thèmes disponibles -> thème vide
        const availableThemes = this.getAvailableThemes();
        const MAX = 8;
        const chosen = availableThemes.filter(t => this.selectedThemes.has(t.name));
        let themesToShow = chosen.length ? chosen : availableThemes.slice(0, MAX);

        // construire mapping date->counts pour chaque thème
        const articles = this.app.articles || [];

        // Precompute article date ISO and themes list for speed
        const pre = articles.map(a => {
            const iso = this._toIsoDate(a.pubDate || a.date || a.pub_date || a.published);
            return { iso: iso, themes: (a.themes || []) };
        });

        const themeObjects = themesToShow.map(t => {
            const values = dates.map(date => {
                // count articles on this date that include theme.name
                let count = 0;
                for (let i = 0; i < pre.length; i++) {
                    const p = pre[i];
                    if (!p.iso) continue;
                    if (p.iso !== date) continue;
                    if ((p.themes || []).includes(t.name)) count++;
                }
                return count;
            });
            return { name: t.name, color: t.color, values: values, total: values.reduce((a,b)=>a+b,0) };
        });

        return { dates: dates, themes: themeObjects };
    }

    processThemesData(periods) {
        const availableThemes = this.getAvailableThemes();
        const totalArticles = (this.app.articles || []).length;
        let themesToShow = availableThemes.filter(theme => this.selectedThemes.has(theme.name));
        const MAX_THEMES_DISPLAY = 8;

        if (themesToShow.length > MAX_THEMES_DISPLAY) {
            themesToShow.sort((a,b) => b.count - a.count);
            const majorThemes = themesToShow.slice(0, MAX_THEMES_DISPLAY - 1);
            const minorThemes = themesToShow.slice(MAX_THEMES_DISPLAY - 1);
            if (minorThemes.length > 0) {
                majorThemes.push({
                    name: `Autres (${minorThemes.length} thèmes)`,
                    color: "#94a3b8",
                    isGrouped: true,
                    componentThemes: minorThemes,
                    count: minorThemes.reduce((s, t) => s + t.count, 0)
                });
            }
            themesToShow = majorThemes;
            console.log(`📊 Graphique optimisé : ${MAX_THEMES_DISPLAY - 1} thèmes principaux + ${minorThemes.length} groupés en "Autres"`);
        }

        return themesToShow.map(theme => {
            const values = Object.keys(periods).sort().map(period => {
                if (theme.isGrouped) {
                    return theme.componentThemes.reduce((sum, compTheme) => sum + (periods[period].themeCounts[compTheme.name] || 0), 0);
                }
                return periods[period].themeCounts[theme.name] || 0;
            });
            return { name: theme.name, color: theme.color, values: values, total: theme.count || values.reduce((a,b)=>a+b,0) };
        });
    }

    exportChartData() {
        const data = this.prepareChartData();
        const csv = this.convertToCSV(data);
        this.downloadCSV(csv, `evolution-themes-${new Date().toISOString().split("T")[0]}.csv`);
    }

    convertToCSV(data) {
        const headers = ["Date", ...data.themes.map(theme => `"${theme.name}"`)];
        const rows = [headers.join(",")];
        data.dates.forEach((date, idx) => {
            const row = [date, ...data.themes.map(theme => theme.values[idx] || 0)];
            rows.push(row.join(","));
        });
        return rows.join("\n");
    }

    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    setupEventListeners() {
        // Les écouteurs sont raccordés via HTML onclick pour simplicité
    }
}

// Expose helper d'initialisation global pour compatibilité
function initializeChartManager(app) {
    const cm = new ChartManager(app);
    return cm;
}

// Rendre la classe accessible si besoin
window.ChartManager = ChartManager;
window.initializeChartManager = initializeChartManager;

// public/app.js - VERSION COMPLÈTE CORRIGÉE
const API_BASE = window.__API_BASE__ || (location.origin.includes('http') ? location.origin : 'http://localhost:3000');

window.app = (function () {
    // ========== ÉTAT GLOBAL ==========
    const state = {
        apiBase: "/api",
        autoRefresh: true,
        refreshIntervalMs: 300000,
        articles: [],
        themes: [],
        feeds: [],
        summary: {},
        metrics: null,
        charts: {
            themeChart: null,
            timelineChart: null,
            sentimentChart: null,
            sentimentEvolutionChart: null,
            themeEvolutionChart: null
        },
        timers: { autoRefresh: null },
        aiConfig: null,
        emailConfig: null,
        uiConfig: {
            theme: 'light',
            language: 'fr',
            chartColors: 'default'
        },
        currentTab: "articles",
        loading: {
            articles: false,
            themes: false,
            feeds: false
        }
    };

    // ========== UTILITAIRES ==========
    function qs(sel, root = document) { return root.querySelector(sel); }
    function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

    function escapeHtml(s) {
        if (!s && s !== 0) return "";
        return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function safeNumber(v, d = 0) {
        const n = Number(v);
        return isNaN(n) ? d : n;
    }

    function isoDay(dateStrOrObj) {
        if (!dateStrOrObj) return null;
        if (typeof dateStrOrObj === "string") return dateStrOrObj.slice(0, 10);
        if (dateStrOrObj instanceof Date) return dateStrOrObj.toISOString().slice(0, 10);
        try {
            const d = new Date(dateStrOrObj);
            return d.toISOString().slice(0, 10);
        } catch (e) {
            return null;
        }
    }

    function formatDate(dateStr) {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateStr;
        }
    }

    function plural(n, s = "s") { return n > 1 ? s : ""; }

    function setMessage(msg, type = "info") {
        const container = qs("#messageContainer");
        if (!container) return;

        if (!msg) {
            container.innerHTML = "";
            return;
        }

        const colors = {
            info: "#3b82f6",
            error: "#ef4444",
            success: "#10b981",
            warning: "#f59e0b"
        };

        const color = colors[type] || colors.info;
        const icon = type === "success" ? "✅" : type === "error" ? "❌" : type === "warning" ? "⚠️" : "ℹ️";

        container.innerHTML = `
            <div style="color: ${color}; padding: 12px; text-align: center; font-weight: 500; background: ${color}10; border: 1px solid ${color}30; border-radius: 8px; margin: 10px 0;">
                ${icon} ${msg}
            </div>
        `;

        if (type === "success" || type === "error") {
            setTimeout(() => setMessage(""), 5000);
        }
    }

    function closeModal(modalId) {
        const modal = qs(`#${modalId}`);
        if (!modal) return;
        // masquer d'abord pour animation fluide, puis retirer du DOM
        modal.style.display = "none";
        setTimeout(() => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        }, 250);
    }    // ========== FONCTIONS API ==========
    async function apiCall(method, path, body = null) {
        try {
            const fullPath = path.startsWith("/api/") ? path : `/api${path.startsWith("/") ? path : "/" + path}`;
            console.log(`📡 ${method} ${fullPath}`);

            const options = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };

            if (body && method !== 'GET') {
                options.body = JSON.stringify(body);
            }

            const res = await fetch(fullPath, options);

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`HTTP ${res.status}: ${txt}`);
            }

            return await res.json();
        } catch (err) {
            console.error(`❌ ${method} ${path}:`, err.message);
            throw err;
        }
    }

    const apiGET = (path) => apiCall('GET', path);
    const apiPOST = (path, body) => apiCall('POST', path, body);
    const apiDELETE = (path) => apiCall('DELETE', path);
    const apiPUT = (path, body) => apiCall('PUT', path, body);    // ========== CHARGEMENT DONNÉES ==========
    function normalizeArticle(a) {
        if (!a || typeof a !== "object") return null;

        return {
            id: a.id || Math.random().toString(36).substr(2, 9),
            title: a.title || "Sans titre",
            link: a.link || "#",
            date: a.date || a.pubDate || new Date().toISOString(),
            themes: Array.isArray(a.themes) ? a.themes : [],
            sentiment: a.sentiment || { score: 0, sentiment: 'neutral', confidence: 0 },
            confidence: safeNumber(a.confidence || (a.sentiment && a.sentiment.confidence), 0.5),
            bayesian_posterior: safeNumber(a.bayesian_posterior, 0.5),
            corroboration_strength: safeNumber(a.corroboration_strength, 0),
            summary: a.summary || a.content || "",
            feed: a.feed || a.feed_url || "Inconnu"
        };
    }

    async function loadArticles(forceRefresh = false) {
        if (state.loading.articles && !forceRefresh) return state.articles;

        state.loading.articles = true;
        setMessage("Chargement des articles...", "info");

        try {
            const json = await apiGET("/articles?limit=200");

            // Amélioration: accepter plusieurs formats de réponse de l'API
            if (json && json.success && Array.isArray(json.articles)) {
                state.articles = json.articles.map(normalizeArticle).filter(a => a !== null);
                state.summary = { total_articles: json.total || state.articles.length };
                console.log(`✅ ${state.articles.length} articles chargés`);
            } else if (Array.isArray(json)) {
                state.articles = json.map(normalizeArticle).filter(a => a !== null);
                state.summary = { total_articles: state.articles.length };
            } else {
                state.articles = [];
                state.summary = { total_articles: 0 };
                console.warn("⚠️ Format de données inattendu:", json);
            }

            renderArticlesList();
            computeThemesFromArticles();
            updateAllCharts();
            setMessage("", "info");

            return state.articles;
        } catch (err) {
            console.error("❌ loadArticles error", err);
            setMessage("Erreur chargement articles: " + err.message, "error");
            state.articles = [];
            state.summary = { total_articles: 0 };
            return [];
        } finally {
            state.loading.articles = false;
        }
    }

    async function loadThemes() {
        if (state.loading.themes) return state.themes;

        state.loading.themes = true;

        try {
            const data = await apiGET("/themes");

            // Accept plusieurs formats que l'API peut renvoyer (tableau direct ou { themes: [...] })
            if (Array.isArray(data)) {
                state.themes = data;
                console.log(`✅ ${state.themes.length} thèmes chargés (array)`);
                return state.themes;
            }

            if (data && Array.isArray(data.themes)) {
                state.themes = data.themes;
                console.log(`✅ ${state.themes.length} thèmes chargés (obj.themes)`);
                return state.themes;
            }

            state.themes = [];
            return [];
        } catch (err) {
            console.error("❌ loadThemes error", err);
            state.themes = [];
            return [];
        } finally {
            state.loading.themes = false;
        }
    }

    async function loadFeeds() {
        if (state.loading.feeds) return state.feeds;

        state.loading.feeds = true;

        try {
            const data = await apiGET("/feeds/manager");

            if (Array.isArray(data)) {
                state.feeds = data;
                console.log(`✅ ${state.feeds.length} flux chargés (array)`);
                return state.feeds;
            }

            if (data && Array.isArray(data.feeds)) {
                state.feeds = data.feeds;
                console.log(`✅ ${state.feeds.length} flux chargés (obj.feeds)`);
                return state.feeds;
            }

            state.feeds = [];
            return [];
        } catch (err) {
            console.error("❌ loadFeeds error", err);
            state.feeds = [];
            return [];
        } finally {
            state.loading.feeds = false;
        }
    }    // ========== RAFRAÎCHISSEMENT ==========
    async function refreshArticles() {
        const btn = qs("#refreshBtn");
        const originalText = btn ? btn.innerHTML : "";

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "🔄 Actualisation en cours...";
        }

        setMessage("🔄 Récupération des nouveaux articles RSS...", "info");

        try {
            const refreshResult = await apiPOST("/refresh");

            if (!refreshResult.success) {
                throw new Error(refreshResult.error || "Erreur inconnue lors du rafraîchissement");
            }

            setMessage(`✅ ${refreshResult.details?.articles_processed || 0} nouveaux articles récupérés`, "success");
            await loadArticles(true);

            // Recharger les métriques après le rafraîchissement pour mettre à jour les compteurs (articles, postérieur, corroboration, ...)
            await loadMetrics();

            setMessage("🎨 Analyse thématique en cours...", "info");

            try {
                const themeResult = await apiPOST("/themes/analyze");
                if (themeResult.success) {
                    setMessage(`✅ ${themeResult.relations_created || 0} relations thématiques créées`, "success");
                }
            } catch (themeError) {
                console.warn("⚠️ Analyse thématique échouée:", themeError);
            }

            await loadThemes();
            computeThemesFromArticles();
            updateAllCharts();

            setMessage(`✅ Actualisation terminée avec succès`, "success");

            return refreshResult;
        } catch (error) {
            console.error("❌ Erreur rafraîchissement:", error);
            setMessage("❌ Erreur de rafraîchissement: " + error.message, "error");
            throw error;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    // ========== CALCUL DES THÈMES ==========
    function computeThemesFromArticles() {
        const themeCounts = {};
        const themeColors = {};

        state.articles.forEach(article => {
            if (article.themes && Array.isArray(article.themes)) {
                article.themes.forEach(theme => {
                    if (theme && typeof theme === 'string') {
                        themeCounts[theme] = (themeCounts[theme] || 0) + 1;

                        if (!themeColors[theme]) {
                            const themeObj = state.themes.find(t => t.name === theme);
                            themeColors[theme] = themeObj?.color || getThemeColor(theme);
                        }
                    }
                });
            }
        });

        const allThemes = new Set([
            ...Object.keys(themeCounts),
            ...state.themes.map(t => t.name)
        ]);

        state.themes = Array.from(allThemes).map(name => ({
            name,
            count: themeCounts[name] || 0,
            color: themeColors[name] || getThemeColor(name)
        })).sort((a, b) => b.count - a.count);

        console.log(`✅ ${state.themes.length} thèmes calculés`);
    }

    function getThemeColor(themeName) {
        const colors = [
            "#ef4444", "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6",
            "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#ec4899"
        ];

        let hash = 0;
        for (let i = 0; i < themeName.length; i++) {
            hash = themeName.charCodeAt(i) + ((hash << 5) - hash);
        }

        return colors[Math.abs(hash) % colors.length];
    }    // ========== RENDU DES ARTICLES ==========
    function renderArticlesList() {
        const container = qs("#articlesList");
        if (!container) return;

        if (state.articles.length === 0) {
            container.innerHTML = `
                <div class="loading" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 3rem; margin-bottom: 20px;">📰</div>
                    <div style="font-size: 1.2rem; color: #64748b; margin-bottom: 20px;">Aucun article disponible</div>
                    <p style="color: #94a3b8; margin-bottom: 30px;">Cliquez sur "Actualiser" pour récupérer les derniers articles RSS</p>
                    <button onclick="window.app.refreshArticles()" class="btn btn-success" style="padding: 15px 30px; font-size: 1.1rem;">
                        🔄 Charger des articles
                    </button>
                </div>
            `;
            return;
        }

        const articlesHtml = state.articles.slice(0, 100).map(article => {
            const sentimentEmoji = {
                'positive': '😊',
                'neutral': '😐',
                'negative': '😞'
            };

            const sentiment = article.sentiment || {};
            const sentimentType = sentiment.sentiment || 'neutral';
            const themes = article.themes || [];

            return `
                <div class="article-card" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; background: white; transition: all 0.3s;">
                    <h4 style="margin: 0 0 10px 0;">
                        <a href="${escapeHtml(article.link)}" target="_blank" style="color: #1e40af; text-decoration: none;">
                            ${escapeHtml(article.title)}
                        </a>
                    </h4>
                    <div class="meta" style="display: flex; gap: 16px; font-size: 0.875rem; color: #64748b; margin-bottom: 10px; flex-wrap: wrap;">
                        <span>📅 ${formatDate(article.date)}</span>
                        <span>${sentimentEmoji[sentimentType]} ${sentimentType} (${(sentiment.score || 0).toFixed(2)})</span>
                        <span>🎯 Confiance: ${((article.confidence || 0) * 100).toFixed(1)}%</span>
                        <span>📡 ${escapeHtml(article.feed)}</span>
                    </div>
                    <p style="margin: 0 0 15px 0; color: #475569; line-height: 1.6;">
                        ${escapeHtml((article.summary || '').substring(0, 250))}${article.summary?.length > 250 ? '...' : ''}
                    </p>
                    <div class="themes" style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${themes.length > 0
                    ? themes.map(theme => `
                                <span class="tag" style="padding: 4px 12px; background: linear-gradient(135deg, #e0e7ff, #c7d2fe); color: #4338ca; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">
                                    ${escapeHtml(theme)}
                                </span>
                            `).join("")
                    : '<span style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">Aucun thème détecté</span>'
                }
                    </div>
                </div>
            `;
        }).join("");

        container.innerHTML = `
            <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: #1e293b;">
                    ${state.articles.length} article${plural(state.articles.length)} trouvé${plural(state.articles.length)}
                </span>
                <button onclick="window.app.exportArticlesToCSV()" class="btn btn-secondary" style="padding: 8px 16px;">
                    📥 Exporter CSV
                </button>
            </div>
            ${articlesHtml}
        `;
    }    // ========== GRAPHIQUES ==========
    function updateAllCharts() {
        createThemeChart();
        createTimelineChart();
        createSentimentChart();
        createSentimentEvolutionChart();
        createThemeEvolutionChart();
    }

    function createThemeChart() {
        const ctx = qs("#themeChart");
        if (!ctx) return;

        if (state.charts.themeChart) {
            state.charts.themeChart.destroy();
        }

        const themeData = state.themes.filter(t => t.count > 0).slice(0, 10);

        if (themeData.length === 0) {
            ctx.parentElement.innerHTML = `
                <h3>📊 Répartition par Thème</h3>
                <div style="text-align: center; padding: 60px 20px; color: #64748b;">
                    <div style="font-size: 3rem; margin-bottom: 15px;">📊</div>
                    <div style="font-size: 1.1rem;">Aucune donnée de thème disponible</div>
                </div>
            `;
            return;
        }

        state.charts.themeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: themeData.map(t => t.name),
                datasets: [{
                    data: themeData.map(t => t.count),
                    backgroundColor: themeData.map(t => t.color),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { padding: 15, font: { size: 12 } }
                    }
                }
            }
        });
    }

    function createTimelineChart() {
        const ctx = qs("#timelineChart");
        if (!ctx) return;

        if (state.charts.timelineChart) {
            state.charts.timelineChart.destroy();
        }

        // registre explicitement le plugin si nécessaire
        if (typeof Chart.register === 'function' && window['ChartZoom']) {
            try { Chart.register(window['ChartZoom']); } catch (e) { /* déjà enregistré */ }
        }

        const topThemes = state.themes.filter(t => t.count > 0).slice(0, 5);
        const themeCounts = {};

        topThemes.forEach(theme => {
            themeCounts[theme.name] = (state.articles || []).map(a =>
                a.themes.includes(theme.name) ? 1 : 0
            );
        });

        const data = {
            dates: Array.from(new Set(state.articles.map(a => isoDay(a.date)))).filter(d => d).sort().slice(-30),
            themes: topThemes.map(theme => ({
                name: theme.name,
                color: theme.color,
                values: state.articles.map(article => {
                    const date = isoDay(article.date);
                    return date && themeCounts[theme.name] ? themeCounts[theme.name][state.articles.indexOf(article)] : 0;
                })
            }))
        };

        // Applique les données transformées au graphique
        updateTimelineChart(data);



    } function createSentimentChart() {
        const ctx = qs("#sentimentChart");
        if (!ctx) return;

        if (state.charts.sentimentChart) {
            state.charts.sentimentChart.destroy();
        }

        const sentimentData = {
            positive: state.articles.filter(a => a.sentiment && a.sentiment.sentiment === 'positive').length,
            neutral: state.articles.filter(a => a.sentiment && a.sentiment.sentiment === 'neutral').length,
            negative: state.articles.filter(a => a.sentiment && a.sentiment.sentiment === 'negative').length
        };

        const total = sentimentData.positive + sentimentData.neutral + sentimentData.negative;
        if (total === 0) {
            ctx.parentElement.innerHTML = `
                <h3>😊 Analyse des Sentiments</h3>
                <div style="text-align: center; padding: 40px 20px; color: #64748b;">
                    <div style="font-size: 3rem; margin-bottom: 15px;">😊</div>
                    <div style="font-size: 1.1rem;">Aucune donnée de sentiment disponible</div>
                </div>
            `;
            return;
        }

        state.charts.sentimentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Positif', 'Neutre', 'Négatif'],
                datasets: [{
                    label: "Nombre d'articles",
                    data: [sentimentData.positive, sentimentData.neutral, sentimentData.negative],
                    backgroundColor: ['#10b981', '#6b7280', '#ef4444'],
                    borderWidth: 1,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    function createSentimentEvolutionChart() {
        const ctx = qs("#sentimentEvolutionChart");
        if (!ctx) return;

        if (state.charts.sentimentEvolutionChart) {
            state.charts.sentimentEvolutionChart.destroy();
        }

        const dates = Array.from(new Set(state.articles.map(a => isoDay(a.date)))).filter(d => d).sort().slice(-30);

        if (dates.length === 0) return;

        const sentimentByDate = dates.map(date => {
            const articlesOfDay = state.articles.filter(a => isoDay(a.date) === date);
            const avgScore = articlesOfDay.length > 0
                ? articlesOfDay.reduce((sum, a) => sum + (a.sentiment?.score || 0), 0) / articlesOfDay.length
                : 0;
            return avgScore;
        });

        state.charts.sentimentEvolutionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })),
                datasets: [{
                    label: 'Score de sentiment moyen',
                    data: sentimentByDate,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    function createThemeEvolutionChart() {
        const ctx = qs("#themeEvolutionChart");
        if (!ctx) return;

        if (state.charts.themeEvolutionChart) {
            state.charts.themeEvolutionChart.destroy();
        }

        const dates = Array.from(new Set(state.articles.map(a => isoDay(a.date)))).filter(d => d).sort().slice(-30);

        if (dates.length === 0) return;

        const topThemes = state.themes.filter(t => t.count > 0).slice(0, 8);

        const datasets = topThemes.map(theme => {
            const data = dates.map(date => {
                return state.articles.filter(a =>
                    isoDay(a.date) === date &&
                    a.themes.includes(theme.name)
                ).length;
            });

            return {
                label: theme.name,
                data: data,
                borderColor: theme.color,
                backgroundColor: theme.color + '40',
                tension: 0.3,
                fill: true,
                borderWidth: 2
            };
        });

        state.charts.themeEvolutionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { padding: 10, usePointStyle: true, font: { size: 11 } }
                    }
                }
            }
        });
    }    // ========== GESTION DES ONGLETS ==========
    function showTab(tabName) {
        qsa(".tab-content").forEach(div => {
            div.style.display = "none";
            div.classList.remove("active");
        });

        qsa(".tab").forEach(tab => {
            tab.classList.remove("active");
        });

        const targetTab = qs(`#${tabName}Tab`);
        const targetButton = qsa('.tab').find(tab => tab.getAttribute('onclick')?.includes(tabName));

        if (targetTab) {
            targetTab.style.display = "block";
            targetTab.classList.add("active");
        }

        if (targetButton) {
            targetButton.classList.add("active");
        }

        state.currentTab = tabName;
        console.log(`📂 Onglet activé: ${tabName}`);

        loadTabData(tabName);
    }

    function loadTabData(tabName) {
        console.log(`📊 Chargement données pour: ${tabName}`);

        switch (tabName) {
            case "analysis":
                updateAllCharts();
                break;
            case "metrics":
                loadMetrics();
                break;
            case "sentiment":
                loadSentimentOverview();
                break;
            case "learning":
                loadLearningStats();
                break;
            case "feeds":
                loadFeedsManager();
                break;
            case "themes":
                loadThemesManager();
                break;
            case "articles":
                if (state.articles.length === 0) loadArticles();
                break;
            case "settings":
                loadSettings();
                break;
            default:
                console.warn(`⚠️ Onglet inconnu: ${tabName}`);
        }
    }    // ========== GESTION DES THÈMES ==========
    async function loadThemesManager() {
        const container = qs("#themesManagerList");
        if (!container) return;

        try {
            container.innerHTML = '<div class="loading">Chargement des thèmes...</div>';
            await loadThemes();

            if (state.themes.length > 0) {
                container.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="font-weight: 600; color: #1e293b;">Thèmes configurés</div>
                        <div>
                            <button onclick="window.app.showAddThemeModal()" class="btn btn-success" style="padding: 8px 12px;">➕ Ajouter un thème</button>
                            <button onclick="window.app.importThemesFromFile()" class="btn btn-secondary" style="padding: 8px 12px; margin-left:8px;">📥 Importer</button>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">
                        ${state.themes.map(theme => `
                            <div class="theme-card" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                                    <div style="width: 20px; height: 20px; border-radius: 50%; background: ${theme.color || '#6366f1'};"></div>
                                    <h4 style="margin: 0; flex: 1;">${escapeHtml(theme.name)}</h4>
                                    <span style="background: #f1f5f9; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; color: #64748b;">
                                        ${theme.count || 0} articles
                                    </span>
                                </div>
                                
                                <div style="color: #64748b; font-size: 0.9rem; margin-bottom: 15px;">
                                    ${escapeHtml(theme.description || 'Pas de description')}
                                </div>
                                
                                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 15px;">
                                    ${(theme.keywords || []).slice(0, 8).map(keyword => `
                                        <span style="padding: 2px 8px; background: #f1f5f9; border-radius: 12px; font-size: 0.75rem; color: #475569;">
                                            ${escapeHtml(keyword)}
                                        </span>
                                    `).join('')}
                                    ${(theme.keywords || []).length > 8 ? `
                                        <span style="font-size: 0.75rem; color: #64748b;">+${theme.keywords.length - 8} autres</span>
                                    ` : ''}
                                    ${(theme.keywords || []).length === 0 ? `
                                        <span style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">Aucun mot-clé</span>
                                    ` : ''}
                                </div>
                                
                                <div style="display: flex; gap: 8px;">
                                    <button onclick="window.app.editTheme('${theme.id}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;">
                                        ✏️ Modifier
                                    </button>
                                    <button onclick="window.app.deleteTheme('${theme.id}')" class="btn btn-danger" style="padding: 6px 12px; font-size: 0.85rem;">
                                        🗑️ Supprimer
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; text-align: center; color: #64748b;">
                        Total: ${state.themes.length} thème${plural(state.themes.length)} configuré${plural(state.themes.length)}
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="loading" style="text-align: center; padding: 60px 20px;">
                        <div style="font-size: 3rem; margin-bottom: 20px;">🎨</div>
                        <div style="font-size: 1.2rem; color: #64748b; margin-bottom: 20px;">Aucun thème configuré</div>
                        <div style="display:flex; gap:10px; justify-content:center;">
                            <button onclick="window.app.showAddThemeModal()" class="btn btn-success" style="padding: 15px 20px; font-size: 1.1rem;">
                                ➕ Ajouter un thème
                            </button>
                            <button onclick="window.app.importThemesFromFile()" class="btn btn-secondary" style="padding: 15px 20px; font-size: 1.1rem;">
                                📥 Charger les thèmes par défaut
                            </button>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('❌ Erreur chargement thèmes:', error);
            container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement des thèmes</div>';
        }
    }

    async function importThemesFromFile() {
        if (!confirm('Charger les thèmes par défaut depuis le fichier themes.json ?\n\nCela mettra à jour les thèmes existants.')) {
            return;
        }

        setMessage("Importation des thèmes...", "info");

        try {
            const data = await apiPOST("/themes/import");
            if (data.success) {
                setMessage(`✅ ${data.imported} thèmes importés avec succès`, "success");
                await loadThemes();
                loadThemesManager();
            } else {
                throw new Error(data.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error('❌ Erreur import thèmes:', error);
            setMessage("Erreur: " + error.message, "error");
        }
    }

    async function editTheme(themeId) {
        try {
            const theme = state.themes.find(t => t.id === themeId);
            if (!theme) {
                alert('Thème non trouvé');
                return;
            }

            const modalHtml = `
                <div id="editThemeModal" class="modal" style="display: block;">
                    <div class="modal-content">
                        <span class="close" onclick="window.app.closeModal('editThemeModal')">&times;</span>
                        <h2>✏️ Modifier le Thème</h2>
                        
                        <div style="margin: 15px 0;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nom du thème:</label>
                            <input type="text" id="editThemeName" value="${escapeHtml(theme.name)}" 
                                   style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                        </div>
                        
                        <div style="margin: 15px 0;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Mots-clés (un par ligne):</label>
                            <textarea id="editThemeKeywords" 
                                      style="width: 100%; height: 150px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-family: monospace;">${(theme.keywords || []).join('\n')}</textarea>
                        </div>
                        
                        <div style="margin: 15px 0;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Couleur:</label>
                            <input type="color" id="editThemeColor" value="${theme.color || '#6366f1'}" 
                                   style="width: 100%; height: 40px; border: 1px solid #e2e8f0; border-radius: 8px;">
                        </div>
                        
                        <div style="margin: 15px 0;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Description:</label>
                            <textarea id="editThemeDescription" 
                                      style="width: 100%; height: 80px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">${escapeHtml(theme.description || '')}</textarea>
                        </div>

                        <div style="display: flex; gap: 10px;">
                            <button class="btn btn-success" onclick="window.app.saveThemeEdits('${themeId}')">💾 Enregistrer</button>
                            <button class="btn btn-secondary" onclick="window.app.closeModal('editThemeModal')">❌ Annuler</button>
                        </div>
                    </div>
                </div>
            `;

            const oldModal = qs('#editThemeModal');
            if (oldModal) oldModal.remove();

            document.body.insertAdjacentHTML('beforeend', modalHtml);
        } catch (error) {
            console.error('❌ Erreur édition thème:', error);
            alert('Erreur: ' + error.message);
        }
    }

    async function saveThemeEdits(themeId) {
        const name = qs('#editThemeName').value;
        const keywordsText = qs('#editThemeKeywords').value;
        const color = qs('#editThemeColor').value;
        const description = qs('#editThemeDescription').value;

        if (!name || name.trim().length === 0) {
            alert('Veuillez entrer un nom de thème valide');
            return;
        }

        const keywords = keywordsText.split('\n')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        if (keywords.length === 0) {
            alert('Veuillez entrer au moins un mot-clé');
            return;
        }

        setMessage("Sauvegarde du thème...", "info");

        try {
            const data = await apiPOST("/themes", {
                name,
                keywords,
                color,
                description
            });

            if (data.success) {
                closeModal('editThemeModal');
                await loadThemes();
                loadThemesManager();
                setMessage("✅ Thème modifié avec succès !", "success");
            } else {
                throw new Error(data.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error('❌ Erreur sauvegarde thème:', error);
            alert('Erreur: ' + error.message);
        }
    }

    async function deleteTheme(themeId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce thème ?\n\nCette action supprimera également toutes les analyses associées.')) {
            return;
        }

        setMessage("Suppression du thème...", "info");
        try {
            const data = await apiDELETE(`/themes/${themeId}`);
            if (data.success) {
                await loadThemes();
                loadThemesManager();
                setMessage("✅ Thème supprimé avec succès", "success");
            } else {
                throw new Error(data.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error('❌ Erreur suppression thème:', error);
            alert('Erreur: ' + error.message);
        }
    }    // ========== GESTION DES FLUX RSS ==========
    async function loadFeedsManager() {
        const container = qs("#feedsManagerList");
        if (!container) return;

        try {
            container.innerHTML = '<div class="loading">Chargement des flux...</div>';
            await loadFeeds();

            if (state.feeds.length > 0) {
                container.innerHTML = `
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8fafc;">
                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">URL</th>
                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Statut</th>
                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Dernier fetch</th>
                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${state.feeds.map(feed => `
                                    <tr>
                                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                            <div style="font-weight: 500;">${escapeHtml(feed.title || 'Sans titre')}</div>
                                            <div style="font-size: 0.85rem; color: #64748b; word-break: break-all;">${escapeHtml(feed.url)}</div>
                                        </td>
                                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                            <span style="padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; background: ${feed.is_active ? '#10b98120' : '#ef444420'}; color: ${feed.is_active ? '#10b981' : '#ef4444'};">
                                                ${feed.is_active ? '✅ Actif' : '❌ Inactif'}
                                            </span>
                                        </td>
                                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                            ${feed.last_fetched ? formatDate(feed.last_fetched) : 'Jamais'}
                                        </td>
                                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                            <button onclick="window.app.toggleFeed(${feed.id}, ${!feed.is_active})" class="btn ${feed.is_active ? 'btn-secondary' : 'btn-success'}" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 5px;">
                                                ${feed.is_active ? '❌ Désactiver' : '✅ Activer'}
                                            </button>
                                            <button onclick="window.app.deleteFeed(${feed.id})" class="btn btn-danger" style="padding: 6px 12px; font-size: 0.8rem;">🗑️ Supprimer</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top: 15px; color: #64748b; font-size: 0.9rem;">
                        Total: ${state.feeds.length} flux configuré${plural(state.feeds.length)}
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="loading" style="text-align: center; padding: 60px 20px;">
                        <div style="font-size: 3rem; margin-bottom: 20px;">📰</div>
                        <div style="font-size: 1.2rem; color: #64748b; margin-bottom: 20px;">Aucun flux configuré</div>
                        <button onclick="window.app.showAddFeedModal()" class="btn btn-success" style="padding: 15px 30px; font-size: 1.1rem;">
                            ➕ Ajouter un flux RSS
                        </button>
                    </div>
                `;
            }
        } catch (error) {
            console.error('❌ Erreur chargement flux:', error);
            container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement</div>';
        }
    }

    async function toggleFeed(id, isActive) {
        try {
            const response = await apiPUT(`/feeds/${id}`, { is_active: isActive });
            if (response.success) {
                await loadFeeds();
                loadFeedsManager();
                setMessage(`✅ Statut du flux mis à jour`, "success");
            } else {
                alert('Erreur: ' + response.error);
            }
        } catch (error) {
            alert('Erreur: ' + error.message);
        }
    }

    async function deleteFeed(id) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce flux ?')) return;
        try {
            const response = await apiDELETE(`/feeds/${id}`);
            if (response.success) {
                await loadFeeds();
                loadFeedsManager();
                setMessage('✅ Flux supprimé avec succès', "success");
            } else {
                alert('Erreur: ' + response.error);
            }
        } catch (error) {
            alert('Erreur: ' + error.message);
        }
    }

    // Ouvre le modal d'ajout de thème
    function showAddThemeModal() {
        const modal = qs('#addThemeModal');
        if (modal) modal.style.display = 'block';
    }

    // Ouvre le modal d'ajout de flux RSS (modal complet)
    function showAddFeedModal() {
        const old = qs('#addFeedModal');
        if (old) old.remove();

        const modalHtml = `
            <div id="addFeedModal" class="modal" style="display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1100;">
                <div class="modal-content" style="background: white; border-radius: 10px; max-width: 640px; width: 92%; margin: 6vh auto; padding: 20px; position: relative;">
                    <span class="close" onclick="window.app.closeModal('addFeedModal')" style="position: absolute; right: 14px; top: 10px; font-size: 22px; cursor: pointer; color: #64748b;">&times;</span>
                    <h2 style="margin-top:0; color: #1e40af;">➕ Ajouter un flux RSS</h2>

                    <div style="margin-top: 12px;">
                        <label style="display:block; font-weight:600; margin-bottom:6px;">Titre (optionnel)</label>
                        <input id="newFeedTitle" type="text" placeholder="Titre du flux (ex: Le Monde)" 
                               style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px;">
                    </div>

                    <div style="margin-top: 12px;">
                        <label style="display:block; font-weight:600; margin-bottom:6px;">URL du flux (obligatoire)</label>
                        <input id="newFeedURL" type="url" placeholder="https://exemple.com/rss.xml" 
                               style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px;">
                    </div>

                    <div style="margin-top: 12px; display:flex; gap:12px; align-items:center;">
                        <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
                            <input id="newFeedIsActive" type="checkbox" checked>
                            <span style="font-weight:400;">Activer le flux</span>
                        </label>
                        <span style="color:#64748b; font-size:0.9rem;">Vous pouvez le désactiver plus tard</span>
                    </div>

                    <div id="addFeedError" style="display:none; color:#ef4444; margin-top:12px;"></div>

                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">
                        <button class="btn btn-secondary" onclick="window.app.closeModal('addFeedModal')" style="padding:10px 14px;">❌ Annuler</button>
                        <button id="createFeedBtn" class="btn btn-success" style="padding:10px 14px;" onclick="window.app.createFeed()">✅ Ajouter le flux</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const urlInput = qs('#newFeedURL');
        if (urlInput) urlInput.focus();
    }

    // Crée un flux via l'API et rafraîchit la liste (compatible /api/feeds du server.js)
    async function createFeed() {
        const btn = qs('#createFeedBtn');
        const errBox = qs('#addFeedError');
        if (errBox) { errBox.style.display = 'none'; errBox.textContent = ''; }

        const titleEl = qs('#newFeedTitle');
        const urlEl = qs('#newFeedURL');
        const activeEl = qs('#newFeedIsActive');

        const title = titleEl ? titleEl.value.trim() : '';
        const url = urlEl ? urlEl.value.trim() : '';
        const isActive = activeEl ? !!activeEl.checked : true;

        if (!url) {
            if (errBox) { errBox.style.display = 'block'; errBox.textContent = '❌ URL du flux requise.'; }
            return;
        }

        try {
            new URL(url);
        } catch (e) {
            if (errBox) { errBox.style.display = 'block'; errBox.textContent = '❌ URL invalide.'; }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Création en cours...';
        }
        setMessage("Création du flux...", "info");

        try {
            // server.js attend { url, title } ; is_active est toléré
            const payload = { url, title: title || undefined, is_active: isActive };

            const res = await apiPOST('/feeds', payload);

            if (!res || !res.success) {
                const msg = res?.error || 'Erreur création flux';
                if (errBox) { errBox.style.display = 'block'; errBox.textContent = '❌ ' + msg; }
                setMessage("❌ " + msg, "error");
                throw new Error(msg);
            }

            // Fermer modal et rafraîchir l'affichage des flux
            closeModal('addFeedModal');
            await loadFeeds();
            await loadFeedsManager();

            setMessage("✅ Flux ajouté avec succès", "success");
        } catch (error) {
            console.error('❌ createFeed error:', error);
            if (!errBox) alert('Erreur création flux: ' + (error.message || error));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '✅ Ajouter le flux';
            }
        }
    }
    // ========== STATISTIQUES ==========
    async function loadMetrics() {
        const container = qs("#metricsTab");
        if (!container) return;

        try {
            const stats = await apiGET("/stats/global");
            if (stats.success || stats.total_articles !== undefined) {
                qs("#m_total").textContent = stats.total_articles || 0;
                qs("#m_confidence").textContent = stats.avg_confidence ? (stats.avg_confidence * 100).toFixed(1) + '%' : 'N/A';
                qs("#m_posterior").textContent = stats.avg_posterior ? (stats.avg_posterior * 100).toFixed(1) + '%' : 'N/A';
                qs("#m_corro").textContent = stats.avg_corroboration ? (stats.avg_corroboration * 100).toFixed(1) + '%' : 'N/A';

                const topThemesList = qs("#topThemes");
                if (topThemesList && stats.top_themes) {
                    topThemesList.innerHTML = stats.top_themes.slice(0, 10).map(theme => `
                        <li style="padding: 12px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 500;">${escapeHtml(theme.name)}</span>
                            <span style="background: #3b82f620; color: #3b82f6; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">
                                ${theme.count} articles
                            </span>
                        </li>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('❌ Erreur chargement métriques:', error);
        }
    }

    async function loadSentimentOverview() {
        const container = qs("#sentimentOverview");
        if (!container) return;

        try {
            const stats = await apiGET("/sentiment/stats");
            if (stats.success && stats.stats) {
                const s = stats.stats;
                container.innerHTML = `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
                        <div class="metric-card">
                            <h3>😊 Positifs</h3>
                            <div style="font-size: 2.5rem; color: #10b981;">${s.positive || 0}</div>
                            <div style="font-size: 0.9rem; color: #64748b; margin-top: 5px;">
                                ${s.total > 0 ? ((s.positive / s.total) * 100).toFixed(1) : 0}% du total
                            </div>
                        </div>
                        <div class="metric-card">
                            <h3>😐 Neutres</h3>
                            <div style="font-size: 2.5rem; color: #6b7280;">${s.neutral || 0}</div>
                            <div style="font-size: 0.9rem; color: #64748b; margin-top: 5px;">
                                ${s.total > 0 ? ((s.neutral / s.total) * 100).toFixed(1) : 0}% du total
                            </div>
                        </div>
                        <div class="metric-card">
                            <h3>😞 Négatifs</h3>
                            <div style="font-size: 2.5rem; color: #ef4444;">${s.negative || 0}</div>
                            <div style="font-size: 0.9rem; color: #64748b; margin-top: 5px;">
                                ${s.total > 0 ? ((s.negative / s.total) * 100).toFixed(1) : 0}% du total
                            </div>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('❌ Erreur stats sentiment:', error);
            container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement</div>';
        }
    }

    async function loadLearningStats() {
        const container = qs("#learningStats");
        if (!container) return;

        try {
            container.innerHTML = '<div class="loading">Chargement des statistiques...</div>';
            const stats = await apiGET("/learning/stats");

            if (stats.success || stats.total_articles_processed !== undefined) {
                container.innerHTML = `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
                        <div class="metric-card">
                            <h3>🎯 Précision moyenne</h3>
                            <div style="font-size: 2.5rem; color: #10b981;">${(stats.accuracy * 100).toFixed(1)}%</div>
                        </div>
                        <div class="metric-card">
                            <h3>📈 Modèle entraîné</h3>
                            <div style="font-size: 2.5rem; color: ${stats.is_trained ? '#10b981' : '#ef4444'};">
                                ${stats.is_trained ? '✅ Oui' : '❌ Non'}
                            </div>
                        </div>
                        <div class="metric-card">
                            <h3>📚 Articles analysés</h3>
                            <div style="font-size: 2.5rem; color: #3b82f6;">${stats.labeled_articles || stats.total_articles_processed || 0}</div>
                        </div>
                    </div>
                `;
            } else {
                container.innerHTML = '<div class="loading">Aucune donnée d\'apprentissage disponible</div>';
            }
        } catch (error) {
            console.error('❌ Erreur stats apprentissage:', error);
            container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement</div>';
        }
    }    // ========== PARAMÈTRES ==========
    async function loadSettings() {
        const container = qs("#settingsTab");
        if (!container) return;

        try {
            const savedAiConfig = localStorage.getItem("aiConfig");
            if (savedAiConfig) state.aiConfig = JSON.parse(savedAiConfig);

            const savedEmailConfig = localStorage.getItem("emailConfig");
            if (savedEmailConfig) state.emailConfig = JSON.parse(savedEmailConfig);

            const savedUiConfig = localStorage.getItem("uiConfig");
            if (savedUiConfig) state.uiConfig = JSON.parse(savedUiConfig);
        } catch (e) {
            console.warn("Erreur chargement config:", e);
        }

        container.innerHTML = `
            <div class="settings-container">
                <!-- Configuration IA -->
                <div class="card full-width" style="margin-bottom: 20px;">
                    <h3>🤖 Configuration de l'IA</h3>
                    
                    <div style="margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 8px;">
                        <h4 style="margin-bottom: 15px;">🌐 IA Distante (OpenAI)</h4>
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Clé API OpenAI:</label>
                            <input type="password" id="openaiKey" value="${state.aiConfig?.openaiKey || ''}" 
                                   placeholder="sk-..." 
                                   style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                        </div>
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Modèle:</label>
                            <select id="openaiModel" style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                                <option value="gpt-3.5-turbo" ${state.aiConfig?.openaiModel === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo</option>
                                <option value="gpt-4" ${state.aiConfig?.openaiModel === 'gpt-4' ? 'selected' : ''}>GPT-4</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-success" onclick="window.app.saveAIConfig()">💾 Sauvegarder</button>
                        <button class="btn btn-secondary" onclick="window.app.testAIConnection()">🔌 Tester</button>
                    </div>
                </div>

                <!-- Configuration Email -->
                <div class="card full-width" style="margin-bottom: 20px;">
                    <h3>✉️ Configuration Email</h3>
                    
                    <div style="margin: 20px 0;">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Serveur SMTP:</label>
                            <input type="text" id="smtpHost" value="${state.emailConfig?.smtpHost || ''}" 
                                   placeholder="smtp.gmail.com" 
                                   style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                        </div>
                        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Utilisateur:</label>
                                <input type="email" id="smtpUser" value="${state.emailConfig?.smtpUser || ''}" 
                                       placeholder="votre-email@example.com" 
                                       style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Port:</label>
                                <input type="number" id="smtpPort" value="${state.emailConfig?.smtpPort || '587'}" 
                                       placeholder="587" 
                                       style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            </div>
                        </div>
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Mot de passe:</label>
                            <input type="password" id="smtpPass" value="${state.emailConfig?.smtpPass || ''}" 
                                   placeholder="••••••••" 
                                   style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                        </div>
                        <div style="margin-bottom: 15px;">
                            <label style="display: flex; align-items: center; gap: 10px;">
                                <input type="checkbox" id="smtpSecure" ${state.emailConfig?.smtpSecure ? 'checked' : ''}>
                                <span>Utiliser SSL/TLS</span>
                            </label>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-success" onclick="window.app.saveEmailConfig()">💾 Sauvegarder</button>
                        <button class="btn btn-secondary" onclick="window.app.testEmailConfig()">📧 Tester</button>
                    </div>
                </div>                <!-- Configuration Interface -->
                <div class="card full-width">
                    <h3>🎨 Paramètres d'Interface</h3>

                    <div style="margin: 20px 0;">
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-weight: 600;">Thème visuel:</label>
                            <div style="display: flex; gap: 15px;">
                                <label style="padding: 15px; border: 2px solid ${state.uiConfig?.theme === 'light' ? '#3b82f6' : '#e2e8f0'}; border-radius: 8px; cursor: pointer; flex: 1; text-align: center;">
                                    <input type="radio" name="theme" value="light" ${state.uiConfig?.theme === 'light' ? 'checked' : ''} style="display: none;">
                                    <div style="font-size: 2rem;">☀️</div>
                                    <div style="font-weight: 600; margin-top: 5px;">Clair</div>
                                </label>
                                <label style="padding: 15px; border: 2px solid ${state.uiConfig?.theme === 'dark' ? '#3b82f6' : '#e2e8f0'}; border-radius: 8px; cursor: pointer; flex: 1; text-align: center;">
                                    <input type="radio" name="theme" value="dark" ${state.uiConfig?.theme === 'dark' ? 'checked' : ''} style="display: none;">
                                    <div style="font-size: 2rem;">🌙</div>
                                    <div style="font-weight: 600; margin-top: 5px;">Sombre</div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-success" onclick="window.app.saveUIConfig()">💾 Sauvegarder</button>
                    </div>
                </div>
            </div>
        `;
    }

    function saveAIConfig() {
        state.aiConfig = {
            openaiKey: qs("#openaiKey").value,
            openaiModel: qs("#openaiModel").value
        };

        localStorage.setItem("aiConfig", JSON.stringify(state.aiConfig));
        setMessage("✅ Configuration IA sauvegardée", "success");
    }

    async function testAIConnection() {
        setMessage("🔌 Test de connexion IA...", "info");
        try {
            const response = await apiGET("/health");
            if (response.success) {
                setMessage("✅ Connexion IA réussie", "success");
            } else {
                setMessage("⚠️ Service IA non disponible", "warning");
            }
        } catch (error) {
            setMessage("❌ Erreur de connexion IA: " + error.message, "error");
        }
    }

    function saveEmailConfig() {
        const smtpHost = qs("#smtpHost");
        const smtpUser = qs("#smtpUser");
        const smtpPort = qs("#smtpPort");
        const smtpPass = qs("#smtpPass");
        const smtpSecure = qs("#smtpSecure");

        if (!smtpHost || !smtpUser) {
            setMessage("❌ Champs email manquants", "error");
            return;
        }

        state.emailConfig = {
            smtpHost: smtpHost.value || '',
            smtpUser: smtpUser.value || '',
            smtpPort: parseInt(smtpPort?.value) || 587,
            smtpPass: smtpPass?.value || '',
            smtpSecure: smtpSecure?.checked || false
        };

        localStorage.setItem("emailConfig", JSON.stringify(state.emailConfig));
        setMessage("✅ Configuration email sauvegardée", "success");
    }

    async function testEmailConfig() {
        if (!state.emailConfig || !state.emailConfig.smtpHost) {
            setMessage("❌ Veuillez d'abord configurer les paramètres email", "error");
            return;
        }

        setMessage("📧 Envoi d'un email de test...", "info");

        try {
            const response = await apiPOST("/test-email", {
                to: state.emailConfig.smtpUser,
                subject: "Test - Agrégateur RSS",
                body: "Ceci est un email de test. Votre configuration fonctionne correctement !"
            });

            if (response.success) {
                setMessage("✅ Email de test envoyé avec succès", "success");
            } else {
                setMessage("❌ Échec de l'envoi: " + response.error, "error");
            }
        } catch (error) {
            setMessage("❌ Erreur: " + error.message, "error");
        }
    }

    function saveUIConfig() {
        state.uiConfig = {
            theme: document.querySelector('input[name="theme"]:checked')?.value || 'light',
            language: 'fr',
            chartColors: 'default'
        };

        localStorage.setItem("uiConfig", JSON.stringify(state.uiConfig));
        setMessage("✅ Paramètres d'interface sauvegardés", "success");
        applyUIConfig();
    }

    function applyUIConfig() {
        if (state.uiConfig.theme === 'dark') {
            document.body.style.backgroundColor = '#1e293b';
            document.body.style.color = '#f1f5f9';
        } else {
            document.body.style.backgroundColor = '#f5f7fa';
            document.body.style.color = '#1e293b';
        }
    }    // ========== FONCTIONS D'EXPORT ==========
    async function exportArticlesToCSV() {
        try {
            setMessage("Génération du CSV...", "info");

            if (state.articles.length === 0) {
                alert("Aucun article à exporter");
                return;
            }

            const headers = ["ID", "Titre", "Date", "Lien", "Thèmes", "Sentiment", "Score", "Confiance", "Flux"];
            const csvRows = [headers.join(",")];

            state.articles.forEach(article => {
                const row = [
                    article.id,
                    `"${(article.title || '').replace(/"/g, '""')}"`,
                    `"${article.date || ''}"`,
                    `"${article.link || ''}"`,
                    `"${(article.themes || []).join('; ').replace(/"/g, '""')}"`,
                    `"${article.sentiment?.sentiment || 'neutral'}"`,
                    article.sentiment?.score || 0,
                    article.confidence || 0,
                    `"${article.feed || ''}"`
                ];
                csvRows.push(row.join(","));
            });

            const csvString = csvRows.join("\n");
            const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });

            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `articles-export-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setMessage("✅ Export CSV téléchargé avec succès", "success");
        } catch (error) {
            console.error("❌ Erreur export CSV:", error);
            setMessage("Erreur lors de l'export CSV: " + error.message, "error");
        }
    }

    async function exportToJSON() {
        try {
            setMessage("Génération de l'export JSON...", "info");

            const exportData = {
                export_date: new Date().toISOString(),
                total_articles: state.articles.length,
                articles: state.articles,
                themes: state.themes,
                summary: state.summary
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: "application/json" });

            const link = document.createElement("a");
            link.href = URL.createObjectURL(dataBlob);
            link.download = `rss-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setMessage("✅ Export JSON téléchargé avec succès", "success");
        } catch (error) {
            console.error("❌ Erreur export JSON:", error);
            setMessage("Erreur lors de l'export JSON: " + error.message, "error");
        }
    }
    // ========== RAPPORTS IA ==========
    async function generateAIAnalysisReport() {
        setMessage("🧠 Génération du rapport d'analyse IA...", "info");

        try {
            if (!state.aiConfig?.openaiKey) {
                setMessage("❌ Clé API OpenAI manquante. Configurez-la dans les paramètres.", "error");
                showTab("settings");
                return;
            }

            showReportGenerationInterface();

        } catch (error) {
            console.error("❌ Erreur préparation rapport:", error);
            setMessage("Erreur lors de la préparation du rapport: " + error.message, "error");
        }
    }

    function showReportGenerationInterface() {
        const modalHtml = `
            <div id="reportGenerationModal" class="modal" style="display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
                <div class="modal-content" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 12px; max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto;">
                    <span class="close" onclick="window.app.closeModal('reportGenerationModal')" style="float: right; font-size: 28px; cursor: pointer; color: #64748b;">&times;</span>
                    <h2 style="color: #1e40af; margin-bottom: 20px;">🧠 Rapport d'Analyse Avancée</h2>
                    
                    <div style="margin: 20px 0; padding: 15px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
                        <h4 style="color: #0369a1; margin-bottom: 10px;">📊 Données disponibles</h4>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px;">
                            <div><strong>Articles:</strong> ${state.articles.length}</div>
                            <div><strong>Thèmes:</strong> ${state.themes.length}</div>
                            <div><strong>Période:</strong> ${getAnalysisPeriod()}</div>
                            <div><strong>Sources:</strong> ${Object.keys(groupArticlesBySource()).length}</div>
                        </div>
                    </div>

                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #374151;">Type d'analyse:</label>
                        <select id="reportType" style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                            <option value="comprehensive">📈 Analyse complète</option>
                            <option value="trends">🚨 Détection de tendances</option>
                            <option value="sentiment">😊 Analyse de sentiment</option>
                            <option value="thematic">🎨 Analyse thématique</option>
                        </select>
                    </div>

                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #374151;">Niveau de détail:</label>
                        <select id="reportDetail" style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                            <option value="summary">Résumé exécutif</option>
                            <option value="detailed" selected>Analyse détaillée</option>
                            <option value="comprehensive">Rapport complet</option>
                        </select>
                    </div>

                    <div id="reportPreview" style="margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 8px; display: none;">
                        <h4 style="color: #374151;">📝 Aperçu du rapport</h4>
                        <div id="reportContent" style="max-height: 300px; overflow-y: auto; margin-top: 10px; padding: 10px; background: white; border-radius: 4px;"></div>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 25px;">
                        <button class="btn btn-success" onclick="window.app.generateReportWithAI()" style="padding: 12px 24px; font-size: 14px;">
                            🧠 Générer le rapport
                        </button>
                        <button class="btn btn-secondary" onclick="window.app.closeModal('reportGenerationModal')" style="padding: 12px 24px; font-size: 14px;">
                            ❌ Annuler
                        </button>
                    </div>
                </div>
            </div>
        `;

        const oldModal = qs('#reportGenerationModal');
        if (oldModal) oldModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function generateReportWithAI() {
        const reportType = qs('#reportType').value;
        const reportDetail = qs('#reportDetail').value;

        setMessage("🧠 L'IA analyse les données...", "info");

        const preview = qs('#reportPreview');
        const content = qs('#reportContent');
        if (preview) preview.style.display = 'block';
        if (content) content.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">🔄 Analyse en cours par l\'IA...</div>';

        try {
            const prompt = buildAIPrompt(reportType, reportDetail);
            const analysisResult = await callOpenAIAnalysis(prompt);

            if (content) {
                content.innerHTML = formatAIResponse(analysisResult);
            }

            showReportDownloadOptions(analysisResult, reportType);

        } catch (error) {
            console.error("❌ Erreur génération rapport IA:", error);
            setMessage("❌ Erreur lors de l'analyse IA: " + error.message, "error");
            if (content) {
                content.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">❌ Erreur: ${error.message}</div>`;
            }
        }
    }

    function buildAIPrompt(reportType, reportDetail) {
        const basePrompt = {
            comprehensive: "Fournis une analyse complète des données RSS agrégées, incluant les tendances principales, l'analyse de sentiment, et les insights clés.",
            trends: "Identifie les tendances émergentes, les sujets en croissance, et les patterns temporels significatifs.",
            sentiment: "Analyse en profondeur l'évolution des sentiments, les corrélations entre thèmes et sentiments.",
            thematic: "Explore les relations entre les différents thèmes, les co-occurrences, et l'évolution thématique."
        };

        const detailLevel = {
            summary: "en te concentrant sur les points clés et un résumé exécutif",
            detailed: "avec une analyse détaillée et des exemples concrets",
            comprehensive: "avec une analyse exhaustive incluant données quantitatives et qualitatives"
        };

        return `
En tant qu'analyste expert de données médias, ${basePrompt[reportType]} ${detailLevel[reportDetail]}.

Données à analyser:
- ${state.articles.length} articles RSS agrégés
- ${state.themes.length} thèmes identifiés
- Période: ${getAnalysisPeriod()}
- Distribution des sentiments: ${JSON.stringify(getSentimentDistribution())}

Points d'analyse requis:
1. Synthèse des tendances principales
2. Analyse des patterns temporels  
3. Évolution des sentiments
4. Corrélations thèmes/sentiments
5. Insights actionnables
6. Recommandations stratégiques

Format de réponse: Structuré en sections claires avec titres, points clés, et données chiffrées.
`;
    } async function callOpenAIAnalysis(prompt) {
        if (!state.aiConfig?.openaiKey) {
            throw new Error("Clé API OpenAI non configurée");
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.aiConfig.openaiKey}`
            },
            body: JSON.stringify({
                model: state.aiConfig.openaiModel || 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'Tu es un analyste expert de données médias et RSS. Tu fournis des analyses structurées, factuelles et actionnables basées sur les données fournies.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API: ${errorData.error?.message || 'Erreur inconnue'}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || 'Aucune réponse générée';
    }

    function formatAIResponse(response) {
        return `
            <div style="font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #374151;">
                ${response.replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #1e40af;">$1</strong>')
                .replace(/\*(.*?)\*/g, '<em style="color: #6b7280;">$1</em>')
                .replace(/### (.*?)(?=\n|$)/g, '<h3 style="color: #3b82f6; margin-top: 20px; font-size: 1.2em;">$1</h3>')
                .replace(/## (.*?)(?=\n|$)/g, '<h2 style="color: #1e40af; border-bottom: 2px solid #3b82f6; padding-bottom: 5px; margin-top: 25px; font-size: 1.4em;">$1</h2>')
                .replace(/- (.*?)(?=\n|$)/g, '<li style="margin: 8px 0; padding-left: 10px;">• $1</li>')
                .replace(/(\d+\. .*?)(?=\n|$)/g, '<li style="margin: 8px 0; padding-left: 10px;">$1</li>')}
            </div>
        `;
    }

    function showReportDownloadOptions(analysisResult, reportType) {
        const modal = qs('#reportGenerationModal .modal-content');
        if (!modal) return;

        const downloadSection = `
            <div style="margin: 20px 0; padding: 15px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
                <h4 style="color: #16a34a; margin-bottom: 10px;">✅ Rapport généré avec succès</h4>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn btn-success" onclick="window.app.downloadReportAsPDF('${reportType}')" style="padding: 10px 15px;">
                        📄 Télécharger PDF
                    </button>
                    <button class="btn btn-secondary" onclick="window.app.downloadReportAsHTML('${reportType}')" style="padding: 10px 15px;">
                        🌐 Télécharger HTML
                    </button>
                    <button class="btn btn-info" onclick="window.app.copyReportToClipboard()" style="padding: 10px 15px;">
                        📋 Copier le texte
                    </button>
                </div>
            </div>
        `;

        if (!qs('#downloadSection', modal)) {
            modal.insertAdjacentHTML('beforeend', downloadSection);
        }
    }

    async function downloadReportAsPDF(reportType) {
        try {
            setMessage("Génération du PDF...", "info");
            const content = qs('#reportContent').innerHTML;

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Rapport d'Analyse RSS</title>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; }
                            h1 { color: #1e40af; }
                            h2 { color: #3b82f6; border-bottom: 1px solid #3b82f6; }
                            .header { text-align: center; margin-bottom: 30px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>Rapport d'Analyse RSS</h1>
                            <p>Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
                        </div>
                        ${content}
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();

        } catch (error) {
            console.error("❌ Erreur génération PDF:", error);
            setMessage("Erreur lors de la génération du PDF", "error");
        }
    }

    function downloadReportAsHTML(reportType) {
        try {
            const content = qs('#reportContent').innerHTML;
            const fullHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Rapport d'Analyse RSS - ${reportType}</title>
    <style>
        body { 
            font-family: 'Segoe UI', system-ui, sans-serif; 
            line-height: 1.6; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            color: #333;
        }
        .header { 
            text-align: center; 
            margin-bottom: 40px; 
            border-bottom: 3px solid #3b82f6; 
            padding-bottom: 20px;
        }
        h1 { color: #1e40af; }
        h2 { color: #3b82f6; border-bottom: 1px solid #3b82f6; padding-bottom: 5px; }
        h3 { color: #2563eb; }
        .metadata { 
            background: #f8fafc; 
            padding: 15px; 
            border-radius: 8px; 
            margin: 20px 0; 
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧠 Rapport d'Analyse RSS</h1>
        <div class="metadata">
            <p><strong>Type:</strong> ${reportType} | <strong>Date:</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
            <p><strong>Articles analysés:</strong> ${state.articles.length} | <strong>Thèmes:</strong> ${state.themes.length}</p>
        </div>
    </div>
    ${content}
</body>
</html>`;

            const blob = new Blob([fullHtml], { type: 'text/html' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `rapport-${reportType}-${new Date().toISOString().split('T')[0]}.html`;
            link.click();

            setMessage("✅ Rapport HTML téléchargé", "success");
        } catch (error) {
            console.error("❌ Erreur téléchargement HTML:", error);
            setMessage("Erreur lors du téléchargement HTML", "error");
        }
    }

    async function copyReportToClipboard() {
        try {
            const content = qs('#reportContent').textContent;
            await navigator.clipboard.writeText(content);
            setMessage("✅ Rapport copié dans le presse-papier", "success");
        } catch (error) {
            console.error("❌ Erreur copie presse-papier:", error);
            setMessage("Erreur lors de la copie", "error");
        }
    }    // ========== UTILITAIRES POUR L'ANALYSE ==========
    function getAnalysisPeriod() {
        if (state.articles.length === 0) return "Aucune donnée";
        const dates = state.articles.map(a => new Date(a.date)).filter(d => !isNaN(d));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        return `${minDate.toLocaleDateString('fr-FR')} - ${maxDate.toLocaleDateString('fr-FR')}`;
    }

    function getSentimentDistribution() {
        return {
            positive: state.articles.filter(a => a.sentiment?.sentiment === 'positive').length,
            neutral: state.articles.filter(a => a.sentiment?.sentiment === 'neutral').length,
            negative: state.articles.filter(a => a.sentiment?.sentiment === 'negative').length
        };
    }

    function groupArticlesBySource() {
        const sources = {};
        state.articles.forEach(article => {
            const source = article.feed || 'Inconnu';
            sources[source] = (sources[source] || 0) + 1;
        });
        return sources;
    }

    // ========== AUTO-REFRESH ==========
    function startAutoRefresh() {
        if (state.timers.autoRefresh) {
            clearInterval(state.timers.autoRefresh);
        }

        if (state.autoRefresh) {
            state.timers.autoRefresh = setInterval(() => {
                console.log("🔄 Auto-refresh déclenché");
                refreshArticles().catch(err => {
                    console.warn("⚠️ Auto-refresh échoué:", err);
                });
            }, state.refreshIntervalMs);

            console.log(`✅ Auto-refresh activé (${state.refreshIntervalMs / 1000 / 60} min)`);
        }
    }

    function stopAutoRefresh() {
        if (state.timers.autoRefresh) {
            clearInterval(state.timers.autoRefresh);
            state.timers.autoRefresh = null;
            console.log("❌ Auto-refresh désactivé");
        }
    }    // ========== INITIALISATION ==========
    async function init() {
        console.log("🚀 Initialisation de l'application...");

        // Charger les configurations
        try {
            const savedAiConfig = localStorage.getItem("aiConfig");
            if (savedAiConfig) state.aiConfig = JSON.parse(savedAiConfig);

            const savedEmailConfig = localStorage.getItem("emailConfig");
            if (savedEmailConfig) state.emailConfig = JSON.parse(savedEmailConfig);

            const savedUiConfig = localStorage.getItem("uiConfig");
            if (savedUiConfig) {
                state.uiConfig = JSON.parse(savedUiConfig);
                applyUIConfig();
            }
        } catch (e) {
            console.warn("Erreur chargement config:", e);
        }

        // Activer l'onglet par défaut
        showTab("articles");

        // Charger les données initiales
        try {
            await Promise.all([
                loadArticles(),
                loadThemes(),
                loadFeeds()
            ]);

            updateAllCharts();
            loadMetrics();
        } catch (error) {
            console.error("❌ Erreur chargement initial:", error);
        }

        // Démarrer l'auto-refresh
        startAutoRefresh();

        // Gestionnaire de fermeture des modals
        window.addEventListener('click', function (event) {
            const modals = qsa('.modal');
            modals.forEach(modal => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });

        console.log("✅ Application initialisée");
    }    // ========== EXPOSITION PUBLIQUE ==========
    return {
        // Fonctions principales
        init,
        showTab,
        closeModal,

        // Gestion des données
        loadArticles,
        loadThemes,
        loadFeeds,
        refreshArticles,

        // Gestion des thèmes
        loadThemesManager,
        importThemesFromFile,
        editTheme,
        saveThemeEdits,
        deleteTheme,
        showAddThemeModal: showAddThemeModal,
        createTheme,

        // Gestion des flux
        loadFeedsManager,
        toggleFeed,
        deleteFeed,
        showAddFeedModal,
        createFeed,

        // Statistiques
        loadMetrics,
        loadSentimentOverview,
        loadLearningStats,

        // Paramètres
        loadSettings,
        saveAIConfig,
        testAIConnection,
        saveEmailConfig,
        testEmailConfig,
        saveUIConfig,

        // Export
        exportArticlesToCSV,
        exportToJSON,

        // Utilitaires
        computeThemesFromArticles,
        updateAllCharts,

        // Rapports IA
        generateAIAnalysisReport,
        generateReportWithAI,
        downloadReportAsPDF,
        downloadReportAsHTML,
        copyReportToClipboard,

        // État
        state
    };
})();

// ========== INITIALISATION AU CHARGEMENT ==========
document.addEventListener("DOMContentLoaded", function () {
    window.app.init();
});

// ========== EXPOSITION GLOBALE POUR COMPATIBILITÉ HTML ==========
window.showTab = window.app.showTab;
window.closeModal = window.app.closeModal;

// updateTimelineChart + helpers (à coller dans le scope où state et Chart sont accessibles)

function updateTimelineChart(data) {
    const ctx = document.querySelector("#timelineChart");
    if (!ctx) return;

    // détruit ancien chart si présent
    if (state.charts.timelineChart) {
        state.charts.timelineChart.destroy();
        state.charts.timelineChart = null;
    }

    // registre explicitement le plugin si nécessaire
    if (typeof Chart.register === 'function' && window['ChartZoom']) {
        try { Chart.register(window['ChartZoom']); } catch (e) { /* déjà enregistré */ }
    }

    const datasets = (data.themes || []).map(t => ({
        label: t.name,
        data: (data.dates || []).map((d, i) => ({ x: d, y: t.values[i] || 0 })),
        borderColor: t.color || '#3b82f6',
        backgroundColor: (t.color || '#3b82f6') + '33',
        tension: 0.3,
        fill: true,
        pointRadius: 2,
        borderWidth: 2
    }));

    const config = {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            parsing: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day', tooltipFormat: 'dd MMM yyyy' },
                    ticks: { maxRotation: 0, autoSkip: true },
                    title: { display: true, text: 'Date' }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Nombre d\'articles' }
                }
            },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { position: 'top' },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: 'ctrl' // optionnel : pan avec Ctrl+drag
                    },
                    zoom: {
                        wheel: { enabled: true, speed: 0.1 }, // molette
                        pinch: { enabled: true },             // pinch smartphone
                        mode: 'x'
                    },
                    limits: {
                        x: {
                            min: data.dates && data.dates.length ? data.dates[0] : undefined,
                            max: data.dates && data.dates.length ? data.dates[data.dates.length - 1] : undefined
                        },
                        y: { min: 0 }
                    }
                }
            },
            elements: { point: { radius: 0 } }
        }
    };

    state.charts.timelineChart = new Chart(ctx, config);
}

// Programmatic helpers (exposés globalement)
function zoomTimelineChart(factor = 1.5) {
    const chart = state.charts.timelineChart;
    if (!chart) return;

    const scale = chart.scales.x;
    if (!scale) return;

    const min = scale.min;
    const max = scale.max;
    if (min == null || max == null) return;

    const center = (min + max) / 2;
    const range = max - min;
    const newRange = Math.max(1, range / factor);

    chart.options.scales.x.min = center - newRange / 2;
    chart.options.scales.x.max = center + newRange / 2;
    chart.update('none');
}

function resetTimelineZoom() {
    const chart = state.charts.timelineChart;
    if (!chart) return;
    if (typeof chart.resetZoom === 'function') {
        chart.resetZoom(); // fournie par chartjs-plugin-zoom
        return;
    }
    delete chart.options.scales.x.min;
    delete chart.options.scales.x.max;
    chart.update('none');
}

// Exposer si besoin
window.zoomTimelineChart = zoomTimelineChart;
window.resetTimelineZoom = resetTimelineZoom;
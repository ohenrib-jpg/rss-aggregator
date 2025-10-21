// public/app.js - VERSION CORRIGÉE
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
        if (modal) {
            modal.style.display = "none";
        }
    }

    // ========== FONCTIONS API ==========
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

    // DÉCLARATION UNIQUE DES FONCTIONS API
    const apiGET = (path) => apiCall('GET', path);
    const apiPOST = (path, body) => apiCall('POST', path, body);
    const apiDELETE = (path) => apiCall('DELETE', path);
    const apiPUT = (path, body) => apiCall('PUT', path, body);

    // ========== CHARGEMENT DONNÉES ==========
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

            if (json.success && Array.isArray(json.articles)) {
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
            
            if (data.success && Array.isArray(data.themes)) {
                state.themes = data.themes;
                console.log(`✅ ${state.themes.length} thèmes chargés`);
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
            
            if (data.success && Array.isArray(data.feeds)) {
                state.feeds = data.feeds;
                console.log(`✅ ${state.feeds.length} flux chargés`);
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
    }

    // ========== RAFRAÎCHISSEMENT ==========
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
    }

    // ========== RENDU DES ARTICLES ==========
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
    }

    // ========== GRAPHIQUES ==========
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

    // ... (le reste des fonctions graphiques et autres restent identiques)

    // ========== FONCTIONS D'EXPORT ==========
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

    // ========== INITIALISATION ==========
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

        console.log("✅ Application initialisée");
    }

    // ========== EXPOSITION PUBLIQUE ==========
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

        // Gestion des flux
        loadFeedsManager,
        toggleFeed,
        deleteFeed,
        showAddFeedModal,

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

        // État
        state
    };
})();

// ========== INITIALISATION AU CHARGEMENT ==========
document.addEventListener("DOMContentLoaded", function () {
    if (window.app && typeof window.app.init === 'function') {
        window.app.init();
    } else {
        console.error('❌ App non disponible');
    }
});
// public/app.js - VERSION SIMPLIFIÉE

// Configuration API
const API_BASE = window.location.origin;
const API_TIMEOUT = 30000;

console.log('🚀 App.js loading - API Base:', API_BASE);

window.app = (function () {
    // ========== ÉTAT GLOBAL ==========
    const state = {
        apiBase: "/api",
        articles: [],
        themes: [],
        feeds: [],
        loading: {
            articles: false,
            themes: false,
            feeds: false
        },
        charts: {
            themeChart: null,
            timelineChart: null,
            sentimentChart: null
        }
    };

    // ========== UTILITAIRES ==========
    function qs(sel) { return document.querySelector(sel); }
    function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

    function escapeHtml(s) {
        if (!s && s !== 0) return "";
        return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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
            <div style="color: ${color}; padding: 12px; text-align: center; font-weight: 500; background: ${color}20; border: 1px solid ${color}50; border-radius: 8px; margin: 10px 0;">
                ${icon} ${msg}
            </div>
        `;

        if (type === "success" || type === "error") {
            setTimeout(() => setMessage(""), 5000);
        }
    }

    // ========== API CALLS ==========
    async function apiCall(method, path, body = null) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
            const fullPath = path.startsWith("/api/") ? path : `/api${path.startsWith("/") ? path : "/" + path}`;
            console.log(`📡 ${method} ${fullPath}`);

            const options = {
                method,
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            };

            if (body && method !== 'GET') {
                options.body = JSON.stringify(body);
            }

            const res = await fetch(fullPath, options);
            clearTimeout(timeoutId);

            if (!res.ok) {
                let errorMsg = `HTTP ${res.status}`;
                try {
                    const errorText = await res.text();
                    errorMsg = errorText.substring(0, 100);
                } catch (e) {}
                throw new Error(errorMsg);
            }

            return await res.json();
        } catch (err) {
            clearTimeout(timeoutId);

            if (err.name === 'AbortError') {
                console.error(`⏱️  Timeout ${method} ${path}`);
                throw new Error('Requête expirée (timeout)');
            }

            console.error(`❌ ${method} ${path}:`, err.message);
            throw err;
        }
    }

    const apiGET = (path) => apiCall('GET', path);
    const apiPOST = (path, body) => apiCall('POST', path, body);

    // ========== GESTION DES ONGLETS ==========
    function showTab(tabName) {
        qsa(".tab-content").forEach(div => div.style.display = "none");
        qsa(".tab").forEach(tab => tab.classList.remove("active"));

        const targetTab = qs(`#${tabName}Tab`);
        const targetButton = qsa('.tab').find(tab => tab.getAttribute('onclick')?.includes(tabName));

        if (targetTab) targetTab.style.display = "block";
        if (targetButton) targetButton.classList.add("active");

        console.log(`📂 Onglet activé: ${tabName}`);
        loadTabData(tabName);
    }

    function loadTabData(tabName) {
        switch (tabName) {
            case "analysis":
                updateAllCharts();
                break;
            case "themes":
                loadThemesManager();
                break;
            case "articles":
                if (state.articles.length === 0) loadArticles();
                break;
        }
    }

    // ========== CHARGEMENT DONNÉES ==========
    function normalizeArticle(a) {
        if (!a || typeof a !== "object") return null;

        return {
            id: a.id || Math.random().toString(36).substring(2, 11),
            title: a.title || "Sans titre",
            link: a.link || "#",
            date: a.date || a.pubDate || new Date().toISOString(),
            themes: Array.isArray(a.themes) ? a.themes : [],
            sentiment: a.sentiment || { score: 0, sentiment: 'neutral', confidence: 0 },
            confidence: parseFloat(a.confidence || 0.5),
            summary: a.summary || a.content || "",
            feed: a.feed || "Inconnu"
        };
    }

    async function loadArticles(forceRefresh = false) {
        if (state.loading.articles && !forceRefresh) return state.articles;

        state.loading.articles = true;
        setMessage("Chargement des articles...", "info");

        try {
            const json = await apiGET("/articles?limit=200");
            console.log('📄 Données articles reçues:', json);

            if (json && json.success && Array.isArray(json.articles)) {
                state.articles = json.articles.map(normalizeArticle).filter(a => a !== null);
                console.log(`✅ ${state.articles.length} articles chargés`);
            } else {
                console.warn('⚠️  Format de données inattendu:', json);
                state.articles = [];
            }

            renderArticlesList();
            setMessage("", "info");

            return state.articles;
        } catch (err) {
            console.error("❌ loadArticles error", err);
            setMessage("Erreur chargement articles: " + err.message, "error");
            state.articles = [];
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
            console.log('🎯 Réponse API thèmes:', data);

            if (data && data.success && Array.isArray(data.themes)) {
                state.themes = data.themes;
                console.log(`✅ ${state.themes.length} thèmes chargés`);
            } else {
                state.themes = [];
            }

            return state.themes;
        } catch (err) {
            console.error("❌ loadThemes error", err);
            state.themes = [];
            return [];
        } finally {
            state.loading.themes = false;
        }
    }

    // ========== RAFRAÎCHISSEMENT ==========
    async function refreshArticles() {
        setMessage("🔄 Récupération des nouveaux articles RSS...", "info");

        try {
            const refreshResult = await apiPOST("/refresh");
            await loadArticles(true);
            setMessage(`✅ Actualisation terminée avec succès`, "success");
            return refreshResult;
        } catch (error) {
            console.error("❌ Erreur rafraîchissement:", error);
            setMessage("❌ Erreur: " + error.message, "error");
            throw error;
        }
    }

    // ========== RENDU ARTICLES ==========
    function renderArticlesList() {
        const container = qs("#articlesList");
        if (!container) return;

        if (state.articles.length === 0) {
            container.innerHTML = `
                <div class="loading" style="text-align: center; padding: 60px 20px;">
                    <div style="font-size: 3rem; margin-bottom: 20px;">📰</div>
                    <div style="font-size: 1.2rem; color: #64748b; margin-bottom: 20px;">Aucun article disponible</div>
                    <p style="color: #94a3b8; margin-bottom: 30px;">Cliquez sur "Actualiser" pour récupérer les derniers articles RSS</p>
                    <button onclick="appCall('refreshArticles')" class="btn btn-success" style="padding: 15px 30px; font-size: 1.1rem;">
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
                <div class="article-card">
                    <h4><a href="${escapeHtml(article.link)}" target="_blank">${escapeHtml(article.title)}</a></h4>
                    <div class="meta" style="display: flex; gap: 16px; font-size: 0.875rem; color: #64748b; margin-bottom: 10px;">
                        <span>📅 ${formatDate(article.date)}</span>
                        <span>${sentimentEmoji[sentimentType]} ${sentimentType} (${(sentiment.score || 0).toFixed(2)})</span>
                        <span>🎯 Confiance: ${((article.confidence || 0) * 100).toFixed(1)}%</span>
                    </div>
                    <p>${escapeHtml((article.summary || '').substring(0, 250))}${article.summary && article.summary.length > 250 ? '...' : ''}</p>
                    <div class="themes" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">
                        ${themes.length > 0
                    ? themes.map(theme => `<span class="tag">${escapeHtml(theme)}</span>`).join("")
                    : '<span style="font-size: 0.75rem; color: #94a3b8;">Aucun thème détecté</span>'
                }
                    </div>
                </div>
            `;
        }).join("");

        container.innerHTML = `
            <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px;">
                <span style="font-weight: 600;">${state.articles.length} article(s) trouvé(s)</span>
            </div>
            ${articlesHtml}
        `;
    }

    // ========== GESTION DES THÈMES SIMPLIFIÉE ==========
    async function loadThemesManager() {
        const container = qs("#themesManagerList");
        if (!container) return;

        try {
            container.innerHTML = '<div class="loading">Chargement des thèmes...</div>';
            await loadThemes();

            if (state.themes.length > 0) {
                container.innerHTML = `
                    <div style="margin-bottom: 20px;">
                        <h3 style="color: #1e40af;">🎯 Thèmes Configurés (${state.themes.length})</h3>
                        <p style="color: #64748b;">Les thèmes sont chargés depuis le fichier themes.json</p>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
                        ${state.themes.map(theme => {
                            return `
                                <div class="theme-card" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white;">
                                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                                        <div style="width: 20px; height: 20px; border-radius: 50%; background: ${theme.color || '#6366f1'};"></div>
                                        <h4 style="margin: 0; flex: 1;">${escapeHtml(theme.name)}</h4>
                                    </div>
                                    <div style="margin-bottom: 15px;">
                                        <strong>Mots-clés:</strong>
                                        <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px;">
                                            ${theme.keywords && theme.keywords.length > 0
                                ? theme.keywords.map(kw =>
                                    `<span style="background: #e2e8f0; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;">${escapeHtml(kw)}</span>`
                                ).join('')
                                : '<span style="color: #94a3b8; font-style: italic;">Aucun mot-clé</span>'
                            }
                                        </div>
                                    </div>
                                    ${theme.description ? `
                                        <div style="color: #64748b; font-size: 0.9rem; margin-top: 10px;">
                                            ${escapeHtml(theme.description)}
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="loading" style="text-align: center; padding: 60px;">
                        <div style="font-size: 3rem; margin-bottom: 20px;">🎨</div>
                        <div style="font-size: 1.2rem; color: #64748b; margin-bottom: 20px;">Aucun thème configuré</div>
                        <p style="color: #94a3b8;">Les thèmes doivent être définis dans le fichier themes.json</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('❌ Erreur chargement thèmes:', error);
            container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement</div>';
        }
    }

    // ========== GRAPHIQUES SIMPLIFIÉS ==========
    function createThemeChart() {
        const container = qs("#themeChart");
        if (!container) {
            console.log('❌ Canvas themeChart non trouvé');
            return;
        }

        if (state.charts.themeChart) {
            state.charts.themeChart.destroy();
        }

        // Calculer les données des thèmes
        const themeCounts = {};
        state.articles.forEach(article => {
            (article.themes || []).forEach(theme => {
                themeCounts[theme] = (themeCounts[theme] || 0) + 1;
            });
        });

        const themeData = Object.entries(themeCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);

        if (themeData.length === 0) {
            container.parentElement.innerHTML = `
                <h3>📊 Répartition par Thème</h3>
                <div style="text-align: center; padding: 60px; color: #64748b;">
                    Aucune donnée de thème disponible
                    <br><small>Les thèmes apparaîtront après analyse des articles</small>
                </div>
            `;
            return;
        }

        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

        try {
            state.charts.themeChart = new Chart(container, {
                type: 'doughnut',
                data: {
                    labels: themeData.map(t => t.name),
                    datasets: [{
                        data: themeData.map(t => t.count),
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
            console.log('✅ Graphique thèmes créé');
        } catch (error) {
            console.error('❌ Erreur création graphique thèmes:', error);
        }
    }

    function createSentimentChart() {
        const container = qs("#sentimentChart");
        if (!container) return;

        if (state.charts.sentimentChart) {
            state.charts.sentimentChart.destroy();
        }

        const sentimentCounts = {
            'positive': 0,
            'neutral': 0,
            'negative': 0
        };

        state.articles.forEach(article => {
            const sentiment = article.sentiment?.sentiment || 'neutral';
            // Simplification des sentiments
            if (sentiment.includes('positive')) sentimentCounts.positive++;
            else if (sentiment.includes('negative')) sentimentCounts.negative++;
            else sentimentCounts.neutral++;
        });

        try {
            state.charts.sentimentChart = new Chart(container, {
                type: 'bar',
                data: {
                    labels: ['Positif 😊', 'Neutre 😐', 'Négatif 😞'],
                    datasets: [{
                        data: [sentimentCounts.positive, sentimentCounts.neutral, sentimentCounts.negative],
                        backgroundColor: ['#10b981', '#6b7280', '#ef4444']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
            console.log('✅ Graphique sentiment créé');
        } catch (error) {
            console.error('❌ Erreur création graphique sentiment:', error);
        }
    }

    function updateAllCharts() {
        console.log('📊 Mise à jour des graphiques...');

        if (state.articles.length === 0) {
            loadArticles().then(() => {
                createThemeChart();
                createSentimentChart();
            });
        } else {
            createThemeChart();
            createSentimentChart();
        }
    }

    // ========== INITIALISATION ==========
    async function init() {
        console.log("🚀 Initialisation de l'application...");

        showTab("articles");

        try {
            await loadArticles();
            await loadThemes();
            console.log("✅ Application initialisée");
        } catch (error) {
            console.error("❌ Erreur chargement initial:", error);
            setMessage("Erreur d'initialisation. Veuillez recharger la page.", "error");
        }
    }

    // ========== EXPOSITION PUBLIQUE ==========
    return {
        init,
        showTab,
        loadArticles,
        refreshArticles,
        renderArticlesList,
        loadThemes,
        loadThemesManager,
        updateAllCharts,
        state
    };
})();

// ========== INITIALISATION AU CHARGEMENT ==========
document.addEventListener("DOMContentLoaded", function () {
    console.log('📄 DOM chargé');

    if (window.app && typeof window.app.init === 'function') {
        window.app.init();
    } else {
        console.error('❌ window.app non disponible');
    }
});

// ========== FONCTION GLOBALE POUR LES APPELS ==========
function appCall(functionName, ...args) {
    if (window.app && window.app[functionName]) {
        return window.app[functionName](...args);
    } else {
        console.warn('Fonction non disponible:', functionName);
        return false;
    }
}

console.log('✅ app.js chargé et simplifié');
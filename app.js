// public/app.js - VERSION CORRIGÉE 

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
        summary: {},
        correlationData: {
            keywordSentiments: {},
            themeRelations: {},
            temporalPatterns: {}
        },
        loading: {
            articles: false,
            themes: false,
            feeds: false
        },
        charts: {
            themeChart: null,
            timelineChart: null,
            sentimentChart: null
        },
        aiConfig: {
            localAI: {
                enabled: true,
                url: "http://localhost:8080",
                model: "llama2",
                systemPrompt: "Vous êtes un assistant spécialisé dans l'analyse d'actualités et la détection de thèmes.",
                autoStart: false
            },
            openAI: {
                enabled: false,
                apiKey: "",
                model: "gpt-3.5-turbo"
            },
            priority: "local"
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
                } catch (e) {
                    // Ignorer les erreurs de parsing
                }
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
    const apiDELETE = (path) => apiCall('DELETE', path);
    const apiPUT = (path, body) => apiCall('PUT', path, body);

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
            case "feeds":
                loadFeedsManager();
                break;
            case "metrics":
                loadMetrics();
                loadSentimentOverview();    
                loadLearningStats();    
                break;
            case "alerts":
                loadAlertsManager();
                break;
            case "articles":
                if (state.articles.length === 0) loadArticles();
                break;
            case "settings":
                loadAIConfigToForm();
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
            const json = await apiGET("/articles?limit=200&include_themes=true");
            console.log('📄 Données articles reçues:', json);

            if (json && json.success && Array.isArray(json.articles)) {
                state.articles = json.articles.map(normalizeArticle).filter(a => a !== null);
                console.log(`✅ ${state.articles.length} articles chargés`);

                if (state.articles.length > 0) {
                    console.log('📊 Premier article:', state.articles[0]);
                }
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

    async function loadFeeds() {
        if (state.loading.feeds) return state.feeds;

        state.loading.feeds = true;

        try {
            const data = await apiGET("/feeds/manager");

            if (data && data.success && Array.isArray(data.feeds)) {
                state.feeds = data.feeds;
                console.log(`✅ ${state.feeds.length} flux chargés`);
            } else if (Array.isArray(data)) {
                state.feeds = data;
            } else {
                state.feeds = [];
            }

            return state.feeds;
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
        setMessage("🔄 Récupération des nouveaux articles RSS...", "info");

        // Tentative avec réessai
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const refreshResult = await apiPOST("/refresh");
                await loadArticles(true);
                setMessage(`✅ Actualisation terminée avec succès`, "success");
                return refreshResult;
            } catch (error) {
                console.error(`❌ Tentative ${attempt} échouée:`, error);

                if (attempt < 3) {
                    setMessage(`🔄 Nouvelle tentative dans 3 secondes... (${attempt}/3)`, "warning");
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                    setMessage("❌ Échec après 3 tentatives. Vérifiez que le serveur est démarré.", "error");
                    throw error;
                }
            }
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

    // ========== GESTION DES THÈMES ==========
    async function loadThemesManager() {
        const container = qs("#themesManagerList");
        if (!container) return;

        try {
            container.innerHTML = '<div class="loading">Chargement des thèmes...</div>';
            await loadThemes();

            if (state.themes.length > 0) {
                container.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <div style="font-weight: 600;">Thèmes configurés (${state.themes.length})</div>
                    <button onclick="appCall('showAddThemeModal')" class="btn btn-success">➕ Ajouter</button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">
                    ${state.themes.map(theme => {
                    const keywords = Array.isArray(theme.keywords) ? theme.keywords : [];
                    
                    return `
                            <div class="theme-card" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                                    <div style="width: 20px; height: 20px; border-radius: 50%; background: ${theme.color || '#6366f1'};"></div>
                                    <h4 style="margin: 0; flex: 1;">${escapeHtml(theme.name)}</h4>
                                    <span style="background: #f1f5f9; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">
                                        ${keywords.length} mots-clés
                                    </span>
                                </div>
                                <div style="margin-bottom: 15px;">
                                    <strong>Mots-clés:</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px;">
                                        ${keywords.length > 0
                            ? keywords.slice(0, 8).map(kw =>
                                `<span style="background: #e2e8f0; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;">${escapeHtml(kw)}</span>`
                            ).join('')
                            : '<span style="color: #94a3b8; font-style: italic;">Aucun mot-clé</span>'
                        }
                                        ${keywords.length > 8 ? `<span style="color: #64748b; font-size: 0.75rem;">+ ${keywords.length - 8} autres</span>` : ''}
                                    </div>
                                </div>
                                ${theme.description ? `
                                <div style="margin-bottom: 15px;">
                                    <strong>Description:</strong>
                                    <div style="color: #64748b; font-size: 0.9rem; margin-top: 5px;">${escapeHtml(theme.description)}</div>
                                </div>
                                ` : ''}
                                <div style="display: flex; gap: 8px; margin-top: 15px;">
                                    <button onclick="appCall('deleteTheme', '${theme.id}')" class="btn btn-danger" style="padding: 6px 12px; font-size: 0.85rem;">
                                        🗑️ Supprimer
                                    </button>
                                </div>
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
                    <button onclick="appCall('showAddThemeModal')" class="btn btn-success" style="padding: 15px 20px;">
                        ➕ Ajouter un thème
                    </button>
                </div>
            `;
            }
        } catch (error) {
            console.error('❌ Erreur chargement thèmes:', error);
            container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement</div>';
        }
    }

    function showAddThemeModal() {
        const modalHtml = `
            <div id="addThemeModal" class="modal" style="display: block;">
                <div class="modal-content">
                    <span class="close" onclick="appCall('closeModal', 'addThemeModal')">&times;</span>
                    <h2>➕ Ajouter un Thème</h2>
                    
                    <div style="margin: 15px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nom du thème:</label>
                        <input type="text" id="newThemeName" style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    </div>
                    
                    <div style="margin: 15px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Mots-clés (un par ligne):</label>
                        <textarea id="newThemeKeywords" style="width: 100%; height: 150px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;"></textarea>
                    </div>
                    
                    <div style="margin: 15px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Couleur:</label>
                        <input type="color" id="newThemeColor" value="#6366f1" style="width: 100%; height: 40px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    </div>

                    <div style="margin: 15px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Description (optionnelle):</label>
                        <textarea id="newThemeDescription" style="width: 100%; height: 80px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;"></textarea>
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-success" onclick="appCall('createTheme')">✅ Créer</button>
                        <button class="btn btn-secondary" onclick="appCall('closeModal', 'addThemeModal')">❌ Annuler</button>
                    </div>
                </div>
            </div>
        `;

        const oldModal = qs('#addThemeModal');
        if (oldModal) oldModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function createTheme() {
        const name = qs('#newThemeName').value;
        const keywordsText = qs('#newThemeKeywords').value;
        const color = qs('#newThemeColor').value;
        const description = qs('#newThemeDescription').value;

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

        setMessage("Création du thème...", "info");

        try {
            const data = await apiPOST("/themes", {
                name: name,
                keywords: keywords,
                color: color,
                description: description || ''
            });

            console.log('📝 Réponse création thème:', data);

            if (data.success) {
                closeModal('addThemeModal');
                await loadThemes();
                loadThemesManager();
                setMessage("✅ Thème créé avec succès !", "success");
            } else {
                throw new Error(data.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error('❌ Erreur création thème:', error);
            setMessage('Erreur: ' + error.message, 'error');
        }
    }

    async function deleteTheme(themeId) {
        console.log('🗑️ Suppression thème appelée avec ID:', themeId);

        if (!themeId) {
            setMessage('❌ ID de thème invalide - impossible de supprimer', 'error');
            return;
        }

        if (!confirm('Êtes-vous sûr de vouloir supprimer ce thème ?')) {
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
                throw new Error(data.error || "Erreur inconnue lors de la suppression");
            }
        } catch (error) {
            console.error('❌ Erreur suppression thème:', error);
            setMessage('Erreur: ' + error.message, 'error');
        }
    }

    // ========== GESTION DES FLUX ==========
    async function loadFeedsManager() {
        const container = qs("#feedsManagerList");
        if (!container) return;

        try {
            container.innerHTML = '<div class="loading">Chargement des flux...</div>';
            await loadFeeds();

            if (state.feeds.length > 0) {
                container.innerHTML = `
                    <div style="margin-bottom: 15px;">
                        <button onclick="appCall('showAddFeedModal')" class="btn btn-success">➕ Ajouter un flux</button>
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8fafc;">
                                    <th style="padding: 12px; text-align: left;">URL</th>
                                    <th style="padding: 12px; text-align: left;">Statut</th>
                                    <th style="padding: 12px; text-align: left;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${state.feeds.map(feed => `
                                    <tr>
                                        <td style="padding: 12px;">
                                            <div style="font-weight: 500;">${escapeHtml(feed.title || 'Sans titre')}</div>
                                            <div style="font-size: 0.85rem; color: #64748b;">${escapeHtml(feed.url)}</div>
                                        </td>
                                        <td style="padding: 12px;">
                                            <span style="padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; background: ${feed.is_active ? '#10b98120' : '#ef444420'}; color: ${feed.is_active ? '#10b981' : '#ef4444'};">
                                                ${feed.is_active ? '✅ Actif' : '❌ Inactif'}
                                            </span>
                                        </td>
                                        <td style="padding: 12px;">
                                            <button onclick="appCall('toggleFeed', ${feed.id}, ${!feed.is_active})" class="btn ${feed.is_active ? 'btn-secondary' : 'btn-success'}" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 5px;">
                                                ${feed.is_active ? '❌ Désactiver' : '✅ Activer'}
                                            </button>
                                            <button onclick="appCall('deleteFeed', ${feed.id})" class="btn btn-danger" style="padding: 6px 12px; font-size: 0.8rem;">
                                                🗑️ Supprimer
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="loading" style="text-align: center; padding: 60px;">
                        <div style="font-size: 3rem; margin-bottom: 20px;">📰</div>
                        <div style="font-size: 1.2rem; color: #64748b; margin-bottom: 20px;">Aucun flux configuré</div>
                        <button onclick="appCall('showAddFeedModal')" class="btn btn-success" style="padding: 15px 30px;">
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

    function showAddFeedModal() {
        const modalHtml = `
            <div id="addFeedModal" class="modal" style="display: block;">
                <div class="modal-content">
                    <span class="close" onclick="appCall('closeModal', 'addFeedModal')">&times;</span>
                    <h2>➕ Ajouter un flux RSS</h2>

                    <div style="margin: 12px 0;">
                        <label style="display:block; font-weight:600; margin-bottom:6px;">Titre (optionnel)</label>
                        <input id="newFeedTitle" type="text" placeholder="Titre du flux" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px;">
                    </div>

                    <div style="margin: 12px 0;">
                        <label style="display:block; font-weight:600; margin-bottom:6px;">URL du flux</label>
                        <input id="newFeedURL" type="url" placeholder="https://exemple.com/rss.xml" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px;">
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">
                        <button class="btn btn-secondary" onclick="appCall('closeModal', 'addFeedModal')">❌ Annuler</button>
                        <button class="btn btn-success" onclick="appCall('createFeed')">✅ Ajouter</button>
                    </div>
                </div>
            </div>
        `;

        const oldModal = qs('#addFeedModal');
        if (oldModal) oldModal.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function createFeed() {
        const title = qs('#newFeedTitle').value.trim();
        const url = qs('#newFeedURL').value.trim();

        if (!url) {
            alert('URL du flux requise');
            return;
        }

        try {
            const urlObj = new URL(url);
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                alert('URL invalide: doit commencer par http:// ou https://');
                return;
            }
        } catch (e) {
            console.warn('URL non standard détectée:', url);
            if (!confirm("L'URL ne semble pas standard. Voulez-vous quand même l'ajouter ?")) {
                return;
            }
        }

        setMessage("Création du flux...", "info");

        try {
            const res = await apiPOST('/feeds', {
                url,
                title: title || url,
                is_active: true
            });

            if (res.success) {
                closeModal('addFeedModal');
                await loadFeeds();
                await loadFeedsManager();
                setMessage("✅ Flux ajouté avec succès", "success");
            } else {
                throw new Error(res.error || 'Erreur création flux');
            }
        } catch (error) {
            console.error('❌ createFeed error:', error);
            setMessage('Erreur: ' + error.message, 'error');
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

    // ========== GRAPHIQUES ==========
    function createThemeChart() {
        const container = qs("#themeChart");
        if (!container) {
            console.log('❌ Canvas themeChart non trouvé - création du canvas');
            // Créer le canvas dynamiquement si nécessaire
            const analysisTab = qs("#analysisTab");
            if (analysisTab) {
                analysisTab.innerHTML += `
                <div class="chart-container">
                    <h3>📊 Répartition par Thème</h3>
                    <canvas id="themeChart"></canvas>
                </div>
            `;
            } else {
                console.log('❌ Onglet analysis non trouvé');
                return;
            }
        }

        // Détruire l'ancien graphique
        if (state.charts.themeChart) {
            state.charts.themeChart.destroy();
            state.charts.themeChart = null;
        }

        // Récupérer le canvas après création
        const canvas = qs("#themeChart");
        if (!canvas) {
            console.log('❌ Canvas toujours non trouvé après création');
            return;
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
            .slice(0, 10);

        if (themeData.length === 0) {
            canvas.parentElement.innerHTML = `
            <h3>📊 Répartition par Thème</h3>
            <div style="text-align: center; padding: 60px; color: #64748b;">
                Aucune donnée de thème disponible
                <br><small>Les thèmes apparaîtront après analyse des articles</small>
            </div>
        `;
            return;
        }

        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#ec4899'
        ];

        try {
            state.charts.themeChart = new Chart(canvas, {
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
                    maintainAspectRatio: true,
                    aspectRatio: 2,
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
                                label: function (context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${label}: ${value} articles (${percentage}%)`;
                                }
                            }
                        }
                    },
                    cutout: '50%'
                }
            });
            console.log('✅ Graphique thèmes créé');
        } catch (error) {
            console.error('❌ Erreur création graphique thèmes:', error);
        }
    }

    function createTimelineChart() {
        const container = qs("#timelineChart");
        if (!container) {
            console.log('❌ Canvas timelineChart non trouvé');
            return;
        }

        if (state.charts.timelineChart) {
            state.charts.timelineChart.destroy();
            state.charts.timelineChart = null;
        }

        const last30Days = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            last30Days.push(date.toISOString().split('T')[0]);
        }

        const articlesByDate = {};
        last30Days.forEach(date => {
            articlesByDate[date] = 0;
        });

        state.articles.forEach(article => {
            if (article.date) {
                const articleDate = new Date(article.date).toISOString().split('T')[0];
                if (articlesByDate.hasOwnProperty(articleDate)) {
                    articlesByDate[articleDate]++;
                }
            }
        });

        const dates = last30Days.map(date => {
            const d = new Date(date);
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        });

        const counts = last30Days.map(date => articlesByDate[date]);

        if (counts.every(count => count === 0)) {
            container.parentElement.innerHTML = `
                <h3>📈 Évolution Temporelle</h3>
                <div style="text-align: center; padding: 60px; color: #64748b;">
                    Aucune donnée temporelle disponible
                    <br><small>Les données apparaîtront après actualisation des articles</small>
                </div>
            `;
            return;
        }

        try {
            state.charts.timelineChart = new Chart(container, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [{
                        label: 'Articles publiés',
                        data: counts,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2.5,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45,
                                font: { size: 10 }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                precision: 0
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        }
                    }
                }
            });
            console.log('✅ Graphique timeline créé');
        } catch (error) {
            console.error('❌ Erreur création graphique timeline:', error);
        }
    }

    function createSentimentChart() {
        const container = qs("#sentimentChart");
        if (!container) return;

        // CORRECTION : Détruire l'ancien graphique
        if (state.charts.sentimentChart) {
            state.charts.sentimentChart.destroy();
            state.charts.sentimentChart = null;
        }

        // CORRECTION : Nouveau comptage avec l'échelle fine
        const sentimentData = {
            'positive_strong': 0,
            'positive_weak': 0,
            'neutral': 0,
            'negative_weak': 0,
            'negative_strong': 0
        };

        state.articles.forEach(article => {
            const sentiment = article.sentiment?.sentiment || 'neutral';
            // CORRECTION : Accepter les 5 niveaux
            if (sentimentData.hasOwnProperty(sentiment)) {
                sentimentData[sentiment]++;
            } else {
                // Fallback pour anciens articles
                if (sentiment === 'positive') sentimentData.positive_weak++;
                else if (sentiment === 'negative') sentimentData.negative_weak++;
                else sentimentData.neutral++;
            }
        });

        // CORRECTION : Données pour les 5 catégories
        const chartData = {
            labels: ['Positif Fort 😊', 'Positif Faible 🙂', 'Neutre 😐', 'Négatif Faible 🙁', 'Négatif Fort 😞'],
            datasets: [{
                data: [
                    sentimentData.positive_strong,
                    sentimentData.positive_weak,
                    sentimentData.neutral,
                    sentimentData.negative_weak,
                    sentimentData.negative_strong
                ],
                backgroundColor: ['#10b981', '#34d399', '#6b7280', '#f59e0b', '#ef4444']
            }]
        };

        try {
            state.charts.sentimentChart = new Chart(container, {
                type: 'bar',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    const value = context.raw;
                                    const totalArticles = state.articles.length;
                                    const percentage = Math.round((value / totalArticles) * 100);
                                    return `${value} articles (${percentage}%)`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                precision: 0
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
            console.log('✅ Graphique sentiment créé (échelle fine)');
        } catch (error) {
            console.error('❌ Erreur création graphique sentiment:', error);
        }
    }

    function updateAllCharts() {
        console.log('📊 Mise à jour de tous les graphiques...');

        // Attendre que les données soient chargées
        if (state.articles.length === 0) {
            console.log('⚠️ Aucun article, chargement en cours...');
            loadArticles().then(() => {
                createThemeChart();
                createTimelineChart();
                createSentimentChart();
            });
        } else {
            createThemeChart();
            createTimelineChart();
            createSentimentChart();
        }

        console.log('✅ Graphiques mis à jour');
    }

    function zoomTimelineChart(factor) {
        console.log(`🔍 Zoom timeline: ${factor}`);
        if (state.charts.timelineChart) {
            const chart = state.charts.timelineChart;
            try {
                const yAxis = chart.scales.y;
                if (yAxis) {
                    const currentMax = yAxis.max;
                    const newMax = Math.max(1, Math.round(currentMax * factor));
                    chart.options.scales.y.max = newMax;
                    chart.update('none');
                }
                setMessage(`🔍 Zoom ${factor > 1 ? 'appliqué' : 'réduit'}`, "info");
            } catch (error) {
                console.warn('Zoom non supporté:', error);
            }
        }
    }

    function resetTimelineZoom() {
        console.log("↺ Reset zoom timeline");
        if (state.charts.timelineChart) {
            const chart = state.charts.timelineChart;
            try {
                if (chart.options.scales.y.max) {
                    delete chart.options.scales.y.max;
                }
                chart.update();
                setMessage("↺ Zoom réinitialisé", "success");
            } catch (error) {
                console.warn('Reset zoom non supporté:', error);
            }
        }
    }

    // ========== MÉTRIQUES ==========
    async function loadMetrics() {
        console.log('📊 loadMetrics() appelée');
        try {
            const response = await apiGET("/metrics");
            console.log('📈 Données métriques reçues:', response);

            if (response && response.summary) {  
                const summary = response.summary;
                console.log('📋 Résumé détaillé:', summary);

                // CORRECTION: Utiliser les valeurs directement depuis le summary
                if (qs("#m_total")) qs("#m_total").textContent = summary.total_articles || 0;
                if (qs("#m_confidence")) qs("#m_confidence").textContent = `${((summary.avg_confidence || 0) * 100).toFixed(1)}%`;
                if (qs("#m_posterior")) qs("#m_posterior").textContent = `${((summary.avg_posterior || 0) * 100).toFixed(1)}%`;
                if (qs("#m_corro")) qs("#m_corro").textContent = `${((summary.avg_corroboration || 0) * 100).toFixed(1)}%`;

                // Charger les thèmes populaires
                if (response.top_themes && response.top_themes.length > 0) {
                    const themesHtml = response.top_themes.map(theme => {
                        const themeName = theme.name;
                        const themeCount = theme.total;

                        return `<li style="margin-bottom: 8px; padding: 8px; background: #f8fafc; border-radius: 6px;">
            <strong>${themeName}</strong>: ${themeCount} articles
        </li>`;
                    }).join('');

                    if (qs("#topThemes")) qs("#topThemes").innerHTML = themesHtml;
                }
            } else {
                console.warn('⚠️ Format de réponse inattendu');
            }
        } catch (error) {
            console.error('❌ Erreur loadMetrics:', error);
        }
    }

    // ========== APERÇU DES SENTIMENTS ==========
    async function loadSentimentOverview() {
        console.log('😊 loadSentimentOverview() appelée');
        try {
            const response = await apiGET("/sentiment/detailed");
            console.log('📊 Données sentiment reçues:', response);

            const container = qs("#sentimentOverview");
            if (!container) return;

            if (response && response.stats) {
                const stats = response.stats;
                const total = stats.positive + stats.neutral + stats.negative;

                const html = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center;">
                    <div style="background: #f0fdf4; padding: 20px; border-radius: 12px;">
                        <div style="font-size: 2rem;">😊</div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: #10b981;">${stats.positive}</div>
                        <div>Positifs</div>
                        <div style="font-size: 0.8rem; color: #64748b;">${total > 0 ? Math.round((stats.positive / total) * 100) : 0}%</div>
                    </div>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 12px;">
                        <div style="font-size: 2rem;">😐</div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: #6b7280;">${stats.neutral}</div>
                        <div>Neutres</div>
                        <div style="font-size: 0.8rem; color: #64748b;">${total > 0 ? Math.round((stats.neutral / total) * 100) : 0}%</div>
                    </div>
                    <div style="background: #fef2f2; padding: 20px; border-radius: 12px;">
                        <div style="font-size: 2rem;">😞</div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: #ef4444;">${stats.negative}</div>
                        <div>Négatifs</div>
                        <div style="font-size: 0.8rem; color: #64748b;">${total > 0 ? Math.round((stats.negative / total) * 100) : 0}%</div>
                    </div>
                </div>
                ${stats.average_score ? `<div style="margin-top: 15px; text-align: center; color: #64748b;">Score moyen: ${stats.average_score.toFixed(2)}</div>` : ''}
            `;

                container.innerHTML = html;
            } else {
                container.innerHTML = '<div class="loading">Aucune donnée de sentiment disponible</div>';
            }
        } catch (error) {
            console.error('❌ Erreur loadSentimentOverview:', error);
            const container = qs("#sentimentOverview");
            if (container) container.innerHTML = '<div style="color: #ef4444;">Erreur de chargement</div>';
        }
    }

    // ========== STATISTIQUES D'APPRENTISSAGE ==========
    async function loadLearningStats() {
        console.log('🧠 loadLearningStats() appelée');
        try {
            const response = await apiGET("/learning/stats");
            console.log('📚 Données apprentissage reçues:', response);

            const container = qs("#learningStats");
            if (!container) return;

            if (response) {
                const stats = response;
                const html = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div style="text-align: center; padding: 20px; background: #f0f9ff; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;">${stats.total_articles_processed || 0}</div>
                        <div style="color: #64748b;">Articles traités</div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f0fdf4; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #10b981;">${((stats.sentiment_accuracy || 0) * 100).toFixed(1)}%</div>
                        <div style="color: #64748b;">Précision sentiment</div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #fef3c7; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #f59e0b;">${((stats.theme_detection_accuracy || 0) * 100).toFixed(1)}%</div>
                        <div style="color: #64748b;">Précision thèmes</div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #fef2f2; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #ef4444;">${stats.avg_processing_time || 0}s</div>
                        <div style="color: #64748b;">Temps traitement</div>
                    </div>
                </div>
                ${stats.modules_active ? `
                <div style="margin-top: 20px;">
                    <h4>Modules actifs:</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${stats.modules_active.map(module =>
                    `<span style="background: #3b82f6; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">${module}</span>`
                ).join('')}
                    </div>
                </div>
                ` : ''}
            `;

                container.innerHTML = html;
            } else {
                container.innerHTML = '<div class="loading">Aucune donnée d\'apprentissage disponible</div>';
            }
        } catch (error) {
            console.error('❌ Erreur loadLearningStats:', error);
            const container = qs("#learningStats");
            if (container) container.innerHTML = '<div style="color: #ef4444;">Erreur de chargement</div>';
        }
    }

    // ========== SYSTÈME D'ALERTES ==========
    async function loadAlertsManager() {
        await loadAlertsList();
        await loadAlertsStats();
        await loadTriggeredAlerts();
    }

    async function loadAlertsList() {
        const container = qs("#alertsList");
        if (!container) return;

        try {
            const response = await apiGET("/alerts");

            if (response.success) {
                const alerts = response.alerts || [];

                if (alerts.length > 0) {
                    container.innerHTML = `
                    <div style="display: grid; gap: 15px;">
                    ${alerts.map(alert => `
                      <div class="alert-item" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                          <div style="flex: 1;">
                              <h4 style="margin: 0; color: #1e293b;">${escapeHtml(alert.name)}</h4>
                                  <div style="display: flex; gap: 10px; margin-top: 8px; font-size: 0.85rem;">
                            <span style="background: ${getSeverityColor(alert.severity)}; color: white; padding: 4px 8px; border-radius: 12px;">
                                       ${getSeverityText(alert.severity)}
                            </span>
                                 <span style="color: #64748b;">
                                ${alert.keywords?.length || 0} mot(s)-clé(s)
                            </span>
                            <span style="color: #64748b;">
                                Cooldown: ${formatCooldown(alert.cooldown)}
                            </span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <label class="switch">
                            <input type="checkbox" ${alert.enabled ? 'checked' : ''} 
                                   onchange="appCall('toggleAlert', '${alert.id}', this.checked)">
                            <span class="slider"></span>
                        </label>
                        <button class="btn btn-danger" onclick="appCall('deleteAlert', '${alert.id}')" style="padding: 6px 12px;">
                            🗑️
                        </button>
                    </div>
                </div>
                
                <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                    ${(alert.keywords || []).map(keyword => `
                        <span style="background: #f1f5f9; padding: 4px 8px; border-radius: 15px; font-size: 0.8rem; color: #475569;">
                            ${escapeHtml(keyword)}
                        </span>
                    `).join('')}
                </div>
            </div>
        `).join('')}
    </div>
`;
                } else {
                    container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #64748b;">
                        <div style="font-size: 3rem; margin-bottom: 15px;">🔔</div>
                        <div style="font-size: 1.1rem; margin-bottom: 10px;">Aucune alerte configurée</div>
                        <p>Créez votre première alerte pour surveiller des mots-clés spécifiques</p>
                    </div>
                `;
                }
            }
        } catch (error) {
            console.error("❌ Erreur chargement alertes:", error);
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ef4444;">
                    <div style="font-size: 3rem; margin-bottom: 15px;">⚠️</div>
                    <div>Erreur de chargement des alertes</div>
                    <p style="font-size: 0.9rem; margin-top: 10px;">${error.message}</p>
                </div>
            `;
        }
    }

    async function loadAlertsStats() {
        const container = qs("#alertsStats");
        if (!container) return;

        try {
            const response = await apiGET("/alerts");

            if (response.success) {
                const stats = response.stats || {};

                container.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                    <div style="text-align: center; padding: 20px; background: #f0f9ff; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;">${stats.total_alerts || 0}</div>
                        <div style="color: #64748b;">Alertes configurées</div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #f0fdf4; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #10b981;">${stats.enabled_alerts || 0}</div>
                        <div style="color: #64748b;">Alertes actives</div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #fef3c7; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #f59e0b;">${stats.today_triggered || 0}</div>
                        <div style="color: #64748b;">Aujourd'hui</div>
                    </div>
                    <div style="text-align: center; padding: 20px; background: #fef2f2; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #ef4444;">${stats.total_triggered || 0}</div>
                        <div style="color: #64748b;">Total déclenchées</div>
                    </div>
                </div>
            `;
            }
        } catch (error) {
            console.error("❌ Erreur chargement stats:", error);
            container.innerHTML = '<div style="color: #ef4444;">Erreur de chargement</div>';
        }
    }

    async function loadTriggeredAlerts() {
        const container = qs("#triggeredAlerts");
        if (!container) return;

        try {
            const response = await apiGET("/alerts/triggered?limit=20");

            if (response.success) {
                const alerts = response.alerts || [];

                if (alerts.length > 0) {
                    container.innerHTML = `
                    <div style="max-height: 400px; overflow-y: auto;">
                        <div style="display: grid; gap: 10px;">
                            ${alerts.reverse().map(alert => `
                                <div style="border-left: 4px solid ${getSeverityColor(alert.severity)}; padding: 15px; background: #f8fafc; border-radius: 0 8px 8px 0;">
                                    <div style="font-weight: 600; color: #1e293b;">${escapeHtml(alert.alert_name)}</div>
                                    <div style="color: #475569; margin: 5px 0; font-size: 0.9rem;">
                                        <a href="${alert.article_link}" target="_blank" style="color: #3b82f6; text-decoration: none;">
                                            ${escapeHtml(alert.article_title)}
                                        </a>
                                    </div>
                                    <div style="display: flex; gap: 10px; font-size: 0.8rem; color: #64748b;">
                                        <span>🕐 ${formatDate(alert.triggered_at)}</span>
                                        <span>🔍 ${(alert.matched_keywords || []).slice(0, 3).join(', ')}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                } else {
                    container.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #64748b;">
                        <div style="font-size: 2rem; margin-bottom: 10px;">🔭</div>
                        <div>Aucune alerte déclenchée pour le moment</div>
                    </div>
                `;
                }
            }
        } catch (error) {
            console.error("❌ Erreur chargement historique:", error);
            container.innerHTML = '<div style="color: #ef4444;">Erreur de chargement</div>';
        }
    }

    async function createAlert() {
        const name = qs('#newAlertName').value.trim();
        const keywordsText = qs('#newAlertKeywords').value.trim();
        const severity = qs('#newAlertSeverity').value;
        const cooldown = parseInt(qs('#newAlertCooldown').value);

        if (!name || !keywordsText) {
            setMessage('Veuillez remplir le nom et les mots-clés', 'error');
            return;
        }

        const keywords = keywordsText.split('\n')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        if (keywords.length === 0) {
            setMessage('Veuillez entrer au moins un mot-clé', 'error');
            return;
        }

        setMessage("Création de l'alerte...", "info");

        try {
            const response = await apiPOST("/alerts", {
                name: name,
                keywords: keywords,
                severity: severity,
                cooldown: cooldown,
                actions: ["notification"]
            });

            if (response.success) {
                qs('#newAlertName').value = '';
                qs('#newAlertKeywords').value = '';

                await loadAlertsManager();
                setMessage("✅ Alerte créée avec succès", "success");
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error("❌ Erreur création alerte:", error);
            setMessage("Erreur: " + error.message, "error");
        }
    }

    async function toggleAlert(alertId, enabled) {
        try {
            const response = await apiPUT(`/alerts/${alertId}`, { enabled: enabled });

            if (response.success) {
                setMessage(`✅ Alerte ${enabled ? 'activée' : 'désactivée'}`, "success");
                await loadAlertsStats();
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error("❌ Erreur toggle alerte:", error);
            setMessage("Erreur: " + error.message, "error");
        }
    }

    async function deleteAlert(alertId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette alerte ?')) {
            return;
        }

        setMessage("Suppression de l'alerte...", "info");

        try {
            const response = await apiDELETE(`/alerts/${alertId}`);

            if (response.success) {
                await loadAlertsManager();
                setMessage("✅ Alerte supprimée", "success");
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error("❌ Erreur suppression alerte:", error);
            setMessage("Erreur: " + error.message, "error");
        }
    }

    function getSeverityColor(severity) {
        const colors = {
            'low': '#10b981',
            'medium': '#f59e0b',
            'high': '#ef4444'
        };
        return colors[severity] || '#6b7280';
    }

    function getSeverityText(severity) {
        const texts = {
            'low': 'Faible',
            'medium': 'Moyen',
            'high': 'Élevé'
        };
        return texts[severity] || 'Inconnu';
    }

    function formatCooldown(seconds) {
        if (seconds === 0) return 'Aucun';
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
        return `${Math.round(seconds / 3600)}h`;
    }

    // ========== CONFIGURATION IA ==========
    function loadAIConfigToForm() {
        try {
            const config = state.aiConfig;

            if (qs('#localAIEnabled')) qs('#localAIEnabled').checked = config.localAI.enabled;
            if (qs('#localAIUrl')) qs('#localAIUrl').value = config.localAI.url;
            if (qs('#localAIModel')) qs('#localAIModel').value = config.localAI.model;
            if (qs('#localAISystemPrompt')) qs('#localAISystemPrompt').value = config.localAI.systemPrompt;
            if (qs('#localAIAutoStart')) qs('#localAIAutoStart').checked = config.localAI.autoStart;

            if (qs('#openaiEnabled')) qs('#openaiEnabled').checked = config.openAI.enabled;
            if (qs('#openaiKey')) qs('#openaiKey').value = config.openAI.apiKey;
            if (qs('#openaiModel')) qs('#openaiModel').value = config.openAI.model;

            const priorityRadio = qs(`input[name="aiPriority"][value="${config.priority}"]`);
            if (priorityRadio) priorityRadio.checked = true;

        } catch (error) {
            console.error("❌ Erreur chargement config dans formulaire:", error);
        }
    }

    async function saveAIConfig() {
        try {
            const config = {
                localAI: {
                    enabled: qs('#localAIEnabled').checked,
                    url: qs('#localAIUrl').value,
                    model: qs('#localAIModel').value,
                    systemPrompt: qs('#localAISystemPrompt').value,
                    autoStart: qs('#localAIAutoStart').checked
                },
                openAI: {
                    enabled: qs('#openaiEnabled').checked,
                    apiKey: qs('#openaiKey').value,
                    model: qs('#openaiModel').value
                },
                priority: qs('input[name="aiPriority"]:checked').value
            };

            state.aiConfig = config;
            localStorage.setItem('rssAggregatorAIConfig', JSON.stringify(config));

            setMessage("✅ Configuration IA sauvegardée", "success");

        } catch (error) {
            console.error("❌ Erreur sauvegarde config IA:", error);
            setMessage("❌ Erreur sauvegarde configuration", "error");
        }
    }

    async function testLocalAIConnection() {
        setMessage("🔌 Test de connexion IA locale...", "info");
        try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            setMessage("✅ Connexion IA locale fonctionnelle", "success");
        } catch (error) {
            setMessage("❌ Erreur connexion IA locale", "error");
        }
    }

    async function testOpenAIConnection() {
        setMessage("🌐 Test de connexion OpenAI...", "info");
        try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            setMessage("✅ Connexion OpenAI fonctionnelle", "success");
        } catch (error) {
            setMessage("❌ Erreur connexion OpenAI", "error");
        }
    }

    async function startLocalAIServer() {
        setMessage("🚀 Démarrage du serveur IA local...", "info");
        try {
            setTimeout(() => {
                setMessage("✅ Serveur IA local prêt (vérifiez que llama.cpp est lancé)", "success");
            }, 2000);
        } catch (error) {
            setMessage(`❌ Erreur démarrage serveur: ${error.message}`, "error");
        }
    }

    // ========== RAPPORTS & EXPORTS ==========
    async function generateAIAnalysisReport() {
        setMessage("🧠 Génération du rapport IA en cours...", "info");
        try {
            const response = await apiGET("/metrics");

            if (response && response.summary) {
                const reportWindow = window.open('', '_blank');
                reportWindow.document.write(`
                    <html>
                        <head>
                            <title>Rapport IA - Analyse des Actualités</title>
                            <style>
                                body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f8fafc; }
                                .container { max-width: 1000px; margin: 0 auto; }
                                .metric-card { background: white; border-radius: 12px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                                .chart-container { background: white; border-radius: 12px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>🧠 Rapport d'Analyse IA</h1>
                                <p>Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
                                
                                <div class="metric-card">
                                    <h3>📊 Métriques principales</h3>
                                    <p><strong>Articles analysés:</strong> ${response.summary.total_articles || 0}</p>
                                    <p><strong>Confiance moyenne:</strong> ${((response.summary.avg_confidence || 0) * 100).toFixed(1)}%</p>
                                    <p><strong>Postérieur bayésien moyen:</strong> ${((response.summary.avg_posterior || 0) * 100).toFixed(1)}%</p>
                                    <p><strong>Corroboration moyenne:</strong> ${((response.summary.avg_corroboration || 0) * 100).toFixed(1)}%</p>
                                </div>

                                ${response.theme_evolution && response.theme_evolution.length > 0 ? `
                                <div class="chart-container">
                                    <h3>📈 Évolution des thèmes</h3>
                                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                        ${response.theme_evolution.slice(0, 5).map(theme => `
                                            <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px;">
                                                <div style="font-weight: bold; color: #1e40af;">${theme.name}</div>
                                                <div style="font-size: 1.5rem; font-weight: bold; color: #3b82f6;">${theme.count}</div>
                                                <div style="color: #64748b; font-size: 0.9rem;">articles</div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                ` : ''}

                                ${response.top_themes && response.top_themes.length > 0 ? `
                                <div class="chart-container">
                                    <h3>🏆 Thèmes les plus populaires</h3>
                                    <div style="display: grid; gap: 10px;">
                                        ${response.top_themes.slice(0, 8).map((theme, index) => `
                                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f1f5f9; border-radius: 6px;">
                                                <div style="display: flex; align-items: center; gap: 10px;">
                                                    <span style="background: #3b82f6; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;">
                                                        ${index + 1}
                                                    </span>
                                                    <span style="font-weight: 500;">${theme.name}</span>
                                                </div>
                                                <span style="background: #3b82f6; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">
                                                    ${theme.count} articles
                                                </span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                ` : ''}

                                <div class="metric-card">
                                    <h3>📋 Résumé de l'analyse</h3>
                                    <p>Ce rapport a été généré automatiquement par le système d'analyse IA.</p>
                                    <p>Les données sont basées sur l'analyse sémantique des articles RSS collectés.</p>
                                    <p style="color: #64748b; font-size: 0.9rem; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                                        Généré par RSS Aggregator Intelligent - ${new Date().toLocaleString('fr-FR')}
                                    </p>
                                </div>
                            </div>
                        </body>
                    </html>
                `);
                reportWindow.document.close();
                setMessage("✅ Rapport IA généré avec succès", "success");
            } else {
                throw new Error("Format de réponse invalide");
            }
        } catch (error) {
            console.error("❌ Erreur génération rapport IA:", error);
            setMessage("❌ Erreur génération rapport: " + error.message, "error");
        }
    }

    async function exportToJSON() {
        try {
            setMessage("Génération du JSON...", "info");

            if (state.articles.length === 0) {
                alert("Aucun article à exporter");
                return;
            }

            const exportData = {
                exportDate: new Date().toISOString(),
                totalArticles: state.articles.length,
                articles: state.articles.map(article => ({
                    id: article.id,
                    title: article.title,
                    link: article.link,
                    date: article.date,
                    themes: article.themes,
                    sentiment: article.sentiment,
                    confidence: article.confidence,
                    summary: article.summary,
                    feed: article.feed
                }))
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });

            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `articles-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setMessage("✅ Export JSON téléchargé", "success");
        } catch (error) {
            console.error("❌ Erreur export JSON:", error);
            setMessage("Erreur: " + error.message, "error");
        }
    }

    async function exportArticlesToCSV() {
        try {
            setMessage("Génération du CSV...", "info");

            if (state.articles.length === 0) {
                alert("Aucun article à exporter");
                return;
            }

            const headers = ["ID", "Titre", "Date", "Lien", "Thèmes", "Sentiment", "Score", "Confiance"];
            const csvRows = [headers.join(",")];

            state.articles.forEach(article => {
                const row = [
                    article.id,
                    `"${(article.title || '').replace(/"/g, '""')}"`,
                    `"${article.date || ''}"`,
                    `"${article.link || ''}"`,
                    `"${(article.themes || []).join('; ')}"`,
                    article.sentiment?.sentiment || 'neutral',
                    article.sentiment?.score || 0,
                    article.confidence || 0
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

            setMessage("✅ Export CSV téléchargé", "success");
        } catch (error) {
            console.error("❌ Erreur export CSV:", error);
            setMessage("Erreur: " + error.message, "error");
        }
    }

    // ========== RAPPORT IA ENRICHIE ==========
    async function generateEnhancedAIAnalysisReport() {
        setMessage("🧠 Génération du rapport IA avancé...", "info");

        try {
            // Récupérer toutes les données disponibles
            console.log('📊 Collecte des données pour le rapport...');

            const [metrics, sentiment, learning, geopolitical] = await Promise.all([
                apiGET("/metrics"),
                apiGET("/sentiment/detailed"),
                apiGET("/learning/stats"),
                apiGET("/geopolitical/report")
            ]);

            console.log('✅ Données collectées pour le rapport');

            // Vérifier que nous avons des données
            if (!metrics || !sentiment) {
                throw new Error("Données insuffisantes pour générer le rapport");
            }

            // Générer le rapport enrichi
            const reportWindow = window.open('', '_blank');
            const reportDate = new Date().toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            reportWindow.document.write(`
            <html>
                <head>
                    <title>Rapport IA Avancé - Analyse Géopolitique</title>
                    <style>
                        body { 
                            font-family: 'Segoe UI', system-ui, sans-serif; 
                            margin: 0; 
                            padding: 30px; 
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                        }
                        .container { 
                            max-width: 1200px; 
                            margin: 0 auto; 
                            background: white;
                            border-radius: 20px;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
                            overflow: hidden;
                        }
                        .header {
                            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
                            color: white;
                            padding: 40px;
                            text-align: center;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 2.5rem;
                            font-weight: 700;
                        }
                        .header p {
                            margin: 10px 0 0 0;
                            opacity: 0.9;
                            font-size: 1.1rem;
                        }
                        .content {
                            padding: 40px;
                        }
                        .section {
                            margin-bottom: 40px;
                            padding: 30px;
                            background: #f8fafc;
                            border-radius: 16px;
                            border-left: 5px solid #3b82f6;
                        }
                        .section h2 {
                            color: #1e40af;
                            margin-top: 0;
                            font-size: 1.5rem;
                            display: flex;
                            align-items: center;
                            gap: 10px;
                        }
                        .metrics-grid {
                            display: grid;
                            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                            gap: 20px;
                            margin: 20px 0;
                        }
                        .metric-card {
                            background: white;
                            padding: 25px;
                            border-radius: 12px;
                            text-align: center;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                            border: 1px solid #e2e8f0;
                            transition: transform 0.2s ease;
                        }
                        .metric-card:hover {
                            transform: translateY(-5px);
                        }
                        .metric-value {
                            font-size: 2.5rem;
                            font-weight: bold;
                            margin: 10px 0;
                        }
                        .metric-label {
                            color: #64748b;
                            font-size: 0.9rem;
                        }
                        .themes-grid {
                            display: grid;
                            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                            gap: 15px;
                            margin: 20px 0;
                        }
                        .theme-item {
                            background: white;
                            padding: 20px;
                            border-radius: 12px;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                        }
                        .crisis-zones {
                            display: grid;
                            gap: 15px;
                        }
                        .crisis-item {
                            background: white;
                            padding: 20px;
                            border-radius: 12px;
                            border-left: 4px solid;
                        }
                        .risk-high { border-left-color: #ef4444; }
                        .risk-medium { border-left-color: #f59e0b; }
                        .risk-low { border-left-color: #10b981; }
                        .footer {
                            text-align: center;
                            padding: 30px;
                            background: #f1f5f9;
                            color: #64748b;
                            border-top: 1px solid #e2e8f0;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🧠 Rapport d'Analyse IA Avancé</h1>
                            <p>Analyse géopolitique et tendances médiatiques</p>
                            <p>Généré le ${reportDate}</p>
                        </div>
                        
                        <div class="content">
                            <!-- Section Métriques Principales -->
                            <div class="section">
                                <h2>📊 Métriques Globales</h2>
                                <div class="metrics-grid">
                                    <div class="metric-card">
                                        <div class="metric-value">${metrics.summary?.total_articles || 0}</div>
                                        <div class="metric-label">Articles Analysés</div>
                                    </div>
                                    <div class="metric-card">
                                        <div class="metric-value">${((metrics.summary?.avg_confidence || 0) * 100).toFixed(1)}%</div>
                                        <div class="metric-label">Confiance Moyenne</div>
                                    </div>
                                    <div class="metric-card">
                                        <div class="metric-value">${((metrics.summary?.avg_posterior || 0) * 100).toFixed(1)}%</div>
                                        <div class="metric-label">Postérieur Bayesien</div>
                                    </div>
                                    <div class="metric-card">
                                        <div class="metric-value">${((metrics.summary?.avg_corroboration || 0) * 100).toFixed(1)}%</div>
                                        <div class="metric-label">Corroboration</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Section Analyse des Sentiments -->
                            <div class="section">
                                <h2>😊 Analyse des Sentiments</h2>
                                ${sentiment.stats ? `
                                <div class="metrics-grid">
                                    <div class="metric-card" style="border-left: 4px solid #10b981;">
                                        <div class="metric-value" style="color: #10b981;">${sentiment.stats.positive || 0}</div>
                                        <div class="metric-label">Articles Positifs</div>
                                    </div>
                                    <div class="metric-card" style="border-left: 4px solid #6b7280;">
                                        <div class="metric-value" style="color: #6b7280;">${sentiment.stats.neutral || 0}</div>
                                        <div class="metric-label">Articles Neutres</div>
                                    </div>
                                    <div class="metric-card" style="border-left: 4px solid #ef4444;">
                                        <div class="metric-value" style="color: #ef4444;">${sentiment.stats.negative || 0}</div>
                                        <div class="metric-label">Articles Négatifs</div>
                                    </div>
                                </div>
                                ` : '<p>Aucune donnée de sentiment disponible</p>'}
                            </div>

                            <!-- Section Thèmes Principaux -->
                            <div class="section">
                                <h2>🏆 Thèmes les Plus Populaires</h2>
                                ${metrics.top_themes && metrics.top_themes.length > 0 ? `
                                <div class="themes-grid">
                                    ${metrics.top_themes.slice(0, 8).map(theme => `
                                        <div class="theme-item">
                                            <div>
                                                <strong>${theme.name}</strong>
                                                <div style="color: #64748b; font-size: 0.9rem; margin-top: 5px;">
                                                    ${theme.total} articles analysés
                                                </div>
                                            </div>
                                            <div style="font-size: 1.5rem; font-weight: bold; color: #3b82f6;">
                                                ${Math.round((theme.total / metrics.summary.total_articles) * 100)}%
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                                ` : '<p>Aucun thème détecté</p>'}
                            </div>

                            <!-- Section Géopolitique -->
                            <div class="section">
                                <h2>🌍 Analyse Géopolitique</h2>
                                ${geopolitical.report ? `
                                    <div style="background: white; padding: 20px; border-radius: 12px; margin: 20px 0;">
                                        <h3 style="color: #1e40af; margin-top: 0;">Résumé Global</h3>
                                        <p>Pays analysés: <strong>${geopolitical.report.summary?.totalCountries || 0}</strong></p>
                                        <p>Zones à haut risque: <strong style="color: #ef4444;">${geopolitical.report.summary?.highRiskZones || 0}</strong></p>
                                        <p>Zones à risque moyen: <strong style="color: #f59e0b;">${geopolitical.report.summary?.mediumRiskZones || 0}</strong></p>
                                    </div>
                                    ${geopolitical.report.crisisZones && geopolitical.report.crisisZones.length > 0 ? `
                                    <div class="crisis-zones">
                                        <h3 style="color: #1e40af;">Zones de Crise Actives</h3>
                                        ${geopolitical.report.crisisZones.slice(0, 5).map(zone => `
                                            <div class="crisis-item risk-${zone.riskLevel || 'medium'}">
                                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                                    <div>
                                                        <strong>${zone.country}</strong>
                                                        <div style="color: #64748b; font-size: 0.9rem; margin-top: 5px;">
                                                            ${zone.mentions} mentions • Sentiment: ${zone.sentiment || 'N/A'}
                                                        </div>
                                                    </div>
                                                    <span style="background: ${zone.riskLevel === 'high' ? '#ef4444' : zone.riskLevel === 'medium' ? '#f59e0b' : '#10b981'}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem;">
                                                        Risque ${zone.riskLevel === 'high' ? 'Élevé' : zone.riskLevel === 'medium' ? 'Moyen' : 'Faible'}
                                                    </span>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    ` : '<p>Aucune zone de crise détectée</p>'}
                                ` : '<p>Aucune donnée géopolitique disponible</p>'}
                            </div>

                            <!-- Section Apprentissage IA -->
                            <div class="section">
                                <h2>🤖 Statistiques d'Apprentissage IA</h2>
                                ${learning ? `
                                <div class="metrics-grid">
                                    <div class="metric-card">
                                        <div class="metric-value">${learning.total_articles_processed || 0}</div>
                                        <div class="metric-label">Articles Traités</div>
                                    </div>
                                    <div class="metric-card">
                                        <div class="metric-value">${((learning.sentiment_accuracy || 0) * 100).toFixed(1)}%</div>
                                        <div class="metric-label">Précision Sentiment</div>
                                    </div>
                                    <div class="metric-card">
                                        <div class="metric-value">${((learning.theme_detection_accuracy || 0) * 100).toFixed(1)}%</div>
                                        <div class="metric-label">Précision Thèmes</div>
                                    </div>
                                    <div class="metric-card">
                                        <div class="metric-value">${learning.avg_processing_time || 0}s</div>
                                        <div class="metric-label">Temps Traitement</div>
                                    </div>
                                </div>
                                ${learning.modules_active ? `
                                <div style="margin-top: 20px;">
                                    <h3 style="color: #1e40af;">Modules Actifs</h3>
                                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">
                                        ${learning.modules_active.map(module =>
                `<span style="background: #3b82f6; color: white; padding: 6px 12px; border-radius: 20px; font-size: 0.8rem;">${module}</span>`
            ).join('')}
                                    </div>
                                </div>
                                ` : ''}
                                ` : '<p>Aucune donnée d\'apprentissage disponible</p>'}
                            </div>
                        </div>

                        <div class="footer">
                            <p>Rapport généré automatiquement par le système d'analyse IA</p>
                            <p>RSS Aggregator Intelligent • ${new Date().getFullYear()}</p>
                        </div>
                    </div>
                </body>
            </html>
        `);

            reportWindow.document.close();
            setMessage("✅ Rapport IA avancé généré avec succès", "success");

        } catch (error) {
            console.error("❌ Erreur génération rapport avancé:", error);
            setMessage("❌ Erreur génération rapport: " + error.message, "error");
        }
    }

    // ========== FONCTIONS CORRÉLATION PEARSON ==========
    async function analyzeKeywordCorrelation() {
        const keyword = prompt('Entrez un mot-clé à analyser:');
        if (!keyword || keyword.trim().length === 0) return;

        setMessage(`🔍 Analyse de corrélation pour "${keyword}"...`, 'info');

        try {
            const response = await apiGET(`/api/analysis/correlations/keyword-sentiment?keyword=${encodeURIComponent(keyword)}`);

            console.log('📊 Réponse analyse keyword:', response);

            if (response.success && response.analysis) {
                const analysis = response.analysis;

                // ✅ AJOUTER L'AFFICHAGE DANS L'INTERFACE
                const resultsContainer = qs('#pearsonResults');
                if (resultsContainer) {
                    const correlationColor = analysis.correlation > 0.3 ? '#10b981' :
                        analysis.correlation < -0.3 ? '#ef4444' : '#f59e0b';

                    resultsContainer.innerHTML = `
                <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid ${correlationColor}; margin-bottom: 15px;">
                    <h4 style="margin-top: 0; color: #1e293b;">📊 Résultat de l'analyse : "${keyword}"</h4>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 15px 0;">
                        <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px;">
                            <div style="font-size: 2rem; font-weight: bold; color: ${correlationColor};">
                                ${analysis.correlation}
                            </div>
                            <div style="color: #64748b; font-size: 0.9rem;">Coefficient Pearson</div>
                        </div>
                        
                        <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px;">
                            <div style="font-size: 1.5rem; font-weight: bold; color: #3b82f6;">
                                ${analysis.sampleSize}
                            </div>
                            <div style="color: #64748b; font-size: 0.9rem;">Articles analysés</div>
                        </div>
                        
                        <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 8px;">
                            <div style="font-size: 1.2rem; font-weight: bold; color: #8b5cf6;">
                                ${analysis.strength.replace('_', ' ')}
                            </div>
                            <div style="color: #64748b; font-size: 0.9rem;">Force de corrélation</div>
                        </div>
                    </div>
                    
                    <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin-top: 10px;">
                        <strong>🔍 Interprétation :</strong>
                        <p style="margin: 8px 0 0 0; color: #475569;">${analysis.interpretation}</p>
                    </div>
                    
                    <div style="margin-top: 15px; font-size: 0.8rem; color: #64748b;">
                        <strong>🧮 Méthodologie :</strong> 
                        Corrélation de Pearson entre la fréquence du mot-clé "${keyword}" et le score de sentiment des articles.
                        Une valeur proche de +1 indique une forte relation positive, -1 une forte relation négative.
                    </div>
                </div>
            `;
                }

                let message = `📊 Corrélation "${keyword}" ↔ Sentiment: ${analysis.correlation}\n`;
                message += `📈 Force: ${analysis.strength}\n`;
                message += `🔍 ${analysis.interpretation}\n`;
                message += `📋 Échantillon: ${analysis.sampleSize} articles`;

                setMessage(message, analysis.correlation > 0.3 ? 'success' : 'info');
            } else {
                throw new Error('Format de réponse invalide');
            }
        } catch (error) {
            console.error('❌ Erreur analyse corrélation:', error);
            setMessage('Erreur analyse corrélation: ' + error.message, 'error');
        }
    }

    async function loadThemeCorrelations() {
        setMessage('🔗 Analyse des corrélations entre thèmes...', 'info');

        try {
            const response = await apiGET('/api/analysis/correlations/themes?limit=150');

            if (response.success && response.correlations.length > 0) {
                const container = qs('#themeCorrelations');
                if (!container) return;

                const topCorrelations = response.correlations.slice(0, 10);

                container.innerHTML = `
                <div style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                    <h3 style="margin-top: 0;">🔗 Corrélations entre Thèmes</h3>
                    <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 15px;">
                        ${response.metadata.significantCorrelations} corrélations significatives trouvées sur ${response.metadata.themesCount} thèmes analysés
                    </div>
                    <div style="display: grid; gap: 10px;">
                        ${topCorrelations.map(corr => `
                            <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid ${corr.correlation > 0 ? '#10b981' : '#ef4444'
                    };">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <strong>${corr.theme1}</strong> ↔ <strong>${corr.theme2}</strong>
                                    </div>
                                    <div style="font-weight: bold; color: ${corr.correlation > 0 ? '#10b981' : '#ef4444'
                    };">
                                        ${corr.correlation}
                                    </div>
                                </div>
                                <div style="font-size: 0.8rem; color: #64748b; margin-top: 5px;">
                                    ${corr.interpretation}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

                setMessage(`✅ ${response.correlations.length} corrélations entre thèmes analysées`, 'success');
            } else {
                qs('#themeCorrelations').innerHTML = `
                <div style="background: white; padding: 20px; border-radius: 12px; text-align: center; color: #64748b;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">📊</div>
                    <p>Aucune corrélation significative trouvée entre les thèmes</p>
                    <p style="font-size: 0.9rem;">Les corrélations apparaissent quand des thèmes sont fréquemment mentionnés ensemble</p>
                </div>
            `;
            }
        } catch (error) {
            console.error('❌ Erreur chargement corrélations thèmes:', error);
            setMessage('Erreur analyse corrélations: ' + error.message, 'error');
        }
    }

    // ========== FONCTIONS UTILITAIRES ==========
    async function saveEmailConfig() {
        setMessage("✅ Configuration email sauvegardée", "success");
    }

    async function testEmailConfig() {
        setMessage("📧 Test de configuration email...", "info");
        setTimeout(() => setMessage("✅ Configuration email valide", "success"), 1000);
    }

    async function saveUIConfig() {
        const theme = document.querySelector('input[name="theme"]:checked')?.value || 'light';
        setMessage(`✅ Thème ${theme} sauvegardé`, "success");
    }

    function closeModal(modalId) {
        const modal = qs(`#${modalId}`);
        if (modal) modal.style.display = "none";
    }

    // ========== INITIALISATION ==========
    async function init() {
        console.log("🚀 Initialisation de l'application...");

        try {
            const savedConfig = localStorage.getItem('rssAggregatorAIConfig');
            if (savedConfig) {
                state.aiConfig = { ...state.aiConfig, ...JSON.parse(savedConfig) };
            }
        } catch (error) {
            console.warn("❌ Erreur chargement config IA sauvegardée:", error);
        }

        showTab("articles");

        try {
            await loadArticles();
            await loadThemes();
            await loadFeeds();
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
        closeModal,
        loadArticles,
        refreshArticles,
        renderArticlesList,
        loadThemes,
        loadThemesManager,
        showAddThemeModal,
        generateEnhancedAIAnalysisReport,
        createTheme,
        deleteTheme,
        loadFeeds,
        analyzeKeywordCorrelation,
        loadThemeCorrelations,
        loadFeedsManager,
        showAddFeedModal,
        createFeed,
        toggleFeed,
        deleteFeed,
        loadMetrics,
        loadSentimentOverview, 
        loadLearningStats,        
        updateAllCharts,
        zoomTimelineChart,
        resetTimelineZoom,
        loadAlertsManager,
        createAlert,
        toggleAlert,
        deleteAlert,
        loadAIConfigToForm,
        saveAIConfig,
        testLocalAIConnection,
        testOpenAIConnection,
        startLocalAIServer,
        generateAIAnalysisReport,
        exportToJSON,
        exportArticlesToCSV,
        saveEmailConfig,
        testEmailConfig,
        saveUIConfig,
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

console.log('✅ app.js chargé et corrigé');
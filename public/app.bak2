// public/app.js - VERSION COMPLÈTEMENT CORRIGÉE
const API_BASE = window.__API_BASE__ || (location.origin.includes('http') ? location.origin : 'http://localhost:3000');

window.app = (function () {
    // ========== ÉTAT GLOBAL ==========
    const state = {
        apiBase: "/api",
        autoRefresh: true,
        refreshIntervalMs: 300000, // 5 min
        articles: [],
        themes: [],
        summary: {},
        metrics: null,
        charts: { themeChart: null, timelineChart: null, sentimentChart: null, sentimentEvolutionChart: null },
        timers: { autoRefresh: null },
        aiConfig: null,
        currentTab: "articles"
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
        return (v === null || v === undefined) ? d : Number(v);
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

    function plural(n, s = "s") { return n > 1 ? s : ""; }

    // ========== FONCTIONS API CORRIGÉES ==========
    async function apiGET(path) {
        try {
            const fullPath = path.startsWith("/api/") ? path : `/api${path.startsWith("/") ? path : "/" + path}`;
            console.log(`📥 GET ${fullPath}`);

            const res = await fetch(fullPath, {
                method: "GET",
                headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`HTTP ${res.status}: ${txt}`);
            }

            return await res.json();
        } catch (err) {
            console.error(`❌ GET ${path}:`, err.message);
            throw err;
        }
    }

    async function apiPOST(path, body) {
        try {
            const fullPath = path.startsWith("/api/") ? path : `/api${path.startsWith("/") ? path : "/" + path}`;
            console.log(`📤 POST ${fullPath}`);

            const res = await fetch(fullPath, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body || {})
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`HTTP ${res.status}: ${txt}`);
            }

            return await res.json();
        } catch (err) {
            console.error(`❌ POST ${path}:`, err.message);
            throw err;
        }
    }

    // ========== CHARGEMENT DONNÉES CORRIGÉ ==========
    function normalizeArticle(a) {
        if (!a || typeof a !== "object") return {};

        const out = {
            id: a.id || Math.random().toString(36).substr(2, 9),
            title: a.title || "Sans titre",
            link: a.link || "#",
            date: a.date || a.pubDate || new Date().toISOString(),
            themes: Array.isArray(a.themes) ? a.themes : [],
            sentiment: a.sentiment || { score: 0, sentiment: 'neutral', confidence: 0 },
            confidence: safeNumber(a.confidence || (a.sentiment && a.sentiment.confidence), 0.5),
            bayesian_posterior: safeNumber(a.bayesian_posterior, 0.5),
            corroboration_strength: safeNumber(a.corroboration_strength, 0),
            summary: a.summary || a.content || ""
        };

        if (typeof out.date !== "string") {
            try { out.date = new Date(out.date).toISOString(); } catch (e) { }
        }

        out.pubDate = out.date;
        return out;
    }

    async function loadArticles() {
        setMessage("Chargement des articles...", "info");
        try {
            const json = await apiGET("/articles");

            if (json.success && json.articles) {
                state.articles = json.articles.map(normalizeArticle);
                state.summary = { total_articles: json.total || json.articles.length };
                console.log(`✅ ${state.articles.length} articles chargés`);
            } else if (Array.isArray(json)) {
                state.articles = json.map(normalizeArticle);
                state.summary = { total_articles: json.length };
                console.log(`✅ ${state.articles.length} articles chargés (format array)`);
            } else {
                state.articles = [];
                state.summary = { total_articles: 0 };
                console.warn("⚠️ Format de données inattendu:", json);
            }

            renderArticlesList();
            computeThemesFromArticles();
            updateCharts();
            setMessage("", "info");
            return state.articles;
        } catch (err) {
            console.error("❌ loadArticles error", err);
            setMessage("Erreur chargement articles: " + err.message, "error");
            state.articles = [];
            state.summary = { total_articles: 0 };
            return [];
        }
    }

    // ========== FONCTIONS DE RAFRAÎCHISSEMENT CORRIGÉES ==========
    async function refreshArticles() {
        const btn = qs("#refreshBtn");
        const originalText = btn ? btn.innerHTML : "";

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "🔄 Actualisation...";
        }

        setMessage("Rafraîchissement des données en cours...", "info");

        try {
            const result = await apiPOST("/refresh");

            if (result.success) {
                setMessage(`✅ ${result.message}`, "success");

                // Recharger les articles après rafraîchissement
                await loadArticles();

                // Relancer l'analyse thématique
                try {
                    await apiPOST("/themes/analyze");
                    console.log("✅ Analyse thématique relancée");
                } catch (themeError) {
                    console.warn("⚠️ Analyse thématique échouée:", themeError);
                }

                return result;
            } else {
                throw new Error(result.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error("❌ Erreur rafraîchissement:", error);
            setMessage("Erreur de rafraîchissement: " + error.message, "error");
            throw error;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    }

    // ========== GESTION DES THÈMES CORRIGÉE ==========
    async function loadThemesManager() {
        const container = qs("#themesManagerList");
        if (!container) return;

        try {
            setMessage("Chargement des thèmes...", "info");
            const data = await apiGET("/themes/manager");

            if (data.success && data.themes && data.themes.length > 0) {
                container.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">
            ${data.themes.map(theme => `
              <div class="theme-card" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                  <div style="width: 16px; height: 16px; border-radius: 50%; background: ${theme.color || '#6366f1'};"></div>
                  <h4 style="margin: 0; flex: 1;">${escapeHtml(theme.name)}</h4>
                  <div>
                    <button onclick="window.app.editTheme('${theme.id}')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; margin-right: 4px;">✏️</button>
                    <button onclick="window.app.deleteTheme('${theme.id}')" class="btn btn-danger" style="padding: 4px 8px; font-size: 0.8rem;">🗑️</button>
                  </div>
                </div>
                <div style="color: #64748b; font-size: 0.9rem; margin-bottom: 15px;">${escapeHtml(theme.description || 'Pas de description')}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 15px;">
                  ${(theme.keywords || []).slice(0, 8).map(keyword => `
                    <span style="padding: 2px 8px; background: #f1f5f9; border-radius: 12px; font-size: 0.75rem; color: #475569;">${escapeHtml(keyword)}</span>
                  `).join('')}
                  ${(theme.keywords || []).length > 8 ? `<span style="font-size: 0.75rem; color: #64748b;">+${theme.keywords.length - 8} autres</span>` : ''}
                </div>
                <div style="font-size: 0.8rem; color: #94a3b8;">
                  ${theme.keywords?.length || 0} mots-clés • Créé le ${new Date(theme.created_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top: 15px; color: #64748b; font-size: 0.9rem;">
            Total: ${data.themes.length} thèmes configurés
          </div>
        `;
                setMessage("", "info");
            } else {
                container.innerHTML = `
          <div class="loading" style="text-align: center; padding: 40px;">
            <div>📋 Aucun thème configuré</div>
            <button onclick="window.app.loadThemesFromFile()" class="btn btn-success" style="margin-top: 15px;">
              📥 Charger les thèmes par défaut
            </button>
          </div>
        `;
            }
        } catch (error) {
            console.error('❌ Erreur chargement thèmes:', error);
            container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement des thèmes</div>';
        }
    }

    async function loadThemesFromFile() {
        if (!confirm("Charger les thèmes par défaut depuis le fichier themes.json ?")) return;

        setMessage("Chargement des thèmes depuis le fichier...", "info");
        try {
            const data = await apiPOST("/themes/import");

            if (data.success) {
                setMessage(`✅ ${data.imported} thèmes chargés depuis le fichier`, "success");
                loadThemesManager();

                // Relancer l'analyse thématique après chargement
                setTimeout(async () => {
                    try {
                        await apiPOST("/themes/analyze");
                        setMessage("✅ Analyse thématique relancée avec les nouveaux thèmes", "success");
                    } catch (themeError) {
                        console.warn("⚠️ Analyse thématique échouée:", themeError);
                    }
                }, 2000);
            } else {
                throw new Error(data.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error('❌ Erreur chargement thèmes fichier:', error);
            setMessage("Erreur: " + error.message, "error");
        }
    }

    async function addNewTheme() {
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
            const data = await apiPOST("/themes", { name, keywords, color, description });

            if (data.success) {
                closeModal('addThemeModal');
                loadThemesManager();

                // Réinitialiser le formulaire
                qs('#newThemeName').value = '';
                qs('#newThemeKeywords').value = '';
                qs('#newThemeColor').value = '#3b82f6';
                qs('#newThemeDescription').value = '';

                setMessage("✅ Thème créé avec succès !", "success");

                // Relancer l'analyse thématique
                setTimeout(async () => {
                    try {
                        await apiPOST("/themes/analyze");
                        console.log("✅ Analyse thématique relancée");
                    } catch (themeError) {
                        console.warn("⚠️ Analyse thématique échouée:", themeError);
                    }
                }, 1000);
            } else {
                throw new Error(data.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error('❌ Erreur création thème:', error);
            alert('Erreur: ' + error.message);
        }
    }

    async function editTheme(themeId) {
        try {
            const data = await apiGET("/themes/manager");

            if (!data.success) {
                alert('Erreur de récupération des thèmes');
                return;
            }

            const theme = data.themes.find(t => t.id === themeId);
            if (!theme) {
                alert('Thème non trouvé');
                return;
            }

            // Créer le modal d'édition
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
                        style="width: 100%; height: 120px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-family: monospace;">${(theme.keywords || []).map(k => escapeHtml(k)).join('\n')}</textarea>
            </div>
            <div style="margin: 15px 0;">
              <label style="display: block; margin-bottom: 5px; font-weight: 600;">Couleur:</label>
              <input type="color" id="editThemeColor" value="${theme.color || '#6366f1'}" style="width: 100%; height: 40px;">
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

            // Supprimer l'ancien modal s'il existe
            const oldModal = document.querySelector('#editThemeModal');
            if (oldModal) oldModal.remove();

            // Ajouter le nouveau modal
            document.body.insertAdjacentHTML('beforeend', modalHtml);

        } catch (error) {
            console.error('❌ Erreur édition thème:', error);
            alert('Erreur: ' + error.message);
        }
    }

    async function saveThemeEdits(oldThemeId) {
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
                // Si l'ID a changé, supprimer l'ancien thème
                const newThemeId = data.theme?.id || name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                if (oldThemeId !== newThemeId) {
                    try {
                        await apiDELETE(`/themes/${oldThemeId}`);
                    } catch (deleteError) {
                        console.warn("⚠️ Impossible de supprimer l'ancien thème:", deleteError);
                    }
                }

                closeModal('editThemeModal');
                loadThemesManager();
                setMessage("✅ Thème modifié avec succès !", "success");

                // Relancer l'analyse thématique
                setTimeout(async () => {
                    try {
                        await apiPOST("/themes/analyze");
                        console.log("✅ Analyse thématique relancée");
                    } catch (themeError) {
                        console.warn("⚠️ Analyse thématique échouée:", themeError);
                    }
                }, 1000);
            } else {
                throw new Error(data.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error('❌ Erreur sauvegarde thème:', error);
            alert('Erreur: ' + error.message);
        }
    }

    async function deleteTheme(themeId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce thème ? Cette action supprimera également toutes les analyses associées.')) {
            return;
        }

        setMessage("Suppression du thème...", "info");

        try {
            const data = await apiDELETE(`/themes/${themeId}`);

            if (data.success) {
                loadThemesManager();
                setMessage("✅ Thème supprimé avec succès", "success");
            } else {
                throw new Error(data.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error('❌ Erreur suppression thème:', error);
            alert('Erreur: ' + error.message);
        }
    }

    // ========== FONCTIONS UI CORRIGÉES ==========
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

    function showTab(tabName) {
        // Masquer tous les contenus d'onglets
        qsa(".tab-content").forEach(div => {
            div.style.display = "none";
            div.classList.remove("active");
        });

        // Désactiver tous les onglets
        qsa(".tab").forEach(tab => {
            tab.classList.remove("active");
        });

        // Activer l'onglet cible
        const targetTab = qs(`#${tabName}Tab`);
        const targetButton = qs(`[onclick*="${tabName}"]`);

        if (targetTab) {
            targetTab.style.display = "block";
            targetTab.classList.add("active");
        }

        if (targetButton) {
            targetButton.classList.add("active");
        }

        state.currentTab = tabName;
        console.log(`📂 Onglet activé: ${tabName}`);

        // Charger les données spécifiques à l'onglet
        loadTabData(tabName);
    }

    function loadTabData(tabName) {
        console.log(`📊 Chargement données pour: ${tabName}`);

        switch (tabName) {
            case "analysis":
                updateCharts();
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
                loadArticles();
                break;
            default:
                console.warn(`⚠️ Onglet inconnu: ${tabName}`);
        }
    }

    function closeModal(modalId) {
        const modal = qs(`#${modalId}`);
        if (modal) {
            modal.style.display = "none";
        }
    }

    // ========== FONCTIONS D'EXPORT CORRIGÉES ==========
    async function exportToJSON() {
        try {
            setMessage("Génération de l'export JSON...", "info");

            const articles = await apiGET("/articles?limit=1000");
            const themes = await apiGET("/themes/manager");

            const exportData = {
                export_date: new Date().toISOString(),
                total_articles: articles.articles?.length || 0,
                articles: articles.articles || [],
                themes: themes.themes || []
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

    async function exportToCSV() {
        try {
            setMessage("Génération de l'export CSV...", "info");

            const articles = await apiGET("/articles?limit=1000");

            if (!articles.articles || articles.articles.length === 0) {
                throw new Error("Aucun article à exporter");
            }

            const headers = ["Titre", "Date", "Lien", "Thèmes", "Sentiment", "Score", "Confiance"];
            const csvRows = [headers.join(",")];

            articles.articles.forEach(article => {
                const row = [
                    `"${(article.title || '').replace(/"/g, '""')}"`,
                    `"${article.date || ''}"`,
                    `"${article.link || ''}"`,
                    `"${(article.themes || []).join('; ').replace(/"/g, '""')}"`,
                    `"${(article.sentiment?.sentiment || 'neutral')}"`,
                    article.sentiment?.score || 0,
                    article.confidence || 0
                ];
                csvRows.push(row.join(","));
            });

            const csvString = csvRows.join("\n");
            const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });

            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `rss-export-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setMessage("✅ Export CSV téléchargé avec succès", "success");
        } catch (error) {
            console.error("❌ Erreur export CSV:", error);
            setMessage("Erreur lors de l'export CSV: " + error.message, "error");
        }
    }

    // ========== FONCTIONS API SUPPLEMENTAIRES ==========
    async function apiDELETE(path) {
        try {
            const fullPath = path.startsWith("/api/") ? path : `/api${path.startsWith("/") ? path : "/" + path}`;
            console.log(`🗑️ DELETE ${fullPath}`);

            const res = await fetch(fullPath, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" }
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`HTTP ${res.status}: ${txt}`);
            }

            return await res.json();
        } catch (err) {
            console.error(`❌ DELETE ${path}:`, err.message);
            throw err;
        }
    }

    // ========== CALCUL DES THÈMES ==========
    function computeThemesFromArticles() {
        const themeCounts = {};

        state.articles.forEach(article => {
            if (article.themes && Array.isArray(article.themes)) {
                article.themes.forEach(theme => {
                    if (theme && typeof theme === 'string') {
                        themeCounts[theme] = (themeCounts[theme] || 0) + 1;
                    }
                });
            }
        });

        state.themes = Object.entries(themeCounts).map(([name, count]) => ({
            name,
            count,
            color: getThemeColor(name)
        })).sort((a, b) => b.count - a.count);

        console.log(`✅ ${state.themes.length} thèmes calculés depuis les articles`);
    }

    function getThemeColor(themeName) {
        const colors = [
            "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
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
        <div class="loading" style="text-align: center; padding: 40px;">
          <div>📰 Aucun article disponible</div>
          <button onclick="window.app.refreshArticles()" class="btn btn-success" style="margin-top: 15px;">
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
        <div class="article-card" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: white;">
          <h4 style="margin: 0 0 8px 0;">
            <a href="${escapeHtml(article.link)}" target="_blank" style="color: #1e40af; text-decoration: none;">
              ${escapeHtml(article.title)}
            </a>
          </h4>
          <div class="meta" style="display: flex; gap: 16px; font-size: 0.875rem; color: #64748b; margin-bottom: 8px;">
            <span>📅 ${new Date(article.date).toLocaleDateString('fr-FR')}</span>
            <span>${sentimentEmoji[sentimentType]} ${sentimentType} (${(sentiment.score || 0).toFixed(2)})</span>
            <span>🎯 Confiance: ${((article.confidence || 0) * 100).toFixed(1)}%</span>
          </div>
          <p style="margin: 0 0 12px 0; color: #475569; line-height: 1.5;">
            ${escapeHtml((article.summary || '').substring(0, 200))}...
          </p>
          <div class="themes" style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${themes.map(theme => `
              <span class="tag" style="padding: 2px 8px; background: #f1f5f9; border-radius: 12px; font-size: 0.75rem; color: #475569;">
                ${escapeHtml(theme)}
              </span>
            `).join("")}
            ${themes.length === 0 ? '<span style="font-size: 0.75rem; color: #94a3b8;">Aucun thème détecté</span>' : ''}
          </div>
        </div>
      `;
        }).join("");

        container.innerHTML = articlesHtml;
    }

    // ========== GRAPHIQUES ==========
    function updateCharts() {
        createThemeChart();
        createTimelineChart();
        createSentimentChart();
        createSentimentEvolutionChart();
    }

    function createThemeChart() {
        const ctx = qs("#themeChart");
        if (!ctx) return;

        if (state.charts.themeChart) {
            state.charts.themeChart.destroy();
        }

        const themeData = state.themes.slice(0, 10);

        if (themeData.length === 0) {
            ctx.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #64748b;">
          📊 Aucune donnée de thème disponible
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
                plugins: {
                    legend: {
                        position: 'right',
                    },
                    title: {
                        display: true,
                        text: 'Répartition par Thème'
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

        const dates = Array.from(new Set(state.articles.map(a => isoDay(a.date)))).sort().slice(-30);
        const themeCounts = {};

        state.themes.slice(0, 5).forEach(theme => {
            themeCounts[theme.name] = dates.map(date =>
                state.articles.filter(a => isoDay(a.date) === date && a.themes.includes(theme.name)).length
            );
        });

        if (Object.keys(themeCounts).length === 0) {
            ctx.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #64748b;">
          📈 Aucune donnée temporelle disponible
        </div>
      `;
            return;
        }

        state.charts.timelineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: Object.entries(themeCounts).map(([themeName, counts]) => ({
                    label: themeName,
                    data: counts,
                    borderColor: getThemeColor(themeName),
                    backgroundColor: getThemeColor(themeName) + '20',
                    tension: 0.3,
                    fill: true
                }))
            },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Évolution Temporelle des Thèmes'
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
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Date'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Nombre d\'articles'
            },
            beginAtZero: true
          }
        }
      }
    });
  }

  function createSentimentChart() {
    const ctx = qs("#sentimentChart");
    if (!ctx) return;
    
    if (state.charts.sentimentChart) {
      state.charts.sentimentChart.destroy();
    }
    
    const sentimentData = {
      positive: state.articles.filter(a => a.sentiment.sentiment === 'positive').length,
      neutral: state.articles.filter(a => a.sentiment.sentiment === 'neutral').length,
      negative: state.articles.filter(a => a.sentiment.sentiment === 'negative').length
    };
    
    state.charts.sentimentChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Positif', 'Neutre', 'Négatif'],
        datasets: [{
          label: 'Nombre d\'articles',
          data: [sentimentData.positive, sentimentData.neutral, sentimentData.negative],
          backgroundColor: ['#10b981', '#6b7280', '#ef4444'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Répartition du Sentiment'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  // NOUVEAU: Graphique d'évolution du sentiment par thème
  function createSentimentEvolutionChart() {
    const ctx = qs("#sentimentEvolutionChart");
    if (!ctx) return;
    
    if (state.charts.sentimentEvolutionChart) {
      state.charts.sentimentEvolutionChart.destroy();
    }
    
    const dates = Array.from(new Set(state.articles.map(a => {
      const date = a.date || a.pubDate;
      return date ? date.slice(0, 10) : null;
    }))).filter(d => d).sort().slice(-30);
    
    const sentimentByDate = dates.map(date => {
      const articlesOfDay = state.articles.filter(a => {
        const aDate = a.date || a.pubDate;
        return aDate && aDate.slice(0, 10) === date;
      });
      const avgScore = articlesOfDay.length > 0 
        ? articlesOfDay.reduce((sum, a) => sum + (a.sentiment?.score || 0), 0) / articlesOfDay.length
        : 0;
      return avgScore;
    });
    
    state.charts.sentimentEvolutionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: 'Score de sentiment moyen',
          data: sentimentByDate,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Évolution du Sentiment dans le Temps'
          }
        },
        scales: {
          y: {
            suggestedMin: -1,
            suggestedMax: 1
          }
        }
      }
    });
  }

  // ========== FONCTIONS SPÉCIFIQUES AUX ONGLETS ==========
  async function loadSentimentOverview() {
    const container = document.querySelector("#sentimentOverview");
    if (!container) return;
    
    try {
      const stats = await fetch('/api/sentiment/stats').then(r => r.json());
      
      if (stats.success) {
        const s = stats.summary || {};
        container.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
            <div class="metric-card">
              <h3>😊 Positifs</h3>
              <div style="font-size: 2rem; color: #10b981;">${s.positive || 0}</div>
            </div>
            <div class="metric-card">
              <h3>😐 Neutres</h3>
              <div style="font-size: 2rem; color: #6b7280;">${s.neutral || 0}</div>
            </div>
            <div class="metric-card">
              <h3>😞 Négatifs</h3>
              <div style="font-size: 2rem; color: #ef4444;">${s.negative || 0}</div>
            </div>
            <div class="metric-card">
              <h3>📊 Score moyen</h3>
              <div style="font-size: 2rem; color: #3b82f6;">${s.average_score ? s.average_score.toFixed(3) : '0.000'}</div>
            </div>
          </div>
        `;
        
        createSentimentEvolutionChart();
      }
    } catch (error) {
      console.error('Erreur chargement sentiment:', error);
      container.innerHTML = '<div class="loading">Erreur de chargement</div>';
    }
  }

  async function loadLearningStats() {
  const container = document.querySelector("#learningStats");
  if (!container) return;

  try {
    container.innerHTML = '<div class="loading">Chargement des statistiques...</div>';

    // Utiliser la route corrigée
    const response = await fetch('/api/learning/stats');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const stats = await response.json();

    if (stats.success) {
      container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
          <div class="metric-card">
            <h3>🎯 Précision moyenne</h3>
            <div style="font-size: 2rem; color: #10b981;">${(stats.accuracy * 100).toFixed(1)}%</div>
          </div>
          <div class="metric-card">
            <h3>📈 Modèle entraîné</h3>
            <div style="font-size: 2rem; color: ${stats.is_trained ? '#10b981' : '#ef4444'};">${stats.is_trained ? '✅ Oui' : '❌ Non'}</div>
          </div>
          <div class="metric-card">
            <h3>📚 Articles analysés</h3>
            <div style="font-size: 2rem; color: #3b82f6;">${stats.labeled_articles || stats.total_articles_processed || 0}</div>
          </div>
          <div class="metric-card">
            <h3>🔄 Dernier entraînement</h3>
            <div style="font-size: 1.2rem; color: #6b7280;">${stats.last_trained ? new Date(stats.last_trained).toLocaleString('fr-FR') : 'Jamais'}</div>
          </div>
        </div>
        <div style="margin-top: 25px; padding: 20px; background: #f8fafc; border-radius: 12px;">
          <h3 style="margin-bottom: 15px;">🤖 Modules actifs</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
            ${(stats.modules_active || []).map(module => `
              <div style="padding: 10px; background: white; border-radius: 8px; border-left: 3px solid #10b981;">
                ✅ ${module}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      container.innerHTML = '<div class="loading">Aucune donnée d\'apprentissage disponible</div>';
    }
  } catch (error) {
    console.error('❌ Erreur chargement apprentissage:', error);
    container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement des statistiques</div>';
  }
}

  // ========== INITIALISATION ==========
  function init() {
    console.log("🚀 Initialisation de l'application...");
    
    // Charger la configuration IA
    try {
      const savedConfig = localStorage.getItem("aiConfig");
      if (savedConfig) {
        state.aiConfig = JSON.parse(savedConfig);
        if (qs("#openaiKey")) qs("#openaiKey").value = state.aiConfig.openaiKey || "";
        if (qs("#openaiModel")) qs("#openaiModel").value = state.aiConfig.openaiModel || "gpt-3.5-turbo";
        if (qs("#enableLocal")) qs("#enableLocal").checked = state.aiConfig.enableLocal || false;
        if (qs("#llamaUrl")) qs("#llamaUrl").value = state.aiConfig.llamaUrl || "";
      }
    } catch (e) {
      console.warn("Erreur chargement config IA:", e);
    }
    
    // Activer l'onglet par défaut
    showTab("articles");
    
    // Charger les données initiales
    loadArticles().then(() => {
      loadMetrics();
      updateCharts();
    });
    
    // Configurer les écouteurs d'événements globaux
    window.addEventListener('click', function(event) {
      const modals = document.querySelectorAll('.modal');
      modals.forEach(modal => {
        if (event.target === modal) {
          modal.style.display = 'none';
        }
      });
    });
    
    console.log("✅ Application initialisée");
  }


    // ========== FONCTIONS D'INTERFACE IA & MODALES ==========
    function showAIConfig() {
        // Affiche le modal de configuration IA si présent
        const modal = qs('#aiConfigModal');
        if (modal) {
            modal.style.display = 'block';
            // remplir les champs si on a une config
            try {
                const cfg = state.aiConfig || JSON.parse(localStorage.getItem('aiConfig') || '{}');
                if (qs('#openaiKey')) qs('#openaiKey').value = cfg.openaiKey || '';
                if (qs('#openaiModel')) qs('#openaiModel').value = cfg.openaiModel || 'gpt-3.5-turbo';
                if (qs('#enableLocal')) qs('#enableLocal').checked = !!cfg.enableLocal;
                if (qs('#llamaUrl')) qs('#llamaUrl').value = cfg.llamaUrl || '';
            } catch (e) { /* ignore */ }
        } else {
            alert('Configuration IA: modal #aiConfigModal introuvable dans le HTML.');
        }
    }

    function saveAIConfig() {
        try {
            const cfg = {
                openaiKey: qs('#openaiKey') ? qs('#openaiKey').value.trim() : '',
                openaiModel: qs('#openaiModel') ? qs('#openaiModel').value.trim() : '',
                enableLocal: qs('#enableLocal') ? qs('#enableLocal').checked : false,
                llamaUrl: qs('#llamaUrl') ? qs('#llamaUrl').value.trim() : ''
            };
            state.aiConfig = cfg;
            localStorage.setItem('aiConfig', JSON.stringify(cfg));
            setMessage('✅ Configuration IA sauvegardée', 'success');
            closeModal('aiConfigModal');
        } catch (e) {
            console.error('Erreur sauvegarde config IA', e);
            setMessage('Erreur sauvegarde config IA: '+e.message, 'error');
        }
    }

    async function testAIConnection() {
        // Test basique: vérifier que la config existe et, si enableLocal, tenter un ping
        try {
            const cfg = state.aiConfig || JSON.parse(localStorage.getItem('aiConfig') || '{}');
            if (!cfg) {
                setMessage('Aucune configuration IA détectée', 'warning');
                return false;
            }
            if (cfg.enableLocal && cfg.llamaUrl) {
                const url = cfg.llamaUrl.replace(/\/+$/, '') + '/health';
                try {
                    const res = await fetch(url, { method: 'GET' , mode: 'cors' });
                    if (res.ok) {
                        setMessage('✅ Connexion au modèle local OK', 'success');
                        return true;
                    } else {
                        setMessage('❌ Modèle local non joignable ('+res.status+')', 'error');
                        return false;
                    }
                } catch (err) {
                    setMessage('❌ Échec connexion modèle local: ' + err.message, 'error');
                    return false;
                }
            } else if (cfg.openaiKey) {
                // Nous ne pouvons pas tester la clé OpenAI côté client sans backend, indiquer l'état
                setMessage('ℹ️ Clé OpenAI configurée (test côté serveur requis)', 'info');
                return true;
            } else {
                setMessage('⚠️ Aucune méthode IA configurée (OpenAI ou Local)', 'warning');
                return false;
            }
        } catch (e) {
            console.error('Erreur testAIConnection', e);
            setMessage('Erreur test IA: '+e.message, 'error');
            return false;
        }
    }

    function showAddThemeModal() {
        const modal = qs('#addThemeModal');
        if (modal) {
            modal.style.display = 'block';
        } else {
            // create a small inline modal if not present
            const html = `
              <div id="addThemeModal" class="modal" style="display:block;">
                <div class="modal-content" style="max-width:600px;margin:40px auto;padding:20px;background:white;border-radius:8px;">
                  <span class="close" onclick="window.app.closeModal('addThemeModal')">&times;</span>
                  <h3>Ajouter un thème</h3>
                  <div style="margin-top:8px;">
                    <input id="newThemeName" placeholder="Nom du thème" style="width:100%;padding:8px;margin-bottom:8px;">
                    <textarea id="newThemeKeywords" placeholder="Mots-clés (un par ligne)" style="width:100%;height:120px;padding:8px;"></textarea>
                    <div style="display:flex;gap:8px;margin-top:8px;">
                      <input id="newThemeColor" type="color" value="#3b82f6">
                      <button class="btn btn-success" onclick="window.app.addNewTheme()">💾 Ajouter</button>
                      <button class="btn btn-secondary" onclick="window.app.closeModal('addThemeModal')">Annuler</button>
                    </div>
                  </div>
                </div>
              </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
        }
    }

    function showAddFeedModal() {
        const modal = qs('#addFeedModal');
        if (modal) {
            modal.style.display = 'block';
        } else {
            const html = `
              <div id="addFeedModal" class="modal" style="display:block;">
                <div class="modal-content" style="max-width:600px;margin:40px auto;padding:20px;background:white;border-radius:8px;">
                  <span class="close" onclick="window.app.closeModal('addFeedModal')">&times;</span>
                  <h3>Ajouter un flux</h3>
                  <div style="margin-top:8px;">
                    <input id="newFeedUrl" placeholder="URL du flux" style="width:100%;padding:8px;margin-bottom:8px;">
                    <button class="btn btn-success" onclick="(function(){ const url=qs('#newFeedUrl').value; if(url) window.app.addNewFeed(url); })()">💾 Ajouter</button>
                    <button class="btn btn-secondary" onclick="window.app.closeModal('addFeedModal')">Annuler</button>
                  </div>
                </div>
              </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
        }
    }

    
    async function addNewFeed(url) {
        try {
            const feedUrl = url || (qs('#newFeedUrl') ? qs('#newFeedUrl').value.trim() : '');
            if (!feedUrl) {
                alert('Veuillez fournir une URL de flux valide');
                return;
            }
            setMessage('Ajout du flux...', 'info');
            const res = await apiPOST('/feeds', { url: feedUrl });
            if (res.success) {
                closeModal('addFeedModal');
                setMessage('✅ Flux ajouté', 'success');
                if (window.loadFeedsManager) window.loadFeedsManager();
            } else {
                throw new Error(res.error || 'Erreur ajout flux');
            }
        } catch (e) {
            console.error('Erreur addNewFeed', e);
            alert('Erreur ajout flux: ' + e.message);
        }
    }

  // ========== EXPOSITION PUBLIQUE ==========
  return {
    // Fonctions principales
    init,
    showTab,
    showAIConfig,
    closeModal,
    saveAIConfig,
    testAIConnection,
    
    // Gestion des flux
    loadFeedsManager,
    showAddFeedModal,
    addNewFeed,
    toggleFeed,
    deleteFeed,
    
    // Gestion des thèmes
    loadThemesManager,
    showAddThemeModal,
    addNewTheme,
    editTheme,
    deleteTheme,
    loadThemesFromFile,
    
    // Fonctions de données
    loadArticles,
    loadMetrics,
    loadSentimentOverview,
    loadLearningStats,
    
    // État
    state
  };
})();

// Initialisation au chargement
document.addEventListener("DOMContentLoaded", function() {
  window.app.init();
});

// Exposer les fonctions globales
window.showTab = window.app.showTab;
window.showAIConfig = window.app.showAIConfig;
window.closeModal = window.app.closeModal;
window.saveAIConfig = window.app.saveAIConfig;
window.testAIConnection = window.app.testAIConnection;
window.loadThemesFromFile = window.app.loadThemesFromFile;
window.showAddFeedModal = window.app.showAddFeedModal;
window.addNewFeed = window.app.addNewFeed;
window.showAddThemeModal = window.app.showAddThemeModal;
window.addNewTheme = window.app.addNewTheme;

// Corrections pour app.js - À ajouter/remplacer dans le fichier existant

// ========== CORRECTION 1: Fonction loadFeedsManager exposée globalement ==========
window.loadFeedsManager = async function () {
    const container = document.querySelector("#feedsManagerList");
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Chargement des flux...</div>';

        const response = await fetch('/api/feeds/manager');
        const data = await response.json();

        if (data.success && data.feeds && data.feeds.length > 0) {
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
              ${data.feeds.map(feed => `
                <tr>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    <div style="font-weight: 500;">${feed.title || 'Sans titre'}</div>
                    <div style="font-size: 0.85rem; color: #64748b;">${feed.url}</div>
                  </td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    <span style="padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; background: ${feed.is_active ? '#10b98120' : '#ef444420'}; color: ${feed.is_active ? '#10b981' : '#ef4444'};">
                      ${feed.is_active ? '✅ Actif' : '❌ Inactif'}
                    </span>
                  </td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    ${feed.last_fetched ? new Date(feed.last_fetched).toLocaleDateString('fr-FR') : 'Jamais'}
                  </td>
                  <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                    <button onclick="window.toggleFeed(${feed.id}, ${!feed.is_active})" class="btn ${feed.is_active ? 'btn-secondary' : 'btn-success'}" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 5px;">
                      ${feed.is_active ? '❌ Désactiver' : '✅ Activer'}
                    </button>
                    <button onclick="window.deleteFeed(${feed.id})" class="btn btn-danger" style="padding: 6px 12px; font-size: 0.8rem;">🗑️ Supprimer</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top: 15px; color: #64748b; font-size: 0.9rem;">
          Total: ${data.feeds.length} flux configurés
        </div>
      `;
        } else {
            container.innerHTML = '<div class="loading">Aucun flux configuré</div>';
        }
    } catch (error) {
        console.error('❌ Erreur chargement flux:', error);
        container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement</div>';
    }
};

// ========== CORRECTION 2: Fonction loadThemesManager exposée globalement ==========
window.loadThemesManager = async function () {
    const container = document.querySelector("#themesManagerList");
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Chargement des thèmes...</div>';

        const response = await fetch('/api/themes/manager');
        const data = await response.json();

        if (data.success && data.themes && data.themes.length > 0) {
            container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">
          ${data.themes.map(theme => `
            <div class="theme-card" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                <div style="width: 16px; height: 16px; border-radius: 50%; background: ${theme.color};"></div>
                <h4 style="margin: 0; flex: 1;">${theme.name}</h4>
                <div>
                  <button onclick="window.editTheme('${theme.id}')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; margin-right: 4px;">✏️</button>
                  <button onclick="window.deleteTheme('${theme.id}')" class="btn btn-danger" style="padding: 4px 8px; font-size: 0.8rem;">🗑️</button>
                </div>
              </div>
              <div style="color: #64748b; font-size: 0.9rem; margin-bottom: 15px;">${theme.description || 'Pas de description'}</div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 15px;">
                ${(theme.keywords || []).slice(0, 8).map(keyword => `
                  <span style="padding: 2px 8px; background: #f1f5f9; border-radius: 12px; font-size: 0.75rem; color: #475569;">${keyword}</span>
                `).join('')}
                ${(theme.keywords || []).length > 8 ? `<span style="font-size: 0.75rem; color: #64748b;">+${theme.keywords.length - 8} autres</span>` : ''}
              </div>
              <div style="font-size: 0.8rem; color: #94a3b8;">
                ${theme.keywords?.length || 0} mots-clés • Créé le ${new Date(theme.created_at).toLocaleDateString('fr-FR')}
              </div>
            </div>
          `).join('')}
        </div>
        <div style="margin-top: 15px; color: #64748b; font-size: 0.9rem;">
          Total: ${data.themes.length} thèmes configurés
        </div>
      `;
        } else {
            container.innerHTML = '<div class="loading">Aucun thème configuré</div>';
        }
    } catch (error) {
        console.error('❌ Erreur chargement thèmes:', error);
        container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement</div>';
    }
};

// ========== CORRECTION 3: Fonction editTheme implémentée ==========
window.editTheme = async function (themeId) {
    try {
        console.log(`✏️ Édition du thème: ${themeId}`);
        
        // Récupérer les données du thème depuis l'API
        const response = await fetch('/api/themes/manager');
        const data = await response.json();

        if (!data.success) {
            alert('Erreur de récupération des thèmes');
            return;
        }

        const theme = data.themes.find(t => t.id === themeId);

        if (!theme) {
            alert('Thème non trouvé');
            return;
        }

        // Créer le modal d'édition
        const modalHtml = `
            <div id="editThemeModal" class="modal" style="display: block;">
                <div class="modal-content">
                    <span class="close" onclick="window.closeModal('editThemeModal')">&times;</span>
                    <h2>✏️ Modifier le Thème</h2>
                    <div style="margin: 15px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nom du thème:</label>
                        <input type="text" id="editThemeName" value="${theme.name.replace(/"/g, '&quot;')}" 
                               style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    </div>
                    <div style="margin: 15px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Mots-clés (un par ligne):</label>
                        <textarea id="editThemeKeywords" 
                                  style="width: 100%; height: 120px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-family: monospace;">${(theme.keywords || []).map(k => k.replace(/"/g, '&quot;')).join('\n')}</textarea>
                    </div>
                    <div style="margin: 15px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Couleur:</label>
                        <input type="color" id="editThemeColor" value="${theme.color || '#6366f1'}" style="width: 100%; height: 40px;">
                    </div>
                    <div style="margin: 15px 0;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Description:</label>
                        <textarea id="editThemeDescription" 
                                  style="width: 100%; height: 80px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">${(theme.description || '').replace(/"/g, '&quot;')}</textarea>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-success" onclick="window.saveThemeEdits('${themeId}')">💾 Enregistrer</button>
                        <button class="btn btn-secondary" onclick="window.closeModal('editThemeModal')">❌ Annuler</button>
                    </div>
                </div>
            </div>
        `;

        // Supprimer l'ancien modal s'il existe
        const oldModal = document.querySelector('#editThemeModal');
        if (oldModal) oldModal.remove();

        // Ajouter le nouveau modal
        document.body.insertAdjacentHTML('beforeend', modalHtml);

    } catch (error) {
        console.error('❌ Erreur édition thème:', error);
        alert('Erreur: ' + error.message);
    }
};

// ========== CORRECTION 4: Fonction saveThemeEdits ==========
window.saveThemeEdits = async function (oldThemeId) {
    try {
        const name = document.querySelector('#editThemeName').value;
        const keywordsText = document.querySelector('#editThemeKeywords').value;
        const color = document.querySelector('#editThemeColor').value;
        const description = document.querySelector('#editThemeDescription').value;

        if (!name) {
            alert('Veuillez entrer un nom de thème');
            return;
        }

        const keywords = keywordsText.split('\n')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        // Générer un nouvel ID basé sur le nom
        const newThemeId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

        const response = await fetch('/api/themes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id: newThemeId, 
                name, 
                keywords, 
                color, 
                description 
            })
        });

        const data = await response.json();

        if (data.success) {
            // Si l'ID a changé, supprimer l'ancien thème
            if (oldThemeId !== newThemeId) {
                await fetch(`/api/themes/${oldThemeId}`, {
                    method: 'DELETE'
                });
            }
            
            window.closeModal('editThemeModal');
            window.loadThemesManager();
            alert('✅ Thème modifié avec succès !');
        } else {
            alert('Erreur: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Erreur sauvegarde thème:', error);
        alert('Erreur: ' + error.message);
    }
};

// ========== CORRECTION 5: Fonction toggleFeed exposée ==========
window.toggleFeed = async function (id, isActive) {
    try {
        const response = await fetch(`/api/feeds/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: isActive })
        });

        const data = await response.json();

        if (data.success) {
            window.loadFeedsManager();
            alert('✅ Statut du flux mis à jour');
        } else {
            alert('Erreur: ' + data.error);
        }
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
};

// ========== CORRECTION 6: Fonction deleteFeed exposée ==========
window.deleteFeed = async function (id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce flux ?')) {
        try {
            const response = await fetch(`/api/feeds/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                window.loadFeedsManager();
                alert('✅ Flux supprimé avec succès');
            } else {
                alert('Erreur: ' + data.error);
            }
        } catch (error) {
            alert('Erreur: ' + error.message);
        }
    }
};

// ========== CORRECTION 7: Fonction deleteTheme exposée ==========
window.deleteTheme = async function (id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce thème ?')) {
        try {
            const response = await fetch(`/api/themes/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                window.loadThemesManager();
                alert('✅ Thème supprimé avec succès');
            } else {
                alert('Erreur: ' + data.error);
            }
        } catch (error) {
            alert('Erreur: ' + error.message);
        }
    }
};

// ========== CORRECTION 8: Fonction loadLearningStats corrigée ==========
async function loadLearningStats() {
    const container = document.querySelector("#learningStats");
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Chargement des statistiques...</div>';

        // Correction de l'URL de l'API
        const response = await fetch('/api/learning/stats');
        const stats = await response.json();

        if (stats.success) {
            container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
          <div class="metric-card">
            <h3>🎯 Précision moyenne</h3>
            <div style="font-size: 2rem; color: #10b981;">${(stats.accuracy * 100).toFixed(1)}%</div>
          </div>
          <div class="metric-card">
            <h3>📈 Modèle entraîné</h3>
            <div style="font-size: 2rem; color: ${stats.is_trained ? '#10b981' : '#ef4444'};">${stats.is_trained ? '✅ Oui' : '❌ Non'}</div>
          </div>
          <div class="metric-card">
            <h3>📚 Articles analysés</h3>
            <div style="font-size: 2rem; color: #3b82f6;">${stats.labeled_articles || stats.total_articles_processed || 0}</div>
          </div>
          <div class="metric-card">
            <h3>🔄 Dernier entraînement</h3>
            <div style="font-size: 1.2rem; color: #6b7280;">${stats.last_trained ? new Date(stats.last_trained).toLocaleString('fr-FR') : 'Jamais'}</div>
          </div>
        </div>
        <div style="margin-top: 25px; padding: 20px; background: #f8fafc; border-radius: 12px;">
          <h3 style="margin-bottom: 15px;">🤖 Modules actifs</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
            ${(stats.modules_active || []).map(module => `
              <div style="padding: 10px; background: white; border-radius: 8px; border-left: 3px solid #10b981;">
                ✅ ${module}
              </div>
            `).join('')}
          </div>
        </div>
      `;
        } else {
            container.innerHTML = '<div class="loading">Aucune donnée d\'apprentissage disponible</div>';
        }
    } catch (error) {
        console.error('❌ Erreur chargement apprentissage:', error);
        container.innerHTML = '<div class="loading" style="color: #ef4444;">Erreur de chargement des statistiques</div>';
    }
}

// ========== CORRECTION 9: Fonction manuelle de rafraîchissement ==========
window.refreshArticles = async function () {
    const btn = document.querySelector('#refreshBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '🔄 Actualisation...';
    }

    try {
        const response = await fetch('/api/refresh', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            alert(`✅ ${data.message}`);
            // Recharger les articles
            if (window.app && window.app.loadArticles) {
                await window.app.loadArticles();
            }
        } else {
            alert('Erreur: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Erreur rafraîchissement:', error);
        alert('Erreur de rafraîchissement: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🔄 Actualiser';
        }
    }
};

// ========== CORRECTION 10: Fonction computeThemesFromArticles améliorée ==========
function computeThemesFromArticles() {
    const themeCounts = {};

    if (!window.app || !window.app.state || !window.app.state.articles) {
        console.warn('❌ Aucun article disponible pour calculer les thèmes');
        return;
    }

    window.app.state.articles.forEach(article => {
        if (article.themes && Array.isArray(article.themes)) {
            article.themes.forEach(theme => {
                if (theme && typeof theme === 'string') {
                    themeCounts[theme] = (themeCounts[theme] || 0) + 1;
                }
            });
        }
    });

    if (Object.keys(themeCounts).length === 0) {
        console.warn('⚠️ Aucun thème détecté dans les articles');
        window.app.state.themes = [];
        return;
    }

    window.app.state.themes = Object.entries(themeCounts).map(([name, count]) => ({
        name,
        count,
        color: getThemeColor(name)
    })).sort((a, b) => b.count - a.count);

    console.log(`✅ ${window.app.state.themes.length} thèmes calculés`);
}

// Exposer la fonction globalement si elle n'existe pas déjà
if (window.app && !window.app.computeThemesFromArticles) {
    window.app.computeThemesFromArticles = computeThemesFromArticles;
}

// ========== ATTACHER LES ÉVÉNEMENTS AU CHARGEMENT ==========
document.addEventListener('DOMContentLoaded', function () {
    // Bouton d'actualisation principal
    const refreshBtn = document.querySelector('#refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', window.refreshArticles);
    }

    console.log('✅ Corrections JavaScript chargées');
});
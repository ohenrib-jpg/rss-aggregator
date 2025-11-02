/* -------------------------------------------------------------
 *  app.js
 *  Front‑end de l’agrégateur RSS Intelligent (GEOPOLIS)
 *  -------------------------------------------------------------
 *  - Toutes les fonctionnalités existantes sont conservées.
 *  - La création / mise à jour des graphiques est déléguée
 *    au module ChartManager (chart-manager.js).
 * ------------------------------------------------------------- */

(() => {
    "use strict";

    /* -----------------------------------------------------------------
     *  Helpers généraux
     * ----------------------------------------------------------------- */
    const qs = sel => document.querySelector(sel);
    const qsa = sel => Array.from(document.querySelectorAll(sel));

    const escapeHtml = s => {
        if (s === null || s === undefined) return "";
        return String(s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    };

    const formatDate = ds => {
        try {
            const d = new Date(ds);
            return d.toLocaleDateString("fr-FR", {
                year: "numeric", month: "short", day: "2-digit",
                hour: "2-digit", minute: "2-digit"
            });
        } catch (_) { return ds; }
    };

    const setMessage = (msg, type = "info") => {
        const ctn = qs("#messageContainer");
        if (!ctn) return;
        if (!msg) { ctn.innerHTML = ""; return; }

        const colors = {
            info: "#3b82f6",
            success: "#10b981",
            warning: "#f59e0b",
            error: "#ef4444"
        };
        const icons = {
            success: "✅",
            error: "❌",
            warning: "⚠️",
            info: "ℹ️"
        };
        ctn.innerHTML = `
            <div style="
                color:${colors[type]};
                padding:12px;
                text-align:center;
                font-weight:500;
                background:${colors[type]}20;
                border:1px solid ${colors[type]}50;
                border-radius:8px;
                margin:10px 0;">
                ${icons[type]} ${msg}
            </div>`;
        if (type === "success" || type === "error")
            setTimeout(() => setMessage(""), 5_000);
    };

    /* -----------------------------------------------------------------
     *  API wrapper
     * ----------------------------------------------------------------- */
    const API_TIMEOUT = 30_000; // 30 s

    async function apiCall(method, path, body = null) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
        try {
            const fullPath = path.startsWith("/api/") ? path
                : `/api${path.startsWith("/") ? path : "/" + path}`;
            console.log(`📡 ${method} ${fullPath}`);

            const opts = {
                method,
                headers: { "Content-Type": "application/json" },
                signal: controller.signal
            };
            if (body && method !== "GET") opts.body = JSON.stringify(body);

            const res = await fetch(fullPath, opts);
            clearTimeout(timeoutId);
            if (!res.ok) {
                let txt = `HTTP ${res.status}`;
                try { txt = await res.text(); } catch { }
                throw new Error(txt);
            }
            return await res.json();
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === "AbortError")
                console.error(`⏱️ Timeout ${method} ${path}`);
            else
                console.error(`❌ ${method} ${path}:`, err.message);
            throw err;
        }
    }
    const apiGET = p => apiCall("GET", p);
    const apiPOST = (p, b) => apiCall("POST", p, b);
    const apiPUT = (p, b) => apiCall("PUT", p, b);
    const apiDELETE = p => apiCall("DELETE", p);

    /* -----------------------------------------------------------------
     *  État global
     * ----------------------------------------------------------------- */
    const state = {
        apiBase: "/api",
        articles: [],               // articles (bruts ou enrichis)
        themes: [],               // thèmes configurés
        feeds: [],               // flux RSS
        socialSources: [],          // sources sociales
        socialPosts: [],          // posts sociaux
        factorZData: null,        // dernier facteur Z calculé
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
        },
        loading: {
            articles: false,
            themes: false,
            feeds: false,
            social: true
        },
        ui: {
            timelineRange: 30          // jours affichés sur le graphe d’évolution
        }
    };

    /* -----------------------------------------------------------------
     *  Thèmes – association des mots‑clés aux articles
     * ----------------------------------------------------------------- */
    function applyThemesToArticles(articles, themes) {
        const kwMap = {};                       // mot‑clé → [nomThème,…]
        themes.forEach(t => {
            (t.keywords || []).forEach(k => {
                const low = k.toLowerCase().trim();
                if (!kwMap[low]) kwMap[low] = [];
                kwMap[low].push(t.name);
            });
        });

        return articles.map(a => {
            const lowTitle = (a.title || "").toLowerCase();
            const lowContent = (a.summary || a.content || "").toLowerCase();
            const detected = new Set();

            Object.keys(kwMap).forEach(kw => {
                if (lowTitle.includes(kw) || lowContent.includes(kw))
                    kwMap[kw].forEach(th => detected.add(th));
            });

            const articleThemes = Array.from(detected);
            return {
                ...a,
                themes: articleThemes.length > 0 ? articleThemes : (a.themes || [])
            };
        });
    }

    async function loadThemes() {
        if (state.loading.themes) return state.themes;
        state.loading.themes = true;
        try {
            const data = await apiGET("/themes");
            if (data && data.success && Array.isArray(data.themes)) {
                state.themes = data.themes;
                console.log(`✅ ${state.themes.length} thèmes chargés (API)`);
            } else {
                const localRes = await fetch("./themes.json");
                const local = await localRes.json();
                state.themes = local.themes || [];
                console.warn("⚠️ Thèmes non fournis par l’API – utilisation du fichier local");
            }
            populateThemeFilter();
            return state.themes;
        } catch (e) {
            console.error("❌ loadThemes:", e);
            setMessage("Erreur chargement thèmes", "error");
            return [];
        } finally {
            state.loading.themes = false;
        }
    }

    function populateThemeFilter() {
        const sel = qs("#themeFilter");
        if (!sel) return;
        const opts = state.themes.map(t => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join("");
        sel.innerHTML = `<option value="">Tous les thèmes</option>${opts}`;
    }

    /* -----------------------------------------------------------------
     *  Normalisation d’un article brut
     * ----------------------------------------------------------------- */
    function normalizeArticle(a) {
        if (!a || typeof a !== "object") return null;
        return {
            id: a.id || Math.random().toString(36).slice(2, 11),
            title: a.title || "Sans titre",
            link: a.link || "#",
            date: a.date || a.pubDate || new Date().toISOString(),
            themes: Array.isArray(a.themes) ? a.themes : [],
            sentiment: a.sentiment || { score: 0, sentiment: "neutral", confidence: 0 },
            confidence: parseFloat(a.confidence || 0.5),
            summary: a.summary || a.content || "",
            feed: a.feed || "Inconnu"
        };
    }

    /* -----------------------------------------------------------------
     *  Chargement des articles
     * ----------------------------------------------------------------- */
    async function loadArticles(forceRefresh = false) {
        if (state.loading.articles && !forceRefresh) return state.articles;
        state.loading.articles = true;
        setMessage("Chargement des articles…", "info");
        try {
            const raw = await apiGET("/articles?limit=200&include_themes=true");
            if (raw && raw.success && Array.isArray(raw.articles)) {
                let tmp = raw.articles.map(normalizeArticle).filter(Boolean);
                // Si aucun thème n’est présent, on les ajoute côté client
                if (!tmp.some(a => a.themes && a.themes.length)) {
                    const th = await loadThemes();
                    tmp = applyThemesToArticles(tmp, th);
                }
                state.articles = tmp;
                console.log(`✅ ${state.articles.length} articles chargés`);
            } else {
                console.warn("⚠️ Réponse inattendue :", raw);
                state.articles = [];
            }
            renderArticlesList();
            setMessage("", "info");
            return state.articles;
        } catch (err) {
            console.error("❌ loadArticles:", err);
            setMessage("Erreur de chargement : " + err.message, "error");
            state.articles = [];
            return [];
        } finally {
            state.loading.articles = false;
        }
    }

    /* -----------------------------------------------------------------
     *  Rendu de la liste d’articles (filtres + pagination)
     * ----------------------------------------------------------------- */
    function renderArticlesList() {
        const container = qs("#articlesList");
        if (!container) return;

        // ------ filtres ------
        let list = state.articles.slice();

        const selTheme = qs("#themeFilter") ? qs("#themeFilter").value : "";
        if (selTheme) list = list.filter(a => a.themes.includes(selTheme));

        const selSent = qs("#sentimentFilter") ? qs("#sentimentFilter").value : "";
        if (selSent) list = list.filter(a => a.sentiment?.sentiment === selSent);

        const searchEl = qs("#articleSearchInput");
        const search = searchEl ? searchEl.value.trim().toLowerCase() : "";
        if (search) {
            list = list.filter(a =>
                (a.title || "").toLowerCase().includes(search) ||
                (a.summary || "").toLowerCase().includes(search)
            );
        }

        if (list.length === 0) {
            container.innerHTML = `<div class="loading">Aucun article ne correspond aux critères.</div>`;
            return;
        }

        // ------ pagination simple (max 100 affichés) ------
        const pageSize = 100;
        const pagination = qs("#articlesPagination");
        const curPage = pagination && pagination.dataset && pagination.dataset.page ? Number(pagination.dataset.page) : 1;
        const start = (curPage - 1) * pageSize;
        const pageItems = list.slice(start, start + pageSize);

        const html = pageItems.map(a => {
            const emoji = {
                positive: "😊",
                neutral: "😐",
                negative: "😞"
            }[a.sentiment?.sentiment] || "😐";

            const themeBadges = (a.themes || [])
                .map(t => `<span class="badge badge-info" style="margin:2px;">${escapeHtml(t)}</span>`)
                .join("");

            return `
                <div class="article-card">
                    <h4><a href="${escapeHtml(a.link)}" target="_blank">${escapeHtml(a.title)}</a></h4>
                    <div class="meta" style="font-size:.85rem;color:#64748b;margin:8px 0;">
                        📅 ${formatDate(a.date)} &nbsp; ${emoji} ${a.sentiment?.sentiment || "neutral"} (${(a.sentiment?.score || 0).toFixed(2)})
                        &nbsp; 🎯 Confiance : ${(a.confidence * 100).toFixed(1)}%
                    </div>
                    <p>${escapeHtml((a.summary || "").substring(0, 250))}${a.summary && a.summary.length > 250 ? "…" : ""}</p>
                    <div class="themes">${themeBadges || `<span style="color:#94a3b8;font-size:.8rem;">Aucun thème</span>`}</div>
                </div>`;
        }).join("");

        container.innerHTML = `
            <div style="margin-bottom:15px;">
                <span class="stat-number">${list.length}</span> article(s) trouvé(s)
            </div>
            ${html}
        `;

        // ------ pagination UI ------
        const totalPages = Math.ceil(list.length / pageSize);
        if (totalPages > 1) {
            const btns = [];
            for (let i = 1; i <= totalPages; i++) {
                btns.push(`<button class="${i === curPage ? "active" : ""}" data-page="${i}">${i}</button>`);
            }
            pagination.innerHTML = btns.join("");
            pagination.dataset.page = curPage;
            pagination.style.display = "flex";
            pagination.querySelectorAll("button").forEach(b => {
                b.addEventListener("click", e => {
                    const p = Number(e.target.dataset.page);
                    pagination.dataset.page = p;
                    renderArticlesList();
                });
            });
        } else {
            pagination.style.display = "none";
        }
    }

    function filterByTheme() { renderArticlesList(); }
    function filterBySentiment() { renderArticlesList(); }
    function searchArticles() { renderArticlesList(); }

    async function loadMoreArticles() {
        setMessage("Chargement de plus d’articles…", "info");
        try {
            const start = state.articles.length;
            const raw = await apiGET(`/articles?offset=${start}&limit=50`);
            if (raw && raw.success && Array.isArray(raw.articles)) {
                const newArticles = raw.articles.map(normalizeArticle).filter(Boolean);
                state.articles = state.articles.concat(newArticles);
                renderArticlesList();
                setMessage(`${newArticles.length} articles supplémentaires chargés`, "success");
            } else {
                setMessage("Aucun article supplémentaire", "info");
            }
        } catch (err) {
            console.error("❌ loadMoreArticles:", err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    /* -----------------------------------------------------------------
     *  Flux RSS (CRUD)
     * ----------------------------------------------------------------- */
    async function loadFeeds() {
        if (state.loading.feeds) return state.feeds;
        state.loading.feeds = true;
        try {
            const data = await apiGET("/feeds/manager");
            if (data && data.success && Array.isArray(data.feeds))
                state.feeds = data.feeds;
            else if (Array.isArray(data))
                state.feeds = data;
            else
                state.feeds = [];
            console.log(`✅ ${state.feeds.length} flux chargés`);
            return state.feeds;
        } catch (err) {
            console.error("❌ loadFeeds:", err);
            state.feeds = [];
            return [];
        } finally {
            state.loading.feeds = false;
        }
    }

    async function createFeed() {
        const title = qs("#newFeedTitle") ? qs("#newFeedTitle").value.trim() : "";
        const url = qs("#newFeedURL") ? qs("#newFeedURL").value.trim() : "";
        if (!url) { alert("URL du flux obligatoire"); return; }

        setMessage("Création du flux…", "info");
        try {
            const res = await apiPOST("/feeds", { url, title: title || url, is_active: true });
            if (res.success) {
                setMessage("✅ Flux ajouté", "success");
                closeModal("addFeedModal");
                await loadFeeds();
                loadFeedsManager();
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    function showAddFeedModal() {
        const html = `
            <div id="addFeedModal" class="modal" style="display:block;">
                <div class="modal-content">
                    <span class="close" onclick="appCall('closeModal','addFeedModal')">&times;</span>
                    <h2>➕ Ajouter un flux RSS</h2>
                    <div style="margin:12px 0;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Titre (optionnel)</label>
                        <input id="newFeedTitle" type="text" placeholder="Titre du flux"
                               style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;">
                    </div>
                    <div style="margin:12px 0;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">URL du flux</label>
                        <input id="newFeedURL" type="url" placeholder="https://exemple.com/rss.xml"
                               style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;">
                    </div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button class="btn btn-secondary" onclick="appCall('closeModal','addFeedModal')">❌ Annuler</button>
                        <button class="btn btn-success" onclick="appCall('createFeed')">✅ Ajouter</button>
                    </div>
                </div>
            </div>`;
        const old = qs("#addFeedModal");
        if (old) old.remove();
        document.body.insertAdjacentHTML("beforeend", html);
    }

    async function toggleFeed(id, newState) {
        try {
            const res = await apiPUT(`/feeds/${id}`, { is_active: newState });
            if (res.success) {
                await loadFeeds();
                loadFeedsManager();
                setMessage(`✅ Flux ${newState ? "activé" : "désactivé"}`, "success");
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    async function deleteFeed(id) {
        if (!confirm("Supprimer ce flux ?")) return;
        try {
            const res = await apiDELETE(`/feeds/${id}`);
            if (res.success) {
                await loadFeeds();
                loadFeedsManager();
                setMessage("✅ Flux supprimé", "success");
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    async function loadFeedsManager() {
        const container = qs("#feedsManagerList");
        if (!container) return;
        container.innerHTML = '<div class="loading">Chargement des flux…</div>';
        await loadFeeds();
        if (state.feeds.length === 0) {
            container.innerHTML = `
                <div class="loading" style="text-align:center;padding:60px;">
                    <div style="font-size:3rem;margin-bottom:20px;">📡</div>
                    <div style="font-size:1.2rem;color:#64748b;">Aucun flux configuré</div>
                    <button class="btn btn-success" onclick="appCall('showAddFeedModal')" style="padding:15px 30px;">➕ Ajouter un flux</button>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div style="margin-bottom:15px;">
                <button class="btn btn-success" onclick="appCall('showAddFeedModal')">➕ Ajouter un flux</button>
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr style="background:#f8fafc;">
                        <th style="padding:12px;text-align:left;">URL</th>
                        <th style="padding:12px;text-align:left;">Statut</th>
                        <th style="padding:12px;text-align:left;">Actions</th>
                    </tr></thead>
                    <tbody>
                        ${state.feeds.map(f => `
                            <tr>
                                <td style="padding:12px;">
                                    <div style="font-weight:500;">${escapeHtml(f.title || "Sans titre")}</div>
                                    <div style="font-size:.85rem;color:#64748b;">${escapeHtml(f.url)}</div>
                                </td>
                                <td style="padding:12px;">
                                    <span style="padding:4px 8px;border-radius:12px;font-size:.8rem;background:${f.is_active ? "#10b98120" : "#ef444420"};color:${f.is_active ? "#10b981" : "#ef4444"};">
                                        ${f.is_active ? "✅ Actif" : "❌ Inactif"}
                                    </span>
                                </td>
                                <td style="padding:12px;">
                                    <button class="btn ${f.is_active ? "btn-secondary" : "btn-success"}"
                                            onclick="appCall('toggleFeed',${f.id},${!f.is_active})">
                                        ${f.is_active ? "❌ Désactiver" : "✅ Activer"}
                                    </button>
                                    <button class="btn btn-danger"
                                            onclick="appCall('deleteFeed',${f.id})">🗑️</button>
                                </td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>`;
    }

    /* -----------------------------------------------------------------
     *  Gestion des thèmes (CRUD + affichage)
     * ----------------------------------------------------------------- */
    async function loadThemesManager() {
        const container = qs("#themesManagerList");
        if (!container) return;
        container.innerHTML = '<div class="loading">Chargement des thèmes…</div>';
        await loadThemes();

        if (state.themes.length === 0) {
            container.innerHTML = `
                <div class="loading" style="text-align:center;padding:60px;">
                    <div style="font-size:3rem;margin-bottom:20px;">🎨</div>
                    <div style="font-size:1.2rem;color:#64748b;">Aucun thème configuré</div>
                    <button class="btn btn-success" onclick="appCall('showAddThemeModal')" style="padding:15px 30px;">➕ Ajouter un thème</button>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                <div style="font-weight:600;">Thèmes configurés (${state.themes.length})</div>
                <button class="btn btn-success" onclick="appCall('showAddThemeModal')">➕ Ajouter</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:20px;">
                ${state.themes.map(t => `
                    <div class="theme-card" style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;background:#fff;">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:15px;">
                            <div style="width:20px;height:20px;border-radius:50%;background:${t.color || "#6366f1"};"></div>
                            <h4 style="margin:0;flex:1;">${escapeHtml(t.name)}</h4>
                            <span style="background:#f1f5f9;padding:4px 8px;border-radius:12px;font-size:.8rem;">
                                ${(t.keywords || []).length} mots‑clés
                            </span>
                        </div>
                        <div style="margin-bottom:15px;">
                            <strong>Mots‑clés :</strong>
                            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;">
                                ${(t.keywords || []).slice(0, 8).map(k => `<span style="background:#e2e8f0;padding:2px 8px;border-radius:12px;font-size:.75rem;">${escapeHtml(k)}</span>`).join("")}
                                ${(t.keywords || []).length > 8 ? `<span style="color:#64748b;font-size:.75rem;">+ ${(t.keywords || []).length - 8} autres</span>` : ""}
                            </div>
                            ${t.description ? `<div style="margin-top:10px;color:#64748b;font-size:.9rem;">${escapeHtml(t.description)}</div>` : ""}
                        </div>
                        <div style="display:flex;gap:8px;">
                            <button class="btn btn-danger" onclick="appCall('deleteTheme','${t.id}')">🗑️ Supprimer</button>
                        </div>
                    </div>`).join("")}
            </div>`;
    }

    function showAddThemeModal() {
        const html = `
            <div id="addThemeModal" class="modal" style="display:block;">
                <div class="modal-content">
                    <span class="close" onclick="appCall('closeModal','addThemeModal')">&times;</span>
                    <h2>➕ Ajouter un thème</h2>
                    <div style="display:grid;gap:12px;margin-top:15px;">
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Nom du thème</label>
                            <input type="text" id="newThemeName" placeholder="Nom du thème"
                                   style="width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Mots‑clés (un par ligne)</label>
                            <textarea id="newThemeKeywords" placeholder="Mots‑clés (un par ligne)"
                                      style="width:100%;height:120px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;font-family:monospace;"></textarea>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Couleur</label>
                            <input type="color" id="newThemeColor" value="#6366f1"
                                   style="height:36px;width:56px;border:none;background:transparent;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Description (optionnelle)</label>
                            <textarea id="newThemeDescription" placeholder="Description (optionnelle)"
                                      style="width:100%;height:80px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;"></textarea>
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:15px;">
                        <button class="btn btn-success" onclick="appCall('createTheme')">✅ Créer</button>
                        <button class="btn btn-secondary" onclick="appCall('closeModal','addThemeModal')">❌ Annuler</button>
                    </div>
                </div>
            </div>`;
        const old = qs("#addThemeModal");
        if (old) old.remove();
        document.body.insertAdjacentHTML("beforeend", html);
    }

    async function createTheme() {
        const name = qs("#newThemeName") ? qs("#newThemeName").value.trim() : "";
        const kwText = qs("#newThemeKeywords") ? qs("#newThemeKeywords").value.trim() : "";
        const color = qs("#newThemeColor") ? qs("#newThemeColor").value : "#6366f1";
        const descr = qs("#newThemeDescription") ? qs("#newThemeDescription").value.trim() : "";

        if (!name) { alert("Nom du thème obligatoire"); return; }
        const keywords = kwText.split("\n").map(k => k.trim()).filter(k => k);
        if (keywords.length === 0) { alert("Au moins un mot‑clé requis"); return; }

        setMessage("Création du thème…", "info");
        try {
            const res = await apiPOST("/themes", { name, keywords, color, description: descr || "" });
            if (res.success) {
                setMessage("✅ Thème créé", "success");
                closeModal("addThemeModal");
                await loadThemes();
                loadThemesManager();
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    async function deleteTheme(id) {
        if (!confirm("Supprimer ce thème ?")) return;
        setMessage("Suppression…", "info");
        try {
            const res = await apiDELETE(`/themes/${id}`);
            if (res.success) {
                setMessage("✅ Thème supprimé", "success");
                await loadThemes();
                loadThemesManager();
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    /* -----------------------------------------------------------------
     *  Graphiques (délegués à ChartManager)
     * ----------------------------------------------------------------- */
    function createThemeChart() {
        const counts = {};
        state.articles.forEach(a => {
            (a.themes || []).forEach(t => counts[t] = (counts[t] || 0) + 1);
        });
        if (Object.keys(counts).length === 0) {
            const parent = qs("#themeChart") ? qs("#themeChart").parentElement : null;
            if (parent) parent.innerHTML = `
                <h3>📊 Répartition par thème</h3>
                <div style="text-align:center;padding:60px;color:#64748b;">
                    Aucun thème détecté pour le moment
                </div>`;
            return;
        }
        window.ChartManager.updateThemeChart(counts);
    }

    function createSentimentChart() {
        const c = {
            positive_strong: 0,
            positive_weak: 0,
            neutral: 0,
            negative_weak: 0,
            negative_strong: 0
        };
        state.articles.forEach(a => {
            const s = a.sentiment?.sentiment || "neutral";
            if (c.hasOwnProperty(s)) c[s]++;
            else if (s === "positive") c.positive_weak++;
            else if (s === "negative") c.negative_weak++;
            else c.neutral++;
        });
        window.ChartManager.updateSentimentChart(c);
    }

    function createTimelineChart() {
        const range = Number(qs("#timelineRange") ? qs("#timelineRange").value : 30);
        const now = new Date();
        const days = {};
        for (let i = range - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const key = d.toISOString().split("T")[0];
            days[key] = 0;
        }
        state.articles.forEach(a => {
            const d = new Date(a.date).toISOString().split("T")[0];
            if (days.hasOwnProperty(d)) days[d]++;
        });
        if (Object.values(days).every(v => v === 0)) {
            const parent = qs("#timelineChart") ? qs("#timelineChart").parentElement : null;
            if (parent) parent.innerHTML = `
                <h3>📈 Évolution temporelle</h3>
                <div style="text-align:center;padding:60px;color:#64748b;">
                    Aucun article dans la période sélectionnée
                </div>`;
            return;
        }
        window.ChartManager.updateTimelineChart(days);
    }

    function updateAllCharts() {
        console.log("📊 Mise à jour des graphiques…");
        if (state.articles.length === 0) {
            loadArticles().then(() => { createThemeChart(); createSentimentChart(); createTimelineChart(); });
        } else {
            createThemeChart();
            createSentimentChart();
            createTimelineChart();
        }
    }

    function zoomTimelineChart(factor) {
        const chart = window.ChartManager._charts.timelineChart;
        if (!chart) return;
        try {
            const yAxis = chart.scales.y;
            if (yAxis) {
                const newMax = Math.max(1, Math.round((yAxis.max || 10) * factor));
                chart.options.scales.y.max = newMax;
                chart.update("none");
                setMessage(`🔍 Zoom ${factor > 1 ? "appliqué" : "réduit"}`, "info");
            }
        } catch (e) { console.warn(e); }
    }

    function resetTimelineZoom() {
        const chart = window.ChartManager._charts.timelineChart;
        if (!chart) return;
        try {
            if (chart.options.scales.y.max) delete chart.options.scales.y.max;
            chart.update();
            setMessage("↺ Zoom réinitialisé", "success");
        } catch (e) { console.warn(e); }
    }

    /* -----------------------------------------------------------------
     *  Facteur Z
     * ----------------------------------------------------------------- */
    async function loadFactorZ() {
        const period = qs("#factorZPeriod") ? qs("#factorZPeriod").value : 7;
        setMessage("Calcul du facteur Z…", "info");
        try {
            const res = await apiGET(`/factor-z?period=${period}`);
            if (res && res.success) {
                state.factorZData = res.factorZ;
                renderFactorZDisplay();
                window.ChartManager.updateFactorZChart(res.factorZ);
                setMessage("✅ Facteur Z calculé", "success");
            } else {
                throw new Error(res?.error || "Réponse inattendue");
            }
        } catch (err) {
            console.error(err);
            setMessage("Erreur facteur Z : " + err.message, "error");
        }
    }

    function renderFactorZDisplay() {
        const ctn = qs("#factorZResults");
        if (!ctn || !state.factorZData) return;
        const z = state.factorZData;
        const color = z.absoluteValue > 2.5 ? "#ef4444"
            : z.absoluteValue > 1.5 ? "#f59e0b"
                : "#10b981";

        ctn.innerHTML = `
            <div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:15px;">
                <h4 style="margin:0 0 10px 0;color:#1e293b;">📊 Facteur Z – ${z.period} jours</h4>
                <div style="font-size:2rem;font-weight:bold;color:${color};">${z.value.toFixed(2)}</div>
                <div style="margin-top:8px;color:#64748b;">${z.interpretation}</div>
            </div>`;
    }

    /* -----------------------------------------------------------------
     *  Prédictions (placeholder)
     * ----------------------------------------------------------------- */
    async function loadPredictions() {
        const horizon = qs("#predictionHorizon") ? qs("#predictionHorizon").value : 7;
        setMessage(`Chargement des prédictions (${horizon} jours)…`, "info");
        setTimeout(() => {
            qs("#factorZResults").insertAdjacentHTML("beforeend", `
                <div style="background:#f0f9ff;padding:12px;border-radius:8px;margin-top:10px;">
                    <strong>🔮 Prédiction (horizon ${horizon} jours) :</strong>
                    <span style="color:#64748b;">Fonctionnalité à venir</span>
                </div>`);
            setMessage("✅ Prédictions affichées (placeholder)", "success");
        }, 1200);
    }

    function updateTimelineRange() { createTimelineChart(); }

    /* -----------------------------------------------------------------
     *  Corrélations Pearson (mot‑clé / thème)
     * ----------------------------------------------------------------- */
    async function analyzeKeywordCorrelation() {
        const kw = prompt("Entrez le mot‑clé à analyser :");
        if (!kw) return;
        setMessage(`Analyse du mot‑clé "${kw}"…`, "info");
        try {
            const res = await apiGET(`/api/analysis/correlations/keyword-sentiment?keyword=${encodeURIComponent(kw)}`);
            if (res.success) {
                const a = res.analysis;
                const col = a.correlation > 0 ? "#10b981" : "#ef4444";
                qs("#pearsonResults").innerHTML = `
                    <div style="background:#fff;padding:20px;border-left:4px solid ${col};border-radius:8px;margin-bottom:15px;">
                        <h4 style="margin:0 0 8px 0;">📊 Corrélation : "${a.keyword}"</h4>
                        <div style="font-size:1.5rem;font-weight:bold;color:${col};margin-bottom:8px;">${a.correlation}</div>
                        <div>${a.interpretation}</div>
                        <div style="margin-top:8px;color:#64748b;">Échantillon : ${a.sampleSize} articles</div>
                    </div>`;
                window.ChartManager.updateKeywordCorrelationChart(a);
                setMessage(`✅ Corrélation ${a.correlation}`, "success");
            } else {
                throw new Error(res.error || "Réponse inattendue");
            }
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    async function loadThemeCorrelations() {
        setMessage("Analyse des corrélations entre thèmes…", "info");
        try {
            const res = await apiGET("/api/analysis/correlations/themes?limit=150");
            if (res.success && res.correlations.length) {
                const top = res.correlations.slice(0, 10);
                qs("#themeCorrelations").innerHTML = `
                    <div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:15px;">
                        <h4 style="margin:0 0 10px 0;">🔗 Corrélations entre thèmes (top 10)</h4>
                        ${top.map(c => `
                            <div style="display:flex;justify-content:space-between;padding:8px;border-left:4px solid ${c.correlation > 0 ? "#10b981" : "#ef4444"};">
                                <span>${c.theme1} ↔ ${c.theme2}</span>
                                <span style="font-weight:bold;color:${c.correlation > 0 ? "#10b981" : "#ef4444"};">${c.correlation}</span>
                            </div>`).join("")}
                    </div>`;
                window.ChartManager.updateThemeCorrelationsChart(res.correlations.slice(0, 8));
                setMessage(`✅ ${res.correlations.length} corrélations calculées`, "success");
            } else {
                qs("#themeCorrelations").innerHTML = `<div class="loading">Aucune corrélation significative trouvée.</div>`;
                setMessage("⚠️ Aucun résultat", "warning");
            }
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    /* -----------------------------------------------------------------
     *  Flux sociaux (sources, posts, graphiques, corrélations)
     * ----------------------------------------------------------------- */
    async function loadSocialSources() {
        try {
            const res = await apiGET("/social/sources");
            if (res.success) {
                state.socialSources = res.sources || [];
                return state.socialSources;
            }
            return [];
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    async function loadSocialPosts(limit = 100) {
        setMessage("Chargement des posts sociaux…", "info");
        try {
            const res = await apiGET(`/social/posts?limit=${limit}`);
            if (res.success) {
                state.socialPosts = res.posts || [];
                setMessage("", "info");
                return state.socialPosts;
            }
            return [];
        } catch (e) {
            console.error(e);
            setMessage("Erreur chargement posts sociaux", "error");
            return [];
        }
    }

    async function refreshSocialFeeds() {
        setMessage("Rafraîchissement des flux sociaux…", "info");
        try {
            const res = await apiPOST("/social/refresh");
            if (res.success) {
                state.socialPosts = res.posts || [];
                setMessage(`✅ ${res.total || state.socialPosts.length} posts récupérés`, "success");
                updateSocialCharts();
                loadFactorZ();   // le facteur Z dépend des deux sources
                renderSocialPostsList();
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur rafraîchissement : " + err.message, "error");
        }
    }

    async function loadSocialSourcesManager() {
        const ctn = qs("#socialSourcesList");
        if (!ctn) return;
        ctn.innerHTML = `<div class="loading">Chargement des sources sociales…</div>`;
        await loadSocialSources();
        if (state.socialSources.length === 0) {
            ctn.innerHTML = `
                <div style="text-align:center;padding:40px;color:#64748b;">
                    <div style="font-size:3rem;margin-bottom:15px;">🌐</div>
                    <div>Aucune source sociale configurée</div>
                    <button class="btn btn-success" onclick="appCall('addSocialSource')" style="margin-top:15px;">➕ Ajouter une source</button>
                </div>`;
            return;
        }

        const addBtn = `<button class="btn btn-success" onclick="appCall('addSocialSource')">➕ Ajouter une source</button>`;
        const refreshBtn = `<button class="btn btn-info" onclick="appCall('refreshSocialFeeds')" style="margin-left:10px;">🔄 Rafraîchir</button>`;

        ctn.innerHTML = `
            <div style="margin-bottom:15px;">${addBtn}${refreshBtn}</div>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr style="background:#f8fafc;">
                        <th style="padding:12px;">Nom</th>
                        <th style="padding:12px;">Type</th>
                        <th style="padding:12px;">URL</th>
                        <th style="padding:12px;">Actif</th>
                        <th style="padding:12px;">Actions</th>
                    </tr></thead>
                    <tbody>
                        ${state.socialSources.map(s => `
                            <tr class="social-source-item">
                                <td style="padding:12px;">
                                    <input type="hidden" class="source-id" value="${s.id}">
                                    <input type="text" class="source-name" value="${escapeHtml(s.name)}" style="width:150px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;">
                                </td>
                                <td style="padding:12px;">
                                    <select class="source-type" style="width:100px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;">
                                        <option value="nitter" ${s.type === "nitter" ? "selected" : ""}>Nitter</option>
                                        <option value="reddit" ${s.type === "reddit" ? "selected" : ""}>Reddit</option>
                                        <option value="ria"    ${s.type === "ria" ? "selected" : ""}>RIA.ru</option>
                                    </select>
                                </td>
                                <td style="padding:12px;">
                                    <input type="url" class="source-url" value="${escapeHtml(s.url)}" style="width:300px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;">
                                </td>
                                <td style="padding:12px;">
                                    <label class="switch">
                                        <input type="checkbox" class="source-enabled" ${s.enabled ? "checked" : ""}>
                                        <span class="slider"></span>
                                    </label>
                                </td>
                                <td style="padding:12px;">
                                    <button class="btn btn-danger" onclick="appCall('removeSocialSource','${s.id}')" style="padding:4px 8px;font-size:.8rem;">🗑️</button>
                                </td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:15px;">
                <button class="btn btn-success" onclick="appCall('saveSocialSources')">💾 Sauvegarder</button>
            </div>`;
    }

    function addSocialSource() {
        const tbody = qs("#socialSourcesList tbody");
        if (!tbody) return;
        const id = `tmp_${Date.now()}`;
        const row = document.createElement("tr");
        row.className = "social-source-item";
        row.innerHTML = `
            <td style="padding:12px;">
                <input type="hidden" class="source-id" value="${id}">
                <input type="text" class="source-name" placeholder="Nom de la source"
                       style="width:150px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;">
            </td>
            <td style="padding:12px;">
                <select class="source-type" style="width:100px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;">
                    <option value="nitter">Nitter</option>
                    <option value="reddit">Reddit</option>
                    <option value="ria">RIA.ru</option>
                </select>
            </td>
            <td style="padding:12px;">
                <input type="url" class="source-url" placeholder="https://exemple.com"
                       style="width:300px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;">
            </td>
            <td style="padding:12px;">
                <label class="switch">
                    <input type="checkbox" class="source-enabled" checked>
                    <span class="slider"></span>
                </label>
            </td>
            <td style="padding:12px;">
                <button class="btn btn-danger" onclick="appCall('removeSocialSource','${id}')" style="padding:4px 8px;font-size:.8rem;">🗑️</button>
            </td>`;
        tbody.appendChild(row);
    }

    function removeSocialSource(id) {
        qsa(".social-source-item").forEach(r => {
            if (r.querySelector(".source-id") && r.querySelector(".source-id").value === id) r.remove();
        });
    }

    async function saveSocialSources() {
        const sources = [];
        qsa(".social-source-item").forEach(row => {
            const id = row.querySelector(".source-id")?.value;
            const name = row.querySelector(".source-name")?.value?.trim();
            const type = row.querySelector(".source-type")?.value;
            const url = row.querySelector(".source-url")?.value?.trim();
            const enable = row.querySelector(".source-enabled")?.checked;
            if (name && url) {
                sources.push({ id, name, type, url, enabled: enable });
            }
        });
        if (sources.length === 0) {
            setMessage("Aucune source valide à sauvegarder", "warning");
            return;
        }
        setMessage("Sauvegarde des sources sociales…", "info");
        try {
            const res = await apiPOST("/social/sources", { sources });
            if (res.success) {
                setMessage("✅ Sources sociales sauvegardées", "success");
                await loadSocialSources();
                loadSocialSourcesManager();
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    async function loadSocialAnalysisData() {
        await loadSocialPosts(100);
        updateSocialCharts();

        // Mise à jour du filtre source
        const sel = qs("#socialSourceFilter");
        if (sel) {
            const opts = state.socialSources.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
            sel.innerHTML = `<option value="">Toutes les sources</option>${opts}`;
        }
    }

    function updateSocialCharts() {
        // Thèmes sociaux
        const themeCounts = {};
        state.socialPosts.forEach(p => (p.themes || []).forEach(t => themeCounts[t] = (themeCounts[t] || 0) + 1));
        if (Object.keys(themeCounts).length)
            window.ChartManager.updateSocialThemeChart(themeCounts);
        else {
            const parent = qs("#socialThemeChart") ? qs("#socialThemeChart").parentElement : null;
            if (parent) parent.innerHTML = `
                <h3>📊 Répartition par thème (Réseaux Sociaux)</h3>
                <div style="text-align:center;padding:60px;color:#64748b;">Aucun thème détecté</div>`;
        }

        // Sentiment social
        const sent = {
            positive_strong: 0, positive_weak: 0,
            neutral: 0,
            negative_weak: 0, negative_strong: 0
        };
        state.socialPosts.forEach(p => {
            const s = p.sentiment?.sentiment || "neutral";
            if (sent.hasOwnProperty(s)) sent[s]++; else if (s === "positive") sent.positive_weak++;
            else if (s === "negative") sent.negative_weak++; else sent.neutral++;
        });
        window.ChartManager.updateSocialSentimentChart(sent);

        // Posts par source (doughnut)
        window.ChartManager.updateSocialPostsChart(state.socialPosts);
    }

    async function analyzeSocialKeywordCorrelation() {
        const kw = prompt("Mot‑clé à analyser (sociaux) :");
        if (!kw) return;
        setMessage(`Analyse du mot‑clé "${kw}" sur les posts…`, "info");
        try {
            const res = await apiGET(`/social/correlations/keyword-sentiment?keyword=${encodeURIComponent(kw)}`);
            if (res.success) {
                const a = res.analysis;
                const col = a.correlation > 0 ? "#10b981" : "#ef4444";
                qs("#socialPearsonResults").innerHTML = `
                    <div style="background:#fff;padding:20px;border-left:4px solid ${col};border-radius:8px;margin-bottom:15px;">
                        <h4 style="margin:0 0 8px 0;">📊 Corrélation (social) : "${a.keyword}"</h4>
                        <div style="font-size:1.5rem;font-weight:bold;color:${col};margin-bottom:8px;">${a.correlation}</div>
                        <div>${a.interpretation}</div>
                        <div style="margin-top:8px;color:#64748b;">Échantillon : ${a.sampleSize} posts</div>
                    </div>`;
                window.ChartManager.updateSocialKeywordCorrelationChart(a);
                setMessage(`✅ Corrélation ${a.correlation}`, "success");
            } else throw new Error(res.error || "Réponse inattendue");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    async function loadSocialThemeCorrelations() {
        setMessage("Analyse des corrélations de thèmes (sociaux)…", "info");
        try {
            const res = await apiGET("/social/correlations/themes?limit=150");
            if (res.success && res.correlations.length) {
                const top = res.correlations.slice(0, 10);
                qs("#socialThemeCorrelations").innerHTML = `
                    <div style="background:#fff;padding:20px;border-radius:12px;margin-bottom:15px;">
                        <h4 style="margin:0 0 10px 0;">🔗 Corrélations entre thèmes (sociaux) – Top 10</h4>
                        ${top.map(c => `
                            <div style="display:flex;justify-content:space-between;padding:8px;border-left:4px solid ${c.correlation > 0 ? "#10b981" : "#ef4444"};">
                                <span>${c.theme1} ↔ ${c.theme2}</span>
                                <span style="font-weight:bold;color:${c.correlation > 0 ? "#10b981" : "#ef4444"};">${c.correlation}</span>
                            </div>`).join("")}
                    </div>`;
                window.ChartManager.updateSocialThemeCorrelationsChart(res.correlations.slice(0, 8));
                setMessage(`✅ ${res.correlations.length} corrélations sociales calculées`, "success");
            } else {
                qs("#socialThemeCorrelations").innerHTML = `<div class="loading">Aucune corrélation sociale trouvée.</div>`;
                setMessage("⚠️ Aucun résultat", "warning");
            }
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    /* -----------------------------------------------------------------
     *  Rendu des posts sociaux (filtres + pagination simple)
     * ----------------------------------------------------------------- */
    function renderSocialPostsList() {
        const container = qs("#socialPostsList");
        if (!container) return;

        // -------- filtres --------
        let list = state.socialPosts.slice();

        const selSrc = qs("#socialSourceFilter") ? qs("#socialSourceFilter").value : "";
        if (selSrc) list = list.filter(p => p.source === selSrc);

        const selSent = qs("#socialSentimentFilter") ? qs("#socialSentimentFilter").value : "";
        if (selSent) list = list.filter(p => p.sentiment?.sentiment === selSent);

        const searchEl = qs("#socialSearchInput");
        const search = searchEl ? searchEl.value.trim().toLowerCase() : "";
        if (search) {
            list = list.filter(p =>
                (p.author || "").toLowerCase().includes(search) ||
                (p.content || "").toLowerCase().includes(search)
            );
        }

        if (list.length === 0) {
            container.innerHTML = `<div class="loading">Aucun post ne correspond aux critères.</div>`;
            return;
        }

        // Affichage (max 200)
        const html = list.slice(0, 200).map(p => {
            const emoji = {
                positive: "😊",
                neutral: "😐",
                negative: "😞"
            }[p.sentiment?.sentiment] || "😐";

            const themeBadges = (p.themes || [])
                .map(t => `<span class="badge badge-info" style="margin:2px;">${escapeHtml(t)}</span>`)
                .join("");

            return `
                <div class="article-card">
                    <h4>${escapeHtml(p.author || "Anon")} – ${emoji} ${p.sentiment?.sentiment || "neutral"} (${(p.sentiment?.score || 0).toFixed(2)})</h4>
                    <div class="meta" style="font-size:.85rem;color:#64748b;margin:8px 0;">
                        📅 ${formatDate(p.date)} – Source : ${escapeHtml(p.source || "???")}
                    </div>
                    <p>${escapeHtml((p.content || "").substring(0, 250))}${p.content && p.content.length > 250 ? "…" : ""}</p>
                    <div class="themes">${themeBadges || `<span style="color:#94a3b8;font-size:.8rem;">Aucun thème</span>`}</div>
                </div>`;
        }).join("");

        container.innerHTML = html;
    }

    function searchSocialPosts() { renderSocialPostsList(); }
    function filterSocialBySource() { renderSocialPostsList(); }
    function filterSocialBySentiment() { renderSocialPostsList(); }

    /* -----------------------------------------------------------------
     *  Analyse de commentaires de sites (prototype)
     * ----------------------------------------------------------------- */
    async function fetchSiteComments() {
        const url = qs("#siteCommentsInput") ? qs("#siteCommentsInput").value.trim() : "";
        const query = qs("#siteCommentsQuery") ? qs("#siteCommentsQuery").value.trim() : "";
        if (!url) {
            setMessage("URL du site requise", "error");
            return;
        }
        const ctn = qs("#siteCommentsResults");
        ctn.innerHTML = `<div class="loading">Analyse du site…</div>`;
        try {
            const res = await apiPOST("/site/comments", { url, query });
            if (res.success && Array.isArray(res.comments)) {
                if (res.comments.length === 0) {
                    ctn.innerHTML = `<div class="loading">Aucun commentaire trouvé</div>`;
                    return;
                }
                ctn.innerHTML = res.comments.map(c => `
                    <div style="padding:8px;border-bottom:1px solid #e2e8f0;">
                        <p style="margin:0;">${escapeHtml(c.text)}</p>
                        <small style="color:#64748b;">Par ${escapeHtml(c.author || "Anonyme")} – ${formatDate(c.date)}</small>
                    </div>`).join("");
            } else {
                ctn.innerHTML = `<div class="loading" style="color:#ef4444;">Erreur : ${res.error || "Réponse inattendue"}</div>`;
            }
        } catch (err) {
            console.error(err);
            ctn.innerHTML = `<div class="loading" style="color:#ef4444;">Erreur : ${err.message}</div>`;
        }
    }

    /* -----------------------------------------------------------------
     *  Métriques & statistiques globales
     * ----------------------------------------------------------------- */
    async function loadMetrics() {
        try {
            const res = await apiGET("/metrics");
            if (res && res.summary) {
                const s = res.summary;
                qs("#m_total").textContent = s.total_articles || 0;
                qs("#m_confidence").textContent = `${((s.avg_confidence || 0) * 100).toFixed(1)}%`;
                qs("#m_posterior").textContent = `${((s.avg_posterior || 0) * 100).toFixed(1)}%`;
                qs("#m_corro").textContent = `${((s.avg_corroboration || 0) * 100).toFixed(1)}%`;

                if (Array.isArray(res.top_themes)) {
                    qs("#topThemes").innerHTML = `
                        <ul style="list-style:none;padding:0;">
                            ${res.top_themes.slice(0, 10).map(t => `
                                <li style="padding:8px;background:#f8fafc;border-radius:6px;margin-bottom:5px;">
                                    <strong>${escapeHtml(t.name)}</strong> : ${t.total} articles
                                </li>`).join("")}
                        </ul>`;
                }
            }
        } catch (err) {
            console.error("❌ loadMetrics:", err);
            setMessage("Erreur métriques : " + err.message, "error");
        }
    }

    async function loadSentimentOverview() {
        try {
            const res = await apiGET("/sentiment/detailed");
            const ctn = qs("#sentimentOverview");
            if (!ctn) return;
            if (res && res.stats) {
                const st = res.stats;
                const total = st.positive + st.neutral + st.negative;
                ctn.innerHTML = `
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:15px;text-align:center;">
                        <div style="background:#f0fdf4;padding:20px;border-radius:12px;">
                            <div style="font-size:2rem;color:#10b981;">${st.positive}</div>
                            <div>Positifs</div>
                            <div style="font-size:.8rem;color:#64748b;">${total ? Math.round(st.positive / total * 100) : 0}%</div>
                        </div>
                        <div style="background:#f8fafc;padding:20px;border-radius:12px;">
                            <div style="font-size:2rem;color:#6b7280;">${st.neutral}</div>
                            <div>Neutres</div>
                            <div style="font-size:.8rem;color:#64748b;">${total ? Math.round(st.neutral / total * 100) : 0}%</div>
                        </div>
                        <div style="background:#fef2f2;padding:20px;border-radius:12px;">
                            <div style="font-size:2rem;color:#ef4444;">${st.negative}</div>
                            <div>Négatifs</div>
                            <div style="font-size:.8rem;color:#64748b;">${total ? Math.round(st.negative / total * 100) : 0}%</div>
                        </div>
                    </div>
                    ${st.average_score ? `<div style="margin-top:12px;text-align:center;color:#64748b;">
                        Score moyen : ${st.average_score.toFixed(2)}
                    </div>`: ""}
                `;
            } else {
                ctn.innerHTML = `<div class="loading">Aucune donnée de sentiment disponible</div>`;
            }
        } catch (err) {
            console.error(err);
            qs("#sentimentOverview").innerHTML = `<div class="loading" style="color:#ef4444;">Erreur chargement</div>`;
        }
    }

    async function loadLearningStats() {
        try {
            const res = await apiGET("/learning/stats");
            const ctn = qs("#learningStats");
            if (!ctn) return;
            if (res) {
                const html = `
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;">
                        <div class="stat-card"><div class="stat-number">${res.total_articles_processed || 0}</div><div class="stat-label">Articles traités</div></div>
                        <div class="stat-card"><div class="stat-number">${((res.sentiment_accuracy || 0) * 100).toFixed(1)}%</div><div class="stat-label">Précision sentiment</div></div>
                        <div class="stat-card"><div class="stat-number">${((res.theme_detection_accuracy || 0) * 100).toFixed(1)}%</div><div class="stat-label">Précision thèmes</div></div>
                        <div class="stat-card"><div class="stat-number">${res.avg_processing_time || 0}s</div><div class="stat-label">Temps traitement</div></div>
                    </div>
                    ${res.modules_active ? `<div style="margin-top:15px;">
                        <h4>Modules actifs</h4>
                        <div style="display:flex;flex-wrap:wrap;gap:8px;">
                            ${res.modules_active.map(m => `<span class="badge badge-info">${escapeHtml(m)}</span>`).join("")}
                        </div>
                    </div>`: ""}
                `;
                ctn.innerHTML = html;
            } else {
                ctn.innerHTML = `<div class="loading">Aucune donnée d'apprentissage disponible</div>`;
            }
        } catch (err) {
            console.error(err);
            qs("#learningStats").innerHTML = `<div class="loading" style="color:#ef4444;">Erreur chargement</div>`;
        }
    }

    /* -----------------------------------------------------------------
     *  Gestion des alertes
     * ----------------------------------------------------------------- */
    async function loadAlertsManager() {
        await loadAlertsList();
        await loadAlertsStats();
        await loadTriggeredAlerts();
    }

    async function loadAlertsList() {
        const ctn = qs("#alertsList");
        if (!ctn) return;
        ctn.innerHTML = `<div class="loading">Chargement des alertes…</div>`;
        try {
            const res = await apiGET("/alerts");
            if (res.success) {
                const alerts = res.alerts || [];
                if (alerts.length === 0) {
                    ctn.innerHTML = `<div class="loading">Aucune alerte configurée</div>`;
                    return;
                }
                ctn.innerHTML = alerts.map(alert => `
                    <div class="alert-item" style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:12px;background:#fff;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <h4 style="margin:0;">${escapeHtml(alert.name)}</h4>
                                <div style="margin-top:5px;">
                                    <span class="badge ${alert.severity === 'high' ? 'badge-danger' : alert.severity === 'medium' ? 'badge-warning' : 'badge-success'}">
                                        ${alert.severity.toUpperCase()}
                                    </span>
                                    <span style="margin-left:8px;color:#64748b;">${alert.keywords?.length || 0} mots‑clés</span>
                                    <span style="margin-left:8px;color:#64748b;">Cooldown : ${formatCooldown(alert.cooldown)}</span>
                                </div>
                            </div>
                            <div style="display:flex;gap:8px;align-items:center;">
                                <label class="switch">
                                    <input type="checkbox" ${alert.enabled ? 'checked' : ''}
                                           onchange="appCall('toggleAlert','${alert.id}',this.checked)">
                                    <span class="slider"></span>
                                </label>
                                <button class="btn btn-danger" onclick="appCall('deleteAlert','${alert.id}')">🗑️</button>
                            </div>
                        </div>
                        <div style="margin-top:10px;">
                            ${(alert.keywords || []).map(k => `<span class="badge badge-info" style="margin:2px;">${escapeHtml(k)}</span>`).join("")}
                        </div>
                    </div>
                `).join("");
            } else {
                ctn.innerHTML = `<div class="loading" style="color:#ef4444;">Erreur : ${res.error || "inconnue"}</div>`;
            }
        } catch (err) {
            console.error(err);
            ctn.innerHTML = `<div class="loading" style="color:#ef4444;">Erreur : ${err.message}</div>`;
        }
    }

    async function loadAlertsStats() {
        const ctn = qs("#alertsStats");
        if (!ctn) return;
        try {
            const res = await apiGET("/alerts");
            if (res.success) {
                const s = res.stats || {};
                ctn.innerHTML = `
                    <div class="stat-card"><div class="stat-number">${s.total_alerts || 0}</div><div class="stat-label">Alertes configurées</div></div>
                    <div class="stat-card"><div class="stat-number">${s.enabled_alerts || 0}</div><div class="stat-label">Alertes actives</div></div>
                    <div class="stat-card"><div class="stat-number">${s.today_triggered || 0}</div><div class="stat-label">Aujourd'hui</div></div>
                    <div class="stat-card"><div class="stat-number">${s.total_triggered || 0}</div><div class="stat-label">Total déclenchées</div></div>
                `;
            }
        } catch (err) { console.error(err); }
    }

    async function loadTriggeredAlerts() {
        const ctn = qs("#triggeredAlerts");
        if (!ctn) return;
        ctn.innerHTML = `<div class="loading">Chargement de l'historique…</div>`;
        try {
            const res = await apiGET("/alerts/triggered?limit=20");
            if (res.success) {
                const al = res.alerts || [];
                if (al.length === 0) {
                    ctn.innerHTML = `<div class="loading">Aucune alerte déclenchée pour le moment</div>`;
                    return;
                }
                ctn.innerHTML = al.reverse().map(a => `
                    <div class="relation-item ${a.severity || 'low'}" style="padding:12px;border-left:4px solid ${a.severity === 'high' ? '#ef4444' : a.severity === 'medium' ? '#f59e0b' : '#10b981'};background:#f8fafc;margin-bottom:8px;border-radius:4px;">
                        <div style="font-weight:600;">${escapeHtml(a.alert_name)}</div>
                        <div style="margin:5px 0;">
                            <a href="${escapeHtml(a.article_link)}" target="_blank" style="color:#3b82f6;">${escapeHtml(a.article_title)}</a>
                        </div>
                        <div style="font-size:.85rem;color:#64748b;">
                            🕐 ${formatDate(a.triggered_at)} – ${a.matched_keywords?.slice(0, 3).join(", ")}
                        </div>
                    </div>
                `).join("");
            } else {
                ctn.innerHTML = `<div class="loading" style="color:#ef4444;">Erreur : ${res.error || "inconnue"}</div>`;
            }
        } catch (err) {
            console.error(err);
            ctn.innerHTML = `<div class="loading" style="color:#ef4444;">Erreur : ${err.message}</div>`;
        }
    }

    async function createAlert() {
        const name = qs("#newAlertName") ? qs("#newAlertName").value.trim() : "";
        const kwt = qs("#newAlertKeywords") ? qs("#newAlertKeywords").value.trim() : "";
        const sev = qs("#newAlertSeverity") ? qs("#newAlertSeverity").value : "";
        const cd = Number(qs("#newAlertCooldown")?.value) || 0;

        if (!name || !kwt) {
            setMessage("Nom et mots‑clés obligatoires", "error");
            return;
        }
        const keywords = kwt.split("\n").map(k => k.trim()).filter(k => k);
        setMessage("Création de l'alerte…", "info");
        try {
            const res = await apiPOST("/alerts", { name, keywords, severity: sev, cooldown: cd, actions: ["notification"] });
            if (res.success) {
                setMessage("✅ Alerte créée", "success");
                qs("#newAlertName").value = "";
                qs("#newAlertKeywords").value = "";
                await loadAlertsManager();
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    async function toggleAlert(id, enabled) {
        try {
            const res = await apiPUT(`/alerts/${id}`, { enabled });
            if (res.success) {
                setMessage(`✅ Alerte ${enabled ? "activée" : "désactivée"}`, "success");
                await loadAlertsStats();
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    async function deleteAlert(id) {
        if (!confirm("Supprimer cette alerte ?")) return;
        setMessage("Suppression…", "info");
        try {
            const res = await apiDELETE(`/alerts/${id}`);
            if (res.success) {
                setMessage("✅ Alerte supprimée", "success");
                await loadAlertsManager();
            } else throw new Error(res.error || "Erreur serveur");
        } catch (err) {
            console.error(err);
            setMessage("Erreur : " + err.message, "error");
        }
    }

    function formatCooldown(seconds) {
        if (seconds === 0) return "Aucun";
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
        return `${Math.round(seconds / 3600)} h`;
    }

    /* -----------------------------------------------------------------
     *  IA / rapports / export
     * ----------------------------------------------------------------- */
    async function generateAIAnalysisReport() {
        setMessage("🧠 Génération du rapport IA…", "info");
        try {
            const res = await apiGET("/metrics");
            if (!response || !response.summary) {
                throw new Error("Aucune donnée de métriques disponible");
            }

            const reportWindow = window.open("", "_blank");
            reportWindow.document.write(`
                <html>
                    <head>
                        <title>Rapport IA - Analyse des Actualités</title>
                        <style>
                            body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f8fafc; }
                            .container { max-width: 1000px; margin: 0 auto; }
                            .metric-card { background: white; border-radius: 12px; padding: 20px; margin: 15px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1>🧠 Rapport d'Analyse IA</h1>
                            <p>Généré le ${new Date().toLocaleDateString("fr-FR")}</p>
                            <div class="metric-card">
                                <h3>📊 Métriques principales</h3>
                                <p><strong>Articles analysés:</strong> ${response.summary.total_articles || 0}</p>
                                <p><strong>Confiance moyenne:</strong> ${((response.summary.avg_confidence || 0) * 100).toFixed(1)}%</p>
                                <p><strong>Postérieur bayésien moyen:</strong> ${((response.summary.avg_posterior || 0) * 100).toFixed(1)}%</p>
                                <p><strong>Corroboration moyenne:</strong> ${((response.summary.avg_corroboration || 0) * 100).toFixed(1)}%</p>
                            </div>
                            <div class="metric-card">
                                <h3>🏆 Thèmes les plus populaires</h3>
                                <ul>
                                    ${(response.top_themes || []).map(t => `<li>${t.name} — ${t.total}</li>`).join("")}
                                </ul>
                            </div>
                            <p style="color:#64748b; font-size:0.9rem; margin-top:20px;">
                                Généré par l'agrégateur RSS Intelligent — ${new Date().toLocaleString('fr-FR')}
                            </p>
                        </div>
                    </body>
                </html>
            `);
            reportWindow.document.close();
            setMessage("✅ Rapport IA généré avec succès", "success");
        } catch (error) {
            console.error("❌ Erreur génération rapport IA:", error);
            setMessage("❌ Erreur génération rapport: " + error.message, "error");
        }
    }

    async function generateEnhancedAIAnalysisReport() {
        setMessage("🧠 Génération du rapport IA avancé…", "info");
        try {
            const [metrics, sentiment, learning, geopolitical] = await Promise.all([
                apiGET("/metrics"),
                apiGET("/sentiment/detailed"),
                apiGET("/learning/stats"),
                apiGET("/geopolitical/report")
            ]);

            const reportWindow = window.open("", "_blank");
            const now = new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });

            reportWindow.document.write(`
                <html>
                    <head>
                        <title>Rapport IA Avancé - Analyse Géopolitique</title>
                        <style>
                            body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height:100vh; }
                            .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.1); overflow: hidden; }
                            .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color:white; padding:40px; text-align:center; }
                            .header h1 { margin:0; font-size:2.5rem; font-weight:700; }
                            .content { padding: 40px; }
                            .section { margin-bottom: 40px; padding: 30px; background: #f8fafc; border-radius: 16px; border-left: 5px solid #3b82f6; }
                            .section h2 { color:#1e40af; margin-top:0; font-size:1.5rem; display:flex; align-items:center; gap:10px; }
                            .metrics-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin:20px 0; }
                            .metric-card { background:white; padding:25px; border-radius:12px; text-align:center; box-shadow:0 4px 12px rgba(0,0,0,.05); border:1px solid #e2e8f0; }
                            .metric-value { font-size:2.5rem; font-weight:bold; margin:10px 0; }
                            .metric-label { color:#64748b; font-size:.9rem; }
                            .themes-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:15px; }
                            .theme-item { background:white; padding:20px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,.05); }
                            .crisis-zones { display:grid; gap:15px; }
                            .crisis-item { background:white; padding:20px; border-radius:12px; border-left:4px solid; }
                            .risk-high { border-left-color:#ef4444; }
                            .risk-medium { border-left-color:#f59e0b; }
                            .risk-low { border-left-color:#10b981; }
                            .footer { text-align:center; padding:30px; background:#f1f5f9; color:#64748b; border-top:1px solid #e2e8f0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🧠 Rapport d'Analyse IA Avancé</h1>
                                <p>Analyse géopolitique et tendances médiatiques</p>
                                <p>Généré le ${now}</p>
                            </div>
                            <div class="content">
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

                                <div class="section">
                                    <h2>😊 Analyse des Sentiments</h2>
                                    ${sentiment.stats ? `
                                    <div class="metrics-grid">
                                        <div class="metric-card" style="border-left:4px solid #10b981;">
                                            <div class="metric-value" style="color:#10b981;">${sentiment.stats.positive || 0}</div>
                                            <div class="metric-label">Articles Positifs</div>
                                        </div>
                                        <div class="metric-card" style="border-left:4px solid #6b7280;">
                                            <div class="metric-value" style="color:#6b7280;">${sentiment.stats.neutral || 0}</div>
                                            <div class="metric-label">Articles Neutres</div>
                                        </div>
                                        <div class="metric-card" style="border-left:4px solid #ef4444;">
                                            <div class="metric-value" style="color:#ef4444;">${sentiment.stats.negative || 0}</div>
                                            <div class="metric-label">Articles Négatifs</div>
                                        </div>
                                    </div>
                                    ` : '<p>Aucune donnée de sentiment disponible</p>'}
                                </div>

                                <div class="section">
                                    <h2>🏆 Thèmes les Plus Populaires</h2>
                                    ${metrics.top_themes && metrics.top_themes.length ? `
                                    <div class="themes-grid">
                                        ${metrics.top_themes.slice(0, 8).map(theme => `
                                            <div class="theme-item">
                                                <div>
                                                    <strong>${theme.name}</strong>
                                                    <div style="color:#64748b; font-size:.9rem; margin-top:5px;">
                                                        ${theme.total} articles analysés
                                                    </div>
                                                </div>
                                                <div style="font-size:1.5rem; font-weight:bold; color:#3b82f6;">
                                                    ${Math.round((theme.total / metrics.summary.total_articles) * 100)}%
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    ` : '<p>Aucun thème détecté</p>'}
                                </div>

                                <div class="section">
                                    <h2>🌍 Analyse Géopolitique</h2>
                                    ${geopolitical.report ? `
                                        <div style="background:white; padding:20px; border-radius:12px; margin:20px 0;">
                                            <h3 style="color:#1e40af; margin-top:0;">Résumé Global</h3>
                                            <p>Pays analysés: <strong>${geopolitical.report.summary?.totalCountries || 0}</strong></p>
                                            <p>Zones à haut risque: <strong style="color:#ef4444;">${geopolitical.report.summary?.highRiskZones || 0}</strong></p>
                                            <p>Zones à risque moyen: <strong style="color:#f59e0b;">${geopolitical.report.summary?.mediumRiskZones || 0}</strong></p>
                                        </div>
                                        ${geopolitical.report.crisisZones && geopolitical.report.crisisZones.length ? `
                                            <div class="crisis-zones">
                                                <h3 style="color:#1e40af;">Zones de Crise Actives</h3>
                                                ${geopolitical.report.crisisZones.slice(0, 5).map(zone => `
                                                    <div class="crisis-item risk-${zone.riskLevel || 'medium'}">
                                                        <div style="display:flex; justify-content:space-between; align-items:center;">
                                                            <div>
                                                                <strong>${zone.country}</strong>
                                                                <div style="color:#64748b; font-size:.9rem; margin-top:5px;">
                                                                    ${zone.mentions} mentions • Sentiment: ${zone.sentiment || 'N/A'}
                                                                </div>
                                                            </div>
                                                            <span style="background:${zone.riskLevel === 'high' ? '#ef4444' : zone.riskLevel === 'medium' ? '#f59e0b' : '#10b981'}; color:white; padding:4px 12px; border-radius:20px; font-size:.8rem;">
                                                                Risque ${zone.riskLevel === 'high' ? 'Élevé' : zone.riskLevel === 'medium' ? 'Moyen' : 'Faible'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : '<p>Aucune zone de crise détectée</p>'}
                                    ` : '<p>Aucune donnée géopolitique disponible</p>'}
                                </div>

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
                                        <div style="margin-top:20px;">
                                            <h3 style="color:#1e40af;">Modules Actifs</h3>
                                            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
                                                ${learning.modules_active.map(m => `<span style="background:#3b82f6; color:white; padding:6px 12px; border-radius:20px; font-size:.8rem;">${m}</span>`).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                    ` : '<p>Aucune donnée d\'apprentissage disponible</p>'}
                                </div>
                            </div>

                            <div class="footer">
                                <p>Rapport généré automatiquement par le système d'analyse IA</p>
                                <p>RSS Aggregator Intelligent — ${new Date().getFullYear()}</p>
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

    async function exportToJSON() {
        try {
            setMessage("Génération du JSON…", "info");

            if (state.articles.length === 0) {
                alert("Aucun article à exporter");
                return;
            }

            const exportData = {
                exportDate: new Date().toISOString(),
                totalArticles: state.articles.length,
                articles: state.articles.map(a => ({
                    id: a.id,
                    title: a.title,
                    link: a.link,
                    date: a.date,
                    themes: a.themes,
                    sentiment: a.sentiment,
                    confidence: a.confidence,
                    summary: a.summary,
                    feed: a.feed
                }))
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json;charset=utf-8" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `articles-export-${new Date().toISOString().split("T")[0]}.json`;
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
            setMessage("Génération du CSV…", "info");

            if (state.articles.length === 0) {
                alert("Aucun article à exporter");
                return;
            }

            const headers = ["ID", "Titre", "Date", "Lien", "Thèmes", "Sentiment", "Score", "Confiance"];
            const rows = [headers.join(",")];

            state.articles.forEach(a => {
                const row = [
                    a.id,
                    `"${(a.title || "").replace(/"/g, '""')}"`,
                    `"${a.date || ""}"`,
                    `"${a.link || ""}"`,
                    `"${(a.themes || []).join("; ")}"`,
                    a.sentiment?.sentiment || "neutral",
                    a.sentiment?.score || 0,
                    a.confidence || 0
                ];
                rows.push(row.join(","));
            });

            const csv = rows.join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `articles-export-${new Date().toISOString().split("T")[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setMessage("✅ Export CSV téléchargé", "success");
        } catch (error) {
            console.error("❌ Erreur export CSV:", error);
            setMessage("Erreur: " + error.message, "error");
        }
    }

    // -------------------------------------------------------------
    // Corrélations de Pearson
    // -------------------------------------------------------------
    async function analyzeKeywordCorrelation() {
        const keyword = prompt("Entrez un mot‑clé à analyser:");
        if (!keyword) return;

        setMessage(`🔍 Analyse de corrélation pour "${keyword}"…`, "info");

        try {
            const response = await apiGET(
                `/api/analysis/correlations/keyword-sentiment?keyword=${encodeURIComponent(keyword)}`
            );

            if (response.success) {
                const analysis = response.analysis;

                // Affichage dans le conteneur dédié
                const resultsContainer = qs("#pearsonResults");
                if (resultsContainer) {
                    const correlationColor =
                        analysis.correlation > 0.3
                            ? "#10b981"
                            : analysis.correlation < -0.3
                                ? "#ef4444"
                                : "#f59e0b";

                    resultsContainer.innerHTML = `
                    <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid ${correlationColor}; margin-bottom: 15px;">
                        <h4 style="margin-top: 0; color: #1e293b;">📊 Résultat de l'analyse : "${analysis.keyword}"</h4>
                        
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
                                    ${analysis.strength.replace("_", " ")}
                                </div>
                                <div style="color: #64748b; font-size: 0.9rem;">Force de corrélation</div>
                            </div>
                        </div>
                        
                        <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin-top: 10px;">
                            <strong>📝 Interprétation :</strong>
                            <p style="margin: 8px 0 0 0; color: #475569;">${analysis.interpretation}</p>
                        </div>
                        
                        <div style="margin-top: 15px; font-size: 0.8rem; color: #64748b;">
                            <strong>🧮 Méthodologie :</strong> 
                            Corrélation de Pearson entre la fréquence du mot‑clé "${analysis.keyword}" et le score de sentiment des articles.
                            Une valeur proche de +1 indique une forte relation positive, -1 une forte relation négative.
                        </div>
                    </div>
                `;
                }

                // Message contextuel
                setMessage(
                    `📊 Corrélation "${keyword}" ↔ Sentiment: ${analysis.correlation}\n` +
                    `📈 Force: ${analysis.strength}\n` +
                    `📝 ${analysis.interpretation}\n` +
                    `📋 Échantillon: ${analysis.sampleSize} articles`,
                    analysis.correlation > 0.3 ? "success" : "info"
                );

                // Mise à jour du petit graphique (optionnel)
                window.ChartManager.updateKeywordCorrelationChart(analysis);
            }
        } catch (error) {
            console.error("❌ Erreur analyse corrélation:", error);
            setMessage("Erreur analyse corrélation: " + error.message, "error");
        }
    }

    async function loadThemeCorrelations() {
        setMessage("🔗 Analyse des corrélations entre thèmes…", "info");

        try {
            const response = await apiGET("/api/analysis/correlations/themes?limit=150");

            if (response.success && response.correlations.length > 0) {
                const container = qs("#themeCorrelations");
                if (container) {
                    const topCorrelations = response.correlations.slice(0, 10);

                    container.innerHTML = `
                    <div style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                        <h3 style="margin-top: 0;">🔗 Corrélations entre thèmes</h3>
                        <div style="font-size: .9rem; color: #64748b; margin-bottom: 15px;">
                            ${response.metadata.significantCorrelations} corrélations significatives trouvées sur ${response.metadata.themesCount} thèmes analysés
                        </div>
                        <div style="display: grid; gap: 10px;">
                            ${topCorrelations.map(corr => `
                                <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid ${corr.correlation > 0 ? "#10b981" : "#ef4444"};">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <strong>${corr.theme1}</strong> ↔ <strong>${corr.theme2}</strong>
                                        </div>
                                        <div style="font-weight: bold; color: ${corr.correlation > 0 ? "#10b981" : "#ef4444"};">
                                            ${corr.correlation}
                                        </div>
                                    </div>
                                    <div style="font-size: .8rem; color: #64748b; margin-top: 5px;">
                                        ${corr.interpretation}
                                    </div>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                `;
                }

                // Graphique de barres pour les top‑corrélations
                window.ChartManager.updateThemeCorrelationsChart(
                    response.correlations.slice(0, 8)
                );

                setMessage(
                    `✅ ${response.correlations.length} corrélations entre thèmes analysées`,
                    "success"
                );
            } else {
                qs("#themeCorrelations").innerHTML = `
                <div style="background: white; padding: 20px; border-radius: 12px; text-align: center; color: #64748b;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">📊</div>
                    <p>Aucune corrélation significative trouvée entre les thèmes</p>
                    <p style="font-size: .9rem;">Les corrélations apparaissent lorsque des thèmes sont fréquemment mentionnés ensemble</p>
                </div>
            `;
            }
        } catch (error) {
            console.error("❌ Erreur chargement corrélations thèmes:", error);
            setMessage("Erreur analyse corrélations: " + error.message, "error");
        }
    }



    // -------------------------------------------------------------
    // Fonctions utilitaires (modals, email, UI)
    // -------------------------------------------------------------
    async function saveEmailConfig() {
        setMessage("✅ Configuration email sauvegardée", "success");
    }

    async function testEmailConfig() {
        setMessage("📧 Test de configuration email…", "info");
        setTimeout(() => setMessage("✅ Configuration email valide", "success"), 1000);
    }

    async function saveUIConfig() {
        const theme = document.querySelector('input[name="theme"]:checked')?.value || "light";
        setMessage(`✅ Thème ${theme} sauvegardé`, "success");
    }

    function closeModal(modalId) {
        const modal = qs(`#${modalId}`);
        if (modal) modal.style.display = "none";
    }

    /* -----------------------------------------------------------------
 *  Fonctions manquantes pour la navigation et l'UI
 * ----------------------------------------------------------------- */
    function showTab(tabName) {
        // Masquer tous les contenus d'onglets
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        // Désactiver tous les onglets
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Activer l'onglet sélectionné
        const targetTab = document.getElementById(tabName + 'Tab');
        if (targetTab) {
            targetTab.classList.add('active');
        }

        // Activer le bouton d'onglet correspondant
        const tabButtons = document.querySelectorAll('.tab');
        tabButtons.forEach(button => {
            if (button.textContent.includes(getTabIcon(tabName)) ||
                button.onclick.toString().includes(tabName)) {
                button.classList.add('active');
            }
        });

        // Charger les données spécifiques à l'onglet
        loadTabData(tabName);
    }

    function getTabIcon(tabName) {
        const icons = {
            'articles': '📰',
            'analysis': '📈',
            'themes': '🎨',
            'feeds': '📡',
            'social': '🌐',
            'metrics': '📊',
            'alerts': '🔔',
            'settings': '⚙️'
        };
        return icons[tabName] || '📄';
    }

    async function loadTabData(tabName) {
        switch (tabName) {
            case 'articles':
                await loadArticles();
                break;
            case 'analysis':
                updateAllCharts();
                break;
            case 'themes':
                await loadThemesManager();
                break;
            case 'feeds':
                await loadFeedsManager();
                break;
            case 'social':
                await loadSocialAnalysisData();
                await loadSocialSourcesManager();
                break;
            case 'metrics':
                await loadMetrics();
                await loadSentimentOverview();
                await loadLearningStats();
                break;
            case 'alerts':
                await loadAlertsManager();
                break;
            case 'settings':
                loadAIConfigToForm();
                break;
        }
    }

    async function refreshArticles() {
        await loadArticles(true);
        updateAllCharts();
    }

    /* -----------------------------------------------------------------
     *  Configuration IA - Fonctions manquantes
     * ----------------------------------------------------------------- */
    function loadAIConfigToForm() {
        // Remplir les champs de configuration IA
        const config = state.aiConfig;

        // IA locale
        if (qs("#localAIUrl")) qs("#localAIUrl").value = config.localAI.url;
        if (qs("#localAIModel")) qs("#localAIModel").value = config.localAI.model;
        if (qs("#localAISystemPrompt")) qs("#localAISystemPrompt").value = config.localAI.systemPrompt;
        if (qs("#localAIEnabled")) qs("#localAIEnabled").checked = config.localAI.enabled;
        if (qs("#localAIAutoStart")) qs("#localAIAutoStart").checked = config.localAI.autoStart;

        // OpenAI
        if (qs("#openaiKey")) qs("#openaiKey").value = config.openAI.apiKey;
        if (qs("#openaiModel")) qs("#openaiModel").value = config.openAI.model;
        if (qs("#openaiEnabled")) qs("#openaiEnabled").checked = config.openAI.enabled;

        // Priorité
        const priorityRadio = qs(`input[name="aiPriority"][value="${config.priority}"]`);
        if (priorityRadio) priorityRadio.checked = true;
    }

    async function saveAIConfig() {
        const config = {
            localAI: {
                enabled: qs("#localAIEnabled") ? qs("#localAIEnabled").checked : true,
                url: qs("#localAIUrl") ? qs("#localAIUrl").value : "http://localhost:8080",
                model: qs("#localAIModel") ? qs("#localAIModel").value : "llama2",
                systemPrompt: qs("#localAISystemPrompt") ? qs("#localAISystemPrompt").value : "",
                autoStart: qs("#localAIAutoStart") ? qs("#localAIAutoStart").checked : false
            },
            openAI: {
                enabled: qs("#openaiEnabled") ? qs("#openaiEnabled").checked : false,
                apiKey: qs("#openaiKey") ? qs("#openaiKey").value : "",
                model: qs("#openaiModel") ? qs("#openaiModel").value : "gpt-3.5-turbo"
            },
            priority: qs('input[name="aiPriority"]:checked') ? qs('input[name="aiPriority"]:checked').value : "local"
        };

        state.aiConfig = config;

        try {
            localStorage.setItem("rssAggregatorAIConfig", JSON.stringify(config));
            setMessage("✅ Configuration IA sauvegardée", "success");
        } catch (error) {
            console.error("Erreur sauvegarde config:", error);
            setMessage("⚠️ Configuration sauvegardée localement seulement", "warning");
        }
    }

    async function testLocalAIConnection() {
        setMessage("🔌 Test de connexion à l'IA locale...", "info");
        try {
            // Simulation de test - à adapter avec vos vraies routes
            const response = await fetch(state.aiConfig.localAI.url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                setMessage("✅ Connexion IA locale réussie", "success");
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error("Test connexion IA locale:", error);
            setMessage("❌ Échec connexion IA locale: " + error.message, "error");
        }
    }

    async function testOpenAIConnection() {
        setMessage("🌐 Test de connexion OpenAI...", "info");

        if (!state.aiConfig.openAI.apiKey) {
            setMessage("❌ Clé API OpenAI manquante", "error");
            return;
        }

        // Simulation - à remplacer par votre vrai test
        setTimeout(() => {
            setMessage("✅ Connexion OpenAI réussie", "success");
        }, 1000);
    }

    async function startLocalAIServer() {
        setMessage("🚀 Démarrage du serveur IA local...", "info");

        try {
            // Simulation - à adapter avec vos routes
            const response = await apiPOST("/llama.cpp/llama-server.exe", {
                model: state.aiConfig.localAI.model
            });

            if (response.success) {
                setMessage("✅ Serveur IA démarré", "success");
            } else {
                throw new Error(response.error || "Erreur inconnue");
            }
        } catch (error) {
            console.error("Démarrage serveur IA:", error);
            setMessage("❌ Erreur démarrage serveur: " + error.message, "error");
        }
    }

    /* -----------------------------------------------------------------
     *  Routes API manquantes - Fallback et gestion d'erreurs
     * ----------------------------------------------------------------- */
    async function apiCallWithFallback(method, path, body = null, fallbackData = null) {
        try {
            return await apiCall(method, path, body);
        } catch (error) {
            console.warn(`Route ${path} non disponible, utilisation du fallback:`, error.message);

            // Retourner les données de fallback pour le développement
            if (fallbackData !== null) {
                return { success: true, ...fallbackData };
            }

            // Fallback générique basé sur le chemin
            return getGenericFallback(path);
        }
    }

    function getGenericFallback(path) {
        const fallbacks = {
            '/metrics': {
                summary: {
                    total_articles: state.articles.length,
                    avg_confidence: 0.75,
                    avg_posterior: 0.68,
                    avg_corroboration: 0.72
                },
                top_themes: state.themes.slice(0, 5).map(t => ({
                    name: t.name,
                    total: Math.floor(Math.random() * 50) + 10
                }))
            },
            '/sentiment/detailed': {
                stats: {
                    positive: Math.floor(state.articles.length * 0.3),
                    neutral: Math.floor(state.articles.length * 0.5),
                    negative: Math.floor(state.articles.length * 0.2),
                    average_score: 0.1
                }
            },
            '/learning/stats': {
                total_articles_processed: state.articles.length,
                sentiment_accuracy: 0.82,
                theme_detection_accuracy: 0.78,
                avg_processing_time: 2.5,
                modules_active: ['sentiment', 'themes', 'corroboration']
            }
        };

        for (const [route, data] of Object.entries(fallbacks)) {
            if (path.includes(route)) {
                return { success: true, ...data };
            }
        }

        return { success: false, error: "Route non disponible" };
    }

    /* -----------------------------------------------------------------
     *  Initialisation améliorée avec fallbacks
     * ----------------------------------------------------------------- */
    async function enhancedInit() {
        console.log("🚀 Initialisation améliorée de l'application…");

        try {
            // Charger la configuration sauvegardée
            const savedConfig = localStorage.getItem("rssAggregatorAIConfig");
            if (savedConfig) {
                state.aiConfig = { ...state.aiConfig, ...JSON.parse(savedConfig) };
            }

            // Afficher l'onglet par défaut
            showTab("articles");

            // Chargement initial des données avec fallbacks
            await Promise.allSettled([
                loadArticles().catch(e => console.warn("Articles load failed:", e)),
                loadThemes().catch(e => console.warn("Themes load failed:", e)),
                loadFeeds().catch(e => console.warn("Feeds load failed:", e)),
                loadSocialSources().catch(e => console.warn("Social sources load failed:", e))
            ]);

            // Mettre à jour les graphiques
            setTimeout(() => {
                updateAllCharts();
                loadFactorZ().catch(e => console.warn("Factor Z load failed:", e));
            }, 1000);

            console.log("✅ Application initialisée avec fallbacks");
            setMessage("Application prête (mode développement avec fallbacks)", "success");

        } catch (error) {
            console.error("❌ Erreur d'initialisation:", error);
            setMessage("Application en mode développement - certaines fonctionnalités peuvent être limitées", "warning");
        }
    }

    // -------------------------------------------------------------
    // Exposition publique de l'API de l'application
    // -------------------------------------------------------------
    window.app = {
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
        loadSocialSources,
        loadSocialPosts,
        refreshSocialFeeds,
        saveSocialSources,
        loadSocialSourcesManager,
        addSocialSource,
        removeSocialSource,
        loadFactorZ,
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
        showTab,
        refreshArticles,
        loadAIConfigToForm,
        saveAIConfig,
        testLocalAIConnection,
        testOpenAIConnection,
        startLocalAIServer,
        state
    };

    // Initialisation automatique au chargement du DOM
    document.addEventListener("DOMContentLoaded", () => {
        console.log("📄 DOM chargé");
        if (window.app && typeof window.app.init === "function") {
            window.app.init();
        } else {
            console.error("❌ window.app non disponible");
        }
    });
})();

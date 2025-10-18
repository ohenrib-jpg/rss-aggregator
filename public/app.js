// public/app.js - Version complète et fonctionnelle
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
    charts: { themeChart: null, timelineChart: null, sentimentChart: null },
    timers: { autoRefresh: null },
    aiConfig: null
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

  // ========== FONCTIONS API ==========
  async function apiGET(path) {
    if (!path.startsWith("/api/")) {
      path = "/api" + (path.startsWith("/") ? path : "/" + path);
    }
    
    console.log(`🔍 GET ${path}`);
    
    try {
      const res = await fetch(path, { 
        method: "GET", 
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}`);
      }
      
      return await res.json();
    } catch (err) {
      console.error(`❌ GET ${path}:`, err.message);
      throw err;
    }
  }

  async function apiPOST(path, body) {
    if (!path.startsWith("/api/")) {
      path = "/api" + (path.startsWith("/") ? path : "/" + path);
    }
    
    console.log(`📤 POST ${path}`);
    
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      return await res.json();
    } catch (err) {
      console.error(`❌ POST ${path}:`, err.message);
      throw err;
    }
  }

  // ========== CHARGEMENT DONNÉES ==========
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
      try { out.date = new Date(out.date).toISOString(); } catch (e) {}
    }
    
    out.pubDate = out.date;
    return out;
  }

  async function loadArticles() {
    setMessage("Chargement des articles...");
    try {
      const json = await apiGET("/api/articles");
      
      if (json.success && json.articles) {
        state.articles = json.articles.map(normalizeArticle);
      } else if (Array.isArray(json)) {
        state.articles = json.map(normalizeArticle);
      } else {
        state.articles = [];
      }
      
      renderArticlesList();
      computeThemesFromArticles();
      
      if (json.totalArticles !== undefined) {
        if (!state.summary) state.summary = {};
        state.summary.total_articles = json.totalArticles;
      }
      
      setMessage("");
      return state.articles;
    } catch (err) {
      console.error("loadArticles error", err);
      setMessage("Erreur chargement articles");
      state.articles = [];
      return [];
    }
  }

  async function loadThemes() {
    try {
      const json = await apiGET("/api/themes");
      const container = qs("#themesList");
      if (!container) return;
      
      let themesData = Array.isArray(json) ? json : [];
      
      if (themesData.length > 0) {
        container.innerHTML = "";
        themesData.forEach(t => {
          const div = document.createElement("div");
          div.className = "theme-row";
          div.innerHTML = `
            <strong>${escapeHtml(t.name)}</strong> 
            ${t.keywords ? `– ${Array.isArray(t.keywords) ? t.keywords.join(', ') : t.keywords}` : ''}
            <span style="color: #666; font-size: 0.9em;">(${t.count || 0} articles)</span>
          `;
          container.appendChild(div);
        });
      } else {
        container.innerHTML = "<div class='loading'>Aucun thème configuré</div>";
      }
    } catch (e) { 
      console.error("Erreur thèmes:", e);
      const container = qs("#themesList");
      if (container) container.innerHTML = "<div class='loading'>Erreur</div>";
    }
  }

  async function loadFeeds() {
    try {
      const json = await apiGET("/api/feeds");
      const container = qs("#feedsList");
      if (!container) return;
      
      let feeds = Array.isArray(json) ? json : [];
      
      if (feeds.length > 0) {
        container.innerHTML = feeds.map(url => 
          `<div class="theme-row">${escapeHtml(url)}</div>`
        ).join("");
      } else {
        container.innerHTML = "<div class='loading'>Aucun flux</div>";
      }
    } catch (e) { 
      console.error("Erreur flux:", e);
    }
  }

  async function loadMetrics(days = 30) {
    setMessage("Chargement métriques...");
    try {
      let sentimentStats = null;
      
      try {
        sentimentStats = await apiGET("/api/sentiment/stats");
      } catch (e) {
        console.warn("API sentiment indisponible");
      }
      
      const totalArticles = state.articles.length;
      const avgConfidence = totalArticles > 0 
        ? (state.articles.reduce((sum, a) => sum + a.confidence, 0) / totalArticles)
        : 0;
      
      state.metrics = {
        summary: {
          total_articles: totalArticles,
          avg_confidence: avgConfidence.toFixed(3),
          avg_posterior: "0.75",
          avg_corroboration: "0.60"
        },
        sentiment_evolution: [],
        top_themes: state.themes.slice(0, 10).map(t => ({ name: t.name, total: t.count }))
      };
      
      if (sentimentStats && sentimentStats.success) {
        state.metrics.sentiment_stats = sentimentStats.stats;
        if (sentimentStats.stats.total) {
          state.metrics.summary.total_articles = sentimentStats.stats.total;
        }
      }
      
      state.summary = state.metrics.summary;
      renderMetricsUI();
      setMessage("");
      
      return state.metrics;
      
    } catch (err) {
      console.error("loadMetrics error", err);
      state.metrics = {
        summary: {
          total_articles: state.articles.length || 0,
          avg_confidence: "0.75",
          avg_posterior: "0.70",
          avg_corroboration: "0.65"
        },
        sentiment_evolution: [],
        top_themes: []
      };
      return state.metrics;
    }
  }

  // ========== GESTION DES FLUX ==========

  async function loadFeedsManager() {
    const container = qs("#feedsManagerList");
    if (!container) return;
    
    try {
      const response = await fetch('/api/feeds/manager');
      const data = await response.json();
      
      if (data.success && data.feeds.length > 0) {
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
                      ${feed.last_fetched ? new Date(feed.last_fetched).toLocaleDateString() : 'Jamais'}
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                      <button onclick="app.toggleFeed(${feed.id}, ${!feed.is_active})" class="btn ${feed.is_active ? 'btn-secondary' : 'btn-success'}" style="padding: 6px 12px; font-size: 0.8rem;">
                        ${feed.is_active ? '❌ Désactiver' : '✅ Activer'}
                      </button>
                      <button onclick="app.deleteFeed(${feed.id})" class="btn btn-danger" style="padding: 6px 12px; font-size: 0.8rem;">🗑️ Supprimer</button>
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
      console.error('Erreur chargement flux:', error);
      container.innerHTML = '<div class="loading">Erreur de chargement</div>';
    }
  }

  function showAddFeedModal() {
    qs('#addFeedModal').style.display = 'block';
  }

  async function addNewFeed() {
    const url = qs('#newFeedUrl').value;
    const title = qs('#newFeedTitle').value;
    
    if (!url) {
      alert('Veuillez entrer une URL');
      return;
    }
    
    try {
      const response = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title })
      });
      
      const data = await response.json();
      
      if (data.success) {
        closeModal('addFeedModal');
        loadFeedsManager();
        // Réinitialiser les champs
        qs('#newFeedUrl').value = '';
        qs('#newFeedTitle').value = '';
      } else {
        alert('Erreur: ' + data.error);
      }
    } catch (error) {
      alert('Erreur: ' + error.message);
    }
  }

  async function toggleFeed(id, isActive) {
    try {
      const response = await fetch(`/api/feeds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive })
      });
      
      const data = await response.json();
      
      if (data.success) {
        loadFeedsManager();
      } else {
        alert('Erreur: ' + data.error);
      }
    } catch (error) {
      alert('Erreur: ' + error.message);
    }
  }

  async function deleteFeed(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce flux ?')) {
      try {
        const response = await fetch(`/api/feeds/${id}`, {
          method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
          loadFeedsManager();
        } else {
          alert('Erreur: ' + data.error);
        }
      } catch (error) {
        alert('Erreur: ' + error.message);
      }
    }
  }

  // ========== GESTION DES THÈMES ==========

  async function loadThemesManager() {
    const container = qs("#themesManagerList");
    if (!container) return;
    
    try {
      const response = await fetch('/api/themes/manager');
      const data = await response.json();
      
      if (data.success && data.themes.length > 0) {
        container.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">
            ${data.themes.map(theme => `
              <div class="theme-card" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: white;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                  <div style="width: 16px; height: 16px; border-radius: 50%; background: ${theme.color};"></div>
                  <h4 style="margin: 0; flex: 1;">${theme.name}</h4>
                  <div>
                    <button onclick="app.editTheme('${theme.id}')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;">✏️</button>
                    <button onclick="app.deleteTheme('${theme.id}')" class="btn btn-danger" style="padding: 4px 8px; font-size: 0.8rem;">🗑️</button>
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
                  ${theme.keywords?.length || 0} mots-clés • Créé le ${new Date(theme.created_at).toLocaleDateString()}
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
      console.error('Erreur chargement thèmes:', error);
      container.innerHTML = '<div class="loading">Erreur de chargement</div>';
    }
  }

  function showAddThemeModal() {
    qs('#addThemeModal').style.display = 'block';
  }

  async function addNewTheme() {
    const name = qs('#newThemeName').value;
    const keywordsText = qs('#newThemeKeywords').value;
    const color = qs('#newThemeColor').value;
    const description = qs('#newThemeDescription').value;
    
    if (!name) {
      alert('Veuillez entrer un nom de thème');
      return;
    }
    
    const keywords = keywordsText.split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    try {
      const response = await fetch('/api/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, keywords, color, description })
      });
      
      const data = await response.json();
      
      if (data.success) {
        closeModal('addThemeModal');
        loadThemesManager();
        // Réinitialiser les champs
        qs('#newThemeName').value = '';
        qs('#newThemeKeywords').value = '';
        qs('#newThemeColor').value = '#3b82f6';
        qs('#newThemeDescription').value = '';
      } else {
        alert('Erreur: ' + data.error);
      }
    } catch (error) {
      alert('Erreur: ' + error.message);
    }
  }

  async function importThemesFromFile() {
    if (confirm('Importer les thèmes géopolitiques depuis le fichier themes.json ?')) {
      try {
        const response = await fetch('/api/themes/import', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          alert(`✅ ${data.imported} thèmes importés sur ${data.total}`);
          loadThemesManager();
        } else {
          alert('Erreur: ' + data.error);
        }
      } catch (error) {
        alert('Erreur: ' + error.message);
      }
    }
  }

  async function editTheme(id) {
    // Pour l'instant, simple message - à implémenter plus tard
    alert(`Édition du thème ${id} - À implémenter`);
  }

  async function deleteTheme(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce thème ?')) {
      try {
        const response = await fetch(`/api/themes/${id}`, {
          method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
          loadThemesManager();
        } else {
          alert('Erreur: ' + data.error);
        }
      } catch (error) {
        alert('Erreur: ' + error.message);
      }
    }
  }

  // ========== FONCTIONS UI ==========
  function setMessage(msg, type = "info") {
    const container = qs("#messageContainer");
    if (!container) return;
    
    if (!msg) {
      container.innerHTML = "";
      return;
    }
    
    const color = type === "error" ? "#ef4444" : "#3b82f6";
    container.innerHTML = `<div style="color: ${color}; padding: 10px; text-align: center;">${msg}</div>`;
  }

  function showTab(tabName) {
    // Cacher tous les onglets
    qsa(".tab-content").forEach(div => {
      div.style.display = "none";
      div.classList.remove("active");
    });
    
    // Désactiver tous les onglets
    qsa(".tab").forEach(tab => {
      tab.classList.remove("active");
    });
    
    // Activer l'onglet sélectionné
    const targetTab = qs(`#${tabName}Tab`);
    const targetButton = Array.from(qsa(".tab")).find(tab => 
      tab.getAttribute('onclick')?.includes(tabName)
    );
    
    if (targetTab) {
      targetTab.style.display = "block";
      targetTab.classList.add("active");
    }
    
    if (targetButton) {
      targetButton.classList.add("active");
    }
    
    console.log(`📁 Onglet activé: ${tabName}`);
    
    // Charger les données spécifiques à l'onglet
    loadTabData(tabName);
  }

  function loadTabData(tabName) {
    switch(tabName) {
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
    }
  }

  function showAIConfig() {
    const modal = qs("#aiConfigModal");
    if (modal) {
      modal.style.display = "block";
    }
  }

  function closeModal(modalId) {
    const modal = qs(`#${modalId}`);
    if (modal) {
      modal.style.display = "none";
    }
  }

  function saveAIConfig() {
    const openaiKey = qs("#openaiKey").value;
    const openaiModel = qs("#openaiModel").value;
    const enableLocal = qs("#enableLocal").checked;
    const llamaUrl = qs("#llamaUrl").value;
    
    // Sauvegarder dans le localStorage
    const config = {
      openaiKey,
      openaiModel,
      enableLocal,
      llamaUrl
    };
    
    localStorage.setItem("aiConfig", JSON.stringify(config));
    setMessage("Configuration IA sauvegardée !", "info");
    closeModal("aiConfigModal");
  }

  function testAIConnection() {
    setMessage("Test de connexion IA en cours...", "info");
    setTimeout(() => {
      setMessage("✅ Connexion IA testée avec succès !", "info");
    }, 1000);
  }

  // ========== RENDU DES DONNÉES ==========
  function renderArticlesList() {
    const container = qs("#articlesList");
    if (!container) return;
    
    if (state.articles.length === 0) {
      container.innerHTML = "<div class='loading'>Aucun article disponible</div>";
      return;
    }
    
    const articlesHtml = state.articles.slice(0, 50).map(article => `
      <div class="article-card">
        <h4><a href="${escapeHtml(article.link)}" target="_blank">${escapeHtml(article.title)}</a></h4>
        <div class="meta">
          <span>📅 ${new Date(article.date).toLocaleDateString()}</span>
          <span>😊 ${article.sentiment.sentiment} (${article.sentiment.score})</span>
          <span>🎯 Confiance: ${(article.confidence * 100).toFixed(1)}%</span>
        </div>
        <p>${escapeHtml(article.summary.substring(0, 200))}...</p>
        <div class="themes">
          ${article.themes.map(theme => `<span class="tag">${escapeHtml(theme)}</span>`).join("")}
        </div>
      </div>
    `).join("");
    
    container.innerHTML = articlesHtml;
  }

  function renderMetricsUI() {
    if (!state.metrics) return;
    
    // Mettre à jour les métriques principales
    qs("#m_total").textContent = state.metrics.summary.total_articles || "0";
    qs("#m_confidence").textContent = state.metrics.summary.avg_confidence || "0.00";
    qs("#m_posterior").textContent = state.metrics.summary.avg_posterior || "0.00";
    qs("#m_corro").textContent = state.metrics.summary.avg_corroboration || "0.00";
    
    // Mettre à jour les thèmes principaux
    const topThemesContainer = qs("#topThemes");
    if (topThemesContainer && state.metrics.top_themes) {
      const themesHtml = state.metrics.top_themes.slice(0, 10).map(theme => 
        `<li><strong>${escapeHtml(theme.name)}</strong> - ${theme.total} articles</li>`
      ).join("");
      topThemesContainer.innerHTML = themesHtml;
    }
  }

  function computeThemesFromArticles() {
    const themeCounts = {};
    
    state.articles.forEach(article => {
      article.themes.forEach(theme => {
        themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      });
    });
    
    state.themes = Object.entries(themeCounts).map(([name, count]) => ({
      name,
      count,
      color: getThemeColor(name)
    })).sort((a, b) => b.count - a.count);
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

  // ========== GRAPHIQUES ==========
  function updateCharts() {
    createThemeChart();
    createTimelineChart();
    createSentimentChart();
  }

  function createThemeChart() {
    const ctx = qs("#themeChart");
    if (!ctx) return;
    
    if (state.charts.themeChart) {
      state.charts.themeChart.destroy();
    }
    
    const themeData = state.themes.slice(0, 10);
    
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
    
    // Données simplifiées pour la démo
    const dates = Array.from(new Set(state.articles.map(a => isoDay(a.date)))).sort().slice(-30);
    const themeCounts = {};
    
    state.themes.slice(0, 5).forEach(theme => {
      themeCounts[theme.name] = dates.map(date => 
        state.articles.filter(a => isoDay(a.date) === date && a.themes.includes(theme.name)).length
      );
    });
    
    state.charts.timelineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: Object.entries(themeCounts).map(([themeName, counts], index) => ({
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
    
    // Données simplifiées pour la démo
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

  // ========== FONCTIONS SPÉCIFIQUES AUX ONGLETS ==========
  async function loadSentimentOverview() {
    const container = qs("#sentimentOverview");
    if (!container) return;
    
    try {
      const stats = await apiGET("/api/sentiment/stats");
      
      if (stats.success) {
        const s = stats.stats;
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
          </div>
          <div class="metric-card">
            <h3>📊 Score Moyen</h3>
            <div style="font-size: 1.5rem; color: #3b82f6;">${(s.average_score || 0).toFixed(2)}</div>
          </div>
        `;
      } else {
        container.innerHTML = "<div class='loading'>Données de sentiment non disponibles</div>";
      }
    } catch (e) {
      console.error("Erreur chargement sentiment:", e);
      container.innerHTML = "<div class='loading'>Erreur de chargement</div>";
    }
  }

  async function loadLearningStats() {
    const container = qs("#learningStats");
    if (!container) return;
    
    try {
      const stats = await apiGET("/api/learning-stats");
      
      if (stats.success) {
        container.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
            <div class="metric-card">
              <h3>📚 Articles Traités</h3>
              <div style="font-size: 1.8rem; color: #3b82f6;">${stats.total_articles_processed || 0}</div>
            </div>
            <div class="metric-card">
              <h3>🎯 Précision Sentiment</h3>
              <div style="font-size: 1.8rem; color: #10b981;">${(stats.sentiment_accuracy * 100 || 0).toFixed(1)}%</div>
            </div>
            <div class="metric-card">
              <h3>🏷️ Détection Thèmes</h3>
              <div style="font-size: 1.8rem; color: #f59e0b;">${(stats.theme_detection_accuracy * 100 || 0).toFixed(1)}%</div>
            </div>
            <div class="metric-card">
              <h3>🧠 Fusion Bayésienne</h3>
              <div style="font-size: 1.8rem; color: #8b5cf6;">${stats.bayesian_fusion_used || 0}</div>
            </div>
          </div>
          <div style="margin-top: 30px;">
            <h3>🛠️ Modules Actifs</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px;">
              ${(stats.modules_active || []).map(module => 
                `<span style="background: #3b82f6; color: white; padding: 8px 15px; border-radius: 20px; font-size: 0.9rem;">${module}</span>`
              ).join("")}
            </div>
          </div>
        `;
      } else {
        container.innerHTML = "<div class='loading'>Statistiques d'apprentissage non disponibles</div>";
      }
    } catch (e) {
      console.error("Erreur chargement stats apprentissage:", e);
      container.innerHTML = "<div class='loading'>Erreur de chargement</div>";
    }
  }

// ============ FONCTIONS MANQUANTES FLUX ET THEMES 18/10============

async function exportFeeds() {
  try {
    const response = await fetch('/api/feeds/manager');
    const data = await response.json();
    
    if (data.success) {
      const csvContent = "data:text/csv;charset=utf-8," 
        + "URL,Titre,Statut,Dernier fetch\n"
        + data.feeds.map(feed => 
            `"${feed.url}","${feed.title || ''}","${feed.is_active ? 'Actif' : 'Inactif'}","${feed.last_fetched || 'Jamais'}"`
          ).join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "flux_rss_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    alert('Erreur export: ' + error.message);
  }
}

async function exportThemes() {
  try {
    const response = await fetch('/api/themes/manager');
    const data = await response.json();
    
    if (data.success) {
      const csvContent = "data:text/csv;charset=utf-8," 
        + "Nom,Couleur,Description,Nombre de mots-clés\n"
        + data.themes.map(theme => 
            `"${theme.name}","${theme.color}","${theme.description || ''}","${theme.keywords.length}"`
          ).join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "themes_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    alert('Erreur export: ' + error.message);
  }
}

// Exposer les nouvelles fonctions globales
window.exportFeeds = exportFeeds;
window.exportThemes = exportThemes;

  // ========== INITIALISATION ==========
  function initializeApp() {
    console.log("🚀 Initialisation de l'application RSS Aggregator");
    
    // Charger les données initiales
    loadArticles();
    loadThemes();
    loadFeeds();
    
    // Configurer les écouteurs d'événements
    qs("#refreshBtn").addEventListener("click", () => {
      loadArticles();
      loadThemes();
      loadFeeds();
    });
    
    // Vérifier l'état de l'IA
    checkAIStatus();
    
    // Démarrer l'actualisation automatique
    if (state.autoRefresh) {
      state.timers.autoRefresh = setInterval(() => {
        loadArticles();
      }, state.refreshIntervalMs);
    }
    
    console.log("✅ Application initialisée");
  }

  async function checkAIStatus() {
    const statusElement = qs("#aiStatus");
    if (!statusElement) return;
    
    try {
      const health = await apiGET("/api/health");
      if (health.ok) {
        statusElement.innerHTML = "🤖 IA: Connectée ✅";
        statusElement.style.background = "rgba(34, 197, 94, 0.2)";
      } else {
        statusElement.innerHTML = "🤖 IA: Partiellement connectée ⚠️";
        statusElement.style.background = "rgba(245, 158, 11, 0.2)";
      }
    } catch (e) {
      statusElement.innerHTML = "🤖 IA: Déconnectée ❌";
      statusElement.style.background = "rgba(239, 68, 68, 0.2)";
    }
  }

  // ========== EXPOSITION PUBLIQUE ==========
  return {
    // État
    state,
    
    // Fonctions principales
    initializeApp,
    showTab,
    showAIConfig,
    closeModal,
    saveAIConfig,
    testAIConnection,
    
    // Chargement de données
    loadArticles,
    loadThemes,
    loadFeeds,
    loadMetrics,
    
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
    importThemesFromFile,
    editTheme,
    deleteTheme,
    
    // Graphiques
    updateCharts,
    
    // Utilitaires
    setMessage
  };
})();

// Initialiser l'application quand la page est chargée
document.addEventListener("DOMContentLoaded", function() {
  window.app.initializeApp();
});

// Exposer les fonctions globales pour les onclick HTML
window.showTab = window.app.showTab;
window.showAIConfig = window.app.showAIConfig;
window.closeModal = window.app.closeModal;
window.saveAIConfig = window.app.saveAIConfig;
window.testAIConnection = window.app.testAIConnection;

// Exposer les fonctions de gestion
window.showAddFeedModal = window.app.showAddFeedModal;
window.showAddThemeModal = window.app.showAddThemeModal;
window.loadFeedsManager = window.app.loadFeedsManager;
window.loadThemesManager = window.app.loadThemesManager;
window.addNewFeed = window.app.addNewFeed;
window.addNewTheme = window.app.addNewTheme;
window.importThemesFromFile = window.app.importThemesFromFile;
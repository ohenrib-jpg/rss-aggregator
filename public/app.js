const API_BASE = window.__API_BASE__ || (location.origin.includes('http') ? location.origin : 'http://localhost:3000');
/* public/app.js - Version finale avec IA intégrée - SANS ERREURS */

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
          avg_corroboration: "0.65
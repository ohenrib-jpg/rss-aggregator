/* public/app.js - Version corrigée pour backend Node.js */
/* global Chart */
window.app = (function () {
  const state = {
    apiBase: "/api",
    autoRefresh: true,
    refreshIntervalMs: 300000,
    articles: [],
    themes: [],
    summary: {},
    metrics: null,
    charts: { themeChart: null, timelineChart: null, sentimentChart: null },
    timers: { autoRefresh: null }
  };

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else if (c instanceof Node) node.appendChild(c);
    });
    return node;
  }
  function safeNumber(v, d = 0) { return (v === null || v === undefined) ? d : Number(v); }
  function isoDay(dateStrOrObj) {
    if (!dateStrOrObj) return null;
    if (typeof dateStrOrObj === "string") return dateStrOrObj.slice(0, 10);
    if (dateStrOrObj instanceof Date) return dateStrOrObj.toISOString().slice(0, 10);
    try { const d = new Date(dateStrOrObj); return d.toISOString().slice(0, 10); } catch (e) { return null; }
  }
  function plural(n, s = "s") { return n > 1 ? s : ""; }
  function escapeHtml(s) {
    if (!s && s !== 0) return "";
    return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  async function apiGET(path) {
    const url = path.startsWith("/") ? path : state.apiBase + path;
    const res = await fetch(url, { method: "GET", credentials: "same-origin" });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status} ${txt}`);
    }
    return res.json();
  }

  async function apiPOST(path, body) {
    const url = path.startsWith("/") ? path : state.apiBase + path;
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status} ${txt}`);
    }
    return res.json();
  }

  async function loadArticles() {
    setMessage("Chargement des articles...");
    try {
      const json = await apiGET("/articles");
      
      // ✅ CORRECTION : backend Node.js renvoie { success, articles, analysis }
      if (json.success && json.articles) {
        state.articles = json.articles.map(normalizeArticle);
      } else {
        const list = json.articles || json.data || [];
        state.articles = list.map(normalizeArticle);
      }
      
      renderArticlesList();
      computeThemesFromArticles();
      
      // ✅ Mettre à jour les stats depuis la réponse
      if (json.totalArticles !== undefined) {
        if (!state.summary) state.summary = {};
        state.summary.total_articles = json.totalArticles;
      }
      
      setMessage("");
      return state.articles;
    } catch (err) {
      console.error("loadArticles error", err);
      setMessage("Erreur lors du chargement des articles: " + err.message);
      state.articles = [];
      renderArticlesList();
      computeThemesFromArticles();
      return [];
    }
  }

  function normalizeArticle(a) {
    const out = {};
    if (!a || typeof a !== "object") return out;
    out.id = a.id || a._id || null;
    out.title = a.title || "";
    out.link = a.link || "";
    out.date = a.date || a.pubDate || a.published || null;
    if (out.date && typeof out.date !== "string") {
      try { out.date = new Date(out.date).toISOString(); } catch (e) {}
    }
    
    let themes = a.themes || [];
    if (typeof themes === "string") themes = themes.split(",").map(s => s.trim()).filter(Boolean);
    out.themes = Array.isArray(themes) ? themes : [];
    
    out.sentiment = a.sentiment || null;
    out.confidence = safeNumber(a.confidence, 0);
    out.bayesian_posterior = safeNumber(a.bayesian_posterior, 0);
    out.corroboration_strength = safeNumber(a.corroboration_strength, 0);
    out.summary = a.summary || a.content || "";
    return out;
  }

  async function loadMetrics(days = 30) {
    setMessage("Chargement des métriques...");
    try {
      // ✅ CORRECTION : Pas de route /metrics dans Node.js, on calcule depuis les articles
      // On simule les métriques depuis state.articles
      const totalArticles = state.articles.length;
      const avgConfidence = totalArticles > 0 
        ? (state.articles.reduce((sum, a) => sum + (a.confidence || 0), 0) / totalArticles)
        : 0;
      
      state.metrics = {
        summary: {
          total_articles: totalArticles,
          avg_confidence: avgConfidence.toFixed(3),
          avg_posterior: 0,
          avg_corroboration: 0
        },
        sentiment_evolution: [],
        top_themes: state.themes.map(t => ({ name: t.name, total: t.count }))
      };
      
      state.summary = state.metrics.summary;
      renderMetricsUI();
      setMessage("");
      return state.metrics;
    } catch (err) {
      console.warn("loadMetrics error", err);
      state.metrics = null;
      renderMetricsUI();
      return null;
    }
  }

  function computeThemesFromArticles() {
    const counter = new Map();
    state.articles.forEach(a => {
      if (!a.themes || !Array.isArray(a.themes)) return;
      a.themes.forEach(t => {
        if (!t) return;
        const n = String(t).trim();
        counter.set(n, (counter.get(n) || 0) + 1);
      });
    });
    const themes = Array.from(counter.entries()).map(([name, count]) => ({ name, count, color: themeColorFor(name) })).sort((a, b) => b.count - a.count);
    state.themes = themes;
    renderThemesList();
    renderThemeChart();
  }

  function themeColorFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 70% 45%)`;
  }

  function renderArticlesList() {
    const container = qs("#articlesList");
    if (!container) return;
    container.innerHTML = "";
    if (!state.articles.length) {
      container.appendChild(el("div", { class: "loading", html: "Aucun article disponible." }));
      return;
    }
    state.articles.slice(0, 200).forEach(a => {
      const card = el("div", { class: "article-card" });
      
      // ✅ Extraction du sentiment
      let sentimentScore = 0;
      let sentimentType = 'neutral';
      if (a.sentiment) {
        if (typeof a.sentiment === 'object') {
          sentimentScore = a.sentiment.score || 0;
          sentimentType = a.sentiment.sentiment || 'neutral';
        } else if (typeof a.sentiment === 'number') {
          sentimentScore = a.sentiment;
          sentimentType = sentimentScore > 0.1 ? 'positive' : sentimentScore < -0.1 ? 'negative' : 'neutral';
        }
      }
      
      const sentimentEmoji = sentimentType === 'positive' ? '😊' : sentimentType === 'negative' ? '😞' : '😐';
      
      card.innerHTML = `
        <h4><a href="${escapeHtml(a.link || '#')}" target="_blank" rel="noreferrer noopener">${escapeHtml(a.title || "(sans titre)")}</a></h4>
        <div class="meta">
          <small>${escapeHtml(a.date ? a.date.slice(0,10) : "")}</small> • 
          <small>Confiance: ${Number(a.confidence||0).toFixed(2)}</small> • 
          <small>${sentimentEmoji} ${sentimentType} (${sentimentScore.toFixed(2)})</small>
        </div>
        <p>${escapeHtml((a.summary || "").substring(0, 200))}${a.summary && a.summary.length > 200 ? '...' : ''}</p>
        <div class="themes">${(a.themes||[]).map(t => '<span class="tag">'+escapeHtml(t)+'</span>').join(" ")}</div>
      `;
      container.appendChild(card);
    });
  }

  function renderThemesList() {
    const container = qs("#themesList");
    if (!container) return;
    container.innerHTML = "";
    if (!state.themes.length) {
      container.appendChild(el("div", { class: "loading", html: "Aucun thème détecté." }));
      return;
    }
    state.themes.forEach(t => {
      const row = el("div", { class: "theme-row" });
      row.innerHTML = `<strong>${escapeHtml(t.name)}</strong> — ${t.count} article${plural(t.count)}`;
      container.appendChild(row);
    });
  }

  function renderMetricsUI() {
    const s = state.metrics && state.metrics.summary ? state.metrics.summary : state.summary || {};
    const m_total = qs("#m_total");
    const m_conf = qs("#m_confidence");
    const m_post = qs("#m_posterior");
    const m_corro = qs("#m_corro");
    
    if (m_total) m_total.innerText = (s.total_articles != null) ? s.total_articles : (state.articles.length || 0);
    if (m_conf) m_conf.innerText = (s.avg_confidence != null) ? s.avg_confidence : "—";
    if (m_post) m_post.innerText = (s.avg_posterior != null) ? Number(s.avg_posterior).toFixed(3) : "—";
    if (m_corro) m_corro.innerText = (s.avg_corroboration != null) ? Number(s.avg_corroboration).toFixed(3) : "—";

    const topList = qs("#topThemes");
    if (topList) {
      topList.innerHTML = "";
      const top = (state.metrics && state.metrics.top_themes) ? state.metrics.top_themes : state.themes.map(t => ({name: t.name, total: t.count}));
      top.slice(0, 25).forEach(t => {
        const li = el("li", {}, `${t.name} — ${t.total}`);
        topList.appendChild(li);
      });
    }

    // Sentiment chart
    const buckets = buildSentimentBucketsFromArticles(30);
    renderSentimentChart(Object.keys(buckets), Object.values(buckets).map(v => ({ 
      date: v.date, 
      positive: v.positive, 
      neutral: v.neutral, 
      negative: v.negative 
    })));
  }

  function buildSentimentBucketsFromArticles(days = 30) {
    const map = {};
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = isoDay(d);
      map[key] = { date: key, positive: 0, neutral: 0, negative: 0 };
    }
    state.articles.forEach(a => {
      const day = isoDay(a.date);
      if (!day || !map[day]) return;
      const s = classifySentiment(a.sentiment, a);
      map[day][s] = (map[day][s] || 0) + 1;
    });
    return map;
  }

  function classifySentiment(sentiment, article) {
    if (typeof sentiment === "object" && sentiment.sentiment) {
      return sentiment.sentiment;
    }
    if (typeof sentiment === "number") {
      if (sentiment > 0.1) return "positive";
      if (sentiment < -0.1) return "negative";
      return "neutral";
    }
    if (typeof sentiment === "object" && sentiment.score !== undefined) {
      const score = sentiment.score;
      if (score > 0.1) return "positive";
      if (score < -0.1) return "negative";
      return "neutral";
    }
    return "neutral";
  }

  function renderThemeChart() {
    const ctx = qs("#themeChart");
    if (!ctx) return;
    const labels = state.themes.map(t => t.name).slice(0, 10);
    const data = state.themes.map(t => t.count).slice(0, 10);
    if (state.charts.themeChart) {
      state.charts.themeChart.data.labels = labels;
      state.charts.themeChart.data.datasets[0].data = data;
      state.charts.themeChart.update();
      return;
    }
    try {
      state.charts.themeChart = new Chart(ctx.getContext("2d"), {
        type: "bar",
        data: { labels: labels, datasets: [{ label: "Articles par thème", data: data, backgroundColor: labels.map(l => themeColorFor(l)) }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
    } catch (e) { console.warn("Chart renderThemeChart failed", e); }
  }

  function renderTimelineChart() {
    const ctx = qs("#timelineChart");
    if (!ctx) return;
    const buckets = buildDayCountsFromArticles(30);
    const labels = Object.keys(buckets);
    const data = Object.values(buckets).map(b => b.count);
    if (state.charts.timelineChart) {
      state.charts.timelineChart.data.labels = labels;
      state.charts.timelineChart.data.datasets[0].data = data;
      state.charts.timelineChart.update();
      return;
    }
    try {
      state.charts.timelineChart = new Chart(ctx.getContext("2d"), {
        type: "line",
        data: { labels: labels, datasets: [{ label: "Articles par jour", data: data, fill: true, tension: 0.25, borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)' }] },
        options: { 
          responsive: true, 
          scales: { y: { beginAtZero: true } },
          plugins: {
            zoom: {
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: 'xy'
              },
              pan: {
                enabled: true,
                mode: 'xy'
              }
            }
          }
        }
      });
    } catch (e) { console.warn("Chart renderTimelineChart failed", e); }
  }

  function buildDayCountsFromArticles(days = 30) {
    const today = new Date();
    const map = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = isoDay(d);
      map[key] = { date: key, count: 0 };
    }
    state.articles.forEach(a => {
      const d = isoDay(a.date);
      if (!d || !map[d]) return;
      map[d].count++;
    });
    return map;
  }

  function renderSentimentChart(periods, sentimentData) {
    const canvas = qs("#sentimentChart");
    if (!canvas) return;
    const labels = periods || sentimentData.map(s => s.date);
    const positives = (sentimentData || []).map(s => safeNumber(s.positive, 0));
    const neutrals = (sentimentData || []).map(s => safeNumber(s.neutral, 0));
    const negatives = (sentimentData || []).map(s => safeNumber(s.negative, 0));

    const datasets = [
      { label: "Positive", data: positives, fill: true, tension: 0.2, backgroundColor: "rgba(75,192,192,0.08)", borderColor: "rgba(75,192,192,1)" },
      { label: "Neutre", data: neutrals, fill: true, tension: 0.2, backgroundColor: "rgba(201,203,207,0.06)", borderColor: "rgba(201,203,207,1)" },
      { label: "Négative", data: negatives, fill: true, tension: 0.2, backgroundColor: "rgba(255,99,132,0.06)", borderColor: "rgba(255,99,132,1)" }
    ];

    if (state.charts.sentimentChart) {
      state.charts.sentimentChart.data.labels = labels;
      state.charts.sentimentChart.data.datasets = datasets;
      state.charts.sentimentChart.update();
      return;
    }
    try {
      state.charts.sentimentChart = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: { labels: labels, datasets: datasets },
        options: { responsive: true, interaction: { mode: 'index', intersect: false }, stacked: false }
      });
    } catch (e) { console.warn("renderSentimentChart failed", e); }
  }

  function setMessage(msg) { 
    const m = qs("#messageContainer"); 
    if (!m) return; 
    m.innerText = msg || "";
    m.style.color = msg ? '#ef4444' : '';
    m.style.padding = msg ? '10px' : '0';
  }

  function toCSV(arr) {
    if (!Array.isArray(arr)) return "";
    const headers = ["id","date","title","link","sentiment","confidence","themes","summary"];
    const rows = arr.map(a => headers.map(h => {
      let v = a[h] !== undefined ? a[h] : (h === "themes" ? (Array.isArray(a.themes) ? a.themes.join(";") : "") : "");
      if (v === null || v === undefined) v = "";
      if (typeof v === 'object') v = JSON.stringify(v);
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(","));
    return [headers.join(","), ...rows].join("\n");
  }

  function downloadBlob(blob, filename) { 
    const url = URL.createObjectURL(blob); 
    const a = document.createElement("a"); 
    a.href = url; 
    a.download = filename; 
    document.body.appendChild(a); 
    a.click(); 
    a.remove(); 
    setTimeout(() => URL.revokeObjectURL(url), 1000); 
  }

  function exportData(type = "json") {
    const payload = { 
      generatedAt: new Date().toISOString(), 
      summary: state.summary || {}, 
      metrics: state.metrics || {}, 
      articles: state.articles || [] 
    };
    if (type === "json") {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      downloadBlob(blob, `rss-aggregator-export-${new Date().toISOString().slice(0,10)}.json`);
    } else {
      const csv = toCSV(state.articles || []);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, `rss-aggregator-export-${new Date().toISOString().slice(0,10)}.csv`);
    }
  }

  async function showLearningStats() {
    const modal = qs("#learningStatsModal");
    const container = qs("#modalLearningStats") || qs("#learningStats");
    if (!container) return;
    container.innerHTML = "<div class='loading'>Statistiques d'apprentissage non disponibles (endpoint absent)</div>";
    if (modal) modal.style.display = "block";
  }

  async function loadFeeds() {
    try {
      const json = await apiGET("/feeds");
      const container = qs("#feedsList");
      if (!container) return;
      if (Array.isArray(json) && json.length > 0) {
        container.innerHTML = json.map(url => `<div class="feed-item" style="padding: 10px; border-bottom: 1px solid #e9ecef;">${escapeHtml(url)}</div>`).join("");
      } else {
        container.innerHTML = "<div class='loading'>Aucun flux RSS configuré.</div>";
      }
    } catch (e) { 
      const c = qs("#feedsList"); 
      if (c) c.innerHTML = "<div class='loading'>Erreur chargement flux.</div>"; 
    }
  }

  async function loadThemes() {
    try {
      const json = await apiGET("/themes");
      const container = qs("#themesList");
      if (!container) return;
      if (Array.isArray(json) && json.length > 0) {
        container.innerHTML = "";
        json.forEach(t => {
          const node = el("div", { class: "theme-row" });
          node.innerHTML = `<strong>${escapeHtml(t.name)}</strong> — ${(t.keywords || []).join(', ')}`;
          container.appendChild(node);
        });
      } else {
        computeThemesFromArticles();
      }
    } catch (e) { 
      computeThemesFromArticles(); 
    }
  }

  async function manualRefresh() {
    const btn = qs("#refreshBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⏳ Rafraîchissement...";
    }
    
    setMessage("Rafraîchissement manuel en cours...");
    try {
      await apiPOST("/refresh", {});
      await Promise.all([loadArticles(), loadFeeds(), loadThemes()]);
      await loadMetrics();
      renderTimelineChart();
      renderThemeChart();
      renderMetricsUI();
      setMessage("Mise à jour terminée !");
      const lu = qs("#lastUpdate");
      if (lu) lu.innerText = "Dernière mise à jour: " + new Date().toLocaleString();
    } catch (e) {
      console.error("manualRefresh failed", e);
      setMessage("Erreur lors du rafraîchissement: " + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "🔄 Générer";
      }
      setTimeout(() => setMessage(""), 5000);
    }
  }

  function startAutoRefresh() { 
    stopAutoRefresh(); 
    if (!state.autoRefresh) return; 
    state.timers.autoRefresh = setInterval(() => manualRefresh().catch(() => {}), state.refreshIntervalMs); 
  }
  
  function stopAutoRefresh() { 
    if (state.timers.autoRefresh) clearInterval(state.timers.autoRefresh); 
    state.timers.autoRefresh = null; 
  }

  window.showTab = function (target, ev) {
    const mapping = { 
      analysis: "#analysisTab", trends: "#trendsTab", metrics: "#metricsTab", 
      sentiment: "#sentimentTab", learning: "#learningTab", feeds: "#feedsTab", 
      themes: "#themesTab", articles: "#articlesTab" 
    };
    const sel = mapping[target] || `#${target}Tab`;
    const tabs = qsa(".tab");
    tabs.forEach(t => t.classList.remove("active"));
    const elms = tabs.filter(t => {
      try {
        return (t.getAttribute("onclick") || "").includes("'" + target + "'");
      } catch (e) { return false; }
    });
    if (elms.length) elms[0].classList.add("active");
    const sections = qsa(".tab-content");
    sections.forEach(s => s.classList.remove("active"));
    const targetSection = qs(sel);
    if (targetSection) targetSection.classList.add("active");
    
    if (target === "metrics") loadMetrics().then(() => renderMetricsUI()).catch(() => {});
    if (target === "analysis") { renderThemeChart(); renderTimelineChart(); }
    if (target === "feeds") loadFeeds();
    if (target === "themes") loadThemes();
  };

  function attachUIBindings() {
    const jsonBtn = qs(".export-btn.json");
    const csvBtn = qs(".export-btn.csv");
    const statsBtn = qs(".export-btn.stats");
    if (jsonBtn) jsonBtn.addEventListener("click", () => exportData("json"));
    if (csvBtn) jsonBtn.addEventListener("click", () => exportData("csv"));
    if (statsBtn) statsBtn.addEventListener("click", () => showLearningStats());
    
    const refreshBtn = qs("#refreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", manualRefresh);
    
    const modal = qs("#learningStatsModal");
    if (modal) {
      const close = modal.querySelector(".close");
      if (close) close.addEventListener("click", () => modal.style.display = "none");
      window.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    }
    
    qsa(".tab").forEach(t => {
      t.addEventListener("click", (ev) => {
        const onclick = t.getAttribute("onclick");
        if (onclick) {
          const match = onclick.match(/showTab\(['"]([^'"]+)['"]/);
          if (match) {
            showTab(match[1], ev);
            return;
          }
        }
      });
    });
  }

  async function init() {
    console.log("🚀 Initialisation de l'application...");
    attachUIBindings();
    await Promise.allSettled([loadArticles(), loadThemes(), loadFeeds()]);
    await loadMetrics();
    renderThemeChart();
    renderTimelineChart();
    renderMetricsUI();
    startAutoRefresh();
    console.log("✅ Application initialisée");
  }

  return {
    init, manualRefresh, exportData, showLearningStats, 
    loadArticles, loadMetrics, loadThemes, loadFeeds,
    _state: state
  };
})();

window.addEventListener("load", () => { 
  if (window.app && typeof window.app.init === "function") { 
    window.app.init().catch(err => console.error("app.init failed", err)); 
  } 
});

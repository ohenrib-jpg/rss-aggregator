/* public/app.js
   Version unifiée — Option B (SQL backend)
   - fournit : chargement articles, thèmes, métriques, navigation onglets, exports, apprentissage (placeholders)
   - compatibilité Chart.js
*/

/* global Chart */
window.app = (function () {
  // -------------------------
  // State
  // -------------------------
  const state = {
    apiBase: "/api",
    autoRefresh: true,
    refreshIntervalMs: 300000, // 5 min
    articles: [],        // array of article objects fetched from /api/articles
    themes: [],          // computed themes list [{name, color, count}]
    summary: {},         // from /api/summaries or metrics.summary
    metrics: null,       // full metrics object from /api/metrics
    charts: {
      themeChart: null,
      timelineChart: null,
      sentimentChart: null
    },
    timers: {
      autoRefresh: null
    },
    ui: {}
  };

  // -------------------------
  // Utilities
  // -------------------------
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
    } catch (e) { return null; }
  }
  function plural(n, s = "s") { return n > 1 ? s : ""; }

  // -------------------------
  // API helpers
  // -------------------------
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

  // -------------------------
  // Data loaders
  // -------------------------
  async function loadArticles() {
    setMessage("Chargement des articles...");
    try {
      const json = await apiGET("/articles");
      if (!json) throw new Error("Réponse vide /api/articles");
      const list = json.articles || json.data || [];
      // normalize each article to expected shape
      state.articles = list.map(normalizeArticle);
      // update UI lists that depend on articles
      renderArticlesList();
      computeThemesFromArticles();
      setMessage(""); // clear
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
    // Try to be tolerant with multiple shapes (SQL rows vs json)
    // Expected fields after normalization: id, title, link, date (ISO), themes (array), sentiment, confidence, summary
    const out = {};
    if (!a || typeof a !== "object") return out;
    out.id = a.id || a._id || a.uuid || null;
    out.title = a.title || (a.raw && a.raw.title) || "";
    out.link = a.link || (a.raw && a.raw.link) || "";
    // date: prefer ISO string
    out.date = a.date || a.pubDate || a.published || (a.raw && (a.raw.pubDate || a.raw.date)) || null;
    if (out.date && typeof out.date !== "string") {
      try { out.date = new Date(out.date).toISOString(); } catch (e) {}
    }
    // themes: try multiple locations/formats
    let themes = a.themes || a.detected_themes || a.topics || null;
    if (!themes && a.raw && a.raw.themes) themes = a.raw.themes;
    if (!themes && a.theme) themes = a.theme;
    if (!themes) themes = [];
    if (typeof themes === "string") themes = themes.split(",").map(s => s.trim()).filter(Boolean);
    if (Array.isArray(themes)) {
      out.themes = themes.map(t => (typeof t === "string" ? t : (t.name || t))).filter(Boolean);
    } else if (typeof themes === "object") {
      // object possibly {name:count} or {names:[...]}
      if (Array.isArray(themes.names)) out.themes = themes.names.map(String);
      else out.themes = Object.keys(themes);
    } else out.themes = [];

    // sentiment field(s)
    out.sentiment = a.sentiment || a.tone || a.sentiment_label || (a.raw && a.raw.sentiment) || null;
    // confidence and posterior
    out.confidence = safeNumber(a.confidence, 0);
    out.bayesian_posterior = safeNumber(a.bayesian_posterior, 0);
    out.corroboration_strength = safeNumber(a.corroboration_strength, 0);
    out.summary = a.summary || (a.raw && a.raw.summary) || "";
    return out;
  }

  async function loadMetrics(days = 30) {
    setMessage("Chargement des métriques...");
    try {
      const json = await apiGET(`/metrics?days=${days}`);
      if (!json || !json.success) {
        // if older backend: try /summaries
        if (json && json.metrics) {
          state.metrics = json.metrics;
        } else {
          // fallback to /summaries
          const s = await apiGET("/summaries");
          state.metrics = { summary: s };
        }
      } else {
        state.metrics = json.metrics;
      }
      // update summary from metrics if present
      if (state.metrics && state.metrics.summary) state.summary = state.metrics.summary;
      renderMetricsUI();
      setMessage("");
      return state.metrics;
    } catch (err) {
      console.warn("loadMetrics error -> trying /summaries fallback", err);
      try {
        const s = await apiGET("/summaries");
        state.metrics = { summary: s || {} };
        state.summary = s || {};
        renderMetricsUI();
        setMessage("");
        return state.metrics;
      } catch (err2) {
        console.error("loadMetrics fallback failed", err2);
        setMessage("Erreur lors du chargement des métriques: " + err2.message);
        state.metrics = null;
        renderMetricsUI();
        return null;
      }
    }
  }

  // -------------------------
  // Computations: themes, counts
  // -------------------------
  function computeThemesFromArticles() {
    // aggregate from state.articles
    const counter = new Map();
    state.articles.forEach(a => {
      if (!a.themes || !Array.isArray(a.themes)) return;
      a.themes.forEach(t => {
        if (!t) return;
        const n = String(t).trim();
        counter.set(n, (counter.get(n) || 0) + 1);
      });
    });
    // transform into array, preserve possible color mapping if available in articles (not typical)
    const themes = Array.from(counter.entries()).map(([name, count]) => {
      return { name, count, color: themeColorFor(name) };
    }).sort((a, b) => b.count - a.count);
    state.themes = themes;
    renderThemesList();
    renderThemeChart();
  }

  function themeColorFor(name) {
    // deterministic color for a theme (hash)
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 70% 45%)`;
  }

  // -------------------------
  // Renders: Articles, Themes, Charts, Metrics
  // -------------------------
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
      card.innerHTML = `
        <h4><a href="${escapeHtml(a.link || '#')}" target="_blank" rel="noreferrer noopener">${escapeHtml(a.title || "(sans titre)")}</a></h4>
        <div class="meta"><small>${escapeHtml(a.date ? a.date.slice(0,10) : "")}</small> - <small>Confiance: ${Number(a.confidence||0).toFixed(2)}</small></div>
        <p>${escapeHtml(a.summary || "")}</p>
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
    // summary cards
    const s = state.metrics && state.metrics.summary ? state.metrics.summary : state.summary || {};
    const m_total = qs("#m_total");
    const m_conf = qs("#m_confidence");
    const m_post = qs("#m_posterior");
    const m_corro = qs("#m_corro");
    if (m_total) m_total.innerText = (s.total_articles != null) ? s.total_articles : (state.articles.length || 0);
    if (m_conf) m_conf.innerText = (s.avg_confidence != null) ? Number(s.avg_confidence).toFixed(3) : "—";
    if (m_post) m_post.innerText = (s.avg_posterior != null) ? Number(s.avg_posterior).toFixed(3) : "—";
    if (m_corro) m_corro.innerText = (s.avg_corroboration != null) ? Number(s.avg_corroboration).toFixed(3) : "—";

    // top themes list
    const topList = qs("#topThemes");
    if (topList) {
      topList.innerHTML = "";
      const top = (state.metrics && state.metrics.top_themes) ? state.metrics.top_themes : state.themes.map(t => ({name: t.name, total: t.count}));
      top.slice(0, 25).forEach(t => {
        const li = el("li", {}, `${t.name} — ${t.total}`);
        topList.appendChild(li);
      });
    }

    // sentiment evolution chart render
    if (state.metrics && Array.isArray(state.metrics.sentiment_evolution)) {
      renderSentimentChart(state.metrics.periods || state.metrics.sentiment_evolution.map(s => s.date), state.metrics.sentiment_evolution);
    } else {
      // fallback: compute simple sentiment from articles grouped by day
      const buckets = buildSentimentBucketsFromArticles(30);
      renderSentimentChart(Object.keys(buckets), Object.values(buckets).map(v => ({
        date: v.date, positive: v.positive, neutral: v.neutral, negative: v.negative
      })));
    }
  }

  function buildSentimentBucketsFromArticles(days = 30) {
    // initialize last N days
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
    if (typeof sentiment === "number") {
      if (sentiment > 0.1) return "positive";
      if (sentiment < -0.1) return "negative";
      return "neutral";
    }
    if (!sentiment && article) {
      // try to infer from themes or confidence heuristics (fallback)
      return "neutral";
    }
    const s = String(sentiment || "").toLowerCase();
    if (s.includes("pos") || s.includes("+") || s.includes("positive")) return "positive";
    if (s.includes("neg") || s.includes("-") || s.includes("negative")) return "negative";
    return "neutral";
  }

  // -------------------------
  // Charts
  // -------------------------
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
        data: {
          labels: labels,
          datasets: [{
            label: "Articles par thème",
            data: data,
            backgroundColor: labels.map(l => themeColorFor(l))
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    } catch (e) {
      console.warn("Chart renderThemeChart failed", e);
    }
  }

  function renderTimelineChart() {
    const ctx = qs("#timelineChart");
    if (!ctx) return;
    // Build timeseries: count articles per day for last 30 days
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
        data: {
          labels: labels,
          datasets: [{
            label: "Articles par jour",
            data: data,
            fill: true,
            tension: 0.25
          }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
      });
    } catch (e) {
      console.warn("Chart renderTimelineChart failed", e);
    }
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
    } catch (e) {
      console.warn("renderSentimentChart failed", e);
    }
  }

  // -------------------------
  // UI helpers: messages, loaders
  // -------------------------
  function setMessage(msg) {
    const m = qs("#messageContainer");
    if (!m) return;
    m.innerText = msg || "";
  }
  function escapeHtml(s) {
    if (!s && s !== 0) return "";
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -------------------------
  // Exports
  // -------------------------
  function exportData(type = "json") {
    // Exports the currently loaded articles + metrics
    const payload = {
      generatedAt: new Date().toISOString(),
      summary: state.summary || {},
      metrics: state.metrics || {},
      articles: state.articles || []
    };
    if (type === "json") {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      downloadBlob(blob, `rss-aggregator-export-${new Date().toISOString().slice(0,10)}.json`);
    } else if (type === "csv") {
      const csv = toCSV(state.articles || []);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, `rss-aggregator-export-${new Date().toISOString().slice(0,10)}.csv`);
    }
  }

  function toCSV(arr) {
    if (!Array.isArray(arr)) return "";
    const headers = ["id","date","title","link","sentiment","confidence","bayesian_posterior","corroboration_strength","themes","summary"];
    const rows = arr.map(a => headers.map(h => {
      let v = a[h] !== undefined ? a[h] : (h === "themes" ? (Array.isArray(a.themes) ? a.themes.join(";") : "") : "");
      if (v === null || v === undefined) v = "";
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

  // -------------------------
  // Learning / manual corrections (placeholders)
  // -------------------------
  async function showLearningStats() {
    // Try /api/learning/stats if available; else show placeholder modal content
    const modal = qs("#learningStatsModal");
    const container = qs("#modalLearningStats") || qs("#learningStats");
    if (!container) return;
    container.innerHTML = "<div class='loading'>Chargement des statistiques...</div>";
    try {
      const json = await apiGET("/learning/stats").catch(() => null);
      if (json && json.success) {
        container.innerHTML = `<pre>${escapeHtml(JSON.stringify(json, null, 2))}</pre>`;
      } else {
        container.innerHTML = "<div>Aucune statistique d'apprentissage disponible (endpoint absent).</div>";
      }
    } catch (err) {
      container.innerHTML = "<div>Erreur lors de la lecture des statistiques: " + escapeHtml(err.message) + "</div>";
    }
    // show modal if present
    if (modal) modal.style.display = "block";
  }

  async function refreshLearningStats() {
    return showLearningStats();
  }

  async function learnFromCorrection() {
    // Collect fields from DOM if present
    const text = qs("#learningText") ? qs("#learningText").value : "";
    const scoreEl = qs("#expectedScore");
    const score = scoreEl ? Number(scoreEl.value) : 0;
    const out = qs("#learningResult");
    if (out) out.innerHTML = "Envoi en cours...";
    try {
      const resp = await apiPOST("/learning/teach", { text, score }).catch(() => ({ success: false }));
      if (resp && resp.success) {
        if (out) out.innerHTML = "Apprentissage OK";
      } else {
        if (out) out.innerHTML = "Service d'apprentissage indisponible (endpoint absent).";
      }
    } catch (err) {
      if (out) out.innerHTML = "Erreur: " + escapeHtml(err.message);
    }
  }

  async function resetLearning() {
    if (!confirm("Réinitialiser les données d'apprentissage ?")) return;
    try {
      const r = await apiPOST("/learning/reset").catch(() => ({ success: false }));
      alert((r && r.success) ? "Réinitialisation effectuée." : "Impossible de réinitialiser (endpoint absent).");
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  }

  // -------------------------
  // Feeds & Themes actions (simple wrappers)
  // -------------------------
  async function addFeed() {
    const urlEl = qs("#feedUrl");
    if (!urlEl || !urlEl.value) return alert("Entrez une URL de flux.");
    try {
      const resp = await apiPOST("/feeds/add", { url: urlEl.value }).catch(() => ({ success: false }));
      if (resp && resp.success) {
        alert("Flux ajouté.");
        loadFeeds();
      } else alert("Impossible d'ajouter le flux (endpoint absent).");
    } catch (e) { alert("Erreur: " + e.message); }
  }

  async function loadFeeds() {
    try {
      const json = await apiGET("/feeds").catch(() => null);
      const container = qs("#feedsList");
      if (!container) return;
      if (json && json.success && Array.isArray(json.feeds)) {
        container.innerHTML = json.feeds.map(f => `<div>${escapeHtml(f.url)}</div>`).join("");
      } else {
        container.innerHTML = "<div class='loading'>Aucun flux (ou endpoint absent).</div>";
      }
    } catch (e) {
      const c = qs("#feedsList");
      if (c) c.innerHTML = "<div class='loading'>Erreur chargement flux.</div>";
    }
  }

  async function addTheme() {
    const nameEl = qs("#themeName");
    const keywordsEl = qs("#themeKeywords");
    const colorEl = qs("#themeColor");
    if (!nameEl || !keywordsEl) return alert("Formulaire thème incomplet.");
    const payload = { name: nameEl.value, keywords: keywordsEl.value, color: colorEl ? colorEl.value : null };
    try {
      const resp = await apiPOST("/themes/add", payload).catch(() => ({ success: false }));
      if (resp && resp.success) {
        alert("Thème créé.");
        loadThemes();
      } else alert("Impossible de créer le thème (endpoint absent).");
    } catch (e) {
      alert("Erreur: " + e.message);
    }
  }

  async function loadThemes() {
    // Try to fetch themes from /themes, else use computed themes from articles
    try {
      const json = await apiGET("/themes").catch(() => null);
      if (json && json.success && Array.isArray(json.themes)) {
        // render them into themesList
        const container = qs("#themesList");
        if (container) {
          container.innerHTML = "";
          json.themes.forEach(t => {
            const node = el("div", {}, `${t.name} — ${t.description || ""}`);
            container.appendChild(node);
          });
        }
      } else {
        computeThemesFromArticles();
      }
    } catch (e) {
      computeThemesFromArticles();
    }
  }

  // -------------------------
  // Controls: manual refresh / auto refresh
  // -------------------------
  async function manualRefresh() {
    setMessage("Rafraîchissement manuel en cours...");
    try {
      // optionally trigger server refresh job
      try { await apiPOST("/refresh", {}); } catch(e) { /* ignore if not supported */ }
      // load data
      await Promise.all([loadArticles(), loadMetrics()]);
      // update charts
      renderTimelineChart();
      renderThemeChart();
      renderMetricsUI();
      setMessage("Mise à jour terminée.");
      // update lastUpdate display if present
      const lu = qs("#lastUpdate");
      if (lu) lu.innerText = "Dernière mise à jour: " + new Date().toLocaleString();
    } catch (e) {
      console.error("manualRefresh failed", e);
      setMessage("Erreur lors du rafraîchissement: " + e.message);
    } finally {
      setTimeout(() => setMessage(""), 3000);
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

  // -------------------------
  // Navigation / tabs
  // -------------------------
  window.showTab = function (target, ev) {
    // global function used by HTML onclick attributes
    const mapping = {
      analysis: "#analysisTab",
      trends: "#trendsTab",
      metrics: "#metricsTab",
      sentiment: "#sentimentTab",
      learning: "#learningTab",
      feeds: "#feedsTab",
      themes: "#themesTab",
      articles: "#articlesTab"
    };
    const sel = mapping[target] || `#${target}Tab`;
    // set active class on .tab elements
    const tabs = qsa(".tab");
    tabs.forEach(t => t.classList.remove("active"));
    // find clicked tab element by text or target (best-effort)
    const elms = tabs.filter(t => {
      try {
        // the HTML uses onclick="showTab('metrics', event)" and shows glyphs; we find by onclick attribute or innerText
        return (t.getAttribute("onclick") || "").includes("'" + target + "'") || (t.textContent || "").toLowerCase().includes(target.toLowerCase());
      } catch (e) { return false; }
    });
    if (elms.length) elms[0].classList.add("active");
    // hide/show sections
    const sections = qsa(".tab-content");
    sections.forEach(s => s.classList.remove("active"));
    const targetSection = qs(sel);
    if (targetSection) targetSection.classList.add("active");
    // if it's metrics, ensure we load metrics
    if (target === "metrics") loadMetrics().then(() => renderMetricsUI()).catch(() => {});
    if (target === "analysis") {
      // ensure charts rendered
      renderThemeChart();
      renderTimelineChart();
    }
  };

  // -------------------------
  // Initialization
  // -------------------------
  function attachUIBindings() {
    // Export buttons
    const jsonBtn = qs(".export-btn.json");
    const csvBtn = qs(".export-btn.csv");
    const statsBtn = qs(".export-btn.stats");
    if (jsonBtn) jsonBtn.addEventListener("click", () => exportData("json"));
    if (csvBtn) csvBtn.addEventListener("click", () => exportData("csv"));
    if (statsBtn) statsBtn.addEventListener("click", () => showLearningStats());

    // Learning controls
    const learnBtn = qs(".learn-btn");
    if (learnBtn) learnBtn.addEventListener("click", learnFromCorrection);
    const resetBtn = qs(".delete");
    if (resetBtn) resetBtn.addEventListener("click", resetLearning);
    const refreshLearningBtn = qs(".refresh");
    // careful: .refresh class used in multiple places; don't override global refresh button binding below.

    // feed / themes
    const addFeedBtn = qs("button[onclick='addFeed()']") || null;
    // safe fallback: find any button in feedsTab with "Ajouter le flux" text
    if (!addFeedBtn) {
      const feedsTab = qs("#feedsTab");
      if (feedsTab) {
        const b = Array.from(feedsTab.querySelectorAll("button")).find(x => (x.textContent||"").toLowerCase().includes("ajouter"));
        if (b) b.addEventListener("click", addFeed);
      }
    } else addFeedBtn.addEventListener("click", addFeed);

    // theme create button
    const themeCreateBtn = qsa("button").find(b => (b.textContent || "").toLowerCase().includes("créer le thème") || (b.textContent || "").toLowerCase().includes("créer"));
    if (themeCreateBtn) themeCreateBtn.addEventListener("click", addTheme);

    // manual refresh button (specific id refreshBtn)
    const refreshBtn = qs("#refreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", manualRefresh);

    // modal close for learning modal
    const modal = qs("#learningStatsModal");
    if (modal) {
      const close = modal.querySelector(".close");
      if (close) close.addEventListener("click", () => modal.style.display = "none");
      window.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    }

    // ensure default tab behavior: attach click handlers for .tab elements that have onclick inline (keeps compatibility)
    qsa(".tab").forEach(t => {
      t.addEventListener("click", (ev) => {
        // find onclick attribute like showTab('analysis', event)
        const onclick = t.getAttribute("onclick");
        if (onclick) {
          const match = onclick.match(/showTab\(['"]([^'"]+)['"]/);
          if (match) {
            showTab(match[1], ev);
            return;
          }
        }
        // fallback: use data-target or text
        const text = (t.textContent || "").trim().toLowerCase();
        if (text.includes("analyse")) showTab("analysis");
        else if (text.includes("tendances")) showTab("trends");
        else if (text.includes("métriques") || text.includes("metrics")) showTab("metrics");
        else if (text.includes("sentiment")) showTab("sentiment");
        else if (text.includes("apprentissage") || text.includes("apprendre")) showTab("learning");
        else if (text.includes("flux")) showTab("feeds");
        else if (text.includes("thèmes") || text.includes("themes")) showTab("themes");
        else if (text.includes("articles")) showTab("articles");
      });
    });
  }

  async function init() {
    attachUIBindings();
    // initial loads
    await Promise.allSettled([loadArticles(), loadThemes(), loadMetrics()]);
    // render initial charts
    renderThemeChart();
    renderTimelineChart();
    renderMetricsUI();

    // start auto refresh if enabled
    startAutoRefresh();
  }

  // -------------------------
  // Exposed API
  // -------------------------
  return {
    init,
    manualRefresh,
    exportData,
    showLearningStats,
    refreshLearningStats,
    learnFromCorrection,
    addFeed,
    addTheme,
    loadArticles,
    loadMetrics,
    loadThemes,
    // for tests / console
    _state: state
  };
})(); // end app closure

// Init on load
window.addEventListener("load", () => {
  if (window.app && typeof window.app.init === "function") {
    window.app.init().catch(err => console.error("app.init failed", err));
  }
});

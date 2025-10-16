/* ============================================================
   RSS AGGREGATOR FRONTEND - PostgreSQL version
   ============================================================ */

const app = {
  config: {
    apiBase: "/api",             
    autoRefresh: true,
    refreshInterval: 300000,     
  },

  articles: [],
  themes: [],
  charts: {},
  initialized: false,

  /* -------------------- INITIALISATION -------------------- */
  init() {
    console.log("App initialization started");
    this.cacheDOM();
    this.bindEvents();
    this.loadAll();
    if (this.config.autoRefresh) {
      setInterval(() => this.loadAll(), this.config.refreshInterval);
    }
  },

  cacheDOM() {
    this.dom = {
      refreshBtn: document.getElementById("refresh-btn"),
      themesContainer: document.getElementById("themes-container"),
      articlesContainer: document.getElementById("articles-container"),
      summaryContainer: document.getElementById("summary-container"),
      chartCanvas: document.getElementById("chart-themes"),
    };
  },

  bindEvents() {
    if (this.dom.refreshBtn) {
      this.dom.refreshBtn.addEventListener("click", () => this.manualRefresh());
    }
  },

  /* -------------------- LOADERS -------------------- */
  async loadAll() {
    try {
      await Promise.all([
        this.loadThemes(),
        this.loadArticles(),
        this.loadSummary()
      ]);
      this.updateDashboard();
    } catch (err) {
      console.error("Error loading data:", err);
    }
  },

  async loadThemes() {
    try {
      const res = await fetch(`${this.config.apiBase}/themes`);
      if (!res.ok) throw new Error("Themes fetch failed");
      this.themes = await res.json();
    } catch (err) {
      console.warn("No themes available", err);
      this.themes = [];
    }
  },

  async loadArticles() {
    try {
      const res = await fetch(`${this.config.apiBase}/articles`);
      if (!res.ok) throw new Error("Articles fetch failed");
      const data = await res.json();
      if (data && data.success) {
        this.articles = data.articles || [];
      } else {
        this.articles = [];
      }
    } catch (err) {
      console.error("Error fetching articles:", err);
      this.articles = [];
    }
  },

  async loadSummary() {
    try {
      const res = await fetch(`${this.config.apiBase}/summaries`);
      if (!res.ok) throw new Error("Summary fetch failed");
      const data = await res.json();
      this.summary = data;
    } catch (err) {
      console.warn("Summary unavailable", err);
      this.summary = {};
    }
  },

  /* -------------------- REFRESH -------------------- */
  async manualRefresh() {
    try {
      const res = await fetch(`${this.config.apiBase}/refresh`, { method: "POST" });
      if (res.ok) {
        console.log("Manual refresh triggered");
        await this.loadAll();
      }
    } catch (err) {
      console.error("Manual refresh failed", err);
    }
  },

  /* -------------------- DASHBOARD -------------------- */
  updateDashboard() {
    this.displayThemes();
    this.displayArticles();
    this.displaySummary();
    this.renderChart();
  },

  displayThemes() {
    if (!this.dom.themesContainer) return;
    this.dom.themesContainer.innerHTML = "";
    this.themes.forEach(t => {
      const div = document.createElement("div");
      div.className = "theme-item";
      div.style.borderLeft = `5px solid ${t.color || "#6366f1"}`;
      div.innerHTML = `
        <strong>${t.name}</strong>
        <span class="theme-count">${t.count}</span>
      `;
      this.dom.themesContainer.appendChild(div);
    });
  },

  displayArticles() {
    if (!this.dom.articlesContainer) return;
    this.dom.articlesContainer.innerHTML = "";
    const articles = this.articles.slice(0, 20); // limit
    if (articles.length === 0) {
      this.dom.articlesContainer.innerHTML = "<p>Aucun article disponible.</p>";
      return;
    }
    articles.forEach(a => {
      const card = document.createElement("div");
      card.className = "article-card";
      const confidence = (a.bayesian_posterior || a.confidence || 0).toFixed(2);
      card.innerHTML = `
        <h4>${a.title || "Sans titre"}</h4>
        <p class="meta">${a.source || "Inconnu"} | ${new Date(a.date || a.pubDate).toLocaleString()}</p>
        <p>${a.summary || ""}</p>
        <p class="confidence">Confiance : ${confidence}</p>
      `;
      this.dom.articlesContainer.appendChild(card);
    });
  },

  displaySummary() {
    if (!this.dom.summaryContainer) return;
    const s = this.summary || {};
    this.dom.summaryContainer.innerHTML = `
      <div class="summary-item"><b>Articles total :</b> ${s.total_articles || 0}</div>
      <div class="summary-item"><b>Confiance moyenne :</b> ${(s.avg_confidence || 0).toFixed(2)}</div>
      <div class="summary-item"><b>Fiabilité bayésienne :</b> ${(s.avg_posterior || 0).toFixed(2)}</div>
      <div class="summary-item"><b>Corroboration moyenne :</b> ${(s.avg_corroboration || 0).toFixed(2)}</div>
    `;
  },

  /* -------------------- GRAPHIQUE -------------------- */
renderChart() {
  if (!this.dom.chartCanvas || typeof Chart === "undefined") return;

  const ctx = this.dom.chartCanvas.getContext("2d");
  if (this.charts.main) {
    this.charts.main.destroy();
  }

  const data = this.prepareChartData();
  if (!data || data.dates.length === 0) {
    console.warn("Aucune donnée pour le graphique");
    return;
  }

  this.charts.main = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.dates,
      datasets: data.themes.map(t => ({
        label: t.name,
        data: t.values,
        borderColor: t.color || "#2563eb",
        backgroundColor: "transparent",
        borderWidth: 2,
        tension: 0.35,
        fill: false,
        pointRadius: 2.5,
        pointHoverRadius: 5
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 12,
            color: "#1e293b",
            font: { size: 12, weight: 500 }
          }
        },
        tooltip: {
          backgroundColor: "rgba(30,41,59,0.9)",
          titleFont: { size: 13, weight: "bold" },
          bodyFont: { size: 12 },
          padding: 10,
          displayColors: false
        },
        zoom: {
          zoom: {
            wheel: { enabled: true },     // Zoom molette
            pinch: { enabled: true },     // Zoom tactile
            mode: "xy"
          },
          pan: {
            enabled: true,
            mode: "xy",
            modifierKey: "shift"          // Pan avec SHIFT + drag
          },
          limits: {
            y: { min: 0 }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Date",
            color: "#334155",
            font: { size: 13, weight: "bold" }
          },
          ticks: { color: "#475569" },
          grid: { color: "rgba(148,163,184,0.2)" }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Occurrences par thème",
            color: "#334155",
            font: { size: 13, weight: "bold" }
          },
          ticks: { color: "#475569" },
          grid: { color: "rgba(148,163,184,0.2)" }
        }
      }
    }
  });

  // bouton de réinitialisation du zoom zoom toyoto
  const resetBtn = document.getElementById("resetZoomBtn");
  if (resetBtn) {
    resetBtn.onclick = () => this.charts.main.resetZoom();
  }
}

  prepareChartData() {
    if (!this.articles || this.articles.length === 0) {
      return { dates: [], themes: [] };
    }

    const dateSet = new Set();
    this.articles.forEach(a => {
      const d = new Date(a.date || a.pubDate);
      if (!isNaN(d)) dateSet.add(d.toISOString().split("T")[0]);
    });
    const dates = Array.from(dateSet).sort();

    const themeCounts = {};
    this.articles.forEach(a => {
      const day = new Date(a.date || a.pubDate).toISOString().split("T")[0];
      (a.themes || []).forEach(t => {
        if (!themeCounts[t]) themeCounts[t] = {};
        themeCounts[t][day] = (themeCounts[t][day] || 0) + 1;
      });
    });

    const themeList = Object.keys(themeCounts).slice(0, 8);
    const colorPalette = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#84cc16", "#f43f5e"];

    const themes = themeList.map((t, i) => ({
      name: t,
      color: colorPalette[i % colorPalette.length],
      values: dates.map(d => themeCounts[t][d] || 0)
    }));

    return { dates, themes };
  },
};

/* -------------------- BOOTSTRAP -------------------- */
window.addEventListener("DOMContentLoaded", () => app.init());

// rss_aggregator - app.js (réparé, version NEXTGEN)
// Toutes les requêtes pointent vers /api/...
// Gestion robuste des erreurs, support Chart.js zoom, et fonctions IA côté client pour UX (non-serveur)

const app = {
  config: { apiBase: '/api', autoRefresh: true, refreshInterval: 300000 },
  articles: [], themes: [], summary: {}, charts: {}, initialized: false,

  init() {
    this.cacheDOM(); this.bindEvents(); this.loadAll();
    if (this.config.autoRefresh) setInterval(()=>this.loadAll(), this.config.refreshInterval);
  },

  cacheDOM() {
    this.dom = {
      refreshBtn: document.getElementById('refresh-btn'),
      resetZoomBtn: document.getElementById('resetZoomBtn'),
      themesContainer: document.getElementById('themes-container'),
      articlesContainer: document.getElementById('articles-container'),
      summaryContainer: document.getElementById('summary-container'),
      chartCanvas: document.getElementById('chart-themes')
    };
  },

  bindEvents() {
    if (this.dom.refreshBtn) this.dom.refreshBtn.addEventListener('click', ()=>this.manualRefresh());
    if (this.dom.resetZoomBtn) this.dom.resetZoomBtn.addEventListener('click', ()=>{ if(this.charts.main && this.charts.main.resetZoom) this.charts.main.resetZoom(); });
  },

  async loadAll() {
    // parallelize loaders but keep resilience
    const tasks = [
      this.loadThemes(),
      this.loadArticles(),
      this.loadSummary()
    ];
    const res = await Promise.allSettled(tasks);
    res.forEach(r => { if(r.status==='rejected') console.warn('Loader error:', r.reason); });
    this.updateDashboard();
  },

  // Generic fetch helper that verifies JSON and returns parsed JSON or throws
  async _fetchJSON(path, opts) {
    try {
      const resp = await fetch(this.config.apiBase + path, opts);
      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok) {
        const text = await resp.text().catch(()=>null);
        throw new Error(`HTTP ${resp.status} - ${text ? text.slice(0,200) : 'no body'}`);
      }
      if (contentType.indexOf('application/json') === -1) {
        // attempt to parse but likely HTML error page
        const txt = await resp.text().catch(()=>null);
        throw new Error('Expected JSON but got: ' + (txt ? txt.slice(0,300) : 'no body'));
      }
      return await resp.json();
    } catch (e) {
      console.error('Fetch error', path, e);
      throw e;
    }
  },

  async loadThemes() {
    try {
      const data = await this._fetchJSON('/themes');
      // Accept either array or object
      this.themes = Array.isArray(data) ? data : (data.themes || []);
    } catch (e) {
      console.warn('loadThemes fallback to empty', e);
      this.themes = [];
    }
  },

  async loadArticles() {
    try {
      const data = await this._fetchJSON('/articles');
      if (data && data.success && Array.isArray(data.articles)) {
        this.articles = data.articles;
      } else if (Array.isArray(data)) {
        this.articles = data;
      } else {
        console.warn('articles: unexpected payload', data);
        this.articles = [];
      }
    } catch (e) {
      console.warn('loadArticles error', e);
      this.articles = [];
    }
  },

  async loadSummary() {
    try {
      const data = await this._fetchJSON('/summaries');
      this.summary = data || {};
    } catch (e) {
      console.warn('loadSummary error', e);
      this.summary = {};
    }
  },

  manualRefresh() {
    // trigger backend refresh and reload
    fetch(this.config.apiBase + '/refresh', { method: 'POST' })
      .then(r => { if (!r.ok) console.warn('Refresh failed', r.status); return r.json().catch(()=>null); })
      .then(()=>this.loadAll())
      .catch(e=>{ console.error('manualRefresh error', e); this.loadAll(); });
  },

  updateDashboard() {
    this.displayThemes(); this.displayArticles(); this.displaySummary(); this.renderChart();
  },

  displayThemes() {
    const container = this.dom.themesContainer;
    if (!container) return;
    container.innerHTML = '';
    (this.themes||[]).forEach(t=>{
      const div = document.createElement('div');
      div.className = 'theme-item';
      div.style.borderLeft = `5px solid ${t.color||'#6366f1'}`;
      div.innerHTML = `<strong>${t.name}</strong><span class="theme-count">${t.count||0}</span>`;
      container.appendChild(div);
    });
  },

  displayArticles() {
    const container = this.dom.articlesContainer;
    if (!container) return;
    container.innerHTML = '';
    const list = (this.articles||[]).slice(0,30);
    if (list.length===0) { container.innerHTML = '<p>Aucun article disponible.</p>'; return; }
    list.forEach(a=>{
      const el = document.createElement('div');
      el.className = 'article-card';
      const conf = (a.bayesian_posterior||a.confidence||0).toFixed(2);
      el.innerHTML = `<h4>${a.title||'Sans titre'}</h4><p class="meta">${a.source||'Inconnu'} • ${new Date(a.date||a.pubDate||Date.now()).toLocaleString()}</p><p>${a.summary? a.summary.slice(0,300): ''}</p><p class="confidence">Confiance: ${conf}</p>`;
      container.appendChild(el);
    });
  },

  displaySummary() {
    const c = this.dom.summaryContainer;
    if (!c) return;
    const s = this.summary || {};
    c.innerHTML = `
      <div class="summary-item"><b>Articles total :</b> ${s.total_articles||0}</div>
      <div class="summary-item"><b>Confiance moyenne :</b> ${(s.avg_confidence||0).toFixed(2)}</div>
      <div class="summary-item"><b>Bayésien :</b> ${(s.avg_posterior||0).toFixed(2)}</div>
      <div class="summary-item"><b>Corroboration :</b> ${(s.avg_corroboration||0).toFixed(2)}</div>
    `;
  },

  // Simple IA helpers (client-side) - non critiques, pour affichage
  normalize(v,min=0,max=1){ if(v==null) return 0; return Math.max(0, Math.min(1, (v-min)/(max-min))); },
  simpleBayes(prior,likelihoods){ let p=prior||0.5; likelihoods.forEach(l=>{ l=Math.max(0,Math.min(1,l)); const num=p*l; const den=num+(1-p)*(1-l); if(den!==0) p=num/den; }); return p; },

  // Chart handling w/ Chart.js zoom
  prepareChartData() {
    if(!this.articles || this.articles.length===0) return {dates:[], themes:[]};
    const dateSet = new Set();
    this.articles.forEach(a=>{ const d=new Date(a.date||a.pubDate); if(!isNaN(d)) dateSet.add(d.toISOString().split('T')[0]); });
    const dates = Array.from(dateSet).sort();
    const counts = {};
    this.articles.forEach(a=>{ const day=new Date(a.date||a.pubDate).toISOString().split('T')[0]; (a.themes||[]).forEach(t=>{ counts[t]=counts[t]||{}; counts[t][day]=(counts[t][day]||0)+1; }); });
    const themeNames = Object.keys(counts).slice(0,8);
    const palette = ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4','#a855f7','#84cc16','#f43f5e'];
    const themes = themeNames.map((t,i)=>({ name: t, color: palette[i%palette.length], values: dates.map(d=>counts[t][d]||0) }));
    return { dates, themes };
  },

  renderChart() {
    if(!this.dom.chartCanvas || typeof Chart==='undefined') return;
    const ctx = this.dom.chartCanvas.getContext('2d');
    if(this.charts.main) try{ this.charts.main.destroy(); }catch(e){}
    const data = this.prepareChartData();
    if(!data.dates || data.dates.length===0){ console.warn('No chart data'); return; }
    this.charts.main = new Chart(ctx, {
      type: 'line',
      data: { labels: data.dates, datasets: data.themes.map(t=>({ label: t.name, data: t.values, borderColor: t.color, backgroundColor: 'transparent', tension:0.3, pointRadius:2 })) },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'nearest', intersect:false },
        plugins:{
          legend:{ position:'bottom' },
          tooltip:{ mode:'index', intersect:false },
          zoom:{
            zoom:{ wheel:{enabled:true}, pinch:{enabled:true}, mode:'xy' },
            pan:{ enabled:true, mode:'xy', modifierKey:'shift' },
            limits:{ y:{min:0} }
          }
        },
        scales:{ x:{ title:{display:true,text:'Date'} }, y:{ beginAtZero:true, title:{display:true,text:'Occurrences'} } }
      }
    });
    // reset button hookup
    if(this.dom.resetZoomBtn) this.dom.resetZoomBtn.onclick = ()=>{ if(this.charts.main && this.charts.main.resetZoom) this.charts.main.resetZoom(); };
  }
};

// initialise au DOM ready
document.addEventListener('DOMContentLoaded', ()=>app.init());
// expose pour debug
window.app = app;

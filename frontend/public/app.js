// Simple frontend bridge to backend /api endpoints
document.addEventListener('DOMContentLoaded', () => {
  const articlesContainer = document.getElementById('articles-container');
  const themesSelect = document.getElementById('themes-select') || createThemesUI();
  const feedsList = document.getElementById('feeds-list') || createFeedsUI();

  // Fetch and display recent articles
  async function loadArticles() {
    try {
      const res = await fetch('/api/articles');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      articlesContainer.innerHTML = '';
      data.slice(0,20).forEach(a => {
        const el = document.createElement('div');
        el.className = 'article';
        el.innerHTML = `<a href="${a.link}" target="_blank" rel="noopener">${a.title}</a>
                        <div class="meta">${a.source || ''} — ${new Date(a.pubDate || a.isoDate || Date.now()).toLocaleString()}</div>
                        <p>${(a.contentSnippet || '').slice(0,300)}</p>`;
        articlesContainer.appendChild(el);
      });
    } catch (e) {
      console.error('loadArticles error', e);
      articlesContainer.innerText = 'Impossible de charger les articles : ' + e.message;
    }
  }

  // Load themes
  async function loadThemes() {
    try {
      const res = await fetch('/api/themes');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      populateThemes(data);
    } catch (e) {
      console.warn('loadThemes', e);
    }
  }

  function populateThemes(themes) {
    // themes: array of {name:..., enabled:...}
    themesSelect.innerHTML = '';
    (themes || []).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name || t;
      opt.innerText = t.name || t;
      themesSelect.appendChild(opt);
    });
  }

  // Load feeds
  async function loadFeeds() {
    try {
      const res = await fetch('/api/feeds');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      populateFeeds(data);
    } catch (e) {
      console.warn('loadFeeds', e);
    }
  }

  function populateFeeds(feeds) {
    feedsList.innerHTML = '';
    (feeds || []).forEach(f => {
      const li = document.createElement('li');
      li.innerText = (f.title || '') + ' — ' + (f.url || f);
      feedsList.appendChild(li);
    });
  }

  // Create minimal UI containers if not present
  function createThemesUI() {
    const aside = document.querySelector('aside') || document.body;
    const div = document.createElement('div');
    div.innerHTML = '<h3>Thèmes</h3><select id="themes-select" size="6" style="width:100%"></select>';
    aside.appendChild(div);
    return div.querySelector('#themes-select');
  }

  function createFeedsUI() {
    const aside = document.querySelector('aside') || document.body;
    const div = document.createElement('div');
    div.innerHTML = '<h3>Flux RSS</h3><ul id="feeds-list"></ul>';
    aside.appendChild(div);
    return div.querySelector('#feeds-list');
  }

  // Initial loads
  loadArticles();
  loadThemes();
  loadFeeds();

  // Periodic refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadArticles();
      loadFeeds();
    });
  }
});
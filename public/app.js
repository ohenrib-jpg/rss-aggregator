// Client-side UI script for GEOPOL frontend
// Provides simple tabbing, modals, and API calls to backend endpoints.
// Designed to replace a server-side file accidentally placed in public/

(function(){
  // Helper: show a tab by id (analysis, metrics, sentiment, learning, feeds, themes, articles)
  window.showTab = function(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    // set active on tab element matching text or data attribute
    const tabElems = Array.from(document.querySelectorAll('.tab')).filter(el => {
      return (el.getAttribute('data-tab') === tab) || (el.textContent.toLowerCase().includes(tab));
    });
    if (tabElems.length) tabElems[0].classList.add('active');
    const content = document.getElementById(tab + 'Tab') || document.getElementById(tab);
    if (content) content.classList.add('active');
  };

  // Show AI config modal
  window.showAIConfig = function() {
    const modal = document.getElementById('aiConfigModal');
    if (modal) modal.style.display = 'block';
  };

  // Generic modal controls
  window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  };
  window.showAddFeedModal = function() { const m = document.getElementById('addFeedModal'); if(m) m.style.display='block'; };
  window.showAddThemeModal = function() { const m = document.getElementById('addThemeModal'); if(m) m.style.display='block'; };

  // API helpers
  async function api(path, method='GET', body=null) {
    const opts = { method, headers: { 'Accept':'application/json' } };
    if (body) { opts.headers['Content-Type']='application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(path, opts);
    if (!res.ok) throw new Error('API error '+res.status);
    return res.json().catch(()=>null);
  }

  // Add new feed from modal inputs
  window.addNewFeed = async function() {
    try {
      const url = document.getElementById('newFeedUrl')?.value || '';
      const title = document.getElementById('newFeedTitle')?.value || '';
      if (!url) return alert('Veuillez entrer l\'URL du flux');
      await api('/api/feeds', 'POST', { url, title });
      window.closeModal('addFeedModal');
      alert('Flux ajouté — recharge en cours');
      await loadFeedsManager();
    } catch (e) { console.error(e); alert('Erreur ajout flux: '+e.message); }
  };

  window.addNewTheme = async function() {
    try {
      const name = document.getElementById('newThemeName')?.value || '';
      const desc = document.getElementById('newThemeDesc')?.value || '';
      if (!name) return alert('Nom du thème requis');
      await api('/api/themes', 'POST', { name, description: desc });
      window.closeModal('addThemeModal');
      alert('Thème ajouté');
      await loadThemesManager();
    } catch (e) { console.error(e); alert('Erreur ajout thème: '+e.message); }
  };

  window.exportFeeds = async function() {
    try {
      const data = await api('/api/feeds');
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'feeds_export.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); alert('Erreur export: '+e.message); }
  };

  // Load themes manager list and top themes
  window.loadThemesManager = async function() {
    try {
      const themes = await api('/api/themes');
      const ul = document.getElementById('topThemes');
      if (ul) {
        ul.innerHTML = '';
        themes.slice(0,20).forEach(t => {
          const li = document.createElement('li');
          li.textContent = (t.name || t.title || t.id) + (t.count ? ' ('+t.count+')' : '');
          ul.appendChild(li);
        });
      }
      // populate manager table if exists
      const mgr = document.getElementById('themesManagerList');
      if (mgr && Array.isArray(themes)) {
        mgr.innerHTML = themes.map(t=>`<tr><td>${t.name||t.id}</td><td>${t.description||''}</td></tr>`).join('');
      }
    } catch(e){ console.error(e); }
  };

  // Load feeds manager
  window.loadFeedsManager = async function() {
    try {
      const feeds = await api('/api/feeds');
      const list = document.getElementById('feedsManagerList');
      if (list) {
        list.innerHTML = feeds.map(f=>`<tr><td>${f.title||''}</td><td>${f.url||''}</td></tr>`).join('');
      }
    } catch(e){ console.error(e); }
  };

  // On DOM ready, wire up simple handlers and load initial data
  document.addEventListener('DOMContentLoaded', function() {
    // ensure first tab active
    window.showTab('analysis');
    // load themes and feeds
    window.loadThemesManager();
    window.loadFeedsManager();
    // close modals when clicking outside content
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('click', (ev)=>{ if (ev.target === m) m.style.display='none'; });
    });
  });

})();
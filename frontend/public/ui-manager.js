
// ui-manager.js - helper functions for CRUD operations
async function apiFetch(path, opts={}){
  opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {});
  try{
    const res = await fetch(path, opts);
    const text = await res.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }catch(e){ data = text; }
    if(!res.ok){
      throw {status: res.status, body: data};
    }
    return data;
  }catch(e){
    console.error("apiFetch error", e);
    throw e;
  }
}

function showNotice(container, text, type="success"){
  const el = document.createElement('div');
  el.className = 'notice ' + (type==='error' ? 'error' : 'success');
  el.innerText = text;
  container.prepend(el);
  setTimeout(()=> el.remove(), 6000);
}

// Themes UI
async function loadThemesInto(selectEl){
  const data = await apiFetch('/api/themes');
  selectEl.innerHTML = '<option value="">--aucun--</option>';
  (data||[]).forEach(t=>{
    const o = document.createElement('option');
    o.value = t.id; o.text = t.name; selectEl.appendChild(o);
  });
  return data;
}

async function refreshThemesTable(tableBody, noticeBox){
  const data = await apiFetch('/api/themes');
  tableBody.innerHTML = '';
  (data||[]).forEach(t=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${t.name}</td>
      <td>${t.keywords||''}</td>
      <td>${t.enabled? 'Oui':'Non'}</td>
      <td class="actions">
        <button class="btn btn-ghost" onclick="editTheme(${t.id})">✏️</button>
        <button class="btn btn-danger" onclick="deleteTheme(${t.id})">🗑</button>
        <button class="btn btn-primary" onclick="toggleTheme(${t.id}, ${t.enabled? 'false':'true'})">${t.enabled? 'Désactiver':'Activer'}</button>
      </td>`;
    tableBody.appendChild(tr);
  });
}

async function createThemeFromForm(form, noticeBox){
  const name = form.querySelector('[name=name]').value.trim();
  const keywords = form.querySelector('[name=keywords]').value.trim();
  if(!name){ showNotice(noticeBox, 'Nom requis', 'error'); return; }
  const body = {name, keywords, enabled: true};
  try{
    await apiFetch('/api/themes', {method:'POST', body: JSON.stringify(body)});
    showNotice(noticeBox, 'Thème créé');
    form.reset();
    await refreshThemesTable(document.getElementById('themes-tbody'), noticeBox);
    await refreshFeedsTable(document.getElementById('feeds-tbody'), noticeBox);
  }catch(e){ showNotice(noticeBox, 'Erreur création thème', 'error'); }
}

window.editTheme = async function(id){
  const data = await apiFetch('/api/themes');
  const t = data.find(x=>x.id===id);
  const form = document.getElementById('theme-form');
  form.querySelector('[name=id]').value = t.id;
  form.querySelector('[name=name]').value = t.name;
  form.querySelector('[name=keywords]').value = t.keywords||'';
}

async function updateThemeFromForm(form, noticeBox){
  const id = form.querySelector('[name=id]').value;
  if(!id) return showNotice(noticeBox, 'No id', 'error');
  const name = form.querySelector('[name=name]').value.trim();
  const keywords = form.querySelector('[name=keywords]').value.trim();
  try{
    await apiFetch('/api/themes/' + id, {method:'PUT', body: JSON.stringify({name, keywords})});
    showNotice(noticeBox, 'Thème mis à jour');
    form.reset();
    await refreshThemesTable(document.getElementById('themes-tbody'), noticeBox);
    await refreshFeedsTable(document.getElementById('feeds-tbody'), noticeBox);
  }catch(e){ showNotice(noticeBox, 'Erreur update', 'error'); }
}

async function deleteTheme(id){
  if(!confirm('Supprimer ce thème ?')) return;
  try{
    await apiFetch('/api/themes/' + id, {method:'DELETE'});
    await refreshThemesTable(document.getElementById('themes-tbody'), document.getElementById('themes-notice'));
    await refreshFeedsTable(document.getElementById('feeds-tbody'), document.getElementById('feeds-notice'));
  }catch(e){ alert('Erreur suppression'); }
}

async function toggleTheme(id, toState){
  try{
    await apiFetch('/api/themes/' + id, {method:'PUT', body: JSON.stringify({enabled: toState})});
    await refreshThemesTable(document.getElementById('themes-tbody'), document.getElementById('themes-notice'));
  }catch(e){ alert('Erreur'); }
}

// Feeds UI
async function refreshFeedsTable(tableBody, noticeBox){
  const data = await apiFetch('/api/feeds');
  tableBody.innerHTML = '';
  (data||[]).forEach(f=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${f.title||''}</td>
      <td><a href="${f.url}" target="_blank" rel="noopener">${f.url}</a></td>
      <td>${f.theme_id||''}</td>
      <td>${f.enabled? 'Oui':'Non'}</td>
      <td class="actions">
        <button class="btn btn-ghost" onclick="editFeed(${f.id})">✏️</button>
        <button class="btn btn-danger" onclick="deleteFeed(${f.id})">🗑</button>
      </td>`;
    tableBody.appendChild(tr);
  });
}

window.editFeed = async function(id){
  const data = await apiFetch('/api/feeds');
  const f = data.find(x=>x.id===id);
  const form = document.getElementById('feed-form');
  form.querySelector('[name=id]').value = f.id;
  form.querySelector('[name=title]').value = f.title||'';
  form.querySelector('[name=url]').value = f.url||'';
  form.querySelector('[name=theme_id]').value = f.theme_id||'';
  form.querySelector('[name=enabled]').checked = !!f.enabled;
}

async function createFeedFromForm(form, noticeBox){
  const title = form.querySelector('[name=title]').value.trim();
  const url = form.querySelector('[name=url]').value.trim();
  const theme_id = form.querySelector('[name=theme_id]').value || null;
  const enabled = form.querySelector('[name=enabled]').checked;
  if(!url){ showNotice(noticeBox, 'URL requise', 'error'); return; }
  try{
    await apiFetch('/api/feeds', {method:'POST', body: JSON.stringify({title, url, theme_id, enabled})});
    showNotice(noticeBox, 'Flux créé');
    form.reset();
    await refreshFeedsTable(document.getElementById('feeds-tbody'), noticeBox);
  }catch(e){ showNotice(noticeBox, 'Erreur création flux', 'error'); }
}

async function updateFeedFromForm(form, noticeBox){
  const id = form.querySelector('[name=id]').value;
  if(!id) return showNotice(noticeBox, 'No id', 'error');
  const title = form.querySelector('[name=title]').value.trim();
  const url = form.querySelector('[name=url]').value.trim();
  const theme_id = form.querySelector('[name=theme_id]').value || null;
  const enabled = form.querySelector('[name=enabled]').checked;
  try{
    await apiFetch('/api/feeds/' + id, {method:'PUT', body: JSON.stringify({title, url, theme_id, enabled})});
    showNotice(noticeBox, 'Flux mis à jour');
    form.reset();
    await refreshFeedsTable(document.getElementById('feeds-tbody'), noticeBox);
  }catch(e){ showNotice(noticeBox, 'Erreur update flux', 'error'); }
}

async function deleteFeed(id){
  if(!confirm('Supprimer ce flux ?')) return;
  try{
    await apiFetch('/api/feeds/' + id, {method:'DELETE'});
    await refreshFeedsTable(document.getElementById('feeds-tbody'), document.getElementById('feeds-notice'));
  }catch(e){ alert('Erreur suppression'); }
}

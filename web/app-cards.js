/* app-cards.js — Grid de cards, botones en columna, sin parpadeo, auto opcional, orden selectable, i18n */

const STATE = {
  items: [],
  sort: { key: 'vmid', dir: 'asc' },
  lang: localStorage.getItem('lxcdash_lang') || 'es',
  auto: localStorage.getItem('lxcdash_auto') === '1',
  interval: Number(localStorage.getItem('lxcdash_auto_ms')) || 15000
};

const UI = {
  t: {
    title: 'LXC Containers',
    refresh: 'Actualizar',
    search: 'Buscar',
    name: 'Nombre',
    vmid: 'VMID',
    status: 'Estado',
    actions: 'Acciones',
    running: 'En ejecución',
    stopped: 'Detenido',
    start: 'Iniciar',
    stop: 'Detener',
    reboot: 'Reiniciar',
    loading: 'Cargando...',
    empty: 'Sin datos',
    error_generic: 'Ha ocurrido un error',
    confirmStart: '¿Iniciar el contenedor {id}?',
    confirmStop: '¿Detener el contenedor {id}?',
    confirmReboot: '¿Reiniciar el contenedor {id}?',
    hintSort: 'Haz clic en “Ordenar por” para cambiar el orden',
    autoRefresh: 'Auto',
    sortBy: 'Ordenar por'
  },
};

const qs  = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (tpl, data) => tpl.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? '');

async function setLanguage(langCode) {
  try {
    const res = await fetch(`/lang/${langCode}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error('lang not found');
    const dict = await res.json();
    UI.t = { ...UI.t, ...dict };
    STATE.lang = langCode;
    localStorage.setItem('lxcdash_lang', langCode);
  } catch {}
  qsa('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (UI.t[key]) el.textContent = UI.t[key];
  });
  const search = qs('#searchInput');
  if (search && UI.t.search) search.placeholder = UI.t.search;
}

function applySort(items) {
  const { key, dir } = STATE.sort;
  const mul = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (key === 'vmid' || key === 'uptime') { va = Number(va); vb = Number(vb); }
    else { va = (va ?? '').toString().toLowerCase(); vb = (vb ?? '').toString().toLowerCase(); }
    if (va < vb) return -1 * mul;
    if (va > vb) return  1 * mul;
    return 0;
  });
}

async function loadContainers() {
  showError(null);
  try {
    const res = await fetch('/api/containers', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    STATE.items = Array.isArray(json?.data) ? json.data : [];
  } catch (err) {
    showError(UI.t.error_generic);
    STATE.items = [];
  }
  renderCards();
}

function createCard(it) {
  const card = document.createElement('div');
  card.className = 'ct-card';
  card.dataset.vmid = String(it.vmid);
  card.dataset.status = it.status || '';

  card.innerHTML = `
    <div class="ct-header">
      <h3 class="ct-title"></h3>
      <div class="ct-sub"></div>
      <div class="ct-status"></div>
    </div>
    <div class="ct-actions"></div>
  `;
  updateCard(card, it, true);
  return card;
}

function updateCard(card, it, first = false) {
  const title = qs('.ct-title', card);
  const sub   = qs('.ct-sub', card);
  const stat  = qs('.ct-status', card);
  const acts  = qs('.ct-actions', card);

  const safeName = it.name || `ct${it.vmid}`;
  if (first || title.textContent !== safeName) title.textContent = safeName;
  const subWanted = `VMID: ${it.vmid}`;
  if (first || sub.textContent !== subWanted) sub.textContent = subWanted;

  const prev = card.dataset.status || '';
  const isRunning = it.status === 'running';
  const statusHTML = isRunning
    ? `<span class="badge ok">${UI.t.running}</span>`
    : `<span class="badge stopped">${UI.t.stopped}</span>`;
  if (first || prev !== it.status) {
    stat.innerHTML = statusHTML;
    card.dataset.status = it.status || '';
    if (!first) {
      stat.classList.add('update-blink');
      setTimeout(() => stat.classList.remove('update-blink'), 600);
    }
  }

  const startDisabled  = isRunning;
  const stopDisabled   = !isRunning;
  const rebootDisabled = !isRunning;

  acts.innerHTML = `
    <button class="btn primary btn-block"   data-act="start"  data-id="${it.vmid}" ${startDisabled  ? 'disabled aria-disabled="true"' : ''}>${UI.t.start}</button>
    <button class="btn secondary btn-block" data-act="stop"   data-id="${it.vmid}" ${stopDisabled   ? 'disabled aria-disabled="true"' : ''}>${UI.t.stop}</button>
    <button class="btn secondary btn-block" data-act="reboot" data-id="${it.vmid}" ${rebootDisabled ? 'disabled aria-disabled="true"' : ''}>${UI.t.reboot}</button>
  `;
}

function renderCards() {
  const wrap = qs('#cards');
  if (!wrap) return;

  const term = (qs('#searchInput')?.value || '').trim().toLowerCase();
  let items = STATE.items.filter(it => {
    if (!term) return true;
    const hay = `${(it.name||'').toLowerCase()} ${String(it.vmid||'')}`;
    return hay.includes(term);
  });

  items = applySort(items);

  const existing = new Map();
  qsa('.ct-card', wrap).forEach(card => existing.set(card.dataset.vmid, card));

  if (!items.length) {
    wrap.innerHTML = `<div class="placeholder">${UI.t.empty}</div>`;
    return;
  }

  const ph = qs('.placeholder', wrap);
  if (ph) ph.remove();

  const seen = new Set();
  for (const it of items) {
    const key = String(it.vmid);
    let card = existing.get(key);
    if (!card) {
      card = createCard(it);
    } else {
      updateCard(card, it, false);
    }
    seen.add(key);
    wrap.appendChild(card);
  }

  existing.forEach((card, key) => { if (!seen.has(key)) card.remove(); });
}

async function doAction(vmid, action) {
  const btns = qsa(`button[data-id="${vmid}"]`);
  btns.forEach(b => b.disabled = true);
  try {
    const res = await fetch(`/api/containers/${encodeURIComponent(vmid)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, 600));
    await loadContainers();
  } catch {
    showError(UI.t.error_generic);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

function confirmAndRun(vmid, action) {
  let msg = '';
  if (action === 'start')  msg = fmt(UI.t.confirmStart,  { id: vmid });
  if (action === 'stop')   msg = fmt(UI.t.confirmStop,   { id: vmid });
  if (action === 'reboot') msg = fmt(UI.t.confirmReboot, { id: vmid });
  if (!msg || confirm(msg)) doAction(vmid, action);
}

function showError(message) {
  const el = qs('#errorBox');
  if (!el) return;
  if (!message) { el.style.display = 'none'; el.textContent = ''; }
  else { el.style.display = 'block'; el.textContent = message; }
}

function wireEvents() {
  const refreshBtn = qs('#refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadContainers);

  const search = qs('#searchInput');
  if (search) search.addEventListener('input', () => renderCards());

  const langSel = qs('#langSelect');
  if (langSel) {
    langSel.value = STATE.lang;
    langSel.addEventListener('change', (e) => setLanguage(e.target.value).then(renderCards));
  }

  const cards = qs('#cards');
  if (cards) {
    cards.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-act][data-id]');
      if (!btn || btn.disabled) return;
      confirmAndRun(btn.dataset.id, btn.dataset.act);
    });
  }

  const sortKey = qs('#sortKey');
  const sortDir = qs('#sortDir');
  if (sortKey) {
    sortKey.value = STATE.sort.key;
    sortKey.addEventListener('change', () => {
      STATE.sort.key = sortKey.value;
      renderCards();
    });
  }
  if (sortDir) {
    sortDir.textContent = STATE.sort.dir === 'asc' ? '▲' : '▼';
    sortDir.addEventListener('click', () => {
      STATE.sort.dir = STATE.sort.dir === 'asc' ? 'desc' : 'asc';
      sortDir.textContent = STATE.sort.dir === 'asc' ? '▲' : '▼';
      renderCards();
    });
  }

  const autoTgl = qs('#autoRefreshToggle');
  const autoSel = qs('#autoRefreshInterval');
  if (autoTgl) {
    autoTgl.checked = STATE.auto;
    autoTgl.addEventListener('change', () => {
      STATE.auto = autoTgl.checked;
      localStorage.setItem('lxcdash_auto', STATE.auto ? '1' : '0');
      if (STATE.auto) startAutoRefresh(); else stopAutoRefresh();
    });
  }
  if (autoSel) {
    autoSel.value = String(STATE.interval);
    autoSel.addEventListener('change', () => {
      STATE.interval = Number(autoSel.value) || 15000;
      localStorage.setItem('lxcdash_auto_ms', String(STATE.interval));
      if (STATE.auto) startAutoRefresh();
    });
  }
}

let refreshTimer = null;
function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(loadContainers, STATE.interval);
}
function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

document.addEventListener('DOMContentLoaded', async () => {
  wireEvents();
  await setLanguage(STATE.lang);
  await loadContainers();
  if (STATE.auto) startAutoRefresh();
});

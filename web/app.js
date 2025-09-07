/* web/app.js — LXCDash (no flicker: diff de filas, auto opcional, sort por columnas, i18n, acciones) */

/* ========= Global State ========= */
const STATE = {
  items: [],
  sort: { key: 'vmid', dir: 'asc' },
  lang: localStorage.getItem('lxcdash_lang') || 'es',
  auto: localStorage.getItem('lxcdash_auto') === '1',         // auto-refresh apagado por defecto
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
    hintSort: 'Haz clic en los encabezados para ordenar',
    autoRefresh: 'Auto'
  },
};

/* ========= Utils ========= */
const qs  = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (tpl, data) => tpl.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? '');

/* ========= I18N ========= */
async function setLanguage(langCode) {
  try {
    const res = await fetch(`/lang/${langCode}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error('lang not found');
    const dict = await res.json();
    UI.t = { ...UI.t, ...dict };
    STATE.lang = langCode;
    localStorage.setItem('lxcdash_lang', langCode);
  } catch { /* fallbacks */ }

  qsa('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (UI.t[key]) el.textContent = UI.t[key];
  });
  const search = qs('#searchInput');
  if (search && UI.t.search) search.placeholder = UI.t.search;

  updateSortIndicators();
  // no forzamos render aquí para evitar parpadeos innecesarios
}

/* ========= Sorting ========= */
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

function updateSortIndicators() {
  qsa('.sort-indicator').forEach(el => {
    el.classList.remove('active', 'asc', 'desc');
    if (el.dataset.key === STATE.sort.key) el.classList.add('active', STATE.sort.dir);
  });
}

function initSorting() {
  qsa('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (!key) return;
      if (STATE.sort.key === key) STATE.sort.dir = STATE.sort.dir === 'asc' ? 'desc' : 'asc';
      else { STATE.sort.key = key; STATE.sort.dir = 'asc'; }
      updateSortIndicators();
      renderTable(); // reordena suavemente (sin recrear toda la tabla)
    });
  });
  updateSortIndicators();
}

/* ========= Data Fetch ========= */
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
  renderTable(); // diff suave
}

/* ========= Render sin parpadeo (diff por vmid) ========= */
function createRow(it) {
  const tr = document.createElement('tr');
  tr.dataset.vmid = String(it.vmid);
  tr.dataset.status = it.status || '';
  tr.innerHTML = `
    <td data-col="name"></td>
    <td data-col="vmid"></td>
    <td data-col="status"></td>
    <td data-col="actions"></td>
  `;
  updateRow(tr, it, true);
  return tr;
}

function updateRow(tr, it, first = false) {
  const nameTd   = qs('[data-col="name"]', tr);
  const vmidTd   = qs('[data-col="vmid"]', tr);
  const statusTd = qs('[data-col="status"]', tr);
  const actTd    = qs('[data-col="actions"]', tr);

  // Nombre + VMID
  const safeName = it.name || `ct${it.vmid}`;
  if (first || nameTd.textContent !== safeName) nameTd.textContent = safeName;
  if (first || vmidTd.textContent !== String(it.vmid)) vmidTd.textContent = String(it.vmid);

  // Estado (con highlight solo si cambia)
  const prev = tr.dataset.status || '';
  const isRunning = it.status === 'running';
  const statusHTML = isRunning
    ? `<span class="badge ok">${UI.t.running}</span>`
    : `<span class="badge stopped">${UI.t.stopped}</span>`;
  if (first || prev !== it.status) {
    statusTd.innerHTML = statusHTML;
    tr.dataset.status = it.status || '';
    if (!first) { // highlight de cambio
      statusTd.classList.add('update-blink');
      setTimeout(() => statusTd.classList.remove('update-blink'), 600);
    }
  }

  // Botones (reconstruimos solo esta celda; mínimo parpadeo)
  const startDisabled  = isRunning;
  const stopDisabled   = !isRunning;
  const rebootDisabled = !isRunning;

  actTd.innerHTML = `
    <button class="btn primary"   data-act="start"  data-id="${it.vmid}" ${startDisabled  ? 'disabled aria-disabled="true"' : ''}>${UI.t.start}</button>
    <button class="btn secondary" data-act="stop"   data-id="${it.vmid}" ${stopDisabled   ? 'disabled aria-disabled="true"' : ''}>${UI.t.stop}</button>
    <button class="btn secondary" data-act="reboot" data-id="${it.vmid}" ${rebootDisabled ? 'disabled aria-disabled="true"' : ''}>${UI.t.reboot}</button>
  `;
}

function renderTable() {
  const tbody = qs('#tbody');
  if (!tbody) return;

  // Filtro
  const term = (qs('#searchInput')?.value || '').trim().toLowerCase();
  let items = STATE.items.filter(it => {
    if (!term) return true;
    const hay = `${(it.name||'').toLowerCase()} ${String(it.vmid||'')}`;
    return hay.includes(term);
  });

  // Orden
  items = applySort(items);

  // Map de filas existentes
  const existing = new Map();
  qsa('tr[data-vmid]', tbody).forEach(tr => existing.set(tr.dataset.vmid, tr));

  // Si no hay datos
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4">${UI.t.empty}</td></tr>`;
    return;
  }

  // Eliminamos placeholder "Cargando..." si existe
  if (tbody.children.length === 1 && !tbody.firstElementChild.hasAttribute('data-vmid')) {
    tbody.innerHTML = '';
  }

  // Reconciliación: actualizar/crear y reordenar sin limpiar todo
  const seen = new Set();
  for (const it of items) {
    const key = String(it.vmid);
    let tr = existing.get(key);
    if (!tr) {
      tr = createRow(it);
    } else {
      updateRow(tr, it, false);
    }
    seen.add(key);
    // Reordenar: mover la fila a su posición final (appendChild mantiene el nodo, no recrea)
    tbody.appendChild(tr);
  }

  // Eliminar filas que ya no existen
  existing.forEach((tr, key) => { if (!seen.has(key)) tr.remove(); });
}

/* ========= Actions ========= */
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

/* ========= Error banner ========= */
function showError(message) {
  const el = qs('#errorBox');
  if (!el) return;
  if (!message) { el.style.display = 'none'; el.textContent = ''; }
  else { el.style.display = 'block'; el.textContent = message; }
}

/* ========= Event wiring ========= */
function wireEvents() {
  const refreshBtn = qs('#refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadContainers);

  const search = qs('#searchInput');
  if (search) search.addEventListener('input', () => renderTable());

  const langSel = qs('#langSelect');
  if (langSel) {
    langSel.value = STATE.lang;
    langSel.addEventListener('change', (e) => setLanguage(e.target.value));
  }

  const tbody = qs('#tbody');
  if (tbody) {
    tbody.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-act][data-id]');
      if (!btn || btn.disabled) return;
      confirmAndRun(btn.dataset.id, btn.dataset.act);
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
      if (STATE.auto) startAutoRefresh(); // reinicia con nuevo intervalo
    });
  }
}

/* ========= Auto refresh (opcional, sin parpadeo) ========= */
let refreshTimer = null;
function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(loadContainers, STATE.interval);
}
function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

/* ========= Init ========= */
document.addEventListener('DOMContentLoaded', async () => {
  wireEvents();
  initSorting();
  await setLanguage(STATE.lang);
  await loadContainers();
  if (STATE.auto) startAutoRefresh(); // por defecto apagado, solo si el usuario lo enciende
});

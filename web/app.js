/* web/app.js — LXCDash (sortable columns + i18n + actions) */

/* ========= Global State ========= */
const STATE = {
  items: [],
  sort: { key: 'vmid', dir: 'asc' }, // orden inicial
  lang: localStorage.getItem('lxcdash_lang') || 'es',
};

const UI = {
  t: {
    // Fallbacks (se sobrescriben con /lang/<code>.json)
    title: 'LXC Containers',
    refresh: 'Actualizar',
    search: 'Buscar',
    name: 'Nombre',
    vmid: 'VMID',
    status: 'Estado',
    actions: 'Acciones',
    running: 'Encendido',
    stopped: 'Apagado',
    start: 'Iniciar',
    stop: 'Detener',
    reboot: 'Reiniciar',
    loading: 'Cargando...',
    empty: 'Sin datos',
    error_generic: 'Ha ocurrido un error',
    confirmStart: '¿Iniciar el contenedor {id}?',
    confirmStop: '¿Detener el contenedor {id}?',
    confirmReboot: '¿Reiniciar el contenedor {id}?',
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
  } catch {
    // mantén fallbacks si falla
  }
  // Actualiza textos estáticos (data-i18n)
  qsa('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (UI.t[key]) el.textContent = UI.t[key];
  });
  // Actualiza placeholder search si existe
  const search = qs('#searchInput');
  if (search && UI.t.search) search.placeholder = UI.t.search;

  updateSortIndicators(); // por si cambia dirección/indicadores con textos
  renderTable(); // repinta por si hay textos traducidos en celdas
}

/* ========= Sorting ========= */
function applySort(items) {
  const { key, dir } = STATE.sort;
  const mul = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    let va = a[key], vb = b[key];
    // Campos numéricos conocidos
    if (key === 'vmid' || key === 'uptime') {
      va = Number(va);
      vb = Number(vb);
    } else {
      va = (va ?? '').toString().toLowerCase();
      vb = (vb ?? '').toString().toLowerCase();
    }
    if (va < vb) return -1 * mul;
    if (va > vb) return  1 * mul;
    return 0;
  });
}

function updateSortIndicators() {
  qsa('.sort-indicator').forEach(el => {
    el.classList.remove('active', 'asc', 'desc');
    if (el.dataset.key === STATE.sort.key) {
      el.classList.add('active', STATE.sort.dir);
    }
  });
}

function initSorting() {
  qsa('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (!key) return;
      if (STATE.sort.key === key) {
        STATE.sort.dir = STATE.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        STATE.sort.key = key;
        STATE.sort.dir = 'asc';
      }
      updateSortIndicators();
      renderTable();
    });
  });
  updateSortIndicators();
}

/* ========= Data Fetch ========= */
async function loadContainers() {
  showError(null);
  const tbody = qs('#tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="4">${UI.t.loading}</td></tr>`;
  }
  try {
    const res = await fetch('/api/containers', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    STATE.items = Array.isArray(json?.data) ? json.data : [];
  } catch (err) {
    showError(UI.t.error_generic);
    STATE.items = [];
  }
  renderTable();
}

/* ========= Render ========= */
function renderTable() {
  const tbody = qs('#tbody');
  if (!tbody) return;
  const search = qs('#searchInput');
  const term = (search?.value || '').trim().toLowerCase();

  // filtro simple por nombre/vmid
  let items = STATE.items.filter(it => {
    if (!term) return true;
    const hay = [
      (it.name || '').toString().toLowerCase(),
      (it.vmid != null ? String(it.vmid) : '')
    ].join(' ');
    return hay.includes(term);
  });

  items = applySort(items);

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4">${UI.t.empty}</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(it => {
    const statusBadge = it.status === 'running'
      ? `<span class="badge ok">${UI.t.running}</span>`
      : `<span class="badge stopped">${UI.t.stopped}</span>`;
    const safeName = it.name || `ct${it.vmid}`;
    return `
      <tr>
        <td>${safeName}</td>
        <td>${it.vmid}</td>
        <td>${statusBadge}</td>
        <td class="row-actions">
          <button class="btn primary" data-act="start" data-id="${it.vmid}">${UI.t.start}</button>
          <button class="btn secondary" data-act="stop" data-id="${it.vmid}">${UI.t.stop}</button>
          <button class="btn secondary" data-act="reboot" data-id="${it.vmid}">${UI.t.reboot}</button>
        </td>
      </tr>`;
  }).join('');
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
    // pequeño delay para que Proxmox cambie estado
    await new Promise(r => setTimeout(r, 600));
    await loadContainers();
  } catch (e) {
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
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
  } else {
    el.style.display = 'block';
    el.textContent = message;
  }
}

/* ========= Event wiring ========= */
function wireEvents() {
  const refreshBtn = qs('#refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadContainers);

  const search = qs('#searchInput');
  if (search) search.addEventListener('input', () => renderTable());

  const langSel = qs('#langSelect');
  if (langSel) {
    // set initial
    langSel.value = STATE.lang;
    langSel.addEventListener('change', (e) => setLanguage(e.target.value));
  }

  const tbody = qs('#tbody');
  if (tbody) {
    tbody.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-act][data-id]');
      if (!btn) return;
      const act = btn.dataset.act;
      const id  = btn.dataset.id;
      if (!act || !id) return;
      confirmAndRun(id, act);
    });
  }
}

/* ========= Auto refresh (opcional, suave) ========= */
let refreshTimer = null;
function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(loadContainers, 15000); // 15s
}
function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/* ========= Init ========= */
document.addEventListener('DOMContentLoaded', async () => {
  wireEvents();
  initSorting();
  await setLanguage(STATE.lang);
  await loadContainers();
  startAutoRefresh();
});

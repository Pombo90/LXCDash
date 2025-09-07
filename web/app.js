/* app.js — Cards agrupadas por LXC/VM, título con nombre del nodo, sin parpadeos, acciones y i18n */

const STATE = {
  node: null,
  lxc: [],
  vms: [],
  sort: { key: 'vmid', dir: 'asc' },
  lang: localStorage.getItem('lxcdash_lang') || 'es',
  auto: localStorage.getItem('lxcdash_auto') === '1',
  interval: Number(localStorage.getItem('lxcdash_auto_ms')) || 15000,
  collapsed: {
    lxc: localStorage.getItem('lxcdash_collapsed_lxc') === '1' ? true : false,
    vm:  localStorage.getItem('lxcdash_collapsed_vm') === '1' ? true : false,
  }
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
    shutdown: 'Apagar',
    suspend: 'Hibernar',
    loading: 'Cargando...',
    empty: 'Sin datos',
    error_generic: 'Ha ocurrido un error',
    confirmStart: '¿Iniciar {kind} {id}?',
    confirmStop: '¿Detener {kind} {id}?',
    confirmReboot: '¿Reiniciar {kind} {id}?',
    confirmShutdown: '¿Apagar {kind} {id}?',
    confirmSuspend: '¿Hibernar {kind} {id}?',
    hintSort: 'Usa “Ordenar por” para cambiar el orden',
    autoRefresh: 'Auto',
    sortBy: 'Ordenar por'
  },
};

const qs  = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (tpl, data) => tpl.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? '');

/* ========== Language ========== */
async function setLanguage(langCode) {
  try {
    const res = await fetch(`/lang/${langCode}.json`, { cache: 'no-store' });
    if (res.ok) {
      const dict = await res.json();
      UI.t = { ...UI.t, ...dict };
    }
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

/* ========== Node name ========== */
function paintNodeTitle(name) {
  const h1 = qs('#nodeTitle');
  const docTitle = qs('#docTitle');
  if (h1) h1.textContent = name || '—';
  if (docTitle) docTitle.textContent = name ? `Nodo: ${name} · LXCDash` : 'LXCDash';
}
async function loadNode() {
  try {
    const r = await fetch('/api/node', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      if (j?.node) { STATE.node = j.node; paintNodeTitle(STATE.node); return; }
    }
  } catch {}
  // fallbacks
  if (!STATE.node) {
    if (STATE.lxc[0]?.node) STATE.node = STATE.lxc[0].node;
    else if (STATE.vms[0]?.node) STATE.node = STATE.vms[0].node;
    else STATE.node = 'Nodo';
  }
  paintNodeTitle(STATE.node);
}

/* ========== Sorting/Filter ========== */
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
function filterItems(items) {
  const term = (qs('#searchInput')?.value || '').trim().toLowerCase();
  if (!term) return items;
  return items.filter(it => {
    const hay = `${(it.name||'').toLowerCase()} ${String(it.vmid||'')}`;
    return hay.includes(term);
  });
}

/* ========== Fetch ========== */
async function loadData() {
  showError(null);
  try {
    const [lxcRes, vmRes] = await Promise.allSettled([
      fetch('/api/containers', { cache: 'no-store' }),
      fetch('/api/vms', { cache: 'no-store' })
    ]);

    if (lxcRes.status === 'fulfilled' && lxcRes.value.ok) {
      const j = await lxcRes.value.json();
      STATE.lxc = Array.isArray(j?.data) ? j.data : [];
    } else {
      STATE.lxc = [];
    }

    if (vmRes.status === 'fulfilled' && vmRes.value.ok) {
      const j = await vmRes.value.json();
      STATE.vms = Array.isArray(j?.data) ? j.data : [];
    } else {
      STATE.vms = [];
    }
  } catch {
    showError(UI.t.error_generic);
  }

  await loadNode();
  renderGroup('lxc', STATE.lxc);
  renderGroup('vm', STATE.vms);
}

/* ========== Render (cards por grupo) ========== */
function createCard(kind, it) {
  const card = document.createElement('div');
  card.className = 'ct-card';
  card.dataset.vmid = String(it.vmid);
  card.dataset.status = it.status || '';
  card.dataset.kind = kind;

  card.innerHTML = `
    <div class="ct-header">
      <h3 class="ct-title"></h3>
      <div class="ct-sub"></div>
      <div class="ct-status"></div>
    </div>
    <div class="ct-actions"></div>
  `;
  updateCard(card, kind, it, true);
  return card;
}
function updateCard(card, kind, it, first=false) {
  const title = qs('.ct-title', card);
  const sub   = qs('.ct-sub', card);
  const stat  = qs('.ct-status', card);
  const acts  = qs('.ct-actions', card);

  const safeName = it.name || `${kind}${it.vmid}`;
  if (first || title.textContent !== safeName) title.textContent = safeName;
  const subWanted = `VMID: ${it.vmid}`;
  if (first || sub.textContent !== subWanted) sub.textContent = subWanted;

  const prev = card.dataset.status || '';
  const status = it.status || '';
  const isRunning = status === 'running';
  const statusHTML = isRunning
    ? `<span class="badge ok">${UI.t.running}</span>`
    : `<span class="badge stopped">${UI.t.stopped}</span>`;
  if (first || prev !== status) {
    stat.innerHTML = statusHTML;
    card.dataset.status = status;
    if (!first) {
      stat.classList.add('update-blink');
      setTimeout(() => stat.classList.remove('update-blink'), 600);
    }
  }

  // Lógica de botones
  if (kind === 'lxc') {
    const startDisabled  = isRunning;
    const stopDisabled   = !isRunning;
    const rebootDisabled = !isRunning;
    acts.innerHTML = `
      <button class="btn primary btn-block"   data-kind="lxc" data-act="start"  data-id="${it.vmid}" ${startDisabled  ? 'disabled aria-disabled="true"' : ''}>${UI.t.start}</button>
      <button class="btn secondary btn-block" data-kind="lxc" data-act="stop"   data-id="${it.vmid}" ${stopDisabled   ? 'disabled aria-disabled="true"' : ''}>${UI.t.stop}</button>
      <button class="btn secondary btn-block" data-kind="lxc" data-act="reboot" data-id="${it.vmid}" ${rebootDisabled ? 'disabled aria-disabled="true"' : ''}>${UI.t.reboot}</button>
    `;
  } else { // vm
    const startDisabled   = isRunning;
    const shutdownDisabled= !isRunning;
    const suspendDisabled = !isRunning;
    const rebootDisabled  = !isRunning;
    acts.innerHTML = `
      <button class="btn primary btn-block"   data-kind="vm" data-act="start"    data-id="${it.vmid}" ${startDisabled    ? 'disabled aria-disabled="true"' : ''}>${UI.t.start}</button>
      <button class="btn secondary btn-block" data-kind="vm" data-act="shutdown" data-id="${it.vmid}" ${shutdownDisabled ? 'disabled aria-disabled="true"' : ''}>${UI.t.shutdown}</button>
      <button class="btn secondary btn-block" data-kind="vm" data-act="suspend"  data-id="${it.vmid}" ${suspendDisabled  ? 'disabled aria-disabled="true"' : ''}>${UI.t.suspend}</button>
      <button class="btn secondary btn-block" data-kind="vm" data-act="reboot"   data-id="${it.vmid}" ${rebootDisabled   ? 'disabled aria-disabled="true"' : ''}>${UI.t.reboot}</button>
    `;
  }
}
function renderGroup(kind, source) {
  const wrap = qs(kind === 'lxc' ? '#cards-lxc' : '#cards-vm');
  const btn  = qs(kind === 'lxc' ? '#toggleLxc' : '#toggleVm');
  const countEl = qs(kind === 'lxc' ? '#countLxc' : '#countVm');
  if (!wrap || !btn) return;

  countEl.textContent = String(source.length);

  // Collapsed state
  const isCollapsed = STATE.collapsed[kind];
  btn.setAttribute('aria-expanded', String(!isCollapsed));
  btn.parentElement.setAttribute('aria-collapsed', String(isCollapsed));
  wrap.style.display = isCollapsed ? 'none' : 'grid';

  // Si está colapsado, no renderizamos (ahorra trabajo)
  if (isCollapsed) return;

  // Filtro + orden
  let items = filterItems(source);
  items = applySort(items);

  // Map existentes
  const existing = new Map();
  qsa('.ct-card', wrap).forEach(card => existing.set(card.dataset.vmid, card));

  if (!items.length) {
    wrap.innerHTML = `<div class="placeholder">${UI.t.empty}</div>`;
    return;
  }
  // Quitar placeholder si estaba
  const ph = qs('.placeholder', wrap);
  if (ph) ph.remove();

  const seen = new Set();
  for (const it of items) {
    const key = String(it.vmid);
    let card = existing.get(key);
    if (!card) {
      card = createCard(kind, it);
    } else {
      updateCard(card, kind, it, false);
    }
    seen.add(key);
    wrap.appendChild(card);
  }
  // eliminar las que sobran
  existing.forEach((card, key) => { if (!seen.has(key)) card.remove(); });
}

/* ========== Actions ========== */
async function doAction(kind, vmid, action) {
  const btns = qsa(`button[data-id="${vmid}"][data-kind="${kind}"]`);
  btns.forEach(b => b.disabled = true);
  try {
    const res = await fetch(`/${kind === 'lxc' ? 'api/containers' : 'api/vms'}/${encodeURIComponent(vmid)}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, 600));
    await loadData();
  } catch {
    showError(UI.t.error_generic);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}
function confirmAndRun(kind, vmid, action) {
  const kindLabel = (kind === 'lxc') ? 'el contenedor' : 'la VM';
  const msgs = {
    start: UI.t.confirmStart,
    stop: UI.t.confirmStop,
    reboot: UI.t.confirmReboot,
    shutdown: UI.t.confirmShutdown,
    suspend: UI.t.confirmSuspend
  };
  const tpl = msgs[action] || '';
  if (!tpl || confirm(fmt(tpl, { kind: kindLabel, id: vmid }))) {
    doAction(kind, vmid, action);
  }
}

/* ========== Error ========== */
function showError(message) {
  const el = qs('#errorBox');
  if (!el) return;
  if (!message) { el.style.display = 'none'; el.textContent = ''; }
  else { el.style.display = 'block'; el.textContent = message; }
}

/* ========== Events ========== */
function wireEvents() {
  // refresh
  const refreshBtn = qs('#refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadData);

  // search
  const search = qs('#searchInput');
  if (search) search.addEventListener('input', () => {
    renderGroup('lxc', STATE.lxc);
    renderGroup('vm', STATE.vms);
  });

  // idioma
  const langSel = qs('#langSelect');
  if (langSel) {
    langSel.value = STATE.lang;
    langSel.addEventListener('change', e => setLanguage(e.target.value).then(() => {
      renderGroup('lxc', STATE.lxc);
      renderGroup('vm', STATE.vms);
    }));
  }

  // click en acciones (delegado)
  document.body.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-act][data-id][data-kind]');
    if (!btn || btn.disabled) return;
    confirmAndRun(btn.dataset.kind, btn.dataset.id, btn.dataset.act);
  });

  // sort
  const sortKey = qs('#sortKey');
  const sortDir = qs('#sortDir');
  if (sortKey) {
    sortKey.value = STATE.sort.key;
    sortKey.addEventListener('change', () => {
      STATE.sort.key = sortKey.value;
      renderGroup('lxc', STATE.lxc);
      renderGroup('vm', STATE.vms);
    });
  }
  if (sortDir) {
    sortDir.textContent = STATE.sort.dir === 'asc' ? '▲' : '▼';
    sortDir.addEventListener('click', () => {
      STATE.sort.dir = STATE.sort.dir === 'asc' ? 'desc' : 'asc';
      sortDir.textContent = STATE.sort.dir === 'asc' ? '▲' : '▼';
      renderGroup('lxc', STATE.lxc);
      renderGroup('vm', STATE.vms);
    });
  }

  // auto refresh
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

  // plegado/expandido grupos
  const toggles = [
    { btn: '#toggleLxc', key: 'lxc', wrap: '#cards-lxc' },
    { btn: '#toggleVm',  key: 'vm',  wrap: '#cards-vm'  },
  ];
  toggles.forEach(({btn, key, wrap}) => {
    const elBtn = qs(btn);
    const elWrap = qs(wrap);
    if (!elBtn || !elWrap) return;

    const setState = (collapsed) => {
      STATE.collapsed[key] = collapsed;
      localStorage.setItem(`lxcdash_collapsed_${key}`, collapsed ? '1' : '0');
      elBtn.setAttribute('aria-expanded', String(!collapsed));
      elBtn.parentElement.setAttribute('aria-collapsed', String(collapsed));
      elWrap.style.display = collapsed ? 'none' : 'grid';
      if (!collapsed) {
        renderGroup(key, key === 'lxc' ? STATE.lxc : STATE.vms);
      }
    };

    // estado inicial
    setState(STATE.collapsed[key]);

    elBtn.addEventListener('click', () => {
      setState(!STATE.collapsed[key]);
    });
  });
}

/* ========== Auto refresh ========== */
let refreshTimer = null;
function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(loadData, STATE.interval);
}
function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

/* ========== Init ========== */
document.addEventListener('DOMContentLoaded', async () => {
  wireEvents();
  await setLanguage(STATE.lang);
  await loadData();
  if (STATE.auto) startAutoRefresh();
});

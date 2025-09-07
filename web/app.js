const UI = {
  t: {}, lang: 'es',
  setLang(l){ this.lang = l; localStorage.setItem('lang', l); return this.loadLang(l); },
  async loadLang(l){
    const res = await fetch(`lang/${l}.json`);
    this.t = await res.json();
    document.getElementById('title').textContent = this.t.title;
    document.getElementById('thName').textContent = this.t.name;
    document.getElementById('thStatus').textContent = this.t.status;
    document.getElementById('thActions').textContent = this.t.actions;
    document.getElementById('refreshBtn').textContent = this.t.refresh;
    document.getElementById('loading').textContent = this.t.loading;
  },
  msg(html){ const el = document.getElementById('message'); el.innerHTML = html || ''; }
};

async function fetchContainers(){
  try{
    UI.msg('');
    const res = await fetch('/api/containers');
    if(!res.ok) throw new Error('API error');
    const json = await res.json();
    renderTable(json.data || []);
  }catch(e){
    UI.msg(`<span style="color:#ff9b9b">${UI.t.error || 'Error'}</span>`);
  }
}

function renderTable(items){
  const tbody = document.getElementById('tbody');
  if(!items.length){
    tbody.innerHTML = `<tr><td colspan="4">${UI.t.empty || 'Sin datos'}</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(it => {
    const status = it.status === 'running'
      ? `<span class="badge ok">${UI.t.running}</span>`
      : `<span class="badge stopped">${UI.t.stopped}</span>`;
    return `<tr>
      <td>${it.name} <small style="opacity:.6">(${it.vmid})</small></td>
      <td>${it.vmid}</td>
      <td>${status}</td>
      <td class="row-actions">
        <button class="btn primary" data-act="start" data-id="${it.vmid}">${UI.t.start}</button>
        <button class="btn secondary" data-act="stop" data-id="${it.vmid}">${UI.t.stop}</button>
        <button class="btn secondary" data-act="reboot" data-id="${it.vmid}">${UI.t.reboot}</button>
      </td>
    </tr>`;
  }).join('');
}

async function action(vmid, act){
  try{
    UI.msg(UI.t.working || 'Procesando...');
    const res = await fetch(`/api/containers/${vmid}/${act}`, { method:'POST' });
    if(!res.ok) throw new Error('API error');
    UI.msg(`<span style="color:#9af29a">${UI.t.done || 'Hecho'}</span>`);
    setTimeout(fetchContainers, 800);
  }catch(e){
    UI.msg(`<span style="color:#ff9b9b">${UI.t.error || 'Error'}</span>`);
  }
}

document.addEventListener('click', (e)=>{
  const el = e.target.closest('button[data-act]');
  if(!el) return;
  action(el.dataset.id, el.dataset.act);
});

document.getElementById('refreshBtn').addEventListener('click', fetchContainers);

const langSelect = document.getElementById('langSelect');
langSelect.value = localStorage.getItem('lang') || 'es';
langSelect.addEventListener('change', (e)=> UI.setLang(e.target.value).then(fetchContainers));

UI.setLang(langSelect.value).then(fetchContainers);
setInterval(fetchContainers, 5000);

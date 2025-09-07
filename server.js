// /opt/lxcdash/server.js
// API simple para LXCDash: LXC + VM + nombre de nodo

const fs = require('fs');
const path = require('path');
const express = require('express');
const https = require('https');
const axios = require('axios');

const app = express();
app.use(express.json());

// -------- Config --------
const CONFIG_PATHS = [
  path.join(process.cwd(), 'config.json'),
  '/opt/lxcdash/config.json'
];

let config = {
  host: '192.168.1.90',
  port: 8006,
  user: 'root@pam',
  token_id: 'lxcdash',
  token_secret: '',
  verify_tls: false,
  node: '' // opcional; si no se define, se detecta
};

for (const p of CONFIG_PATHS) {
  try {
    if (fs.existsSync(p)) {
      const c = JSON.parse(fs.readFileSync(p, 'utf8'));
      config = { ...config, ...c };
      break;
    }
  } catch (e) {
    console.error('[config] error leyendo', p, e.message);
  }
}

const baseURL = `https://${config.host}:${config.port}/api2/json`;
const httpsAgent = new https.Agent({ rejectUnauthorized: !!config.verify_tls });

const api = axios.create({
  baseURL,
  httpsAgent,
  headers: {
    Authorization: `PVEAPIToken=${config.user}!${config.token_id}=${config.token_secret}`
  },
  timeout: 15000
});

// -------- Helpers --------
async function getNodeName() {
  // Si el usuario lo puso en config, úsalo
  if (config.node && String(config.node).trim()) return config.node;

  // Si no, pregúntale a Proxmox
  const r = await api.get('/nodes');
  const nodes = r.data?.data || [];
  if (!nodes.length) throw new Error('No hay nodos en /nodes');
  // Toma el primero "online", o el primero si ninguno marca estado
  const online = nodes.find(n => n.status === 'online');
  const picked = online || nodes[0];
  return picked.node;
}

function mapLxc(raw) {
  // Campos típicos: { vmid, name, status, node, ... }
  return {
    vmid: raw.vmid,
    name: raw.name || `ct${raw.vmid}`,
    status: raw.status || '',
    node: raw.node
  };
}
function mapVm(raw) {
  // Campos típicos: { vmid, name, status, node, ... }
  return {
    vmid: raw.vmid,
    name: raw.name || `vm${raw.vmid}`,
    status: raw.status || '',
    node: raw.node
  };
}

function sendError(res, err) {
  const msg = err?.response?.data?.errors || err?.response?.data || err?.message || 'error';
  const code = err?.response?.status || 502;
  res.status(code).json({ ok: false, error: msg });
}

// -------- Rutas básicas --------
app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.get('/api/node', async (req, res) => {
  try {
    const node = await getNodeName();
    res.json({ node });
  } catch (err) {
    sendError(res, err);
  }
});

// -------- LXC --------
app.get('/api/containers', async (req, res) => {
  try {
    const node = await getNodeName();
    const r = await api.get(`/nodes/${encodeURIComponent(node)}/lxc`);
    const list = (r.data?.data || []).map(mapLxc);
    // adjunta node si no viene
    list.forEach(x => { if (!x.node) x.node = node; });
    res.json({ data: list });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/containers/:id/start', async (req, res) => {
  try {
    const node = await getNodeName();
    const { id } = req.params;
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(id)}/status/start`);
    res.json({ ok: true, task: r.data });
  } catch (err) {
    sendError(res, err);
  }
});
app.post('/api/containers/:id/stop', async (req, res) => {
  try {
    const node = await getNodeName();
    const { id } = req.params;
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(id)}/status/stop`);
    res.json({ ok: true, task: r.data });
  } catch (err) {
    sendError(res, err);
  }
});
app.post('/api/containers/:id/reboot', async (req, res) => {
  try {
    const node = await getNodeName();
    const { id } = req.params;
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(id)}/status/reboot`);
    res.json({ ok: true, task: r.data });
  } catch (err) {
    sendError(res, err);
  }
});

// -------- QEMU (VM) --------
app.get('/api/vms', async (req, res) => {
  try {
    const node = await getNodeName();
    const r = await api.get(`/nodes/${encodeURIComponent(node)}/qemu`);
    const list = (r.data?.data || []).map(mapVm);
    list.forEach(x => { if (!x.node) x.node = node; });
    res.json({ data: list });
  } catch (err) {
    sendError(res, err);
  }
});

// Acciones VM:
// start:    /nodes/{node}/qemu/{vmid}/status/start
// shutdown: /nodes/{node}/qemu/{vmid}/status/shutdown   (gracioso)
// suspend:  /nodes/{node}/qemu/{vmid}/status/suspend    (query: todisk=1 → hibernar)
// reboot:   /nodes/{node}/qemu/{vmid}/status/reboot
app.post('/api/vms/:id/start', async (req, res) => {
  try {
    const node = await getNodeName();
    const { id } = req.params;
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/status/start`);
    res.json({ ok: true, task: r.data });
  } catch (err) {
    sendError(res, err);
  }
});
app.post('/api/vms/:id/shutdown', async (req, res) => {
  try {
    const node = await getNodeName();
    const { id } = req.params;
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/status/shutdown`);
    res.json({ ok: true, task: r.data });
  } catch (err) {
    sendError(res, err);
  }
});
app.post('/api/vms/:id/suspend', async (req, res) => {
  try {
    const node = await getNodeName();
    const { id } = req.params;
    // Hibernar (to disk). Si quisieras RAM, usa todisk=0.
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/status/suspend`, null, {
      params: { todisk: 1 }
    });
    res.json({ ok: true, task: r.data });
  } catch (err) {
    sendError(res, err);
  }
});
app.post('/api/vms/:id/reboot', async (req, res) => {
  try {
    const node = await getNodeName();
    const { id } = req.params;
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/status/reboot`);
    res.json({ ok: true, task: r.data });
  } catch (err) {
    sendError(res, err);
  }
});

// -------- Static (web) --------
// Sirve /web como raíz (index.html), ajusta si usas nginx para estáticos
app.use('/', express.static(path.join(__dirname, 'web')));

// -------- Start --------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[lxcdash] API escuchando en http://127.0.0.1:${PORT}`);
});

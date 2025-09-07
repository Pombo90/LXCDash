// /opt/lxcdash/server.js
// API para LXCDash: lista LXC + VMs desde /cluster/resources, acciones con resolución de nodo.

const fs = require('fs');
const path = require('path');
const express = require('express');
const https = require('https');
const axios = require('axios');

const app = express();
app.use(express.json());

/* ---------------- Config ---------------- */
const CONFIG_PATHS = [
  path.join(process.cwd(), 'config.json'),
  '/opt/lxcdash/config.json',
];

let config = {
  host: '127.0.0.1',
  port: 8006,
  user: 'root@pam',
  token_id: 'lxcdash',
  token_secret: '',
  verify_tls: false,
  // node: 'proxmox', // opcional: si lo pones, /api/node lo usará directamente
};

for (const p of CONFIG_PATHS) {
  try {
    if (fs.existsSync(p)) {
      const c = JSON.parse(fs.readFileSync(p, 'utf8'));
      config = { ...config, ...c };
      break;
    }
  } catch (e) {
    console.error('[config] Error leyendo', p, e.message);
  }
}

const baseURL = `https://${config.host}:${config.port}/api2/json`;
const httpsAgent = new https.Agent({ rejectUnauthorized: !!config.verify_tls });

const api = axios.create({
  baseURL,
  httpsAgent,
  headers: {
    Authorization: `PVEAPIToken=${config.user}!${config.token_id}=${config.token_secret}`,
  },
  timeout: 15000,
});

const DEBUG = process.env.DEBUG?.toString() === '1';

/* ---------------- Helpers ---------------- */
function logDebug(...args) { if (DEBUG) console.log('[debug]', ...args); }

function sendError(res, err) {
  const msg = err?.response?.data || err?.message || 'error';
  const code = err?.response?.status || 502;
  console.error('[api error]', code, msg);
  res.status(code).json({ ok: false, error: msg });
}

// Mapea un item de /cluster/resources (type=vm) a estructura común
function mapVmOrCt(x) {
  // x.type ∈ { 'qemu', 'lxc' }
  return {
    vmid: x.vmid,
    name: x.name || `${x.type}${x.vmid}`,
    status: x.status || '',
    node: x.node,
    type: x.type,
  };
}

// Lista todos los “VMs” (incluye LXC) del cluster
async function listAllVmLike() {
  const r = await api.get('/cluster/resources', { params: { type: 'vm' } });
  const arr = Array.isArray(r.data?.data) ? r.data.data : [];
  const mapped = arr.map(mapVmOrCt);
  logDebug('vm-like items:', mapped.length);
  return mapped;
}

// Encuentra el nodo para un vmid y tipo (qemu|lxc) consultando el cluster
async function findNodeForId(vmid, type) {
  const all = await listAllVmLike();
  const one = all.find(x => String(x.vmid) === String(vmid) && x.type === type);
  if (!one) throw new Error(`No se encontró ${type} con vmid ${vmid} en el cluster`);
  return one.node;
}

// Nombre de nodo “bonito”
async function getNodeName() {
  if (config.node && String(config.node).trim()) return config.node;
  try {
    const r = await api.get('/nodes');
    const nodes = r.data?.data || [];
    const online = nodes.find(n => n.status === 'online');
    return (online?.node || nodes[0]?.node || 'Nodo');
  } catch {
    return 'Nodo';
  }
}

/* ---------------- Rutas básicas ---------------- */
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

app.get('/api/node', async (_req, res) => {
  try {
    const node = await getNodeName();
    res.json({ node });
  } catch (err) {
    sendError(res, err);
  }
});

/* ---------------- Listados ---------------- */
// LXC únicamente
app.get('/api/containers', async (_req, res) => {
  try {
    const all = await listAllVmLike();
    const list = all.filter(x => x.type === 'lxc');
    res.json({ data: list });
  } catch (err) {
    sendError(res, err);
  }
});

// VMs QEMU únicamente
app.get('/api/vms', async (_req, res) => {
  try {
    const all = await listAllVmLike();
    const list = all.filter(x => x.type === 'qemu');
    res.json({ data: list });
  } catch (err) {
    sendError(res, err);
  }
});

/* ---------------- Acciones: LXC ---------------- */
app.post('/api/containers/:id/start', async (req, res) => {
  try {
    const id = req.params.id;
    const node = req.query.node || await findNodeForId(id, 'lxc');
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(id)}/status/start`);
    res.json({ ok: true, task: r.data });
  } catch (err) { sendError(res, err); }
});

app.post('/api/containers/:id/stop', async (req, res) => {
  try {
    const id = req.params.id;
    const node = req.query.node || await findNodeForId(id, 'lxc');
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(id)}/status/stop`);
    res.json({ ok: true, task: r.data });
  } catch (err) { sendError(res, err); }
});

app.post('/api/containers/:id/reboot', async (req, res) => {
  try {
    const id = req.params.id;
    const node = req.query.node || await findNodeForId(id, 'lxc');
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/lxc/${encodeURIComponent(id)}/status/reboot`);
    res.json({ ok: true, task: r.data });
  } catch (err) { sendError(res, err); }
});

/* ---------------- Acciones: VMs ---------------- */
app.post('/api/vms/:id/start', async (req, res) => {
  try {
    const id = req.params.id;
    const node = req.query.node || await findNodeForId(id, 'qemu');
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/status/start`);
    res.json({ ok: true, task: r.data });
  } catch (err) { sendError(res, err); }
});

app.post('/api/vms/:id/shutdown', async (req, res) => {
  try {
    const id = req.params.id;
    const node = req.query.node || await findNodeForId(id, 'qemu');
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/status/shutdown`);
    res.json({ ok: true, task: r.data });
  } catch (err) { sendError(res, err); }
});

app.post('/api/vms/:id/suspend', async (req, res) => {
  try {
    const id = req.params.id;
    const node = req.query.node || await findNodeForId(id, 'qemu');
    // Hibernar (to disk). Para suspend-to-RAM usa todisk=0.
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/status/suspend`, null, {
      params: { todisk: 1 },
    });
    res.json({ ok: true, task: r.data });
  } catch (err) { sendError(res, err); }
});

app.post('/api/vms/:id/reboot', async (req, res) => {
  try {
    const id = req.params.id;
    const node = req.query.node || await findNodeForId(id, 'qemu');
    const r = await api.post(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/status/reboot`);
    res.json({ ok: true, task: r.data });
  } catch (err) { sendError(res, err); }
});

/* ---------------- Static web (si no usas nginx) ---------------- */
app.use('/', express.static(path.join(__dirname, 'web')));

/* ---------------- Start ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[lxcdash] API en http://127.0.0.1:${PORT}`));

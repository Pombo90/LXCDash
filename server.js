// server.js — LXCDash API (LXC + VMs) usando config original

const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(express.json());

// ---------- Carga de config ----------
const cfgPath = path.join(__dirname, 'config.json');
let cfg = {};
if (fs.existsSync(cfgPath)) {
  cfg = JSON.parse(fs.readFileSync(cfgPath));
} else {
  console.error('Missing config.json. Run lxcdash.sh installer.');
  process.exit(1);
}

if (!cfg.proxmox) {
  console.error('config.json inválido: falta la clave "proxmox"');
  process.exit(1);
}

const {
  host,
  node: cfgNode,           // puede venir vacío => autodetectar
  port,
  user,
  tokenId,
  tokenSecret,
  verifyTls
} = cfg.proxmox;

const baseURL = `https://${host}:${port}/api2/json`;
const authHeader = `PVEAPIToken=${user}!${tokenId}=${tokenSecret}`;

const axiosInstance = axios.create({
  baseURL,
  headers: { Authorization: authHeader },
  httpsAgent: new https.Agent({ rejectUnauthorized: !!verifyTls }),
  timeout: 15000
});

// ---------- Helpers ----------
function apiError(res, err) {
  const status = err?.response?.status || 500;
  const data = err?.response?.data || { message: String(err?.message || err) };
  console.error('[API ERROR]', status, data);
  res.status(status).json({ error: true, status, data });
}

/**
 * Obtiene el nombre de nodo a usar:
 * - Prioriza ?node=<nodo> en la query
 * - Luego cfg.proxmox.node si está definido
 * - Si no, autodetecta el primero "online" desde /nodes
 */
async function getNodeName(preferred) {
  if (preferred && String(preferred).trim()) return preferred;
  if (cfgNode && String(cfgNode).trim()) return cfgNode;

  // Autodetección
  const r = await axiosInstance.get('/nodes');
  const nodes = r.data?.data || [];
  if (!nodes.length) throw new Error('No hay nodos en /nodes');
  const online = nodes.find(n => n.status === 'online');
  return online?.node || nodes[0].node;
}

// ---------- Rutas básicas ----------
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// Nombre del nodo (útil para el título de la UI)
app.get('/api/node', async (req, res) => {
  try {
    const n = await getNodeName(req.query.node);
    res.json({ node: n });
  } catch (err) {
    apiError(res, err);
  }
});

// ---------- LXC (contenedores) ----------
app.get('/api/containers', async (req, res) => {
  try {
    const n = await getNodeName(req.query.node);
    const { data } = await axiosInstance.get(`/nodes/${encodeURIComponent(n)}/lxc`);
    const list = (data?.data || []).map(c => ({
      vmid: c.vmid,
      name: c.name || `ct${c.vmid}`,
      status: c.status,
      uptime: c.uptime,
      node: n
    }));
    res.json({ data: list });
  } catch (err) {
    apiError(res, err);
  }
});

async function lxcAction(vmid, action, nodeFromQuery) {
  const n = await getNodeName(nodeFromQuery);
  return axiosInstance.post(`/nodes/${encodeURIComponent(n)}/lxc/${encodeURIComponent(vmid)}/status/${action}`, {});
}

app.post('/api/containers/:vmid/start', async (req, res) => {
  try {
    await lxcAction(req.params.vmid, 'start', req.query.node);
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

app.post('/api/containers/:vmid/stop', async (req, res) => {
  try {
    await lxcAction(req.params.vmid, 'stop', req.query.node);
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

app.post('/api/containers/:vmid/reboot', async (req, res) => {
  try {
    await lxcAction(req.params.vmid, 'reboot', req.query.node);
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

// ---------- VMs (QEMU) ----------
app.get('/api/vms', async (req, res) => {
  try {
    const n = await getNodeName(req.query.node);
    const { data } = await axiosInstance.get(`/nodes/${encodeURIComponent(n)}/qemu`);
    const list = (data?.data || []).map(v => ({
      vmid: v.vmid,
      name: v.name || `vm${v.vmid}`,
      status: v.status,
      uptime: v.uptime,
      node: n
    }));
    res.json({ data: list });
  } catch (err) {
    apiError(res, err);
  }
});

async function vmAction(vmid, action, nodeFromQuery, params) {
  const n = await getNodeName(nodeFromQuery);
  const url = `/nodes/${encodeURIComponent(n)}/qemu/${encodeURIComponent(vmid)}/status/${action}`;
  return axiosInstance.post(url, {}, { params: params || {} });
}

app.post('/api/vms/:vmid/start', async (req, res) => {
  try {
    await vmAction(req.params.vmid, 'start', req.query.node);
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

app.post('/api/vms/:vmid/shutdown', async (req, res) => {
  try {
    await vmAction(req.params.vmid, 'shutdown', req.query.node);
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

// Hibernar: suspend to disk (todisk=1). Para suspend-to-RAM usa todisk=0.
app.post('/api/vms/:vmid/suspend', async (req, res) => {
  try {
    await vmAction(req.params.vmid, 'suspend', req.query.node, { todisk: 1 });
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

app.post('/api/vms/:vmid/reboot', async (req, res) => {
  try {
    await vmAction(req.params.vmid, 'reboot', req.query.node);
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

// ---------- Static (si no usas Nginx delante) ----------
app.use('/', express.static(path.join(__dirname, 'web')));

// ---------- Arranque ----------
const bind = cfg.server?.bind || '127.0.0.1';
const apiPort = cfg.server?.port || 3000;
app.listen(apiPort, bind, () => {
  console.log(`LXCDash API listening on http://${bind}:${apiPort}`);
});

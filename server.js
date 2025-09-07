const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(express.json());

// Load config
const cfgPath = path.join(__dirname, 'config.json');
let cfg = {};
if (fs.existsSync(cfgPath)) {
  cfg = JSON.parse(fs.readFileSync(cfgPath));
} else {
  console.error('Missing config.json. Run lxcdash.sh installer.');
  process.exit(1);
}

const { host, node, port, user, tokenId, tokenSecret, verifyTls } = cfg.proxmox;
const baseURL = `https://${host}:${port}/api2/json`;
const authHeader = `PVEAPIToken=${user}!${tokenId}=${tokenSecret}`;

const axiosInstance = axios.create({
  baseURL,
  headers: { Authorization: authHeader },
  httpsAgent: new https.Agent({ rejectUnauthorized: !!verifyTls })
});

// Helpers
function apiError(res, err) {
  const status = err.response?.status || 500;
  const data = err.response?.data || { message: String(err.message || err) };
  res.status(status).json({ error: true, status, data });
}

// Routes
app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.get('/api/containers', async (req, res) => {
  try {
    const { data } = await axiosInstance.get(`/nodes/${encodeURIComponent(node)}/lxc`);
    const list = (data?.data || []).map(c => ({
      vmid: c.vmid,
      name: c.name || `ct${c.vmid}`,
      status: c.status,
      uptime: c.uptime
    }));
    res.json({ data: list });
  } catch (err) {
    apiError(res, err);
  }
});

async function postAction(vmid, action) {
  return axiosInstance.post(`/nodes/${encodeURIComponent(node)}/lxc/${vmid}/status/${action}`, {});
}

app.post('/api/containers/:vmid/start', async (req, res) => {
  try {
    await postAction(req.params.vmid, 'start');
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

app.post('/api/containers/:vmid/stop', async (req, res) => {
  try {
    await postAction(req.params.vmid, 'stop');
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

app.post('/api/containers/:vmid/reboot', async (req, res) => {
  try {
    await postAction(req.params.vmid, 'reboot');
    res.json({ ok: true });
  } catch (err) { apiError(res, err); }
});

// Serve static (optional if nginx not used)
app.use('/', express.static(path.join(__dirname, 'web')));

const bind = cfg.server?.bind || '127.0.0.1';
const apiPort = cfg.server?.port || 3000;
app.listen(apiPort, bind, () => {
  console.log(`LXCDash API listening on http://${bind}:${apiPort}`);
});

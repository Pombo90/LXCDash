#!/usr/bin/env bash
set -Eeuo pipefail

# === Config ===
REPO_URL="${REPO_URL:-https://github.com/Pombo90/lxcdash.git}"
INSTALL_DIR="/opt/lxcdash"
API_PORT="${API_PORT:-3000}"
WEB_PORT="${WEB_PORT:-8080}"

# === Helpers ===
die() { echo -e "\033[01;31m[ERROR]\033[m $*"; exit 1; }
ok()  { echo -e "\033[1;92m[OK]\033[m $*"; }
info(){ echo -e "\033[33m[INFO]\033[m $*"; }

require_root() { [ "$(id -u)" -eq 0 ] || die "Ejecuta este script como root."; }

# === Checks ===
require_root
if ! command -v apt-get >/dev/null 2>&1; then
  die "Este instalador está pensado para Debian/Ubuntu (apt)."
fi

# === Ask for Proxmox API details ===
echo
echo "· Configura el acceso a la API de Proxmox (usado por LXCDash)"
read -rp "Host o IP de Proxmox (ej. 192.168.1.10): " PVE_HOST
PVE_HOST="${PVE_HOST:-127.0.0.1}"

read -rp "Nombre del nodo (ej. pve): " PVE_NODE
PVE_NODE="${PVE_NODE:-pve}"

read -rp "Puerto de API (default 8006): " PVE_PORT
PVE_PORT="${PVE_PORT:-8006}"

read -rp "Usuario (ej. root@pam): " PVE_USER
PVE_USER="${PVE_USER:-root@pam}"

read -rp "ID del token (ej. lxcdash): " PVE_TOKEN_ID
[ -z "${PVE_TOKEN_ID}" ] && die "ID del token requerido."

read -rsp "Token Secret: " PVE_TOKEN_SECRET
echo
[ -z "${PVE_TOKEN_SECRET}" ] && die "Token secret requerido."

read -rp "Verificar certificado TLS (y/N): " VERIFY_TLS_ANS
case "${VERIFY_TLS_ANS,,}" in
  y|yes) VERIFY_TLS=true ;;
  *)     VERIFY_TLS=false ;;
esac

# === System dependencies ===
export DEBIAN_FRONTEND=noninteractive
info "Actualizando paquetes..."
apt-get update -y >/dev/null

info "Instalando dependencias: curl, git, nginx..."
apt-get install -y curl ca-certificates git nginx >/dev/null

# Node.js (v20.x)
if ! command -v node >/dev/null 2>&1; then
  info "Instalando Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null
fi

# pm2
if ! command -v pm2 >/dev/null 2>&1; then
  info "Instalando pm2..."
  npm install -g pm2 >/dev/null
fi

# === Fetch code ===
if [ -d "${INSTALL_DIR}" ]; then
  info "Actualizando código en ${INSTALL_DIR}..."
  git -C "${INSTALL_DIR}" pull --ff-only || true
else
  info "Clonando repositorio en ${INSTALL_DIR}..."
  git clone --depth=1 "${REPO_URL}" "${INSTALL_DIR}" >/dev/null
fi

# === Install API deps ===
cd "${INSTALL_DIR}"
info "Instalando dependencias de Node (API)..."
npm install --omit=dev >/dev/null

# === Write config.json ===
cat > "${INSTALL_DIR}/config.json" <<EOF
{
  "proxmox": {
    "host": "${PVE_HOST}",
    "node": "${PVE_NODE}",
    "port": ${PVE_PORT},
    "user": "${PVE_USER}",
    "tokenId": "${PVE_TOKEN_ID}",
    "tokenSecret": "${PVE_TOKEN_SECRET}",
    "verifyTls": ${VERIFY_TLS}
  },
  "server": {
    "port": ${API_PORT},
    "bind": "127.0.0.1"
  }
}
EOF

ok "Configuración escrita en ${INSTALL_DIR}/config.json"

# === Nginx site ===
info "Configurando nginx (puerto ${WEB_PORT})..."
cat > /etc/nginx/sites-available/lxcdash <<'NGINX'
server {
    listen 8080 default_server;
    listen [::]:8080 default_server;
    server_name _;

    root /opt/lxcdash/web;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

# Enable site
ln -sf /etc/nginx/sites-available/lxcdash /etc/nginx/sites-enabled/lxcdash
# Remove default if exists
[ -e /etc/nginx/sites-enabled/default ] && rm -f /etc/nginx/sites-enabled/default || true
systemctl restart nginx

# === Start API with pm2 ===
info "Iniciando API con pm2..."
pm2 stop lxcdash >/dev/null 2>&1 || true
pm2 start server.js --name lxcdash >/dev/null
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

ok "LXCDash instalado."
echo
echo "URL: http://$(hostname -I | awk '{print $1}'):${WEB_PORT}"

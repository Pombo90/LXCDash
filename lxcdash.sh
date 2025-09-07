APP_DIR="/opt/lxcdash"
REPO_URL="https://github.com/Pombo90/LXCDash.git"
BRANCH="main"

mkdir -p "$APP_DIR"

# ¿Ya está instalado?
if [ -d "$APP_DIR/.git" ]; then
  echo "[INFO] Instalación detectada. Actualizando código…"
  cd "$APP_DIR"
  git fetch --all --prune
  git reset --hard "origin/${BRANCH}"
else
  echo "[INFO] Instalando LXCDash…"
  # Si ya existe la carpeta (instalación anterior sin .git), preservamos config.json si estuviera
  KEEP_CFG=""
  [ -f "$APP_DIR/config.json" ] && KEEP_CFG="$(cat "$APP_DIR/config.json")"

  rm -rf "$APP_DIR"/*
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"

  if [ -n "$KEEP_CFG" ]; then
    echo "$KEEP_CFG" > "$APP_DIR/config.json"
    echo "[INFO] Se ha conservado tu config.json anterior."
  fi
fi

# Dependencias backend si existen
if [ -f "$APP_DIR/package.json" ]; then
  cd "$APP_DIR"
  npm ci --omit=dev
fi

# Nginx (asegúrate de tener el proxy_pass correcto con /api/)
if [ ! -f /etc/nginx/sites-available/lxcdash ]; then
cat >/etc/nginx/sites-available/lxcdash <<'NGINX'
server {
  listen 8080 default_server;
  listen [::]:8080 default_server;
  server_name _;

  root /opt/lxcdash/web;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:3000/api/;   # ← conserva el prefijo /api
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300;
  }

  location / {
    try_files $uri $uri/ =404;
  }
}
NGINX
  ln -sf /etc/nginx/sites-available/lxcdash /etc/nginx/sites-enabled/lxcdash
fi

nginx -t && systemctl reload nginx

# PM2
if ! pm2 describe lxcdash >/dev/null 2>&1; then
  pm2 start "$APP_DIR/server.js" --name lxcdash
  pm2 save
else
  pm2 restart lxcdash
fi

echo "[OK] LXCDash listo. Pruebas rápidas:"
echo "  - http://127.0.0.1:3000/api/ping"
echo "  - http://$(hostname -I | awk '{print $1}'):8080/api/ping"

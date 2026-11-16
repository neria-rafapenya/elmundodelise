#!/usr/bin/env bash
# Se ejecuta EN EL VPS (lo lanza deploy.sh). Usa sudo solo para lo que lo necesita.
set -euo pipefail
: "${APP_DIR:?}" "${DOMAIN:?}" "${DEPLOY_USER:?}"
cd "$APP_DIR"

# Valores por defecto en .env del servidor
grep -q '^PORT=' .env || echo "PORT=3002" >> .env
grep -q '^UPLOAD_DIR=' .env || echo "UPLOAD_DIR=$APP_DIR/uploads" >> .env
grep -q '^PUBLIC_URL=' .env || echo "PUBLIC_URL=https://$DOMAIN" >> .env
chmod 600 .env
PORT=$(grep '^PORT=' .env | tail -1 | cut -d= -f2 | xargs)

# Node >= 20
if ! command -v node >/dev/null || [ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]; then
  echo "  · Instalando Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y nodejs >/dev/null
fi
echo "  · Node $(node -v)"
npm install --omit=dev --no-audit --no-fund --loglevel=error

# Frontend React: compila tienda y backoffice en web/dist
echo "  · Compilando el frontend (React + Vite)"
(cd web && npm install --no-audit --no-fund --loglevel=error && npm run build --silent)

# Fotos: legibles por Caddy, escribibles por la app
mkdir -p uploads/products
chmod 755 uploads uploads/products

# Tablas elise_ en Supabase (idempotente)
DBURL=$(grep -E '^DATABASE_URL=' .env | tail -1 | cut -d= -f2- | tr -d '"'"'" | xargs)
command -v psql >/dev/null || sudo apt-get install -y postgresql-client >/dev/null
echo "  · Aplicando sql/schema.sql"
psql "$DBURL" -v ON_ERROR_STOP=1 -q -f sql/schema.sql

# Servicio systemd (corre con el usuario de despliegue)
NODE_BIN=$(command -v node)
sudo tee /etc/systemd/system/elmundodelise.service >/dev/null <<UNIT
[Unit]
Description=Tienda El Mundo de Élise
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
UMask=0022
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

if ! sudo systemctl is-active --quiet elmundodelise && ss -ltn "( sport = :$PORT )" | grep -q LISTEN; then
  echo "✗ El puerto $PORT está ocupado por otra app. Cambia PORT en .env y vuelve a desplegar."; exit 1
fi
sudo systemctl daemon-reload
sudo systemctl enable elmundodelise >/dev/null 2>&1
sudo systemctl restart elmundodelise
sleep 2
if ! curl -fsS "http://127.0.0.1:$PORT/api/config" >/dev/null; then
  sudo journalctl -u elmundodelise -n 40 --no-pager; exit 1
fi
echo "  · App respondiendo en el puerto $PORT"

# Caddy: sustituye el bloque de elmundodelise.com (copia de seguridad antes)
CF=/etc/caddy/Caddyfile
BAK="$CF.bak.$(date +%Y%m%d%H%M%S)"
sudo cp "$CF" "$BAK"
TMP=$(mktemp)
sudo cat "$CF" | python3 -c '
import re, sys
domain, port, app = sys.argv[1], sys.argv[2], sys.argv[3]
out, skip, depth = [], False, 0
for ln in sys.stdin.read().splitlines(keepends=True):
    if not skip and re.match(r"^\s*(https?://)?(www\.)?" + re.escape(domain) + r"\b", ln) and "{" in ln:
        skip, depth = True, 0
    if skip:
        depth += ln.count("{") - ln.count("}")
        if depth <= 0 and "}" in ln: skip = False
        continue
    out.append(ln)
sys.stdout.write("".join(out).rstrip() + f"""

{domain}, www.{domain} {{
	encode gzip
	handle /api/* {{
		reverse_proxy localhost:{port}
	}}
	handle /producto/* {{
		reverse_proxy localhost:{port}
	}}
	handle_path /uploads/* {{
		root * {app}/uploads
		file_server
	}}
	handle /admin* {{
		root * {app}/web/dist
		try_files {{path}} /admin/index.html
		file_server
	}}
	handle {{
		root * {app}/web/dist
		try_files {{path}} /index.html
		file_server
	}}
}}
""")' "$DOMAIN" "$PORT" "$APP_DIR" > "$TMP"
sudo cp "$TMP" "$CF"; rm -f "$TMP"
if sudo caddy validate --config "$CF" >/dev/null 2>&1; then
  sudo systemctl reload caddy && echo "  · Caddy actualizado (HTTPS automático)"
else
  echo "✗ Caddyfile no válido, restaurando la copia"; sudo cp "$BAK" "$CF"; exit 1
fi

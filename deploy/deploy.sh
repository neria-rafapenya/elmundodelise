#!/usr/bin/env bash
# Despliega El mundo de Lise en el VPS desde el Mac.
# Uso (desde la raíz del repo):  ./deploy/deploy.sh
# Requisitos: acceso ssh root@VPS y un .env en la raíz con las claves de Supabase.
set -euo pipefail

VPS="${VPS:-root@217.160.50.110}"
APP_DIR=/opt/elmundodelise
UPLOADS=/var/www/elmundodelise/uploads
PORT_DEFAULT=3002

cd "$(dirname "$0")/.."

# ---------- comprobaciones locales ----------
[ -f .env ] || { echo "✗ Falta el archivo .env en la raíz"; exit 1; }
val() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*//' | tr -d '"'"'" | xargs; }
for k in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  v="$(val "$k")"
  if [ -z "$v" ] || [[ "$v" == *TU_PROYECTO* ]] || [ "$v" = "eyJ..." ]; then
    echo "✗ Falta $k en .env (Supabase → Project Settings → API)"; exit 1
  fi
done
[ -n "$(val BIZUM_PHONE)" ] || echo "! BIZUM_PHONE vacío: no se ofrecerá Bizum"
[ -n "$(val PAYPAL_CLIENT_ID)" ] || echo "! PAYPAL_CLIENT_ID vacío: no se ofrecerá PayPal"

echo "→ Subiendo código a $VPS:$APP_DIR"
ssh "$VPS" "mkdir -p $APP_DIR"
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'uploads' --exclude '.env' --exclude '.DS_Store' \
  ./ "$VPS:$APP_DIR/"
# .env aparte, con permisos restringidos (no se sobrescribe PORT/UPLOAD_DIR si ya vienen)
scp -q .env "$VPS:$APP_DIR/.env"

echo "→ Configurando el servidor"
ssh "$VPS" APP_DIR="$APP_DIR" UPLOADS="$UPLOADS" PORT_DEFAULT="$PORT_DEFAULT" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "$APP_DIR"

# Valores por defecto en .env
grep -q '^PORT=' .env || echo "PORT=$PORT_DEFAULT" >> .env
grep -q '^UPLOAD_DIR=' .env || echo "UPLOAD_DIR=$UPLOADS" >> .env
PORT=$(grep '^PORT=' .env | tail -1 | cut -d= -f2 | xargs)

# Node >= 20
if ! command -v node >/dev/null || [ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]; then
  echo "  · Instalando Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null
fi
echo "  · Node $(node -v)"

npm install --omit=dev --no-audit --no-fund --loglevel=error

mkdir -p "$UPLOADS/products"
chown -R www-data:www-data "$UPLOADS"
chown www-data:www-data .env && chmod 600 .env

# Esquema de Supabase (si hay DATABASE_URL en .env)
DBURL=$(grep -E '^DATABASE_URL=' .env | tail -1 | cut -d= -f2- | tr -d '"'"'" | xargs || true)
if [ -n "$DBURL" ]; then
  command -v psql >/dev/null || apt-get install -y postgresql-client >/dev/null
  echo "  · Creando tablas elise_ en Supabase"
  psql "$DBURL" -v ON_ERROR_STOP=1 -q -f sql/schema.sql
else
  echo "  ! Sin DATABASE_URL: ejecuta sql/schema.sql en el SQL Editor de Supabase"
fi

# Puerto libre
if ss -ltn "( sport = :$PORT )" | grep -q LISTEN && ! systemctl is-active --quiet elmundodelise; then
  echo "✗ El puerto $PORT está ocupado. Cambia PORT en .env y vuelve a lanzar."; exit 1
fi

# Servicio systemd
cp deploy/elmundodelise.service /etc/systemd/system/elmundodelise.service
systemctl daemon-reload
systemctl enable elmundodelise >/dev/null 2>&1
systemctl restart elmundodelise
sleep 2
systemctl is-active --quiet elmundodelise || { journalctl -u elmundodelise -n 30 --no-pager; exit 1; }
curl -fsS "http://127.0.0.1:$PORT/api/config" >/dev/null && echo "  · App respondiendo en el puerto $PORT"

# Caddy: sustituye el bloque de elmundodelise.com (con copia de seguridad)
CF=/etc/caddy/Caddyfile
cp "$CF" "$CF.bak.$(date +%Y%m%d%H%M%S)"
python3 - "$CF" "$PORT" <<'PY'
import re, sys
path, port = sys.argv[1], sys.argv[2]
s = open(path).read()
lines, out, skip, depth = s.splitlines(keepends=True), [], False, 0
for ln in lines:
    if not skip and re.match(r'^\s*(https?://)?(www\.)?elmundodelise\.com\b', ln) and '{' in ln:
        skip, depth = True, 0
    if skip:
        depth += ln.count('{') - ln.count('}')
        if depth <= 0 and '}' in ln: skip = False
        continue
    out.append(ln)
block = f"""
elmundodelise.com, www.elmundodelise.com {{
\tencode gzip
\thandle_path /uploads/* {{
\t\troot * /var/www/elmundodelise/uploads
\t\tfile_server
\t}}
\treverse_proxy localhost:{port}
}}
"""
open(path, 'w').write(''.join(out).rstrip() + '\n' + block)
PY
if caddy validate --config "$CF" >/dev/null 2>&1; then
  systemctl reload caddy && echo "  · Caddy actualizado"
else
  echo "✗ Caddyfile no válido, restaurando copia"; cp "$(ls -t $CF.bak.* | head -1)" "$CF"; caddy validate --config "$CF"; exit 1
fi
REMOTE

echo "✓ Desplegado: https://elmundodelise.com"

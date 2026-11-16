#!/usr/bin/env bash
# Despliega El mundo de Lise en el VPS de IONOS desde el Mac.
#
#   DEPLOY_USER=tu_usuario bash deploy/deploy.sh
#
# · Conecta por SSH (puerto 22) con un usuario de despliegue (no root) que tenga sudo.
# · Proyecto en /var/www/elmundodelise · fotos en /var/www/elmundodelise/uploads
# · Caddy hace de proxy con HTTPS automático para elmundodelise.com y www.
set -euo pipefail

HOST="${HOST:-217.160.50.110}"
SSH_PORT="${SSH_PORT:-22}"
DEPLOY_USER="${DEPLOY_USER:-}"
APP_DIR=/var/www/elmundodelise
DOMAIN=elmundodelise.com

cd "$(dirname "$0")/.."

if [ -z "$DEPLOY_USER" ]; then read -rp "Usuario SSH de despliegue: " DEPLOY_USER; fi
[ "$DEPLOY_USER" != "root" ] || { echo "✗ Usa el usuario de despliegue, no root"; exit 1; }
TARGET="$DEPLOY_USER@$HOST"
SSH=(ssh -p "$SSH_PORT")

# ---------- comprobaciones locales ----------
[ -f .env ] || { echo "✗ Falta el archivo .env en la raíz"; exit 1; }
val() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*//' | tr -d '"'"'" | xargs; }
[ -n "$(val DATABASE_URL)" ] || { echo "✗ Falta DATABASE_URL en .env"; exit 1; }
[ -n "$(val BIZUM_PHONE)" ] || echo "! BIZUM_PHONE vacío: no se ofrecerá Bizum"
[ -n "$(val PAYPAL_CLIENT_ID)" ] || echo "! PAYPAL_CLIENT_ID vacío: no se ofrecerá PayPal"

echo "→ Preparando $APP_DIR en $TARGET (puede pedirte la contraseña de sudo)"
"${SSH[@]}" -t "$TARGET" "sudo mkdir -p $APP_DIR/uploads/products && sudo chown -R $DEPLOY_USER: $APP_DIR && sudo chmod 755 $APP_DIR"

echo "→ Subiendo código"
# --delete no toca lo excluido: uploads/ (fotos) y .env del servidor se conservan
rsync -az --delete -e "ssh -p $SSH_PORT" \
  --exclude '.git' --exclude 'node_modules' --exclude 'uploads' --exclude '.env' --exclude '.DS_Store' \
  ./ "$TARGET:$APP_DIR/"
rsync -az -e "ssh -p $SSH_PORT" --chmod=F600 .env "$TARGET:$APP_DIR/.env"

echo "→ Configurando el servidor"
"${SSH[@]}" -t "$TARGET" "APP_DIR=$APP_DIR DOMAIN=$DOMAIN DEPLOY_USER=$DEPLOY_USER bash $APP_DIR/deploy/remote-setup.sh"

echo "✓ Desplegado: https://$DOMAIN"

# El mundo de Lise · Tienda online

La tienda tiene catálogo, ficha de producto, carrito, alta e inicio de sesión de usuario, checkout con **PayPal** o **Bizum**, y área «Mis pedidos». El **backoffice** (`/admin/`) permite gestionar prendas, fotos, tallas, stock, pedidos y categorías.

- **Servidor:** Node.js + Express (`server.js`), conectado a Postgres (Supabase) solo con `DATABASE_URL`.
- **Usuarios:** autenticación propia. Las contraseñas se guardan con scrypt y la sesión va en una cookie httpOnly; no se usa Supabase Auth ni claves de API.
- **Base de datos:** tablas con prefijo `elise_`, con RLS activado y sin políticas, así que la API pública de Supabase no puede leerlas.
- **Fotos:** en el disco del VPS, en `/var/www/elmundodelise/uploads/products/`.

```
server.js              API + servidor web
sql/schema.sql         tablas elise_* (el despliegue las crea solo)
public/                tienda (index, producto, carrito, checkout, pedido, cuenta)
public/admin/          backoffice
deploy/deploy.sh       despliegue desde el Mac
deploy/remote-setup.sh configuración en el VPS (lo lanza deploy.sh)
.env.example           configuración
```

---

## 1. Configuración

Copia `.env.example` a `.env` y rellena como mínimo `DATABASE_URL` y `BIZUM_PHONE`. El `.env` nunca se sube a git.

## 2. Despliegue en el VPS de IONOS

| | |
|---|---|
| Dominios | elmundodelise.com y www.elmundodelise.com (registro A → 217.160.50.110) |
| SSH | usuario de despliegue (no root) con sudo, puerto 22 |
| Ruta | `/var/www/elmundodelise` |
| Proxy | Caddy, con certificado HTTPS automático |

Desde la raíz del repo, en el Mac:

```bash
DEPLOY_USER=tu_usuario bash deploy/deploy.sh
```

El script:
- Sube el código con rsync, sin `.git`, `node_modules`, `.env` ni `uploads`. Las fotos del servidor no se tocan.
- Copia el `.env` aparte, con permisos 600.
- Instala Node 22 y `psql` si faltan, y las dependencias.
- Aplica `sql/schema.sql` en Supabase. Es idempotente.
- Crea el servicio systemd `elmundodelise`, que corre con el usuario de despliegue en el puerto 3002.
- Sustituye el bloque de `elmundodelise.com` en `/etc/caddy/Caddyfile`. Antes guarda una copia y, si no valida, la restaura.

Puede pedirte la contraseña de sudo. Para actualizar la tienda, vuelve a lanzar el mismo comando.

Comandos útiles en el VPS:

```bash
sudo systemctl status elmundodelise
sudo journalctl -u elmundodelise -f
```

## 3. Hacerte administrador

1. Regístrate en `https://elmundodelise.com/cuenta.html`.
2. En el SQL Editor de Supabase, ejecuta:
   ```sql
   update public.elise_users set is_admin = true where email = 'tu@email.com';
   ```
3. En «Mi cuenta» aparecerá **Ir al backoffice**. También puedes entrar directamente en `/admin/`.

## 4. Pagos

**PayPal**
- Crea una app en developer.paypal.com y copia el *Client ID* y el *Secret*.
- Prueba primero con `PAYPAL_MODE=sandbox` y una cuenta compradora de pruebas.
- Para producción, cambia a `live` con las credenciales *Live*.
- El servidor comprueba el importe cobrado antes de dar el pedido por pagado y descontar el stock.

**Bizum**
- Sin TPV bancario el cobro es manual: el cliente ve tu número, el importe y el concepto «Pedido NNNN».
- Cuando te llegue el Bizum, en **Backoffice → Pedidos** cambia el estado a **Pagado**. En ese momento se descuenta el stock.
- Para automatizarlo hace falta un TPV virtual con Bizum (Redsys) del banco. Se puede añadir más adelante.

**Stock**
- Se descuenta solo al confirmar el pago, de forma atómica.
- Si dos personas compran la última unidad a la vez, el segundo pago queda marcado con una nota para gestionar el reembolso.

## 5. Envío (pendiente de transportista)

- `SHIPPING_EUR` fija un coste único en euros: por ejemplo, `4,95`.
- `FREE_SHIPPING_FROM_EUR` activa el envío gratis desde un importe en euros: por ejemplo, `50`.
- La moneda de la tienda es el euro (EUR) en precios, carrito y PayPal.
- En cada pedido puedes guardar el **nº de seguimiento**, y el cliente lo ve en su pedido.
- Cuando contrates el transporte, se puede integrar su API (etiquetas y tarifas) en `server.js`.

## 6. Pendiente antes de abrir al público

- Textos legales: aviso legal, política de privacidad, cookies, y condiciones de venta y devoluciones (obligatorias en venta online en España).
- Correo: si rellenas `SMTP_*` en el `.env` (por ejemplo, el buzón de IONOS), se activa «¿Has olvidado la contraseña?». Los emails de confirmación de pedido se pueden añadir con el mismo SMTP.
- Logo y fotos reales.

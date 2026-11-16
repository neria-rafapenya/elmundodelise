# El mundo de Lise · Tienda online

La tienda tiene catálogo, ficha de producto, carrito, alta e inicio de sesión de usuario, checkout con **PayPal** o **Bizum**, y área «Mis pedidos». El **backoffice** (`/admin/`) permite gestionar prendas, fotos, tallas, stock, pedidos y categorías.

- **Servidor:** Node.js + Express (`server.js`).
- **Base de datos:** Supabase, en tablas con prefijo `elise_`. Solo el servidor accede a ellas (RLS activado sin políticas).
- **Usuarios:** Supabase Auth.
- **Fotos:** en el disco del VPS, en `/var/www/elmundodelise/uploads/products/`.

```
server.js              API + servidor web
sql/schema.sql         tablas elise_* (ejecutar en Supabase)
public/                tienda (index, producto, carrito, checkout, pedido, cuenta)
public/admin/          backoffice
deploy/                servicio systemd y bloque de Caddy
.env.example           configuración
```

---

## 1. Supabase

1. **Crea las tablas.** En **SQL Editor**, pega el contenido de `sql/schema.sql` y pulsa **Run**. Puedes ejecutarlo más de una vez sin problemas.
2. **Configura las URLs de autenticación.** En **Authentication → URL Configuration**, añade en *Redirect URLs*:
   - `https://elmundodelise.com/cuenta.html`
   - `https://www.elmundodelise.com/cuenta.html`
3. **Copia las claves.** En **Project Settings → API**, copia `URL`, `anon` y `service_role` para el `.env`.

> **Usuarios compartidos.** Como es el mismo proyecto de Supabase que tus otras apps, los usuarios (`auth.users`) son comunes a todas: alguien registrado en otra app puede entrar aquí con la misma contraseña. Los datos de la tienda van aparte, en `elise_profiles`. Los emails de confirmación también son los mismos del proyecto (Authentication → Email Templates).

## 2. Despliegue en el VPS (217.160.50.110)

Desde el Mac, en la carpeta del proyecto:

```bash
scp -r elmundodelise root@217.160.50.110:/opt/
```

En el servidor:

```bash
ssh root@217.160.50.110

# Node 20 o superior (comprueba con: node -v)
cd /opt/elmundodelise
npm install --omit=dev
cp .env.example .env && nano .env        # rellena Supabase, PayPal, Bizum…

mkdir -p /var/www/elmundodelise/uploads/products
chown -R www-data:www-data /var/www/elmundodelise/uploads
chown www-data:www-data .env && chmod 600 .env

# Servicio
cp deploy/elmundodelise.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now elmundodelise
systemctl status elmundodelise --no-pager

# Caddy: sustituye el bloque de elmundodelise.com por el de deploy/Caddyfile.snippet
nano /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

Si el puerto 3002 está ocupado (`ss -ltnp | grep 3002`), cambia `PORT` en `.env` y en el Caddyfile.

**Para actualizar la tienda más adelante:** sube los archivos de nuevo y ejecuta `systemctl restart elmundodelise`. Las fotos de `/var/www/elmundodelise/uploads` no se tocan.

## 3. Hacerte administrador

1. Regístrate en `https://elmundodelise.com/cuenta.html`.
2. En el SQL Editor de Supabase, ejecuta:
   ```sql
   update public.elise_profiles set is_admin = true
    where id = (select id from auth.users where email = 'TU_EMAIL');
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

- `SHIPPING_CENTS` fija un coste único: por ejemplo, `495` son 4,95 €.
- `FREE_SHIPPING_FROM_CENTS` activa el envío gratis desde un importe.
- En cada pedido puedes guardar el **nº de seguimiento**, y el cliente lo ve en su pedido.
- Cuando contrates el transporte, se puede integrar su API (etiquetas y tarifas) en `server.js`.

## 6. Pendiente antes de abrir al público

- Textos legales: aviso legal, política de privacidad, cookies, y condiciones de venta y devoluciones (obligatorias en venta online en España).
- Emails de confirmación de pedido. Ahora el cliente lo ve en «Mis pedidos». Se pueden enviar con el SMTP de IONOS.
- Logo y fotos reales.

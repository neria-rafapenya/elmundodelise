// El Mundo de Élise · servidor de la tienda
// Postgres directo (DATABASE_URL) con usuarios y sesiones propios. Sin Supabase Auth ni claves de API.
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const scrypt = promisify(crypto.scrypt);

const PORT = Number(env.PORT || 3002);
const PUBLIC_URL = (env.PUBLIC_URL || 'https://elmundodelise.com').replace(/\/$/, '');
const UPLOAD_DIR = path.resolve(env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
const PRODUCTS_DIR = path.join(UPLOAD_DIR, 'products');
const CURRENCY = 'EUR';
// Importes de envío en euros (admite coma o punto decimal: 4,95 / 4.95)
const euros = (v) => Math.round(Number(String(v ?? '0').replace(',', '.')) * 100) || 0;
const SHIPPING_CENTS = euros(env.SHIPPING_EUR);
const FREE_SHIPPING_FROM_CENTS = euros(env.FREE_SHIPPING_FROM_EUR);
const PAYPAL_BASE = env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const SESSION_DAYS = 30;
const COOKIE = 'elise_sid';
const SECURE_COOKIE = env.NODE_ENV !== 'development';

if (!env.DATABASE_URL) console.warn('[aviso] Falta DATABASE_URL en .env');
fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

// ---------- base de datos ----------
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(env.PG_POOL_MAX || 5),
});
const q = async (text, params) => (await pool.query(text, params)).rows;
const one = async (text, params) => (await q(text, params))[0] || null;

// ---------- correo (opcional, para recuperar contraseña) ----------
const mailer = env.SMTP_HOST ? nodemailer.createTransport({
  host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465), secure: Number(env.SMTP_PORT || 465) === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
}) : null;

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const slugify = (s) => s.toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'producto';
const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function shippingFor(subtotal) {
  if (FREE_SHIPPING_FROM_CENTS > 0 && subtotal >= FREE_SHIPPING_FROM_CENTS) return 0;
  return SHIPPING_CENTS;
}

// ---------- contraseñas y sesiones ----------
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((c) => c[0])
    .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function setSessionCookie(res, token, maxAgeSec) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${SECURE_COOKIE ? '; Secure' : ''}`);
}
async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q(`insert into elise_sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha256(token), userId]);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
}

const USER_COLS = 'id, email, full_name, phone, address, postal_code, city, province, is_admin, created_at';

async function loadUser(req, _res, next) {
  try {
    const token = parseCookies(req)[COOKIE];
    if (token) {
      req.user = await one(`select ${USER_COLS.split(', ').map((c) => 'u.' + c).join(', ')}
        from elise_sessions s join elise_users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now()`, [sha256(token)]);
    }
    next();
  } catch (e) { next(e); }
}
app.use('/api', loadUser);

const auth = (req, _res, next) => next(req.user ? undefined : new HttpError(401, 'Inicia sesión para continuar'));
const admin = (req, _res, next) => next(!req.user ? new HttpError(401, 'Inicia sesión para continuar')
  : req.user.is_admin ? undefined : new HttpError(403, 'Solo administradores'));

// Freno sencillo contra fuerza bruta: 10 intentos / 15 min por IP
const attempts = new Map();
function rateLimit(req, _res, next) {
  const key = req.ip, now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (a.length >= 10) return next(new HttpError(429, 'Demasiados intentos. Prueba en unos minutos.'));
  a.push(now); attempts.set(key, a); next();
}

// ---------- autenticación ----------
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

app.post('/api/auth/register', rateLimit, wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!validEmail(email)) throw new HttpError(400, 'Email no válido');
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
  if (!req.body?.accept) throw new HttpError(400, 'Debes aceptar el uso de tus datos');
  if (await one('select 1 from elise_users where email = $1', [email])) {
    throw new HttpError(409, 'Ya existe una cuenta con ese email. Entra con tu contraseña.');
  }
  const user = await one(`insert into elise_users (email, password_hash, full_name) values ($1, $2, $3) returning ${USER_COLS}`,
    [email, await hashPassword(password), clean(req.body.full_name)]);
  await startSession(res, user.id);
  res.status(201).json(user);
}));

app.post('/api/auth/login', rateLimit, wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const row = await one('select id, password_hash from elise_users where email = $1', [email]);
  const ok = row && await verifyPassword(String(req.body?.password || ''), row.password_hash);
  if (!ok) throw new HttpError(401, 'Email o contraseña incorrectos');
  await startSession(res, row.id);
  await q('delete from elise_sessions where user_id = $1 and expires_at < now()', [row.id]);
  res.json(await one(`select ${USER_COLS} from elise_users where id = $1`, [row.id]));
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const token = parseCookies(req)[COOKIE];
  if (token) await q('delete from elise_sessions where token_hash = $1', [sha256(token)]);
  setSessionCookie(res, '', 0);
  res.json({ ok: true });
}));

app.post('/api/auth/forgot', rateLimit, wrap(async (req, res) => {
  if (!mailer) throw new HttpError(503, 'La recuperación por email no está disponible. Escríbenos y te ayudamos.');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = await one('select id from elise_users where email = $1', [email]);
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url');
    await q(`insert into elise_password_resets (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [sha256(token), user.id]);
    await mailer.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER, to: email,
      subject: 'Cambia tu contraseña · El Mundo de Élise',
      text: `Hola,\n\nPara elegir una nueva contraseña entra en este enlace (válido 1 hora):\n${PUBLIC_URL}/restablecer?token=${token}\n\nSi no lo has pedido tú, ignora este mensaje.\n\nEl Mundo de Élise`,
    });
  }
  res.json({ ok: true }); // misma respuesta exista o no la cuenta
}));

app.post('/api/auth/reset', rateLimit, wrap(async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
  const r = await one(`update elise_password_resets set used_at = now()
    where token_hash = $1 and used_at is null and expires_at > now() returning user_id`, [sha256(String(req.body?.token || ''))]);
  if (!r) throw new HttpError(400, 'El enlace ha caducado o ya se ha usado. Pide uno nuevo.');
  await q('update elise_users set password_hash = $1, updated_at = now() where id = $2', [await hashPassword(password), r.user_id]);
  await q('delete from elise_sessions where user_id = $1', [r.user_id]);
  await startSession(res, r.user_id);
  res.json({ ok: true });
}));

app.post('/api/auth/password', auth, wrap(async (req, res) => {
  const row = await one('select password_hash from elise_users where id = $1', [req.user.id]);
  if (!(await verifyPassword(String(req.body?.current || ''), row.password_hash))) throw new HttpError(400, 'La contraseña actual no es correcta');
  if (String(req.body?.password || '').length < 8) throw new HttpError(400, 'La nueva contraseña debe tener al menos 8 caracteres');
  await q('update elise_users set password_hash = $1, updated_at = now() where id = $2', [await hashPassword(req.body.password), req.user.id]);
  res.json({ ok: true });
}));

// ---------- público ----------
app.get('/api/config', (_req, res) => res.json({
  currency: CURRENCY,
  paypalClientId: env.PAYPAL_CLIENT_ID || null,
  bizumPhone: env.BIZUM_PHONE || null,
  shippingCents: SHIPPING_CENTS,
  freeShippingFromCents: FREE_SHIPPING_FROM_CENTS,
  passwordReset: !!mailer,
}));

app.get('/api/categories', wrap(async (_req, res) => {
  res.json(await q('select id, name, slug from elise_categories order by sort, name'));
}));

// Carga productos con sus imágenes y variantes
async function loadProducts(where = 'true', params = []) {
  const products = await q(`select id, name, slug, description, price_cents, active, category_id, created_at
    from elise_products where ${where} order by created_at desc`, params);
  if (!products.length) return [];
  const ids = products.map((p) => p.id);
  const [images, variants] = await Promise.all([
    q('select id, product_id, path, sort from elise_product_images where product_id = any($1) order by sort, created_at', [ids]),
    q('select id, product_id, size, color, sku, stock from elise_product_variants where product_id = any($1) order by created_at', [ids]),
  ]);
  return products.map((p) => {
    const v = variants.filter((x) => x.product_id === p.id);
    return { ...p, images: images.filter((x) => x.product_id === p.id), variants: v, in_stock: v.some((x) => x.stock > 0) };
  });
}

app.get('/api/products', wrap(async (req, res) => {
  if (req.query.category) {
    return res.json(await loadProducts('active and category_id = (select id from elise_categories where slug = $1)', [String(req.query.category)]));
  }
  res.json(await loadProducts('active'));
}));

app.get('/api/products/:slug', wrap(async (req, res) => {
  const [p] = await loadProducts('active and slug = $1', [req.params.slug]);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  res.json(p);
}));

// Precios y stock reales del carrito (el navegador solo guarda variante + cantidad)
async function quoteCart(items) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'El carrito está vacío');
  const uuid = /^[0-9a-f-]{36}$/i;
  const ids = [...new Set(items.map((i) => String(i.variant_id)).filter((id) => uuid.test(id)))];
  const rows = ids.length ? await q(`
    select v.id, v.size, v.color, v.stock, p.id as product_id, p.name, p.slug, p.price_cents, p.active,
      (select path from elise_product_images i where i.product_id = p.id order by sort, created_at limit 1) as image
    from elise_product_variants v join elise_products p on p.id = v.product_id
    where v.id = any($1)`, [ids]) : [];
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const lines = items.map((it) => {
    const v = byId[it.variant_id];
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    if (!v || !v.active) return { variant_id: it.variant_id, unavailable: true, qty };
    return {
      variant_id: v.id, product_id: v.product_id, name: v.name, slug: v.slug, size: v.size, color: v.color,
      image: v.image, unit_price_cents: v.price_cents, qty, stock: v.stock,
      unavailable: v.stock < qty, line_cents: v.price_cents * qty,
    };
  });
  const subtotal = lines.filter((l) => !l.unavailable).reduce((s, l) => s + l.line_cents, 0);
  const shipping = subtotal > 0 ? shippingFor(subtotal) : 0;
  return { lines, subtotal_cents: subtotal, shipping_cents: shipping, total_cents: subtotal + shipping };
}

app.post('/api/cart/quote', wrap(async (req, res) => res.json(await quoteCart(req.body?.items))));

// ---------- cuenta ----------
app.get('/api/me', auth, (req, res) => res.json(req.user));
app.get('/api/session', (req, res) => res.json({ user: req.user || null }));

app.put('/api/me', auth, wrap(async (req, res) => {
  const b = req.body || {};
  res.json(await one(`update elise_users set full_name = $1, phone = $2, address = $3, postal_code = $4, city = $5, province = $6, updated_at = now()
    where id = $7 returning ${USER_COLS}`,
  [clean(b.full_name), clean(b.phone), clean(b.address), clean(b.postal_code), clean(b.city), clean(b.province), req.user.id]));
}));

async function withItems(orders) {
  if (!orders.length) return orders;
  const items = await q('select * from elise_order_items where order_id = any($1)', [orders.map((o) => o.id)]);
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

app.get('/api/me/orders', auth, wrap(async (req, res) => {
  res.json(await withItems(await q(`select id, number, status, payment_method, total_cents, created_at
    from elise_orders where user_id = $1 order by created_at desc`, [req.user.id])));
}));

// ---------- pedidos ----------
app.post('/api/orders', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const method = b.payment_method;
  if (method === 'paypal' && !env.PAYPAL_CLIENT_ID) throw new HttpError(400, 'PayPal no está disponible');
  if (method === 'bizum' && !env.BIZUM_PHONE) throw new HttpError(400, 'Bizum no está disponible');
  if (!['paypal', 'bizum'].includes(method)) throw new HttpError(400, 'Método de pago no válido');
  const s = b.shipping || {};
  for (const [k, label] of [['name', 'el nombre'], ['address', 'la dirección'], ['postal_code', 'el código postal'], ['city', 'la población']]) {
    if (!clean(s[k])) throw new HttpError(400, `Falta ${label} de envío`);
  }
  if (!/^\d{5}$/.test(s.postal_code.trim())) throw new HttpError(400, 'El código postal debe tener 5 cifras');

  const qt = await quoteCart(b.items);
  if (qt.lines.some((l) => l.unavailable)) throw new HttpError(409, 'Algún artículo ya no tiene stock suficiente. Revisa el carrito.');

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: [order] } = await client.query(`insert into elise_orders
      (user_id, status, payment_method, subtotal_cents, shipping_cents, total_cents,
       ship_name, ship_phone, ship_address, ship_postal_code, ship_city, ship_province, notes)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id, number, total_cents, status`,
    [req.user.id, method === 'bizum' ? 'pending_bizum' : 'pending_payment', method, qt.subtotal_cents, qt.shipping_cents, qt.total_cents,
      clean(s.name), clean(s.phone), clean(s.address), s.postal_code.trim(), clean(s.city), clean(s.province), clean(b.notes)]);
    for (const l of qt.lines) {
      await client.query(`insert into elise_order_items (order_id, product_id, variant_id, name, size, color, unit_price_cents, qty)
        values ($1,$2,$3,$4,$5,$6,$7,$8)`, [order.id, l.product_id, l.variant_id, l.name, l.size, l.color, l.unit_price_cents, l.qty]);
    }
    await client.query('commit');
    res.status(201).json(order);
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
}));

app.get('/api/orders/:id', auth, wrap(async (req, res) => {
  const [o] = await withItems(await q('select * from elise_orders where id = $1 and user_id = $2', [req.params.id, req.user.id]));
  if (!o) throw new HttpError(404, 'Pedido no encontrado');
  res.json(o);
}));

// ---------- PayPal ----------
async function paypalToken() {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw new HttpError(503, 'PayPal no está configurado');
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new HttpError(502, 'Error de autenticación con PayPal');
  return (await r.json()).access_token;
}

async function ownPaypalOrder(req) {
  const o = await one('select * from elise_orders where id = $1 and user_id = $2', [req.params.id, req.user.id]);
  if (!o) throw new HttpError(404, 'Pedido no encontrado');
  if (o.payment_method !== 'paypal') throw new HttpError(400, 'Este pedido no se paga con PayPal');
  return o;
}

app.post('/api/orders/:id/paypal', auth, wrap(async (req, res) => {
  const o = await ownPaypalOrder(req);
  if (o.status !== 'pending_payment') throw new HttpError(409, 'El pedido ya no está pendiente de pago');
  const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await paypalToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: o.id, custom_id: o.id, description: `Pedido ${o.number} · El Mundo de Élise`,
        amount: { currency_code: CURRENCY, value: (o.total_cents / 100).toFixed(2) },
      }],
      application_context: { shipping_preference: 'NO_SHIPPING', brand_name: 'El Mundo de Élise' },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new HttpError(502, 'No se pudo crear el pago en PayPal');
  await q('update elise_orders set paypal_order_id = $1, updated_at = now() where id = $2', [j.id, o.id]);
  res.json({ paypal_order_id: j.id });
}));

app.post('/api/orders/:id/paypal/capture', auth, wrap(async (req, res) => {
  const o = await ownPaypalOrder(req);
  if (o.status === 'paid') return res.json({ status: 'paid', number: o.number });
  if (!o.paypal_order_id) throw new HttpError(400, 'Pago de PayPal no iniciado');
  const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${o.paypal_order_id}/capture`, {
    method: 'POST', headers: { Authorization: `Bearer ${await paypalToken()}`, 'Content-Type': 'application/json' },
  });
  const j = await r.json();
  const cap = j?.purchase_units?.[0]?.payments?.captures?.[0];
  const okAmount = cap && cap.amount?.currency_code === CURRENCY && Math.round(Number(cap.amount.value) * 100) === o.total_cents;
  if (!r.ok || j.status !== 'COMPLETED' || !okAmount) throw new HttpError(402, 'El pago no se ha completado');
  try {
    await q('select elise_mark_paid($1, $2)', [o.id, o.paypal_order_id]);
  } catch (e) {
    // Cobrado pero sin stock: queda anotado para gestionar el reembolso desde el backoffice
    await q(`update elise_orders set notes = trim(coalesce(notes, '') || E'\\n[PAGADO EN PAYPAL - REVISAR STOCK] ' || $1) where id = $2`, [e.message, o.id]);
    throw new HttpError(409, 'Pago recibido, pero ha habido un problema de stock. Te contactaremos.');
  }
  res.json({ status: 'paid', number: o.number });
}));

// ---------- backoffice ----------
const adm = express.Router();
adm.use(admin);

adm.get('/products', wrap(async (_req, res) => res.json(await loadProducts())));

function productFields(b, isNew) {
  const name = clean(b.name);
  if (isNew || b.name !== undefined) { if (!name) throw new HttpError(400, 'El nombre es obligatorio'); }
  const cents = Math.round(Number(String(b.price ?? '').replace(',', '.')) * 100);
  if (!Number.isFinite(cents) || cents < 0 || b.price === '' || b.price === undefined) throw new HttpError(400, 'Precio no válido');
  return { name, price_cents: cents, description: clean(b.description), category_id: b.category_id || null, active: !!b.active };
}

async function uniqueSlug(name, exceptId = null) {
  const base = slugify(name);
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await one('select 1 from elise_products where slug = $1 and id is distinct from $2', [slug, exceptId]))) return slug;
  }
}

adm.post('/products', wrap(async (req, res) => {
  const f = productFields(req.body || {}, true);
  res.status(201).json(await one(`insert into elise_products (name, slug, price_cents, description, category_id, active)
    values ($1,$2,$3,$4,$5,$6) returning *`, [f.name, await uniqueSlug(f.name), f.price_cents, f.description, f.category_id, f.active]));
}));

adm.put('/products/:id', wrap(async (req, res) => {
  const f = productFields(req.body || {}, true);
  const p = await one(`update elise_products set name = $1, slug = $2, price_cents = $3, description = $4, category_id = $5, active = $6, updated_at = now()
    where id = $7 returning *`, [f.name, await uniqueSlug(f.name, req.params.id), f.price_cents, f.description, f.category_id, f.active, req.params.id]);
  if (!p) throw new HttpError(404, 'Prenda no encontrada');
  res.json(p);
}));

adm.delete('/products/:id', wrap(async (req, res) => {
  const imgs = await q('delete from elise_product_images where product_id = $1 returning path', [req.params.id]);
  await q('delete from elise_products where id = $1', [req.params.id]);
  imgs.forEach((i) => removeFile(i.path));
  res.json({ ok: true });
}));

// Variantes (talla / color / stock)
adm.post('/products/:id/variants', wrap(async (req, res) => {
  const b = req.body || {};
  res.status(201).json(await one(`insert into elise_product_variants (product_id, size, color, sku, stock) values ($1,$2,$3,$4,$5) returning *`,
    [req.params.id, clean(b.size), clean(b.color), clean(b.sku), Math.max(0, parseInt(b.stock, 10) || 0)]));
}));

adm.put('/variants/:id', wrap(async (req, res) => {
  const b = req.body || {};
  res.json(await one(`update elise_product_variants set size = $1, color = $2, stock = $3 where id = $4 returning *`,
    [clean(b.size), clean(b.color), Math.max(0, parseInt(b.stock, 10) || 0), req.params.id]));
}));

adm.delete('/variants/:id', wrap(async (req, res) => {
  await q('delete from elise_product_variants where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Imágenes → disco del hosting
const upload = multer({
  storage: multer.diskStorage({
    destination: PRODUCTS_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype])),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    ? cb(null, true) : cb(new HttpError(400, 'Solo imágenes JPG, PNG o WEBP'))),
});

function removeFile(publicPath) {
  if (!publicPath?.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_DIR, publicPath.slice('/uploads/'.length));
  if (file.startsWith(UPLOAD_DIR + path.sep)) fs.promises.unlink(file).catch(() => {});
}

adm.post('/products/:id/images', upload.array('images', 10), wrap(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw new HttpError(400, 'No se ha recibido ninguna imagen');
  try {
    const { max } = await one('select coalesce(max(sort), -1) as max from elise_product_images where product_id = $1', [req.params.id]);
    const out = [];
    for (const [i, f] of files.entries()) {
      out.push(await one('insert into elise_product_images (product_id, path, sort) values ($1,$2,$3) returning *',
        [req.params.id, `/uploads/products/${f.filename}`, max + 1 + i]));
    }
    res.status(201).json(out);
  } catch (e) {
    files.forEach((f) => removeFile(`/uploads/products/${f.filename}`));
    throw e;
  }
}));

adm.put('/images/:id', wrap(async (req, res) => {
  res.json(await one('update elise_product_images set sort = $1 where id = $2 returning *', [parseInt(req.body?.sort, 10) || 0, req.params.id]));
}));

adm.delete('/images/:id', wrap(async (req, res) => {
  const img = await one('delete from elise_product_images where id = $1 returning path', [req.params.id]);
  if (img) removeFile(img.path);
  res.json({ ok: true });
}));

// Categorías
adm.post('/categories', wrap(async (req, res) => {
  const name = clean(req.body?.name);
  if (!name) throw new HttpError(400, 'Nombre obligatorio');
  res.status(201).json(await one(`insert into elise_categories (name, slug, sort) values ($1,$2,$3)
    on conflict (slug) do update set name = excluded.name returning *`, [name, slugify(name), parseInt(req.body.sort, 10) || 0]));
}));
adm.delete('/categories/:id', wrap(async (req, res) => {
  await q('delete from elise_categories where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Pedidos
const STATUSES = ['pending_payment', 'pending_bizum', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'];

// Pedidos por atender (aviso del backoffice): Bizum por confirmar o pagados sin preparar
adm.get('/orders/pending-count', wrap(async (_req, res) => {
  const r = await one(`select count(*)::int as count, max(created_at) as latest
    from elise_orders where status in ('pending_bizum', 'paid')`);
  res.json(r);
}));
adm.get('/orders', wrap(async (req, res) => {
  const filter = STATUSES.includes(req.query.status) ? req.query.status : null;
  res.json(await withItems(await q(`select o.*, u.email from elise_orders o join elise_users u on u.id = o.user_id
    where $1::text is null or o.status = $1 order by o.created_at desc limit 300`, [filter])));
}));

adm.patch('/orders/:id', wrap(async (req, res) => {
  const { status, tracking } = req.body || {};
  if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, 'Estado no válido');
  if (status === 'paid') {
    try { await q('select elise_mark_paid($1, null)', [req.params.id]); } catch (e) { throw new HttpError(409, e.message); }
  } else if (status) {
    await q('update elise_orders set status = $1, updated_at = now() where id = $2', [status, req.params.id]);
  }
  if (tracking !== undefined) await q('update elise_orders set tracking = $1, updated_at = now() where id = $2', [clean(tracking), req.params.id]);
  res.json(await one('select * from elise_orders where id = $1', [req.params.id]));
}));

app.use('/api/admin', adm);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

// Frontend React (web/dist). En producción lo sirve Caddy; esto es por si se usa Node solo.
const DIST = path.join(__dirname, 'web', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get(/^\/admin(\/.*)?$/, (_req, res) => res.sendFile(path.join(DIST, 'admin', 'index.html')));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// ---------- errores ----------
app.use((err, _req, res, _next) => {
  let status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  let msg = err.message;
  if (err.code === '22P02') { status = 400; msg = 'Identificador no válido'; } // uuid mal formado
  if (status >= 500) { console.error(err); msg = 'Error interno'; }
  res.status(status).json({ error: msg || 'Error interno' });
});

// Limpieza diaria de sesiones caducadas
setInterval(() => q('delete from elise_sessions where expires_at < now()').catch(() => {}), 24 * 3600 * 1000).unref();

app.listen(PORT, '127.0.0.1', () => console.log(`El Mundo de Élise escuchando en http://127.0.0.1:${PORT}`));

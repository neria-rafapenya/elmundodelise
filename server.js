// El mundo de Lise · servidor de la tienda
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

const PORT = Number(env.PORT || 3002);
const UPLOAD_DIR = path.resolve(env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
const PRODUCTS_DIR = path.join(UPLOAD_DIR, 'products');
const SHIPPING_CENTS = Number(env.SHIPPING_CENTS || 0);
const FREE_SHIPPING_FROM_CENTS = Number(env.FREE_SHIPPING_FROM_CENTS || 0);
const PAYPAL_BASE = env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[k]) console.warn(`[aviso] Falta ${k} en .env`);
}
fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

const db = createClient(env.SUPABASE_URL || 'http://localhost', env.SUPABASE_SERVICE_ROLE_KEY || 'x', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------- utilidades ----------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const must = ({ data, error }) => { if (error) throw new HttpError(500, error.message); return data; };

const slugify = (s) => s.toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'producto';

function shippingFor(subtotal) {
  if (FREE_SHIPPING_FROM_CENTS > 0 && subtotal >= FREE_SHIPPING_FROM_CENTS) return 0;
  return SHIPPING_CENTS;
}

async function auth(req, _res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Inicia sesión para continuar');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) throw new HttpError(401, 'Sesión no válida');
    req.user = data.user;
    next();
  } catch (e) { next(e); }
}

async function admin(req, _res, next) {
  try {
    const { data } = await db.from('elise_profiles').select('is_admin').eq('id', req.user.id).maybeSingle();
    if (!data?.is_admin) throw new HttpError(403, 'Solo administradores');
    next();
  } catch (e) { next(e); }
}

const PRODUCT_SELECT = 'id,name,slug,description,price_cents,active,category_id,created_at,' +
  'elise_product_images(id,path,sort),elise_product_variants(id,size,color,sku,stock)';

function shapeProduct(p) {
  const images = (p.elise_product_images || []).sort((a, b) => a.sort - b.sort);
  const variants = (p.elise_product_variants || []).sort((a, b) => (a.size || '').localeCompare(b.size || ''));
  const { elise_product_images, elise_product_variants, ...rest } = p;
  return { ...rest, images, variants, in_stock: variants.some((v) => v.stock > 0) };
}

// ---------- público ----------
app.get('/api/config', (_req, res) => res.json({
  supabaseUrl: env.SUPABASE_URL,
  supabaseAnonKey: env.SUPABASE_ANON_KEY,
  paypalClientId: env.PAYPAL_CLIENT_ID || null,
  bizumPhone: env.BIZUM_PHONE || null,
  shippingCents: SHIPPING_CENTS,
  freeShippingFromCents: FREE_SHIPPING_FROM_CENTS,
}));

app.get('/api/categories', wrap(async (_req, res) => {
  res.json(must(await db.from('elise_categories').select('id,name,slug').order('sort')));
}));

app.get('/api/products', wrap(async (req, res) => {
  let q = db.from('elise_products').select(PRODUCT_SELECT).eq('active', true).order('created_at', { ascending: false });
  if (req.query.category) {
    const cat = must(await db.from('elise_categories').select('id').eq('slug', req.query.category).maybeSingle());
    if (!cat) return res.json([]);
    q = q.eq('category_id', cat.id);
  }
  res.json(must(await q).map(shapeProduct));
}));

app.get('/api/products/:slug', wrap(async (req, res) => {
  const p = must(await db.from('elise_products').select(PRODUCT_SELECT)
    .eq('slug', req.params.slug).eq('active', true).maybeSingle());
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  res.json(shapeProduct(p));
}));

// Precios y stock reales del carrito (el navegador solo guarda variante + cantidad)
app.post('/api/cart/quote', wrap(async (req, res) => {
  res.json(await quoteCart(req.body?.items));
}));

async function quoteCart(items) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'El carrito está vacío');
  const ids = [...new Set(items.map((i) => i.variant_id))];
  const variants = must(await db.from('elise_product_variants')
    .select('id,size,color,stock,product_id,elise_products(id,name,slug,price_cents,active,elise_product_images(path,sort))')
    .in('id', ids));
  const byId = Object.fromEntries(variants.map((v) => [v.id, v]));
  const lines = [];
  for (const it of items) {
    const v = byId[it.variant_id];
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    if (!v || !v.elise_products?.active) { lines.push({ variant_id: it.variant_id, unavailable: true, qty }); continue; }
    const p = v.elise_products;
    const img = (p.elise_product_images || []).sort((a, b) => a.sort - b.sort)[0];
    lines.push({
      variant_id: v.id, product_id: p.id, name: p.name, slug: p.slug, size: v.size, color: v.color,
      image: img?.path || null, unit_price_cents: p.price_cents, qty, stock: v.stock,
      unavailable: v.stock < qty, line_cents: p.price_cents * qty,
    });
  }
  const subtotal = lines.filter((l) => !l.unavailable).reduce((s, l) => s + l.line_cents, 0);
  const shipping = subtotal > 0 ? shippingFor(subtotal) : 0;
  return { lines, subtotal_cents: subtotal, shipping_cents: shipping, total_cents: subtotal + shipping };
}

// ---------- cuenta ----------
app.get('/api/me', auth, wrap(async (req, res) => {
  const profile = must(await db.from('elise_profiles').select('*').eq('id', req.user.id).maybeSingle());
  res.json({ id: req.user.id, email: req.user.email, profile });
}));

app.put('/api/me', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const row = {
    id: req.user.id,
    full_name: b.full_name?.trim() || null, phone: b.phone?.trim() || null,
    address: b.address?.trim() || null, postal_code: b.postal_code?.trim() || null,
    city: b.city?.trim() || null, province: b.province?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  res.json(must(await db.from('elise_profiles').upsert(row).select().single()));
}));

app.get('/api/me/orders', auth, wrap(async (req, res) => {
  res.json(must(await db.from('elise_orders')
    .select('id,number,status,payment_method,total_cents,created_at,elise_order_items(name,size,color,qty,unit_price_cents)')
    .eq('user_id', req.user.id).order('created_at', { ascending: false })));
}));

// ---------- pedidos ----------
app.post('/api/orders', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const method = b.payment_method;
  if (!['paypal', 'bizum'].includes(method)) throw new HttpError(400, 'Método de pago no válido');
  const s = b.shipping || {};
  for (const [k, label] of [['name', 'nombre'], ['address', 'dirección'], ['postal_code', 'código postal'], ['city', 'población']]) {
    if (!s[k]?.trim()) throw new HttpError(400, `Falta la ${label} de envío`);
  }
  if (!/^\d{5}$/.test(s.postal_code.trim())) throw new HttpError(400, 'El código postal debe tener 5 cifras');

  const q = await quoteCart(b.items);
  if (q.lines.some((l) => l.unavailable)) throw new HttpError(409, 'Algún artículo ya no tiene stock suficiente. Revisa el carrito.');

  // Asegura que el usuario tiene perfil en la tienda
  await db.from('elise_profiles').upsert({ id: req.user.id }, { onConflict: 'id', ignoreDuplicates: true });

  const order = must(await db.from('elise_orders').insert({
    user_id: req.user.id,
    status: method === 'bizum' ? 'pending_bizum' : 'pending_payment',
    payment_method: method,
    subtotal_cents: q.subtotal_cents, shipping_cents: q.shipping_cents, total_cents: q.total_cents,
    ship_name: s.name.trim(), ship_phone: s.phone?.trim() || null, ship_address: s.address.trim(),
    ship_postal_code: s.postal_code.trim(), ship_city: s.city.trim(), ship_province: s.province?.trim() || null,
    notes: b.notes?.trim() || null,
  }).select('id,number,total_cents,status').single());

  must(await db.from('elise_order_items').insert(q.lines.map((l) => ({
    order_id: order.id, product_id: l.product_id, variant_id: l.variant_id, name: l.name,
    size: l.size, color: l.color, unit_price_cents: l.unit_price_cents, qty: l.qty,
  }))));

  res.status(201).json({ ...order, bizum_phone: method === 'bizum' ? env.BIZUM_PHONE || null : undefined });
}));

app.get('/api/orders/:id', auth, wrap(async (req, res) => {
  const o = must(await db.from('elise_orders').select('*,elise_order_items(*)')
    .eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle());
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
  const j = await r.json();
  if (!r.ok) throw new HttpError(502, 'Error de autenticación con PayPal');
  return j.access_token;
}

async function ownOrder(req, status) {
  const o = must(await db.from('elise_orders').select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle());
  if (!o) throw new HttpError(404, 'Pedido no encontrado');
  if (o.payment_method !== 'paypal') throw new HttpError(400, 'Este pedido no se paga con PayPal');
  if (status && o.status !== status) throw new HttpError(409, 'El pedido ya no está pendiente de pago');
  return o;
}

app.post('/api/orders/:id/paypal', auth, wrap(async (req, res) => {
  const o = await ownOrder(req, 'pending_payment');
  const token = await paypalToken();
  const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: o.id, custom_id: o.id, description: `Pedido ${o.number} · El mundo de Lise`,
        amount: { currency_code: 'EUR', value: (o.total_cents / 100).toFixed(2) },
      }],
      application_context: { shipping_preference: 'NO_SHIPPING', brand_name: 'El mundo de Lise' },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new HttpError(502, 'No se pudo crear el pago en PayPal');
  must(await db.from('elise_orders').update({ paypal_order_id: j.id }).eq('id', o.id));
  res.json({ paypal_order_id: j.id });
}));

app.post('/api/orders/:id/paypal/capture', auth, wrap(async (req, res) => {
  const o = await ownOrder(req);
  if (o.status === 'paid') return res.json({ status: 'paid', number: o.number });
  if (!o.paypal_order_id) throw new HttpError(400, 'Pago de PayPal no iniciado');
  const token = await paypalToken();
  const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${o.paypal_order_id}/capture`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const j = await r.json();
  const cap = j?.purchase_units?.[0]?.payments?.captures?.[0];
  const okAmount = cap && cap.amount?.currency_code === 'EUR' && Math.round(Number(cap.amount.value) * 100) === o.total_cents;
  if (!r.ok || j.status !== 'COMPLETED' || !okAmount) throw new HttpError(402, 'El pago no se ha completado');
  const { error } = await db.rpc('elise_mark_paid', { p_order_id: o.id, p_paypal_id: o.paypal_order_id });
  if (error) {
    // Cobrado pero sin stock: queda registrado para gestionarlo (reembolso) desde el backoffice
    await db.from('elise_orders').update({ notes: `${o.notes || ''}\n[PAGADO EN PAYPAL - REVISAR STOCK] ${error.message}`.trim() }).eq('id', o.id);
    throw new HttpError(409, 'Pago recibido, pero ha habido un problema de stock. Te contactaremos.');
  }
  res.json({ status: 'paid', number: o.number });
}));

// ---------- backoffice ----------
const adm = express.Router();
adm.use(auth, admin);

adm.get('/products', wrap(async (_req, res) => {
  res.json(must(await db.from('elise_products').select(PRODUCT_SELECT).order('created_at', { ascending: false })).map(shapeProduct));
}));

function productFields(b) {
  const out = {};
  if (b.name !== undefined) { if (!b.name.trim()) throw new HttpError(400, 'El nombre es obligatorio'); out.name = b.name.trim(); }
  if (b.description !== undefined) out.description = b.description?.trim() || null;
  if (b.price !== undefined) {
    const cents = Math.round(Number(String(b.price).replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents < 0) throw new HttpError(400, 'Precio no válido');
    out.price_cents = cents;
  }
  if (b.category_id !== undefined) out.category_id = b.category_id || null;
  if (b.active !== undefined) out.active = !!b.active;
  return out;
}

async function uniqueSlug(name, exceptId) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    let q = db.from('elise_products').select('id').eq('slug', slug);
    if (exceptId) q = q.neq('id', exceptId);
    if (!must(await q).length) return slug;
    slug = `${base}-${i}`;
  }
}

adm.post('/products', wrap(async (req, res) => {
  const f = productFields(req.body || {});
  if (!f.name || f.price_cents === undefined) throw new HttpError(400, 'Nombre y precio son obligatorios');
  f.slug = await uniqueSlug(f.name);
  res.status(201).json(must(await db.from('elise_products').insert(f).select().single()));
}));

adm.put('/products/:id', wrap(async (req, res) => {
  const f = productFields(req.body || {});
  if (f.name) f.slug = await uniqueSlug(f.name, req.params.id);
  f.updated_at = new Date().toISOString();
  res.json(must(await db.from('elise_products').update(f).eq('id', req.params.id).select().single()));
}));

adm.delete('/products/:id', wrap(async (req, res) => {
  const imgs = must(await db.from('elise_product_images').select('path').eq('product_id', req.params.id));
  must(await db.from('elise_products').delete().eq('id', req.params.id));
  imgs.forEach((i) => removeFile(i.path));
  res.json({ ok: true });
}));

// Variantes (talla / color / stock)
adm.post('/products/:id/variants', wrap(async (req, res) => {
  const b = req.body || {};
  res.status(201).json(must(await db.from('elise_product_variants').insert({
    product_id: req.params.id, size: b.size?.trim() || null, color: b.color?.trim() || null,
    sku: b.sku?.trim() || null, stock: Math.max(0, parseInt(b.stock, 10) || 0),
  }).select().single()));
}));

adm.put('/variants/:id', wrap(async (req, res) => {
  const b = req.body || {};
  const f = {};
  for (const k of ['size', 'color', 'sku']) if (b[k] !== undefined) f[k] = b[k]?.trim() || null;
  if (b.stock !== undefined) f.stock = Math.max(0, parseInt(b.stock, 10) || 0);
  res.json(must(await db.from('elise_product_variants').update(f).eq('id', req.params.id).select().single()));
}));

adm.delete('/variants/:id', wrap(async (req, res) => {
  must(await db.from('elise_product_variants').delete().eq('id', req.params.id));
  res.json({ ok: true });
}));

// Imágenes → disco del hosting
const upload = multer({
  storage: multer.diskStorage({
    destination: PRODUCTS_DIR,
    filename: (_req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype];
      cb(null, crypto.randomUUID() + ext);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    ? null : new HttpError(400, 'Solo imágenes JPG, PNG o WEBP'), true),
});

function removeFile(publicPath) {
  if (!publicPath?.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_DIR, publicPath.slice('/uploads/'.length));
  if (file.startsWith(UPLOAD_DIR)) fs.promises.unlink(file).catch(() => {});
}

adm.post('/products/:id/images', upload.array('images', 10), wrap(async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw new HttpError(400, 'No se ha recibido ninguna imagen');
  const existing = must(await db.from('elise_product_images').select('sort').eq('product_id', req.params.id));
  let sort = existing.reduce((m, i) => Math.max(m, i.sort), -1) + 1;
  const rows = files.map((f) => ({ product_id: req.params.id, path: `/uploads/products/${f.filename}`, sort: sort++ }));
  const { data, error } = await db.from('elise_product_images').insert(rows).select();
  if (error) { rows.forEach((r) => removeFile(r.path)); throw new HttpError(500, error.message); }
  res.status(201).json(data);
}));

adm.put('/images/:id', wrap(async (req, res) => {
  res.json(must(await db.from('elise_product_images').update({ sort: parseInt(req.body?.sort, 10) || 0 })
    .eq('id', req.params.id).select().single()));
}));

adm.delete('/images/:id', wrap(async (req, res) => {
  const img = must(await db.from('elise_product_images').delete().eq('id', req.params.id).select('path').maybeSingle());
  if (img) removeFile(img.path);
  res.json({ ok: true });
}));

// Categorías
adm.post('/categories', wrap(async (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) throw new HttpError(400, 'Nombre obligatorio');
  res.status(201).json(must(await db.from('elise_categories').insert({ name, slug: slugify(name), sort: parseInt(req.body.sort, 10) || 0 }).select().single()));
}));
adm.delete('/categories/:id', wrap(async (req, res) => {
  must(await db.from('elise_categories').delete().eq('id', req.params.id));
  res.json({ ok: true });
}));

// Pedidos
adm.get('/orders', wrap(async (req, res) => {
  let q = db.from('elise_orders').select('*,elise_order_items(*)').order('created_at', { ascending: false }).limit(200);
  if (req.query.status) q = q.eq('status', req.query.status);
  const orders = must(await q);
  const ids = [...new Set(orders.map((o) => o.user_id))];
  const emails = {};
  for (const id of ids) {
    const { data } = await db.auth.admin.getUserById(id);
    emails[id] = data?.user?.email || null;
  }
  res.json(orders.map((o) => ({ ...o, email: emails[o.user_id] })));
}));

adm.patch('/orders/:id', wrap(async (req, res) => {
  const { status, tracking } = req.body || {};
  if (status === 'paid') {
    const { error } = await db.rpc('elise_mark_paid', { p_order_id: req.params.id, p_paypal_id: null });
    if (error) throw new HttpError(409, error.message);
  }
  const f = { updated_at: new Date().toISOString() };
  if (status && status !== 'paid') {
    if (!['preparing', 'shipped', 'delivered', 'cancelled', 'pending_bizum', 'pending_payment'].includes(status)) throw new HttpError(400, 'Estado no válido');
    f.status = status;
  }
  if (tracking !== undefined) f.tracking = tracking?.trim() || null;
  res.json(must(await db.from('elise_orders').update(f).eq('id', req.params.id).select().single()));
}));

app.use('/api/admin', adm);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

// ---------- errores ----------
app.use((err, _req, res, _next) => {
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error interno' });
});

app.listen(PORT, '127.0.0.1', () => console.log(`El mundo de Lise escuchando en http://127.0.0.1:${PORT}`));

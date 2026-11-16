// Utilidades compartidas: configuración, sesión, API, carrito y cabecera
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const config = await fetch('/api/config').then((r) => r.json());
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (cents) => (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
export const params = new URLSearchParams(location.search);

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const session = await getSession();
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`/api${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Error'), { status: r.status });
  return j;
}

export async function requireLogin() {
  const s = await getSession();
  if (!s) location.href = `/cuenta.html?next=${encodeURIComponent(location.pathname + location.search)}`;
  return s;
}

// ---------- carrito (localStorage: solo variante y cantidad) ----------
const KEY = 'elise_cart';
export const cart = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } },
  save(items) { localStorage.setItem(KEY, JSON.stringify(items)); updateCartCount(); },
  add(variant_id, qty = 1) {
    const items = cart.get();
    const it = items.find((i) => i.variant_id === variant_id);
    if (it) it.qty += qty; else items.push({ variant_id, qty });
    cart.save(items);
  },
  set(variant_id, qty) { cart.save(cart.get().map((i) => (i.variant_id === variant_id ? { ...i, qty } : i)).filter((i) => i.qty > 0)); },
  remove(variant_id) { cart.save(cart.get().filter((i) => i.variant_id !== variant_id)); },
  clear() { cart.save([]); },
  count() { return cart.get().reduce((s, i) => s + i.qty, 0); },
};

function updateCartCount() {
  const el = $('#cart-count');
  if (el) { const n = cart.count(); el.textContent = n; el.hidden = n === 0; }
}

export function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

// ---------- PayPal ----------
function loadPaypal() {
  if (window.paypal) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.paypalClientId)}&currency=EUR&locale=es_ES`;
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}

export async function paypalButtons(orderId, selector) {
  await loadPaypal();
  window.paypal.Buttons({
    style: { shape: 'pill', color: 'black' },
    createOrder: async () => (await api(`/orders/${orderId}/paypal`, { method: 'POST' })).paypal_order_id,
    onApprove: async () => {
      try { await api(`/orders/${orderId}/paypal/capture`, { method: 'POST' }); location.href = `/pedido.html?id=${orderId}&ok=1`; }
      catch (e) { toast(e.message, 'err'); }
    },
    onError: () => toast('No se ha podido completar el pago', 'err'),
  }).render(selector);
}

// ---------- cabecera y pie ----------
export async function renderShell() {
  const session = await getSession();
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="wrap header-inner">
      <a href="/" class="logo">El mundo <em>de</em> Lise</a>
      <nav>
        <a href="/">Tienda</a>
        <a href="/cuenta.html">${session ? 'Mi cuenta' : 'Entrar'}</a>
        <a href="/carrito.html" class="cart-link" aria-label="Carrito">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
          <span id="cart-count" class="badge" hidden>0</span>
        </a>
      </nav>
    </div>`;
  document.body.prepend(header);
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `<div class="wrap">© ${new Date().getFullYear()} El mundo de Lise · Pago seguro con PayPal o Bizum</div>`;
  document.body.append(footer);
  updateCartCount();
}

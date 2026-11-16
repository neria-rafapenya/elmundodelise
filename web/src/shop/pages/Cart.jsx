import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../../shared/api.js';
import { useShop } from '../store.jsx';

// Pide al servidor precios y stock reales del carrito
export function useQuote(items) {
  const [q, setQ] = useState(null);
  const [error, setError] = useState('');
  const key = JSON.stringify(items);
  useEffect(() => {
    if (!items.length) { setQ({ lines: [], subtotal_cents: 0, shipping_cents: 0, total_cents: 0 }); return; }
    api('/cart/quote', { method: 'POST', body: { items } }).then(setQ).catch(() => setError('No se ha podido cargar el carrito.'));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { q, error };
}

export function Summary({ q, children }) {
  return (
    <>
      <div className="r"><span>Subtotal</span><span>{money(q.subtotal_cents)}</span></div>
      <div className="r"><span>Envío</span><span>{q.shipping_cents ? money(q.shipping_cents) : 'Gratis'}</span></div>
      <div className="r total"><span>Total</span><span>{money(q.total_cents)}</span></div>
      {children}
    </>
  );
}

export default function Cart() {
  const { cart } = useShop();
  const { q, error } = useQuote(cart.items);

  if (!cart.items.length) {
    return (
      <div className="wrap" style={{ padding: '36px 20px' }}>
        <h1>Tu carrito</h1>
        <p className="muted">Tu carrito está vacío.</p>
        <Link className="btn ghost" to="/">Ir a la tienda</Link>
      </div>
    );
  }

  const blocked = q?.lines.some((l) => l.unavailable);
  return (
    <div className="wrap">
      <div className="two-col">
        <section>
          <h1>Tu carrito</h1>
          {error && <p className="error">{error}</p>}
          {!q && !error && <p className="muted">Cargando…</p>}
          {q?.lines.map((l) => l.name ? (
            <div className="line" key={l.variant_id}>
              {l.image ? <img src={l.image} alt="" /> : <div className="noimg" />}
              <div>
                <Link to={`/producto/${l.slug}`}><strong>{l.name}</strong></Link>
                <div className="meta">{[l.size, l.color].filter(Boolean).join(' · ')} · {money(l.unit_price_cents)}</div>
                {l.unavailable && <div className="error">Solo quedan {l.stock} unidades</div>}
                <div className="qty">
                  <button onClick={() => cart.set(l.variant_id, l.qty - 1)}>−</button>
                  <span>{l.qty}</span>
                  <button onClick={() => cart.set(l.variant_id, l.qty + 1)} disabled={l.qty >= l.stock}>+</button>
                </div>
                <button className="link-btn" onClick={() => cart.remove(l.variant_id)}>Eliminar</button>
              </div>
              <strong>{money(l.line_cents)}</strong>
            </div>
          ) : (
            <div className="line" key={l.variant_id}>
              <div className="noimg" /><div className="error">Este artículo ya no está disponible</div>
              <button className="link-btn" onClick={() => cart.remove(l.variant_id)}>Quitar</button>
            </div>
          ))}
        </section>
        {q && (
          <aside className="box summary">
            <h2>Resumen</h2>
            <Summary q={q}>
              {blocked
                ? <><button className="btn block" style={{ marginTop: 18 }} disabled>Tramitar pedido</button><p className="error" style={{ marginTop: 10 }}>Ajusta las cantidades marcadas para continuar.</p></>
                : <Link className="btn block" style={{ marginTop: 18 }} to="/checkout">Tramitar pedido</Link>}
            </Summary>
          </aside>
        )}
      </div>
    </div>
  );
}

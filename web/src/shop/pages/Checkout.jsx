import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, money } from '../../shared/api.js';
import { useShop } from '../store.jsx';
import { Summary, useQuote } from './Cart.jsx';
import PaypalButtons from '../PaypalButtons.jsx';

export default function Checkout() {
  const { user, setUser, config, cart } = useShop();
  const navigate = useNavigate();
  const { q } = useQuote(cart.items);
  const [f, setF] = useState({
    name: user.full_name || '', phone: user.phone || '', address: user.address || '',
    postal_code: user.postal_code || '', city: user.city || '', province: user.province || '', notes: '', save: true,
  });
  const methods = [config?.paypalClientId && 'paypal', config?.bizumPhone && 'bizum'].filter(Boolean);
  const [pay, setPay] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);

  useEffect(() => { if (!pay && methods.length) setPay(methods[0]); }, [methods.join()]); // eslint-disable-line

  if (!cart.items.length && !order) return <Navigate to="/carrito" replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!pay) return setError('No hay ningún método de pago disponible ahora mismo.');
    setBusy(true);
    try {
      if (f.save) {
        setUser(await api('/me', { method: 'PUT', body: { full_name: f.name, phone: f.phone, address: f.address, postal_code: f.postal_code, city: f.city, province: f.province } }));
      }
      const o = await api('/orders', { method: 'POST', body: {
        items: cart.items, payment_method: pay, notes: f.notes,
        shipping: { name: f.name, phone: f.phone, address: f.address, postal_code: f.postal_code, city: f.city, province: f.province },
      } });
      cart.clear();
      if (pay === 'bizum') navigate(`/pedido/${o.id}`);
      else setOrder(o);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="wrap">
      <div className="two-col">
        <section className="stack">
          <h1>Finalizar compra</h1>
          {order ? (
            <div className="box">
              <h2>Pedido nº {order.number}</h2>
              <p>Total: <strong>{money(order.total_cents)}</strong>. Completa el pago:</p>
              <PaypalButtons clientId={config.paypalClientId} orderId={order.id} />
              <p className="muted" style={{ fontSize: '.85rem' }}>Si cierras esta página, podrás pagar más tarde desde <Link to={`/pedido/${order.id}`}>tu pedido</Link>.</p>
            </div>
          ) : (
            <form className="box" onSubmit={submit} noValidate>
              <h2>Datos de envío</h2>
              <div className="field"><label>Nombre y apellidos *</label><input value={f.name} onChange={set('name')} autoComplete="name" /></div>
              <div className="row">
                <div className="field"><label>Teléfono</label><input value={f.phone} onChange={set('phone')} type="tel" autoComplete="tel" /></div>
                <div className="field"><label>Email</label><input value={user.email} disabled /></div>
              </div>
              <div className="field"><label>Dirección *</label><input value={f.address} onChange={set('address')} autoComplete="street-address" /></div>
              <div className="row">
                <div className="field"><label>Código postal *</label><input value={f.postal_code} onChange={set('postal_code')} inputMode="numeric" maxLength={5} autoComplete="postal-code" /></div>
                <div className="field"><label>Población *</label><input value={f.city} onChange={set('city')} autoComplete="address-level2" /></div>
              </div>
              <div className="field"><label>Provincia</label><input value={f.province} onChange={set('province')} autoComplete="address-level1" /></div>
              <div className="field"><label>Notas para el pedido</label><textarea rows={2} value={f.notes} onChange={set('notes')} /></div>
              <label className="check"><input type="checkbox" checked={f.save} onChange={set('save')} /> Guardar estos datos en mi perfil</label>

              <h2 style={{ marginTop: 26 }}>Pago</h2>
              {methods.includes('paypal') && (
                <label className="pay-opt"><input type="radio" name="pay" checked={pay === 'paypal'} onChange={() => setPay('paypal')} /> <span><strong>PayPal</strong> <span className="muted">· también tarjeta</span></span></label>
              )}
              {methods.includes('bizum') && (
                <label className="pay-opt"><input type="radio" name="pay" checked={pay === 'bizum'} onChange={() => setPay('bizum')} /> <span><strong>Bizum</strong> <span className="muted">· te damos el número y la referencia</span></span></label>
              )}
              {error && <p className="error">{error}</p>}
              <button className="btn block" disabled={busy}>{busy ? 'Creando pedido…' : 'Realizar pedido'}</button>
            </form>
          )}
        </section>
        <aside className="box summary">
          <h2>Tu pedido</h2>
          {!q ? <p className="muted">Cargando…</p> : (
            <>
              {q.lines.filter((l) => l.name).map((l) => (
                <div className="r" key={l.variant_id}><span>{l.qty} × {l.name} <span className="muted">{l.size}</span></span><span>{money(l.line_cents)}</span></div>
              ))}
              <div style={{ marginTop: 14 }}><Summary q={order ? { ...q, total_cents: order.total_cents } : q} /></div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, money, STATUS } from '../../shared/api.js';
import { useToast } from '../../shared/toast.jsx';

export default function Orders({ refresh = 0 }) {
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [orders, setOrders] = useState(null);

  const load = () => api('/admin/orders' + (filter ? `?status=${filter}` : '')).then(setOrders).catch(() => setOrders([]));
  useEffect(() => { setOrders(null); load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (refresh) load(); }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  async function changeStatus(o, status) {
    if (status === 'paid' && !confirm(`¿Confirmas que has recibido el pago del pedido ${o.number}? Se descontará el stock.`)) return;
    try { await api(`/admin/orders/${o.id}`, { method: 'PATCH', body: { status } }); toast('Estado actualizado'); }
    catch (err) { toast(err.message, 'err'); }
    load();
    window.dispatchEvent(new Event('elise:orders-changed')); // actualiza el aviso al momento
  }
  async function saveTracking(o, tracking) {
    if ((o.tracking || '') === tracking) return;
    try { await api(`/admin/orders/${o.id}`, { method: 'PATCH', body: { tracking } }); toast('Seguimiento guardado'); load(); }
    catch (err) { toast(err.message, 'err'); }
  }

  return (
    <>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="muted">{orders ? `${orders.length} pedido(s)` : 'Cargando…'}</span>
      </div>
      <table>
        <thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Artículos</th><th>Total</th><th>Pago</th><th>Estado</th></tr></thead>
        <tbody>
          {orders?.map((o) => (
            <tr key={o.id}>
              <td><strong>{o.number}</strong></td>
              <td>{new Date(o.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td>
                {o.ship_name}
                <div className="muted" style={{ fontSize: '.8rem' }}>
                  {o.email}{o.ship_phone && ` · ${o.ship_phone}`}<br />{o.ship_address}, {o.ship_postal_code} {o.ship_city}
                </div>
                {o.notes && <div style={{ fontSize: '.8rem', color: 'var(--warn)' }}>📝 {o.notes}</div>}
              </td>
              <td style={{ fontSize: '.85rem' }}>{o.items.map((i) => <div key={i.id}>{i.qty}× {i.name} {i.size}</div>)}</td>
              <td>{money(o.total_cents)}</td>
              <td>{o.payment_method === 'bizum' ? 'Bizum' : 'PayPal'}</td>
              <td>
                <select value={o.status} onChange={(e) => changeStatus(o, e.target.value)}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input defaultValue={o.tracking || ''} placeholder="Nº seguimiento" style={{ marginTop: 6, fontSize: '.8rem' }}
                  onBlur={(e) => saveTracking(o, e.target.value.trim())} />
              </td>
            </tr>
          ))}
          {orders && !orders.length && <tr><td colSpan={7} className="muted center">No hay pedidos.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

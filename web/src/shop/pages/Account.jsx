import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, money, STATUS } from '../../shared/api.js';
import { useToast } from '../../shared/toast.jsx';
import { useShop } from '../store.jsx';

// Perfil del cliente: sus pedidos, sus datos y su contraseña
export default function Account() {
  const { user, setUser } = useShop();
  const navigate = useNavigate();
  const toast = useToast();
  const [orders, setOrders] = useState(null);
  const [f, setF] = useState({
    full_name: user.full_name || '', phone: user.phone || '', address: user.address || '',
    postal_code: user.postal_code || '', city: user.city || '', province: user.province || '',
  });
  const [pw, setPw] = useState({ current: '', password: '' });

  useEffect(() => { api('/me/orders').then(setOrders).catch(() => setOrders([])); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    try { setUser(await api('/me', { method: 'PUT', body: f })); toast('Datos guardados'); }
    catch (err) { toast(err.message, 'err'); }
  }
  async function changePassword(e) {
    e.preventDefault();
    try { await api('/auth/password', { method: 'POST', body: pw }); toast('Contraseña cambiada'); setPw({ current: '', password: '' }); }
    catch (err) { toast(err.message, 'err'); }
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    navigate('/');
  }

  return (
    <div className="wrap">
      <div className="two-col">
        <section>
          <h1>Hola{user.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}</h1>
          <h2>Mis pedidos</h2>
          {!orders && <p className="muted">Cargando…</p>}
          {orders && !orders.length && <p className="muted">Todavía no has hecho ningún pedido. <Link to="/">Ver la tienda</Link></p>}
          {orders?.map((o) => (
            <div className="order" key={o.id}>
              <Link to={`/pedido/${o.id}`}><strong>Pedido nº {o.number}</strong></Link>{' '}
              <span className={`status ${o.status}`}>{STATUS[o.status]}</span>
              <div className="muted" style={{ fontSize: '.9rem' }}>
                {new Date(o.created_at).toLocaleDateString('es-ES')} · {money(o.total_cents)} · {o.items.reduce((s, i) => s + i.qty, 0)} artículo(s)
              </div>
            </div>
          ))}
        </section>
        <aside className="stack">
          <form className="box" onSubmit={save}>
            <h2>Mis datos</h2>
            <div className="field"><label>Email</label><input value={user.email} disabled /></div>
            <div className="field"><label>Nombre y apellidos</label><input value={f.full_name} onChange={set('full_name')} /></div>
            <div className="field"><label>Teléfono</label><input value={f.phone} onChange={set('phone')} /></div>
            <div className="field"><label>Dirección</label><input value={f.address} onChange={set('address')} /></div>
            <div className="row">
              <div className="field"><label>C. postal</label><input value={f.postal_code} onChange={set('postal_code')} /></div>
              <div className="field"><label>Población</label><input value={f.city} onChange={set('city')} /></div>
            </div>
            <div className="field"><label>Provincia</label><input value={f.province} onChange={set('province')} /></div>
            <button className="btn block">Guardar</button>
          </form>
          <form className="box" onSubmit={changePassword}>
            <h2>Cambiar contraseña</h2>
            <div className="field"><label>Contraseña actual</label><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></div>
            <div className="field"><label>Nueva contraseña</label><input type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" /></div>
            <button className="btn ghost block">Cambiar</button>
          </form>
          <button className="btn ghost block" onClick={logout}>Cerrar sesión</button>
        </aside>
      </div>
    </div>
  );
}

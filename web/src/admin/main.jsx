// Backoffice de El Mundo de Élise: aplicación separada de la tienda, solo para administración
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import '../shared/styles.css';
import { api } from '../shared/api.js';
import { ToastProvider, useToast } from '../shared/toast.jsx';
import usePendingOrders from './usePendingOrders.js';
import Products from './pages/Products.jsx';
import ProductEdit from './pages/ProductEdit.jsx';
import Orders from './pages/Orders.jsx';
import Categories from './pages/Categories.jsx';

function AdminLogin({ onLogin }) {
  const [f, setF] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const u = await api('/auth/login', { method: 'POST', body: f });
      if (!u.is_admin) {
        await api('/auth/logout', { method: 'POST' });
        return setError('Esta cuenta no tiene acceso al backoffice.');
      }
      onLogin(u);
    } catch (err) { setError(err.message); }
  }
  return (
    <div className="admin-login">
      <form className="auth-box box" onSubmit={submit}>
        <p className="logo" style={{ textAlign: 'center', marginBottom: 6 }}>El Mundo <em>de</em> Élise</p>
        <p className="muted center" style={{ marginTop: 0 }}>Backoffice</p>
        <div className="field"><label>Email</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" /></div>
        <div className="field"><label>Contraseña</label><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" /></div>
        {error && <p className="error">{error}</p>}
        <button className="btn block">Entrar</button>
      </form>
    </div>
  );
}

// Pestañas + aviso de pedidos en tiempo real
function Backoffice({ user, onLogout }) {
  const toast = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const pending = usePendingOrders((n) => {
    toast(n === 1 ? '¡Nuevo pedido!' : `¡${n} pedidos nuevos!`);
    setRefreshKey((k) => k + 1); // refresca el listado de pedidos si está abierto
  });

  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <span className="logo">El Mundo <em>de</em> Élise <small className="muted" style={{ fontFamily: 'var(--sans)', fontSize: '.8rem' }}>backoffice</small></span>
          <nav>
            <a href="/" target="_blank" rel="noreferrer">Ver tienda ↗</a>
            <span className="muted" style={{ fontSize: '.85rem' }}>{user.email}</span>
            <button className="btn small ghost" onClick={onLogout}>Salir</button>
          </nav>
        </div>
      </header>
      <main className="wrap" style={{ paddingTop: 24 }}>
        <div className="admin-tabs">
          <NavLink to="/" end>Prendas</NavLink>
          <NavLink to="/pedidos" className={({ isActive }) => `tab-with-badge ${isActive ? 'active' : ''}`}>
            Pedidos
            {pending > 0 && <span className="notif" title={`${pending} pedido(s) por atender`}>{pending > 99 ? '99+' : pending}</span>}
          </NavLink>
          <NavLink to="/categorias">Categorías</NavLink>
        </div>
        <Routes>
          <Route path="/" element={<Products />} />
          <Route path="/prendas/:id" element={<ProductEdit />} />
          <Route path="/pedidos" element={<Orders refresh={refreshKey} />} />
          <Route path="/categorias" element={<Categories />} />
        </Routes>
      </main>
    </>
  );
}

function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => { api('/session').then((s) => setUser(s.user?.is_admin ? s.user : null)).catch(() => setUser(null)); }, []);

  if (user === undefined) return <p className="muted center" style={{ padding: 60 }}>Cargando…</p>;
  if (!user) return <AdminLogin onLogin={setUser} />;

  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); };
  return <Backoffice user={user} onLogout={logout} />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/admin">
      <ToastProvider><App /></ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

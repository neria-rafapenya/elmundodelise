import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import RequireUser from './RequireUser.jsx';
import '../shared/styles.css';
import { ToastProvider } from '../shared/toast.jsx';
import { ShopProvider, useShop } from './store.jsx';
import Home from './pages/Home.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Order from './pages/Order.jsx';
import Account from './pages/Account.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';

function Header() {
  const { user, cart } = useShop();
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link to="/" className="logo">El mundo <em>de</em> Lise</Link>
        <nav>
          <NavLink to="/" end>Tienda</NavLink>
          <NavLink to={user ? '/cuenta' : '/entrar'}>{user ? 'Mi cuenta' : 'Entrar'}</NavLink>
          <Link to="/carrito" className="cart-link" aria-label="Carrito">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 7h12l-1 13H7L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
            {cart.count > 0 && <span className="badge">{cart.count}</span>}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  React.useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function App() {
  return (
    <>
      <ScrollTop />
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/producto/:slug" element={<Product />} />
          <Route path="/carrito" element={<Cart />} />
          <Route path="/checkout" element={<RequireUser><Checkout /></RequireUser>} />
          <Route path="/pedido/:id" element={<RequireUser><Order /></RequireUser>} />
          <Route path="/cuenta" element={<RequireUser><Account /></RequireUser>} />
          <Route path="/entrar" element={<Login />} />
          <Route path="/restablecer" element={<ResetPassword />} />
          <Route path="*" element={<div className="wrap center" style={{ padding: 60 }}><h1>Página no encontrada</h1><Link to="/">Volver a la tienda</Link></div>} />
        </Routes>
      </main>
      <footer className="site-footer"><div className="wrap">© {new Date().getFullYear()} El mundo de Lise · Pago seguro con PayPal o Bizum</div></footer>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ShopProvider>
          <App />
        </ShopProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

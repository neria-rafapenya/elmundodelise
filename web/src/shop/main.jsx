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
        <Link to="/" className="logo">El Mundo <em>de</em> Élise</Link>
        <nav>
          <NavLink to="/" end>Tienda</NavLink>
          <NavLink to={user ? '/cuenta' : '/entrar'}>{user ? 'Mi cuenta' : 'Entrar'}</NavLink>
          <Link to="/carrito" className="cart-link" aria-label="Carrito">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M2 3.5h2.2c.5 0 .9.3 1 .8L8.4 16.6h10.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path fillRule="evenodd" fill="currentColor" d="M5.9 6.2h15.2c.7 0 1.2.7 1 1.4l-1.8 5.6c-.2.5-.6.8-1.1.8H8.3ZM11.3 8.6a.75.75 0 0 0-1.5 0v2.6a.75.75 0 0 0 1.5 0Zm3.9 0a.75.75 0 0 0-1.5 0v2.6a.75.75 0 0 0 1.5 0Z" />
              <circle cx="9.6" cy="20" r="1.7" fill="currentColor" />
              <circle cx="17.4" cy="20" r="1.7" fill="currentColor" />
            </svg>
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
      <footer className="site-footer"><div className="wrap">© {new Date().getFullYear()} El Mundo de Élise · Pago seguro con PayPal o Bizum</div></footer>
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

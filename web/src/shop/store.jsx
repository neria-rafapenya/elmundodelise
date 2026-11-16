// Estado global de la tienda: configuración, usuario con sesión y carrito
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../shared/api.js';

const ShopCtx = createContext(null);
export const useShop = () => useContext(ShopCtx);

const CART_KEY = 'elise_cart';
const readCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } };

export function ShopProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(undefined); // undefined = cargando, null = sin sesión
  const [cart, setCart] = useState(readCart);

  useEffect(() => {
    api('/config').then(setConfig).catch(() => setConfig({}));
    api('/session').then((s) => setUser(s.user)).catch(() => setUser(null));
  }, []);

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);

  const cartApi = {
    items: cart,
    count: cart.reduce((s, i) => s + i.qty, 0),
    add: (variant_id, qty = 1) => setCart((c) => {
      const it = c.find((i) => i.variant_id === variant_id);
      return it ? c.map((i) => (i === it ? { ...i, qty: i.qty + qty } : i)) : [...c, { variant_id, qty }];
    }),
    set: (variant_id, qty) => setCart((c) => c.map((i) => (i.variant_id === variant_id ? { ...i, qty } : i)).filter((i) => i.qty > 0)),
    remove: (variant_id) => setCart((c) => c.filter((i) => i.variant_id !== variant_id)),
    clear: () => setCart([]),
  };

  const refreshUser = useCallback(async () => {
    const s = await api('/session').catch(() => ({ user: null }));
    setUser(s.user);
    return s.user;
  }, []);

  return (
    <ShopCtx.Provider value={{ config, user, setUser, refreshUser, cart: cartApi }}>
      {children}
    </ShopCtx.Provider>
  );
}

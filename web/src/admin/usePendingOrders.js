import { useEffect, useRef, useState } from 'react';
import { api } from '../shared/api.js';

const EVERY_MS = 15000;

// Nº de pedidos por atender, actualizado cada 15 s (y al volver a la pestaña del navegador).
// Llama a onNew(n) cuando entra algún pedido nuevo.
export default function usePendingOrders(onNew) {
  const [count, setCount] = useState(0);
  const last = useRef(null);
  const cb = useRef(onNew);
  cb.current = onNew;

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const { count: n } = await api('/admin/orders/pending-count');
        if (!alive) return;
        if (last.current !== null && n > last.current) cb.current?.(n - last.current);
        last.current = n;
        setCount(n);
      } catch { /* sin conexión: se reintenta en el siguiente ciclo */ }
    };
    check();
    const id = setInterval(check, EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('elise:orders-changed', check);
    return () => {
      alive = false; clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('elise:orders-changed', check);
    };
  }, []);

  // Título de la pestaña: "(3) Backoffice · El Mundo de Élise"
  useEffect(() => {
    document.title = `${count ? `(${count}) ` : ''}Backoffice · El Mundo de Élise`;
  }, [count]);

  return count;
}

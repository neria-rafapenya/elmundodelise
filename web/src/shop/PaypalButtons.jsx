import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../shared/api.js';
import { useToast } from '../shared/toast.jsx';

let sdkPromise;
function loadSdk(clientId) {
  if (window.paypal) return Promise.resolve();
  sdkPromise ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&locale=es_ES`;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export default function PaypalButtons({ clientId, orderId }) {
  const ref = useRef(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    loadSdk(clientId).then(() => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = '';
      window.paypal.Buttons({
        style: { shape: 'pill', color: 'black' },
        createOrder: async () => (await api(`/orders/${orderId}/paypal`, { method: 'POST' })).paypal_order_id,
        onApprove: async () => {
          try { await api(`/orders/${orderId}/paypal/capture`, { method: 'POST' }); navigate(`/pedido/${orderId}?ok=1`); }
          catch (e) { toast(e.message, 'err'); }
        },
        onError: () => toast('No se ha podido completar el pago', 'err'),
      }).render(ref.current);
    }).catch(() => toast('No se ha podido cargar PayPal', 'err'));
    return () => { cancelled = true; };
  }, [clientId, orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} />;
}

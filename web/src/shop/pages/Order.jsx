import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, money, STATUS } from '../../shared/api.js';
import { useShop } from '../store.jsx';
import PaypalButtons from '../PaypalButtons.jsx';

export default function Order() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { config } = useShop();
  const [o, setO] = useState(undefined);

  useEffect(() => { api(`/orders/${id}`).then(setO).catch(() => setO(null)); }, [id]);

  if (o === undefined) return <p className="muted center" style={{ padding: 60 }}>Cargando…</p>;
  if (o === null) return <p className="center" style={{ padding: 60 }}>Pedido no encontrado. <Link to="/cuenta">Ver mis pedidos</Link></p>;

  return (
    <div className="wrap" style={{ maxWidth: 720, paddingTop: 36 }}>
      <div className="stack">
        {params.get('ok') && <div className="notice ok"><strong>¡Gracias por tu compra!</strong> Hemos recibido el pago y te avisaremos cuando enviemos el pedido.</div>}
        <h1>Pedido nº {o.number}</h1>
        <p><span className={`status ${o.status}`}>{STATUS[o.status]}</span> <span className="muted">· {new Date(o.created_at).toLocaleString('es-ES')}</span></p>

        {o.status === 'pending_bizum' && (
          <div className="notice">
            <strong>Para completar tu pedido, haz un Bizum:</strong><br />
            Teléfono: <strong>{config?.bizumPhone}</strong><br />
            Importe: <strong>{money(o.total_cents)}</strong><br />
            Concepto: <strong>Pedido {o.number}</strong><br />
            <span className="muted">Lo prepararemos en cuanto confirmemos el pago.</span>
          </div>
        )}
        {o.status === 'pending_payment' && o.payment_method === 'paypal' && config?.paypalClientId && (
          <div className="box"><p>Este pedido está pendiente de pago.</p><PaypalButtons clientId={config.paypalClientId} orderId={o.id} /></div>
        )}
        {o.tracking && <div className="notice ok">Seguimiento del envío: <strong>{o.tracking}</strong></div>}

        <div className="box summary">
          {o.items.map((i) => (
            <div className="r" key={i.id}><span>{i.qty} × {i.name} <span className="muted">{[i.size, i.color].filter(Boolean).join(' · ')}</span></span><span>{money(i.unit_price_cents * i.qty)}</span></div>
          ))}
          <div className="r" style={{ marginTop: 12 }}><span>Subtotal</span><span>{money(o.subtotal_cents)}</span></div>
          <div className="r"><span>Envío</span><span>{o.shipping_cents ? money(o.shipping_cents) : 'Gratis'}</span></div>
          <div className="r total"><span>Total</span><span>{money(o.total_cents)}</span></div>
        </div>
        <div className="box">
          <h2>Envío</h2>
          <p>
            {o.ship_name}<br />{o.ship_address}<br />{o.ship_postal_code} {o.ship_city}{o.ship_province && ` (${o.ship_province})`}
            {o.ship_phone && <><br />{o.ship_phone}</>}
          </p>
        </div>
        <p><Link to="/cuenta">← Mis pedidos</Link></p>
      </div>
    </div>
  );
}

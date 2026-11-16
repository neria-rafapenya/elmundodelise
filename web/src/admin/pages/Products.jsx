import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../../shared/api.js';

export default function Products() {
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState([]);
  useEffect(() => {
    api('/admin/products').then(setItems).catch(() => setItems([]));
    api('/categories').then(setCats).catch(() => {});
  }, []);

  return (
    <>
      <div className="toolbar">
        <span className="muted">{items ? `${items.length} prenda(s)` : 'Cargando…'}</span>
        <Link className="btn" to="/prendas/nueva">+ Nueva prenda</Link>
      </div>
      <table>
        <thead><tr><th></th><th>Nombre</th><th>Precio</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {items?.map((p) => (
            <tr key={p.id}>
              <td>{p.images[0] && <img className="mini" src={p.images[0].path} alt="" />}</td>
              <td><strong>{p.name}</strong><div className="muted" style={{ fontSize: '.8rem' }}>{cats.find((c) => c.id === p.category_id)?.name || 'Sin categoría'}</div></td>
              <td>{money(p.price_cents)}</td>
              <td>{p.variants.reduce((s, v) => s + v.stock, 0)} <span className="muted">({p.variants.length} tallas)</span></td>
              <td>{p.active ? <span className="status paid">Visible</span> : <span className="status">Oculta</span>}</td>
              <td><Link className="btn small ghost" to={`/prendas/${p.id}`}>Editar</Link></td>
            </tr>
          ))}
          {items && !items.length && <tr><td colSpan={6} className="muted center">Aún no hay prendas. Crea la primera.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

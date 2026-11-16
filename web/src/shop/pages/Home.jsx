import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money } from '../../shared/api.js';
import ShareButtons from '../ShareButtons.jsx';

export default function Home() {
  const [params] = useSearchParams();
  const current = params.get('cat') || '';
  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/categories').then(setCats).catch(() => {}); }, []);
  useEffect(() => {
    setProducts(null);
    api('/products' + (current ? `?category=${encodeURIComponent(current)}` : ''))
      .then(setProducts).catch(() => setError('No se ha podido cargar el catálogo.'));
  }, [current]);

  return (
    <div className="wrap">
      <section className="hero">
        <h1>El Mundo de Élise</h1>
        <p>Prendas escogidas con cariño. Envío a toda España.</p>
      </section>
      <div className="filters">
        <Link className={`chip ${!current ? 'active' : ''}`} to="/">Todo</Link>
        {cats.map((c) => <Link key={c.id} className={`chip ${c.slug === current ? 'active' : ''}`} to={`/?cat=${c.slug}`}>{c.name}</Link>)}
      </div>
      {error && <p className="error center">{error}</p>}
      {!products && !error && <p className="muted center">Cargando…</p>}
      {products && !products.length && <p className="muted center">Pronto habrá novedades aquí.</p>}
      <div className="grid">
        {products?.map((p) => (
          <Link key={p.id} className="card" to={`/producto/${p.slug}`}>
            <div className="ph">
              {p.images[0] && <img src={p.images[0].path} alt={p.name} loading="lazy" />}
              {!p.in_stock && <span className="tag">Agotado</span>}
            </div>
            <h3>{p.name}</h3>
            <div className="price">{money(p.price_cents)}</div>
          </Link>
        ))}
      </div>
      <div className="center" style={{ marginTop: 48 }}>
        <ShareButtons
          title={`${current ? `${cats.find((c) => c.slug === current)?.name || ''} · ` : ''}El Mundo de Élise`}
          text="Mira la tienda El Mundo de Élise"
          label={current ? 'Compartir esta categoría' : 'Compartir la tienda'}
        />
      </div>
    </div>
  );
}

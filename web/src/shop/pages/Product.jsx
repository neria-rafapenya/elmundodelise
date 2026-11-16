import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, variantLabel } from '../../shared/api.js';
import { useToast } from '../../shared/toast.jsx';
import { useShop } from '../store.jsx';

export default function Product() {
  const { slug } = useParams();
  const { cart } = useShop();
  const toast = useToast();
  const [p, setP] = useState(undefined);
  const [img, setImg] = useState(0);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setP(undefined); setImg(0); setSelected(null);
    api(`/products/${encodeURIComponent(slug)}`).then((x) => {
      setP(x);
      document.title = `${x.name} · El mundo de Lise`;
      const avail = x.variants.filter((v) => v.stock > 0);
      if (x.variants.length === 1 && avail.length === 1) setSelected(avail[0].id);
    }).catch(() => setP(null));
  }, [slug]);

  if (p === undefined) return <p className="muted center" style={{ padding: 60 }}>Cargando…</p>;
  if (p === null) return <p className="center" style={{ padding: 60 }}>Producto no encontrado. <Link to="/">Volver a la tienda</Link></p>;

  const v = p.variants.find((x) => x.id === selected);
  const add = () => {
    if (!v) return toast('Elige una talla', 'err');
    const inCart = cart.items.find((i) => i.variant_id === v.id)?.qty || 0;
    if (inCart + 1 > v.stock) return toast('No hay más unidades de esta talla', 'err');
    cart.add(v.id, 1);
    toast('Añadido al carrito');
  };

  return (
    <div className="wrap">
      <div className="product">
        <div className="gallery">
          <div className="main">{p.images[img] && <img src={p.images[img].path} alt={p.name} />}</div>
          {p.images.length > 1 && (
            <div className="thumbs">
              {p.images.map((im, i) => <img key={im.id} src={im.path} alt="" className={i === img ? 'active' : ''} onClick={() => setImg(i)} />)}
            </div>
          )}
        </div>
        <div>
          <p className="muted"><Link to="/">Tienda</Link></p>
          <h1>{p.name}</h1>
          <div className="price">{money(p.price_cents)}</div>
          {p.variants.length ? (
            <>
              <label>Elige talla</label>
              <div className="sizes">
                {p.variants.map((x) => (
                  <button key={x.id} className={`size ${x.id === selected ? 'active' : ''}`} disabled={x.stock <= 0} onClick={() => setSelected(x.id)}>
                    {variantLabel(x)}
                  </button>
                ))}
              </div>
              <button className="btn block" onClick={add} disabled={!p.in_stock}>{p.in_stock ? 'Añadir al carrito' : 'Agotado'}</button>
              {v && v.stock <= 3 && <p className="muted" style={{ fontSize: '.85rem', marginTop: 8 }}>¡Solo quedan {v.stock}!</p>}
            </>
          ) : <p className="muted">Este producto todavía no tiene tallas disponibles.</p>}
          {p.description && <div className="desc">{p.description}</div>}
        </div>
      </div>
    </div>
  );
}

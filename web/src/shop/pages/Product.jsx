import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money } from '../../shared/api.js';
import { useToast } from '../../shared/toast.jsx';
import { useShop } from '../store.jsx';
import ShareButtons from '../ShareButtons.jsx';

export default function Product() {
  const { slug } = useParams();
  const { cart } = useShop();
  const toast = useToast();
  const [p, setP] = useState(undefined);
  const [img, setImg] = useState(0);
  const [color, setColor] = useState(null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    setP(undefined); setImg(0); setColor(null); setSize(null);
    api(`/products/${encodeURIComponent(slug)}`).then((x) => {
      setP(x);
      document.title = `${x.name} · El Mundo de Élise`;
      // Preselecciona lo que no admite elección
      const cols = [...new Set(x.variants.map((v) => v.color || ''))];
      if (cols.length === 1) setColor(cols[0]);
      const avail = x.variants.filter((v) => v.stock > 0);
      if (avail.length === 1) { setColor(avail[0].color || ''); setSize(avail[0].size || ''); }
    }).catch(() => setP(null));
  }, [slug]);

  if (p === undefined) return <p className="muted center" style={{ padding: 60 }}>Cargando…</p>;
  if (p === null) return <p className="center" style={{ padding: 60 }}>Producto no encontrado. <Link to="/">Volver a la tienda</Link></p>;

  const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const sizeRank = (x) => { const i = SIZE_ORDER.indexOf(x); return i < 0 ? 99 : i; };
  const colors = [...new Set(p.variants.map((x) => x.color || ''))];
  const sizes = [...new Set(p.variants.map((x) => x.size || ''))].sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
  const find = (c, s) => p.variants.find((x) => (x.color || '') === c && (x.size || '') === s);
  const colorHasStock = (c) => p.variants.some((x) => (x.color || '') === c && x.stock > 0);
  const v = color !== null && size !== null ? find(color, size) : null;
  const pickColor = (c) => { setColor(c); if (size !== null && !(find(c, size)?.stock > 0)) setSize(null); };

  const add = () => {
    if (colors.length > 1 && color === null) return toast('Elige un color', 'err');
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
              {(colors.length > 1 || colors[0]) && (
                <>
                  <label>Color{color ? `: ${color}` : ''}</label>
                  <div className="sizes">
                    {colors.map((c) => (
                      <button key={c || '-'} className={`size color-opt ${c === color ? 'active' : ''}`} disabled={!colorHasStock(c)} onClick={() => pickColor(c)}>
                        <span className={`swatch sw-${(c || '').toLowerCase().replace(/\s+/g, '-')}`} />{c || 'Sin color'}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <label>Talla</label>
              <div className="sizes">
                {sizes.map((sz) => {
                  const opt = color !== null ? find(color, sz) : null;
                  const enabled = color !== null ? opt?.stock > 0 : p.variants.some((x) => (x.size || '') === sz && x.stock > 0);
                  return (
                    <button key={sz || '-'} className={`size ${sz === size ? 'active' : ''}`} disabled={!enabled}
                      onClick={() => { if (color === null && colors.length > 1) return toast('Elige primero el color', 'err'); setSize(sz); }}>
                      {sz || 'Única'}
                    </button>
                  );
                })}
              </div>
              <button className="btn block" onClick={add} disabled={!p.in_stock}>{p.in_stock ? 'Añadir al carrito' : 'Agotado'}</button>
              {v && v.stock <= 3 && <p className="muted" style={{ fontSize: '.85rem', marginTop: 8 }}>¡Solo quedan {v.stock}!</p>}
            </>
          ) : <p className="muted">Este producto todavía no tiene tallas disponibles.</p>}
          {p.description && <div className="desc">{p.description}</div>}
          <ShareButtons title={`${p.name} · El Mundo de Élise`} text={`${p.name} (${money(p.price_cents)}) en El Mundo de Élise`} image={p.images[0]?.path} />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../shared/api.js';
import { useToast } from '../../shared/toast.jsx';

// Tallas y colores permitidos (los da el servidor)
let optionsCache;
function useOptions() {
  const [o, setO] = useState(optionsCache || { sizes: [], colors: [] });
  useEffect(() => {
    if (!optionsCache) api('/admin/options').then((x) => { optionsCache = x; setO(x); }).catch(() => {});
  }, []);
  return o;
}

// Selector con las opciones permitidas. Si la variante tiene un valor antiguo fuera de la lista, se muestra marcado.
function Pick({ value, options, onChange, placeholder }) {
  const legacy = value && !options.includes(value);
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {legacy && <option value={value}>{value} (antiguo)</option>}
      {options.map((x) => <option key={x} value={x}>{x}</option>)}
    </select>
  );
}

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = id === 'nueva';
  const navigate = useNavigate();
  const toast = useToast();
  const [cats, setCats] = useState([]);
  const [p, setP] = useState(isNew ? null : undefined);
  const [f, setF] = useState({ name: '', price: '', category_id: '', description: '', active: true });
  const [first, setFirst] = useState({ size: '', color: '', stock: 1 });
  const opts = useOptions();

  const load = async () => {
    const list = await api('/admin/products');
    const x = list.find((y) => y.id === id);
    setP(x || null);
    if (x) setF({ name: x.name, price: (x.price_cents / 100).toFixed(2).replace('.', ','), category_id: x.category_id || '', description: x.description || '', active: x.active });
  };
  useEffect(() => {
    api('/categories').then(setCats).catch(() => {});
    if (!isNew) load().catch(() => setP(null));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p === undefined) return <p className="muted">Cargando…</p>;
  if (!isNew && p === null) return <p>Prenda no encontrada. <Link to="/">Volver</Link></p>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    try {
      if (isNew) {
        if (!first.size || !first.color) return toast('Elige la talla y el color', 'err');
        const saved = await api('/admin/products', { method: 'POST', body: { ...f, variant: first } });
        toast('Prenda creada. Ahora añade fotos y tallas.');
        navigate(`/prendas/${saved.id}`, { replace: true });
      } else {
        await api(`/admin/products/${id}`, { method: 'PUT', body: f });
        toast('Guardado');
        load();
      }
    } catch (err) { toast(err.message, 'err'); }
  }

  async function remove() {
    if (!confirm(`¿Eliminar "${p.name}" y todas sus fotos? No se puede deshacer.`)) return;
    try { await api(`/admin/products/${id}`, { method: 'DELETE' }); toast('Prenda eliminada'); navigate('/'); }
    catch (err) { toast(err.message, 'err'); }
  }

  return (
    <>
      <p><Link to="/" className="link-btn" style={{ margin: 0 }}>← Volver al listado</Link></p>
      <div className="two-col" style={{ paddingTop: 12 }}>
        <form className="box" onSubmit={save}>
          <h2>{isNew ? 'Nueva prenda' : 'Editar prenda'}</h2>
          <div className="field"><label>Nombre *</label><input value={f.name} onChange={set('name')} /></div>
          <div className="row">
            <div className="field"><label>Precio (€) *</label><input value={f.price} onChange={set('price')} inputMode="decimal" placeholder="29,90" /></div>
            <div className="field"><label>Categoría</label>
              <select value={f.category_id} onChange={set('category_id')}>
                <option value="">Sin categoría</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Descripción</label><textarea rows={6} value={f.description} onChange={set('description')} /></div>
          {isNew && (
            <fieldset className="first-variant">
              <legend>Primera talla y color *</legend>
              <div className="row3">
                <div className="field"><label>Talla</label><Pick value={first.size} options={opts.sizes} placeholder="Elige talla" onChange={(v) => setFirst({ ...first, size: v })} /></div>
                <div className="field"><label>Color</label><Pick value={first.color} options={opts.colors} placeholder="Elige color" onChange={(v) => setFirst({ ...first, color: v })} /></div>
                <div className="field"><label>Stock</label><input type="number" min="0" value={first.stock} onChange={(e) => setFirst({ ...first, stock: e.target.value })} /></div>
              </div>
              <p className="muted" style={{ fontSize: '.82rem', margin: 0 }}>Después podrás añadir más combinaciones.</p>
            </fieldset>
          )}
          <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Visible en la tienda</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn">{isNew ? 'Crear y añadir fotos' : 'Guardar cambios'}</button>
            {!isNew && <a className="btn ghost" href={`/producto/${p.slug}`} target="_blank" rel="noreferrer">Ver en tienda</a>}
            {!isNew && <button type="button" className="btn danger" onClick={remove}>Eliminar</button>}
          </div>
        </form>
        <div className="stack">
          {isNew ? <p className="muted">Guarda la prenda para poder añadir fotos y tallas.</p> : (
            <>
              <Images product={p} reload={load} />
              <Variants product={p} reload={load} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Images({ product, reload }) {
  const toast = useToast();
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload(fileList) {
    const files = [...fileList].filter((f) => /^image\/(jpeg|png|webp|avif|heic|heif)$/.test(f.type) || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return toast('Formato no válido (JPG, PNG, WEBP o HEIC)', 'err');
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    setBusy(true);
    try {
      const res = await api(`/admin/products/${product.id}/images`, { method: 'POST', form });
      const before = res.reduce((s, r) => s + (r.original_bytes || 0), 0), after = res.reduce((s, r) => s + (r.optimized_bytes || 0), 0);
      const mb = (b) => `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
      toast(res.length === 1 ? `Foto subida y optimizada (${mb(before)} → ${mb(after)})` : `${res.length} fotos subidas y optimizadas (${mb(before)} → ${mb(after)})`);
      await reload();
    }
    catch (err) { toast(err.message, 'err'); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  async function del(img) {
    if (!confirm('¿Borrar esta foto?')) return;
    await api(`/admin/images/${img.id}`, { method: 'DELETE' }); reload();
  }
  async function makeFirst(img) {
    const min = Math.min(...product.images.map((i) => i.sort));
    await api(`/admin/images/${img.id}`, { method: 'PUT', body: { sort: min - 1 } }); reload();
  }

  return (
    <div className="box">
      <h2>Fotos</h2>
      <div className="img-grid">
        {product.images.map((im, i) => (
          <figure key={im.id}>
            <img src={im.path} alt="" />
            <figcaption>
              {i === 0 ? <small className="muted">Principal</small> : <button className="link-btn" style={{ margin: 0 }} onClick={() => makeFirst(im)}>Principal</button>}
              <button className="link-btn" style={{ margin: 0, color: 'var(--err)' }} onClick={() => del(im)}>Borrar</button>
            </figcaption>
          </figure>
        ))}
      </div>
      <label className={`drop ${over ? 'over' : ''}`} style={{ marginTop: 14, display: 'block' }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        {busy ? 'Subiendo…' : 'Arrastra fotos aquí o haz clic para elegirlas'}<br /><small>JPG, PNG, WEBP o HEIC · se optimizan solas a menos de 1 MB</small>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" multiple hidden onChange={(e) => upload(e.target.files)} />
      </label>
    </div>
  );
}

function Variants({ product, reload }) {
  const toast = useToast();
  const opts = useOptions();
  const [rows, setRows] = useState(product.variants);
  const [nv, setNv] = useState({ size: '', color: '', stock: 1 });
  useEffect(() => setRows(product.variants), [product]);

  const upd = (id, k, v) => setRows(rows.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  async function save(r) {
    try { await api(`/admin/variants/${r.id}`, { method: 'PUT', body: r }); toast('Guardado'); reload(); }
    catch (err) { toast(err.message, 'err'); }
  }
  async function del(r) {
    if (!confirm(`¿Borrar ${r.size || '¿?'} · ${r.color || '¿?'}?`)) return;
    try { await api(`/admin/variants/${r.id}`, { method: 'DELETE' }); reload(); }
    catch (err) { toast(err.message, 'err'); }
  }
  async function add() {
    if (!nv.size || !nv.color) return toast('Elige la talla y el color', 'err');
    try { await api(`/admin/products/${product.id}/variants`, { method: 'POST', body: nv }); setNv({ size: '', color: '', stock: 1 }); toast('Añadida'); reload(); }
    catch (err) { toast(err.message, 'err'); }
  }
  const onlyOne = rows.length <= 1;

  return (
    <div className="box">
      <h2>Tallas, colores y stock</h2>
      {!rows.length && <p className="notice">Esta prenda no tiene ninguna talla y color. Añade al menos una para poder venderla.</p>}
      <table>
        <thead><tr><th>Talla</th><th>Color</th><th>Stock</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={!r.size || !r.color ? 'row-warn' : ''}>
              <td><Pick value={r.size} options={opts.sizes} placeholder="Falta talla" onChange={(v) => upd(r.id, 'size', v)} /></td>
              <td><Pick value={r.color} options={opts.colors} placeholder="Falta color" onChange={(v) => upd(r.id, 'color', v)} /></td>
              <td><input type="number" min="0" value={r.stock} onChange={(e) => upd(r.id, 'stock', e.target.value)} style={{ width: 80 }} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn small ghost" onClick={() => save(r)}>Guardar</button>{' '}
                <button className="link-btn" style={{ color: 'var(--err)' }} onClick={() => del(r)} disabled={onlyOne}
                  title={onlyOne ? 'Una prenda necesita al menos una talla y color' : 'Borrar'}>Borrar</button>
              </td>
            </tr>
          ))}
          <tr className="row-new">
            <td><Pick value={nv.size} options={opts.sizes} placeholder="Talla" onChange={(v) => setNv({ ...nv, size: v })} /></td>
            <td><Pick value={nv.color} options={opts.colors} placeholder="Color" onChange={(v) => setNv({ ...nv, color: v })} /></td>
            <td><input type="number" min="0" value={nv.stock} onChange={(e) => setNv({ ...nv, stock: e.target.value })} style={{ width: 80 }} /></td>
            <td><button className="btn small" onClick={add}>Añadir</button></td>
          </tr>
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>Cada fila es una combinación de talla y color con su propio stock.</p>
    </div>
  );
}

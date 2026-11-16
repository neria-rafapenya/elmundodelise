import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../shared/api.js';
import { useToast } from '../../shared/toast.jsx';

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = id === 'nueva';
  const navigate = useNavigate();
  const toast = useToast();
  const [cats, setCats] = useState([]);
  const [p, setP] = useState(isNew ? null : undefined);
  const [f, setF] = useState({ name: '', price: '', category_id: '', description: '', active: true });

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
        const saved = await api('/admin/products', { method: 'POST', body: f });
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
    const files = [...fileList].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!files.length) return toast('Formato no válido (JPG, PNG o WEBP)', 'err');
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    setBusy(true);
    try { await api(`/admin/products/${product.id}/images`, { method: 'POST', form }); toast('Fotos subidas'); await reload(); }
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
        {busy ? 'Subiendo…' : 'Arrastra fotos aquí o haz clic para elegirlas'}<br /><small>JPG, PNG o WEBP · máx. 8 MB</small>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
      </label>
    </div>
  );
}

function Variants({ product, reload }) {
  const toast = useToast();
  const [rows, setRows] = useState(product.variants);
  const [nv, setNv] = useState({ size: '', color: '', stock: 1 });
  useEffect(() => setRows(product.variants), [product]);

  const upd = (id, k, v) => setRows(rows.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  async function save(r) {
    try { await api(`/admin/variants/${r.id}`, { method: 'PUT', body: r }); toast('Guardado'); }
    catch (err) { toast(err.message, 'err'); }
  }
  async function del(r) {
    if (!confirm('¿Borrar esta talla?')) return;
    await api(`/admin/variants/${r.id}`, { method: 'DELETE' }); reload();
  }
  async function add() {
    try { await api(`/admin/products/${product.id}/variants`, { method: 'POST', body: nv }); setNv({ size: '', color: '', stock: 1 }); toast('Talla añadida'); reload(); }
    catch (err) { toast(err.message, 'err'); }
  }

  return (
    <div className="box">
      <h2>Tallas y stock</h2>
      <table>
        <thead><tr><th>Talla</th><th>Color</th><th>Stock</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><input value={r.size || ''} onChange={(e) => upd(r.id, 'size', e.target.value)} /></td>
              <td><input value={r.color || ''} onChange={(e) => upd(r.id, 'color', e.target.value)} /></td>
              <td><input type="number" min="0" value={r.stock} onChange={(e) => upd(r.id, 'stock', e.target.value)} style={{ width: 80 }} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn small ghost" onClick={() => save(r)}>Guardar</button>{' '}
                <button className="link-btn" style={{ color: 'var(--err)' }} onClick={() => del(r)}>Borrar</button>
              </td>
            </tr>
          ))}
          <tr>
            <td><input value={nv.size} onChange={(e) => setNv({ ...nv, size: e.target.value })} placeholder="S, M, 38…" /></td>
            <td><input value={nv.color} onChange={(e) => setNv({ ...nv, color: e.target.value })} placeholder="Opcional" /></td>
            <td><input type="number" min="0" value={nv.stock} onChange={(e) => setNv({ ...nv, stock: e.target.value })} style={{ width: 80 }} /></td>
            <td><button className="btn small" onClick={add}>Añadir</button></td>
          </tr>
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>Si la prenda es de talla única, añade una sola fila con «Única».</p>
    </div>
  );
}

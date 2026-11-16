import { useEffect, useState } from 'react';
import { api } from '../../shared/api.js';
import { useToast } from '../../shared/toast.jsx';

export default function Categories() {
  const toast = useToast();
  const [cats, setCats] = useState([]);
  const [name, setName] = useState('');
  const load = () => api('/categories').then(setCats).catch(() => {});
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    try { await api('/admin/categories', { method: 'POST', body: { name, sort: cats.length + 1 } }); setName(''); load(); }
    catch (err) { toast(err.message, 'err'); }
  }
  async function del(c) {
    if (!confirm(`¿Borrar la categoría «${c.name}»? Sus prendas quedarán sin categoría.`)) return;
    await api(`/admin/categories/${c.id}`, { method: 'DELETE' }); load();
  }

  return (
    <div className="box" style={{ maxWidth: 560 }}>
      <table>
        <tbody>
          {cats.map((c) => (
            <tr key={c.id}><td>{c.name}</td><td style={{ textAlign: 'right' }}><button className="link-btn" style={{ color: 'var(--err)' }} onClick={() => del(c)}>Borrar</button></td></tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={add} style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" required />
        <button className="btn">Añadir</button>
      </form>
    </div>
  );
}

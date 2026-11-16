import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../shared/api.js';
import { useToast } from '../../shared/toast.jsx';
import { useShop } from '../store.jsx';

export default function Login() {
  const { user, setUser, config } = useShop();
  const [params] = useSearchParams();
  const next = params.get('next') || '/cuenta';
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ full_name: '', email: '', password: '', accept: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const u = mode === 'signup'
        ? await api('/auth/register', { method: 'POST', body: f })
        : await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } });
      setUser(u);
      navigate(next, { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function forgot() {
    if (!f.email.trim()) return setError('Escribe tu email y vuelve a pulsar.');
    try { await api('/auth/forgot', { method: 'POST', body: { email: f.email } }); toast('Si el email existe, te hemos enviado un enlace'); }
    catch (err) { setError(err.message); }
  }

  return (
    <div className="auth-box box">
      <div className="tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Entrar</button>
        <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Crear cuenta</button>
      </div>
      <form onSubmit={submit} noValidate>
        {mode === 'signup' && <div className="field"><label>Nombre y apellidos</label><input value={f.full_name} onChange={set('full_name')} autoComplete="name" /></div>}
        <div className="field"><label>Email</label><input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></div>
        <div className="field"><label>Contraseña</label><input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>
        {mode === 'signup' && (
          <label className="check" style={{ marginBottom: 14 }}><input type="checkbox" checked={f.accept} onChange={set('accept')} /> <span>Acepto que mis datos se usen para gestionar mis pedidos.</span></label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn block" disabled={busy}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        {mode === 'login' && config?.passwordReset && (
          <p className="center" style={{ marginTop: 14 }}><button type="button" className="link-btn" style={{ margin: 0 }} onClick={forgot}>¿Has olvidado la contraseña?</button></p>
        )}
      </form>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../shared/api.js';
import { useToast } from '../../shared/toast.jsx';
import { useShop } from '../store.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const { refreshUser } = useShop();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      await api('/auth/reset', { method: 'POST', body: { token: params.get('token'), password } });
      await refreshUser();
      toast('Contraseña actualizada');
      navigate('/cuenta', { replace: true });
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="auth-box box">
      <h2>Nueva contraseña</h2>
      <form onSubmit={submit}>
        <div className="field"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" /></div>
        {error && <p className="error">{error}</p>}
        <button className="btn block">Guardar</button>
      </form>
    </div>
  );
}

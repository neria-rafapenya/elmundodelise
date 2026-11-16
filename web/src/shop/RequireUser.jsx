import { Navigate, useLocation } from 'react-router-dom';
import { useShop } from './store.jsx';

// Protege páginas que necesitan sesión de cliente
export default function RequireUser({ children }) {
  const { user } = useShop();
  const loc = useLocation();
  if (user === undefined) return <p className="muted center" style={{ padding: 60 }}>Cargando…</p>;
  if (!user) return <Navigate to={`/entrar?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return children;
}

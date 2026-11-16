// Cliente de la API. La sesión va en una cookie httpOnly; no hay tokens en el navegador.
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(`/api${path}`, {
    method, headers, credentials: 'same-origin',
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Error de conexión'), { status: r.status });
  return j;
}

export const money = (cents) => (Number(cents) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export const STATUS = {
  pending_payment: 'Pendiente de pago',
  pending_bizum: 'Pendiente de Bizum',
  paid: 'Pagado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export const variantLabel = (v) => [v.size, v.color].filter(Boolean).join(' · ') || 'Única';

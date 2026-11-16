import { useEffect, useState } from 'react';
import { useToast } from '../shared/toast.jsx';

// Enlaces para compartir la página actual (o la URL indicada)
const ICONS = {
  whatsapp: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.5 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z',
  facebook: 'M14 8.5V6.8c0-.8.5-1 .9-1H17V2.1L14.2 2C11.1 2 10.4 4.3 10.4 5.8v2.7H8.6V12h1.8v10H14V12h2.7l.4-3.5H14Z',
  x: 'M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z',
  pinterest: 'M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.5 1.8-2.5.9 0 1.3.7 1.3 1.4 0 .9-.6 2.2-.9 3.4-.2 1 .5 1.9 1.6 1.9 1.9 0 3.3-2 3.3-4.9 0-2.5-1.8-4.3-4.4-4.3-3 0-4.8 2.3-4.8 4.6 0 .9.4 1.9.8 2.4l.1.4-.3 1.2c0 .2-.2.3-.4.2-1.4-.6-2.2-2.6-2.2-4.2 0-3.4 2.5-6.6 7.2-6.6 3.8 0 6.7 2.7 6.7 6.3 0 3.8-2.4 6.8-5.7 6.8-1.1 0-2.2-.6-2.5-1.3l-.7 2.6c-.2 1-.9 2.2-1.4 2.9A10 10 0 1 0 12 2Z',
  telegram: 'M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2 1.8 11.7c-1-.3-1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3Z',
  email: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 7.2L4.4 7H4v.6l8 5.6 8-5.6V7h-.4L12 12.2Z',
  link: 'M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a3 3 0 1 1 4.2 4.2l-2 2a1 1 0 1 1-1.4-1.4l2-2a1 1 0 1 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Zm2.8-2.8a1 1 0 0 1 0 1.4L10 15.4a3 3 0 1 1-4.2-4.2l2-2a1 1 0 0 1 1.4 1.4l-2 2a1 1 0 1 0 1.4 1.4l3.4-3.4a1 1 0 0 1 1.4 0Z',
  share: 'M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1Z',
};

function Icon({ name }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={ICONS[name]} fill="currentColor" /></svg>;
}

export default function ShareButtons({ title, text, image, url, label = 'Compartir' }) {
  const toast = useToast();
  const [canNative, setCanNative] = useState(false);
  const pageUrl = url || (typeof window !== 'undefined' ? window.location.href.split('#')[0] : '');
  const msg = text || title;
  useEffect(() => { setCanNative(typeof navigator !== 'undefined' && !!navigator.share); }, []);

  const u = encodeURIComponent(pageUrl);
  const t = encodeURIComponent(msg);
  const links = [
    { name: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${msg} ${pageUrl}`)}` },
    { name: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: 'x', label: 'X', href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { name: 'pinterest', label: 'Pinterest', href: `https://pinterest.com/pin/create/button/?url=${u}&description=${t}${image ? `&media=${encodeURIComponent(new URL(image, window.location.origin).href)}` : ''}` },
    { name: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${t}` },
    { name: 'email', label: 'Email', href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${msg}\n${pageUrl}`)}` },
  ];

  async function copy() {
    try { await navigator.clipboard.writeText(pageUrl); toast('Enlace copiado'); }
    catch { window.prompt('Copia el enlace:', pageUrl); }
  }
  async function native() {
    try { await navigator.share({ title, text: msg, url: pageUrl }); } catch { /* cancelado */ }
  }

  return (
    <div className="share">
      <span className="share-label">{label}</span>
      <div className="share-buttons">
        {canNative && <button type="button" className="share-btn" onClick={native} title="Compartir…" aria-label="Compartir"><Icon name="share" /></button>}
        {links.map((l) => (
          <a key={l.name} className={`share-btn ${l.name}`} href={l.href} target={l.name === 'email' ? undefined : '_blank'} rel="noopener noreferrer" title={`Compartir en ${l.label}`} aria-label={`Compartir en ${l.label}`}>
            <Icon name={l.name} />
          </a>
        ))}
        <button type="button" className="share-btn" onClick={copy} title="Copiar enlace" aria-label="Copiar enlace"><Icon name="link" /></button>
      </div>
    </div>
  );
}

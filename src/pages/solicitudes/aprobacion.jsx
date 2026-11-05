import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';

// Enlaces a la aprobación de Power Automate de una solicitud FIQ.
// La app no responde la aprobación (eso exige permisos de Microsoft que no
// tenemos); solo la abre para que el personal la apruebe con un clic.

const HOSTS_MS = /(^|\.)(powerautomate\.com|flow\.microsoft\.com|teams\.microsoft\.com|office\.com)$/i;

// Solo direcciones https de Microsoft; cualquier otra se ignora
export function enlaceSeguro(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS_MS.test(u.hostname) ? u.toString() : null;
  } catch { return null; }
}

// Busca un enlace de aprobación dentro de un texto pegado
export function enlaceEnTexto(texto) {
  for (const m of String(texto ?? '').matchAll(/https:\/\/[^\s<>"')\]]+/g)) {
    const e = enlaceSeguro(m[0]);
    if (e && /approval/i.test(e) && !/reject|rechaz/i.test(e)) return e;
  }
  return null;
}

// Lista de aprobaciones recibidas del mismo entorno que un enlace conocido
function listaDesde(enlace) {
  const m = String(enlace ?? '').match(/\/environments\/([^/?#]+)/);
  return m ? `https://make.powerautomate.com/environments/${m[1]}/approvals/received` : null;
}

// Botón «Aprobar en Power Automate». Sin enlace propio, abre la lista de
// aprobaciones recibidas (tomando el entorno de una solicitud anterior).
export function BotonAprobar({ enlace, principal = false, texto }) {
  const propio = enlaceSeguro(enlace);
  const [lista, setLista] = useState(null);
  useEffect(() => {
    if (propio || !supabase) return;
    supabase.from('solicitudes_entrantes').select('enlace_aprobacion').not('enlace_aprobacion', 'is', null)
      .order('recibida_en', { ascending: false }).limit(1)
      .then(({ data }) => setLista(listaDesde(data?.[0]?.enlace_aprobacion)));
  }, [propio]);
  const destino = propio ?? lista ?? 'https://make.powerautomate.com/';
  return (
    <span className="boton-aprobar">
      <a className={'btn' + (principal ? ' btn-primario' : '')} href={destino} target="_blank" rel="noopener noreferrer">
        {texto ?? (propio ? 'Aprobar en Power Automate ↗' : 'Abrir aprobaciones en Power Automate ↗')}
      </a>
      {!propio && <span className="tenue chico">{lista ? 'Busque la solicitud en «Recibidas».' : 'En Power Automate, vaya a Aprobaciones → Recibidas.'}</span>}
    </span>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import { hhmm } from './pages/reservaciones/comun';

// Avisos para registrar la asistencia de las prácticas de hoy: al acercarse la
// hora de inicio (sin entrada registrada) y al llegar la hora de término (sin
// salida). Se activan o desactivan por navegador en «Mi cuenta».

const CLAVE_ACTIVOS = 'lab-avisos-asistencia';
const CLAVE_POSPUESTOS = 'lab-avisos-asistencia-pospuestos';
const ANTICIPACION_MIN = 10;   // minutos antes del inicio
const POSPONER_MIN = 10;

const leer = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export const avisosAsistenciaActivos = () => leer(CLAVE_ACTIVOS, true);
export function activarAvisosAsistencia(si) {
  escribir(CLAVE_ACTIVOS, si);
  window.dispatchEvent(new Event('avisos-asistencia'));
}

function pendientes(lista, pospuestos) {
  const ahora = Date.now();
  const out = [];
  for (const r of lista) {
    const ini = new Date(r.inicio).getTime(); const fin = new Date(r.fin).getTime();
    const a = r.asistencias_reservacion;
    let tipo = null;
    if (!a && ahora >= ini - ANTICIPACION_MIN * 60000 && ahora <= fin) tipo = 'inicio';
    else if (a && !a.salida && ahora >= fin) tipo = 'termino';
    if (!tipo) continue;
    const clave = `${r.id}:${tipo}`;
    if ((pospuestos[clave] ?? 0) > ahora) continue;
    out.push({ ...r, tipo, clave });
  }
  return out;
}

export function AvisosAsistencia() {
  const navegar = useNavigate();
  const [activos, setActivos] = useState(avisosAsistenciaActivos());
  const [lista, setLista] = useState([]);
  const [pospuestos, setPospuestos] = useState(() => leer(CLAVE_POSPUESTOS, {}));
  const [, setReloj] = useState(0);

  useEffect(() => {
    const cambio = () => setActivos(avisosAsistenciaActivos());
    window.addEventListener('avisos-asistencia', cambio);
    return () => window.removeEventListener('avisos-asistencia', cambio);
  }, []);

  useEffect(() => {
    if (!activos) return undefined;
    const avisados = new Set();
    const revisar = async () => {
      const ini = new Date(); ini.setHours(0, 0, 0, 0);
      const fin = new Date(ini); fin.setDate(fin.getDate() + 1);
      const { data, error } = await supabase.from('reservaciones')
        .select('id, inicio, fin, titulo, responsable, asistencias_reservacion(entrada, salida)')
        .eq('estado', 'programada').gt('fin', ini.toISOString()).lt('inicio', fin.toISOString()).order('inicio');
      if (error) return;
      setLista(data ?? []);
      setReloj((x) => x + 1);
      // Aviso del navegador (si se permitió) la primera vez que aparece cada uno
      if ('Notification' in window && Notification.permission === 'granted') {
        for (const p of pendientes(data ?? [], leer(CLAVE_POSPUESTOS, {}))) {
          if (avisados.has(p.clave)) continue;
          avisados.add(p.clave);
          try {
            const n = new Notification(p.tipo === 'inicio' ? '¿Registrar la entrada?' : '¿Registrar la salida?', {
              body: `${p.titulo} · ${hhmm(p.inicio)}–${hhmm(p.fin)}`, tag: p.clave,
            });
            n.onclick = () => { window.focus(); navegar(`/reservaciones/detalle/${p.id}?registrar=${p.tipo}`); n.close(); };
          } catch { /* algunos navegadores solo permiten avisos desde un service worker */ }
        }
      }
    };
    revisar();
    const t = setInterval(revisar, 60000);
    const alVolver = () => document.visibilityState === 'visible' && revisar();
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [activos, navegar]);

  if (!activos) return null;
  const visibles = pendientes(lista, pospuestos);
  if (!visibles.length) return null;

  function posponer(p, minutos) {
    const nuevo = { ...pospuestos, [p.clave]: Date.now() + minutos * 60000 };
    // Se limpian los vencidos para no acumular
    for (const [k, v] of Object.entries(nuevo)) if (v < Date.now()) delete nuevo[k];
    setPospuestos(nuevo); escribir(CLAVE_POSPUESTOS, nuevo);
  }

  return (
    <div className="avisos-flotantes" role="status" aria-live="polite">
      {visibles.slice(0, 3).map((p) => (
        <div key={p.clave} className="aviso-flotante">
          <p><strong>{p.tipo === 'inicio' ? (new Date(p.inicio) > new Date() ? 'Está por empezar' : 'Ya empezó') : 'Ya terminó'}</strong>{' '}
            «{p.titulo}» ({hhmm(p.inicio)}–{hhmm(p.fin)}){p.responsable ? ` · ${p.responsable}` : ''}.</p>
          <p>{p.tipo === 'inicio' ? '¿Desea registrar su entrada?' : '¿Desea registrar la salida?'}</p>
          <div className="fila-botones">
            <button className="btn btn-primario btn-chico" onClick={() => { posponer(p, POSPONER_MIN); navegar(`/reservaciones/detalle/${p.id}?registrar=${p.tipo}`); }}>
              {p.tipo === 'inicio' ? 'Registrar entrada' : 'Registrar salida'}</button>
            <button className="btn btn-chico" onClick={() => posponer(p, POSPONER_MIN)}>En {POSPONER_MIN} min</button>
            <button className="btn btn-chico" onClick={() => posponer(p, 24 * 60)}>Hoy no</button>
          </div>
        </div>
      ))}
      {visibles.length > 3 && <p className="tenue chico">y {visibles.length - 3} más en «Inicio».</p>}
    </div>
  );
}

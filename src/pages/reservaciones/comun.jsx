import { Link, NavLink } from 'react-router-dom';
import { Etiqueta } from '../../componentes';

export function PestanasReservaciones() {
  return (
    <nav className="pestanas">
      <NavLink to="/reservaciones/calendario">Calendario</NavLink>
      <NavLink to="/reservaciones/nueva">Nueva reservación</NavLink>
      <NavLink to="/reservaciones/lista">Lista</NavLink>
      <NavLink to="/reservaciones/preparacion">Preparación de material</NavLink>
      <NavLink to="/solicitudes">Importar solicitud FIQ</NavLink>
    </nav>
  );
}

// Conmutador Semana / Mes del calendario; recuerda la última vista en este navegador
export function CambiarVista({ vista, fecha }) {
  const recordar = (v) => { try { localStorage.setItem('lab-vista-calendario', v); } catch { /* sin almacenamiento */ } };
  return (
    <div className="conmutador" role="group" aria-label="Vista del calendario">
      <Link className={'btn btn-chico' + (vista === 'semana' ? ' activo' : '')} onClick={() => recordar('semana')}
        to={`/reservaciones/calendario?vista=semana&semana=${fecha}`}>Semana</Link>
      <Link className={'btn btn-chico' + (vista === 'mes' ? ' activo' : '')} onClick={() => recordar('mes')}
        to={`/reservaciones/calendario?vista=mes&mes=${fecha.slice(0, 7)}`}>Mes</Link>
    </div>
  );
}
export function vistaRecordada() {
  try { return localStorage.getItem('lab-vista-calendario') === 'mes' ? 'mes' : 'semana'; } catch { return 'semana'; }
}

// Tipos de actividad. Los nombres siguen el reporte trimestral
// (docencia, investigación, servicios y vinculación).
export const ACTIVIDADES = {
  clase: { texto: 'Clase (práctica de asignatura)', corto: 'Clase', color: 'act-clase' },
  taller_curso: { texto: 'Taller o curso', corto: 'Taller / curso', color: 'act-taller' },
  investigacion: { texto: 'Investigación (tesis, trabajo experimental)', corto: 'Investigación', color: 'act-investigacion' },
  proyecto: { texto: 'Proyecto', corto: 'Proyecto', color: 'act-proyecto' },
  vinculacion: { texto: 'Vinculación o servicio', corto: 'Vinculación', color: 'act-vinculacion' },
  otro: { texto: 'Otra', corto: 'Otra', color: 'act-otro' },
};

// Clasificación de residuos peligrosos del formato de solicitud de prácticas
export const RESIDUOS = {
  1: 'Grupo 1. Soluciones ácidas o básicas',
  2: 'Grupo 2. Solventes clorados',
  3: 'Grupo 3. Solventes no clorados',
  4: 'Grupo 4. Soluciones con metales pesados',
  5: 'Grupo 5. RQP sólido',
  6: 'Grupo 6. Residuos químicos gastados',
  7: 'Grupo 7. Bromuro de etidio y sustancias mutagénicas',
  8: 'Otros',
};

export function EtiquetaActividad({ actividad }) {
  const a = ACTIVIDADES[actividad] ?? ACTIVIDADES.otro;
  return <span className={'etiqueta ' + a.color}>{a.corto}</span>;
}

export function EstadoReservacion({ r }) {
  if (r.estado === 'cancelada') return <Etiqueta tono="mal">Cancelada</Etiqueta>;
  const ahora = new Date();
  if (new Date(r.fin) < ahora) return <Etiqueta tono="gris">Realizada</Etiqueta>;
  if (new Date(r.inicio) <= ahora) return <Etiqueta tono="bien">En curso</Etiqueta>;
  return <Etiqueta tono="aviso">Programada</Etiqueta>;
}

export const SELECT_RESERVACION = `id, serie_id, inicio, fin, actividad, ocupa_todo, titulo, responsable, responsable_correo,
  responsable_telefono, usuarios, procedencia, institucion, asignatura, programa_educativo, semestre, num_alumnos,
  num_equipos_trabajo, equipos, materiales, residuos, contacto_emergencia, observaciones, estado, motivo_cancelacion,
  autorizado_por, creado_en, folio_solicitud, reactivos, alumnos_pe`;

const dos = (n) => String(n).padStart(2, '0');
export const hhmm = (ts) => { const d = new Date(ts); return `${dos(d.getHours())}:${dos(d.getMinutes())}`; };
export const mismoDia = (r) => new Date(r.inicio).toDateString() === new Date(r.fin).toDateString();
const ddmm = (ts) => { const d = new Date(ts); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
// «09:00–11:00», o con fechas si la reservación es de uso continuo
export const horario = (r) => (mismoDia(r) ? `${hhmm(r.inicio)}–${hhmm(r.fin)}` : `${ddmm(r.inicio)} ${hhmm(r.inicio)} → ${ddmm(r.fin)} ${hhmm(r.fin)}`);

// Lunes de la semana de una fecha (hora local)
export function lunesDe(fecha) {
  const d = new Date(fecha); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export function sumarDias(fecha, n) {
  const d = new Date(fecha); d.setDate(d.getDate() + n); return d;
}
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const diaTexto = (d) => `${DIAS_CORTOS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MESES[d.getMonth()]}`;

// ¿Cae fuera del horario de Configuración o en fin de semana? (anticipa la regla de la base)
export function fueraDeHorario(inicio, fin, config) {
  if (!inicio || !fin) return false;
  const a = new Date(inicio); const b = new Date(fin);
  const t = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const apertura = (config.hora_apertura ?? '08:00').slice(0, 5);
  const cierre = (config.hora_cierre ?? '20:00').slice(0, 5);
  return [0, 6].includes(a.getDay()) || t(a) < apertura || t(b) > cierre || a.toDateString() !== b.toDateString();
}

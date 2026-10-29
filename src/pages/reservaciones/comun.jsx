import { NavLink } from 'react-router-dom';
import { Etiqueta } from '../../componentes';

export function PestanasReservaciones() {
  return (
    <nav className="pestanas">
      <NavLink to="/reservaciones/calendario">Calendario</NavLink>
      <NavLink to="/reservaciones/nueva">Nueva reservación</NavLink>
      <NavLink to="/reservaciones/lista">Lista</NavLink>
    </nav>
  );
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
  autorizado_por, creado_en`;

const dos = (n) => String(n).padStart(2, '0');
export const hhmm = (ts) => { const d = new Date(ts); return `${dos(d.getHours())}:${dos(d.getMinutes())}`; };
export const horario = (r) => `${hhmm(r.inicio)}–${hhmm(r.fin)}`;

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

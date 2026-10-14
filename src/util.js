// Utilidades de fecha y hora. Las fechas "YYYY-MM-DD" de la base se formatean
// sin pasar por Date para que la zona horaria no las corra un día.

const dosDig = (n) => String(n).padStart(2, '0');

export function hoyISO(desplazamientoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + desplazamientoDias);
  return `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;
}

export function fecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function hora(ts) {
  return ts ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
}

export function fechaHora(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${dosDig(d.getDate())}/${dosDig(d.getMonth() + 1)}/${d.getFullYear()} ${hora(ts)}`;
}

// Fecha local de una marca de tiempo, como "YYYY-MM-DD"
export function diaLocal(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`;
}

// Para <input type="datetime-local">
export function aCampoFechaHora(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${diaLocal(ts)}T${dosDig(d.getHours())}:${dosDig(d.getMinutes())}`;
}
export function deCampoFechaHora(valor) {
  return valor ? new Date(valor).toISOString() : null;
}

// Duración legible entre dos marcas de tiempo
export function duracion(desde, hasta = new Date()) {
  const min = Math.max(0, Math.round((new Date(hasta) - new Date(desde)) / 60000));
  const h = Math.floor(min / 60);
  return h ? `${h} h ${dosDig(min % 60)} min` : `${min} min`;
}

// Búsqueda sin acentos ni mayúsculas
export function normalizar(t) {
  return (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Descarga una tabla como CSV (se abre bien en Excel con acentos)
export function descargarCSV(nombreArchivo, encabezados, filas) {
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const texto = [encabezados, ...filas].map((f) => f.map(celda).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(a.href);
}

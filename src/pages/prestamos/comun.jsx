import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase } from '../../supabase';
import { Etiqueta } from '../../componentes';
import { fecha, hoyISO } from '../../util';

export function PestanasPrestamos() {
  return (
    <nav className="pestanas">
      <NavLink to="/prestamos/abiertos">Abiertos</NavLink>
      <NavLink to="/prestamos/nuevo">Nuevo préstamo</NavLink>
      <NavLink to="/prestamos/historial">Historial</NavLink>
    </nav>
  );
}

export function useConfiguracion() {
  const [c, setC] = useState({ dias_prestamo_max: 7 });
  useEffect(() => {
    supabase.from('configuracion').select('*').eq('id', 1).maybeSingle().then(({ data }) => data && setC(data));
  }, []);
  return c;
}

export const etiquetaPersona = (p) =>
  `${p.nombre} — ${p.externo ? (p.adscripcion || 'Externo') : p.matricula}`;

// Situación de un préstamo según su estado y fecha límite
export function SituacionPrestamo({ p }) {
  if (p.estado === 'cerrado') return <Etiqueta tono="gris">Devuelto</Etiqueta>;
  const hoy = hoyISO();
  if (p.fecha_limite < hoy) {
    const dias = Math.round((new Date(hoy) - new Date(p.fecha_limite)) / 86400000);
    return <Etiqueta tono="mal">Vencido hace {dias} d</Etiqueta>;
  }
  if (p.fecha_limite === hoy) return <Etiqueta tono="aviso">Vence hoy</Etiqueta>;
  return <Etiqueta tono="bien">Hasta {fecha(p.fecha_limite)}</Etiqueta>;
}

// Texto corto de lo prestado y lo pendiente
export function describirRenglon(r) {
  if (r.equipos) return `${r.equipos.codigo} · ${r.equipos.nombre}`;
  return `${Number(r.cantidad)} ${r.articulos?.unidad ?? ''} · ${r.articulos?.nombre ?? ''}`;
}
export const pendienteRenglon = (r) => (r.devuelto_en ? 0 : Number(r.cantidad) - Number(r.cantidad_devuelta) - Number(r.cantidad_perdida));

export const SELECT_PRESTAMO = `id, tipo, estado, fecha_entrega, fecha_limite, motivo, vobo_referencia, autorizado_por, solicitante_id,
  solicitantes(nombre, matricula, externo, adscripcion, correo, telefono),
  prestamo_renglones(id, cantidad, cantidad_devuelta, cantidad_perdida, devuelto_en, danado, condicion,
    equipo_id, articulo_id, equipos(codigo, nombre), articulos(nombre, unidad))`;

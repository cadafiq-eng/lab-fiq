import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta } from '../../componentes';
import { descargarCSV, diaLocal, fecha, hoyISO, normalizar } from '../../util';
import { ACTIVIDADES, EstadoReservacion, EtiquetaActividad, PestanasReservaciones, RESIDUOS, horario } from './comun';

export default function Lista() {
  const navegar = useNavigate();
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO(30));
  const [actividad, setActividad] = useState('');
  const [verCanceladas, setVerCanceladas] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [lista, setLista] = useState(null);
  const [equipos, setEquipos] = useState({});
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    supabase.from('equipos').select('id, codigo, nombre').then(({ data }) =>
      setEquipos(Object.fromEntries((data ?? []).map((e) => [e.id, `${e.codigo} · ${e.nombre}`]))));
  }, []);

  useEffect(() => {
    if (!desde || !hasta) return;
    setLista(null);
    const fin = new Date(hasta + 'T00:00'); fin.setDate(fin.getDate() + 1);
    let q = supabase.from('reservaciones').select('*').gte('inicio', new Date(desde + 'T00:00').toISOString())
      .lt('inicio', fin.toISOString()).order('inicio').limit(5000);
    if (actividad) q = q.eq('actividad', actividad);
    if (!verCanceladas) q = q.eq('estado', 'programada');
    q.then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  }, [desde, hasta, actividad, verCanceladas]);

  const visibles = useMemo(() => {
    const q = normalizar(buscar.trim());
    return (lista ?? []).filter((r) => !q || normalizar([r.titulo, r.responsable, r.usuarios, r.asignatura, r.institucion,
      ...(r.equipos ?? []).map((e) => equipos[e])].join(' ')).includes(q));
  }, [lista, buscar, equipos]);

  function exportar() {
    descargarCSV(`reservaciones_${desde}_${hasta}.csv`,
      ['Fecha', 'Inicio', 'Fin', 'Horas', 'Actividad', 'Título', 'Responsable', 'Correo', 'Teléfono', 'Usuarios', 'Procedencia', 'Institución',
        'Asignatura', 'Programa educativo', 'Semestre', 'Alumnos', 'Equipos de alumnos', 'Ocupa todo el laboratorio', 'Equipos reservados',
        'Materiales', 'Residuos', 'Contacto de emergencia', 'Observaciones', 'Estado', 'Motivo de cancelación'],
      visibles.map((r) => [fecha(diaLocal(r.inicio)), horario(r).split('–')[0], horario(r).split('–')[1],
        ((new Date(r.fin) - new Date(r.inicio)) / 3600000).toFixed(2), ACTIVIDADES[r.actividad]?.corto, r.titulo, r.responsable,
        r.responsable_correo, r.responsable_telefono, r.usuarios, r.procedencia, r.institucion, r.asignatura, r.programa_educativo,
        r.semestre, r.num_alumnos, r.num_equipos_trabajo, r.ocupa_todo ? 'Sí' : 'No',
        (r.equipos ?? []).map((e) => equipos[e]).join('; '), r.materiales, (r.residuos ?? []).map((g) => RESIDUOS[g]).join('; '),
        r.contacto_emergencia, r.observaciones, r.estado, r.motivo_cancelacion]));
  }

  return (
    <>
      <h1>Reservaciones</h1>
      <PestanasReservaciones />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="filtros">
          <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
          <label>Actividad
            <select value={actividad} onChange={(e) => setActividad(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ACTIVIDADES).map(([k, a]) => <option key={k} value={k}>{a.corto}</option>)}
            </select>
          </label>
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar título, responsable, asignatura o equipo" />
          <label className="casilla"><input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} />Incluir canceladas</label>
          {visibles.length > 0 && <button className="btn btn-chico" onClick={exportar}>CSV</button>}
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? <p className="tenue">No hay reservaciones en el periodo.</p> : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Fecha</th><th>Horario</th><th>Actividad</th><th>Título</th><th>Responsable</th><th>Equipos</th><th>Estado</th></tr></thead>
            <tbody>{visibles.map((r) => (
              <tr key={r.id} className="fila-enlace" onClick={() => navegar(`/reservaciones/detalle/${r.id}`)}>
                <td className="sin-salto">{fecha(diaLocal(r.inicio))}</td>
                <td className="sin-salto">{horario(r)}</td>
                <td><EtiquetaActividad actividad={r.actividad} />{r.ocupa_todo && <><br /><span className="tenue chico">todo el lab</span></>}</td>
                <td><strong>{r.titulo}</strong>{r.asignatura && <><br /><span className="tenue">{r.asignatura}</span></>}</td>
                <td>{r.responsable}{r.procedencia === 'externo' && <><br /><Etiqueta tono="aviso">Externo</Etiqueta> <span className="tenue">{r.institucion}</span></>}</td>
                <td className="chico">{(r.equipos ?? []).map((e) => equipos[e]).filter(Boolean).join(', ') || '—'}</td>
                <td><EstadoReservacion r={r} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {lista && <p className="tenue nota">{visibles.length} reservación(es).</p>}
      </section>
    </>
  );
}

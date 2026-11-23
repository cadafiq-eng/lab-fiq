import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { leerSolicitud } from '../solicitudes/lector';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta } from '../../componentes';
import { diaLocal, hoyISO } from '../../util';
import Asistencia from './Asistencia';
import { EtiquetaActividad, PestanasReservaciones, RESIDUOS, diaTexto, horario } from './comun';

// Preparación de material: una tarjeta por reservación con lo que necesita
// (materiales, reactivos, equipos) y la marca de «preparado».
export default function Preparacion() {
  const [desde, setDesde] = useState(hoyISO());
  const [dias, setDias] = useState(7);
  const [ocultarListas, setOcultarListas] = useState(false);
  const [lista, setLista] = useState(null);
  const [prep, setPrep] = useState({});
  const [equipos, setEquipos] = useState({});
  const [personal, setPersonal] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [porRegistrar, setPorRegistrar] = useState([]);
  const navegar = useNavigate();

  useEffect(() => {
    supabase.from('equipos').select('id, codigo, nombre').then(({ data }) =>
      setEquipos(Object.fromEntries((data ?? []).map((e) => [e.id, `${e.codigo} · ${e.nombre}`]))));
    supabase.from('perfiles').select('id, nombre').then(({ data }) =>
      setPersonal(Object.fromEntries((data ?? []).map((p) => [p.id, p.nombre]))));
  }, []);

  function cargar() {
    const ini = new Date(desde + 'T00:00'); const fin = new Date(ini); fin.setDate(fin.getDate() + Number(dias));
    supabase.from('reservaciones')
      .select('id, inicio, fin, actividad, titulo, responsable, usuarios, asignatura, num_alumnos, num_equipos_trabajo, equipos, materiales, reactivos, residuos, observaciones, folio_solicitud, procedencia, alumnos_pe, estado, asistencias_reservacion(*)')
      .eq('estado', 'programada').gt('fin', ini.toISOString()).lt('inicio', fin.toISOString()).order('inicio').limit(500)
      .then(({ data, error }) => {
        if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
        setLista(data);
        const ids = (data ?? []).map((r) => r.id);
        if (!ids.length) return setPrep({});
        supabase.from('preparacion_reservaciones').select('*').in('reservacion_id', ids)
          .then(({ data: p }) => setPrep(Object.fromEntries((p ?? []).map((x) => [x.reservacion_id, x]))));
      });
  }
  useEffect(cargar, [desde, dias]);

  // Solicitudes de práctica que llegaron pero aún no se registran como reservación
  useEffect(() => {
    const fin = new Date(desde + 'T00:00'); fin.setDate(fin.getDate() + Number(dias));
    supabase.from('solicitudes_entrantes').select('id, texto, folio, recibida_en').eq('estado', 'pendiente').in('tipo', ['practica', 'acceso'])
      .order('recibida_en').limit(200)
      .then(({ data }) => setPorRegistrar((data ?? []).map((s) => ({ ...s, d: leerSolicitud(s.texto) })).filter(({ d }) => {
        if (!d) return false;
        if (d.tipo === 'acceso') return (d.materiales || d.reactivos || d.equipos_texto) && (!d.inicio || ((d.fin || d.inicio) >= desde && d.inicio < diaLocal(fin)));
        return !d.fecha || (d.fecha >= desde && d.fecha < diaLocal(fin));
      })));
  }, [desde, dias]);

  async function marcar(r, preparada) {
    if (!preparada && !confirm(`¿Quitar la marca de preparado a «${r.titulo}»?`)) return;
    setMensaje(null);
    const { error } = await supabase.rpc('marcar_preparacion', { p_reservacion: r.id, p_preparada: preparada });
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    const { data } = await supabase.from('preparacion_reservaciones').select('*').eq('reservacion_id', r.id).maybeSingle();
    setPrep((p) => ({ ...p, [r.id]: data }));
  }

  async function guardarNota(r, nota) {
    if ((prep[r.id]?.nota ?? '') === nota.trim()) return;
    const { error } = await supabase.rpc('marcar_preparacion', { p_reservacion: r.id, p_preparada: Boolean(prep[r.id]?.preparada), p_nota: nota });
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setPrep((p) => ({ ...p, [r.id]: { ...(p[r.id] ?? {}), nota: nota.trim() || p[r.id]?.nota } }));
  }

  const visibles = useMemo(() => (lista ?? []).filter((r) => !ocultarListas || !prep[r.id]?.preparada), [lista, prep, ocultarListas]);
  const porDia = useMemo(() => {
    const g = new Map();
    for (const r of visibles) { const k = diaLocal(r.inicio); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    return [...g.entries()];
  }, [visibles]);
  const listas = (lista ?? []).filter((r) => prep[r.id]?.preparada).length;

  return (
    <>
      <h1>Reservaciones</h1>
      <PestanasReservaciones />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="filtros">
          <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Periodo
            <select value={dias} onChange={(e) => setDias(e.target.value)}>
              <option value={1}>Solo ese día</option>
              <option value={3}>3 días</option>
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={31}>31 días</option>
            </select>
          </label>
          <label className="casilla"><input type="checkbox" checked={ocultarListas} onChange={(e) => setOcultarListas(e.target.checked)} />Ocultar las ya preparadas</label>
        </div>
        {lista && <p className="tenue nota">{listas} de {lista.length} reservación(es) preparadas.</p>}
      </section>

      {porRegistrar.length > 0 && (
        <section className="prep-dia">
          <h2 style={{ textTransform: "none" }}>Solicitudes FIQ aún sin registrar ({porRegistrar.length})</h2>
          <p className="tenue nota">Llegaron pero todavía no están en el calendario. Regístrelas para apartar el horario; mientras, aquí ve lo que piden.</p>
          <div className="prep-tarjetas">
            {porRegistrar.map(({ id, folio, d }) => (
              <article key={id} className="tarjeta prep-tarjeta prep-pendiente">
                <header>
                  <div><strong className="prep-hora">{d.tipo === 'acceso'
                    ? (d.inicio ? `${diaTexto(new Date(d.inicio + 'T12:00'))}${d.fin && d.fin !== d.inicio ? ` al ${diaTexto(new Date(d.fin + 'T12:00'))}` : ''}` : 'Sin fecha')
                    : `${d.fecha ? diaTexto(new Date(d.fecha + 'T12:00')) : 'Sin fecha'} · ${d.hora_inicio || '?'}–${d.hora_fin || '?'}`}</strong>
                    {folio && <span className="tenue chico"> · FIQ {folio}</span>}</div>
                  <Etiqueta tono="aviso">Sin registrar</Etiqueta>
                </header>
                <h3>{d.titulo || d.actividad || 'Sin nombre'}{d.tipo === 'acceso' && <span className="tenue chico"> · acceso</span>}</h3>
                <p className="tenue">{d.tipo === 'acceso' ? d.personas?.map((x) => x.nombre).join(' y ') : d.responsable}{d.asignatura ? ` · ${d.asignatura}` : ''}{d.num_alumnos ? ` · ${d.num_alumnos} personas` : ''}</p>
                {d.materiales && <><h4>Materiales</h4><p className="prep-texto">{d.materiales}</p></>}
                {d.reactivos && <><h4>Reactivos</h4><p className="prep-texto">{d.reactivos}</p></>}
                {d.equipos_texto && <><h4>Equipos solicitados</h4><p className="prep-texto">{d.equipos_texto}</p></>}
                <footer>
                  <button className="btn btn-primario btn-chico" onClick={() => navegar('/solicitudes', { state: { abrir: id } })}>Registrar en el calendario</button>
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}

      {!lista ? <p className="tenue">Cargando…</p> : porDia.length === 0 ? (
        <section className="tarjeta"><p className="tenue">{lista.length ? 'Todo está preparado en este periodo.' : 'No hay reservaciones en este periodo.'}</p></section>
      ) : porDia.map(([dia, rs]) => (
        <section key={dia} className="prep-dia">
          <h2>{diaTexto(new Date(dia + 'T12:00'))}{dia === hoyISO() && <span className="tenue"> · hoy</span>}</h2>
          <div className="prep-tarjetas">
            {rs.map((r) => {
              const p = prep[r.id];
              const nada = !r.materiales && !r.reactivos && !(r.equipos ?? []).length;
              return (
                <article key={r.id} className={'tarjeta prep-tarjeta' + (p?.preparada ? ' prep-lista' : '')}>
                  <header>
                    <div>
                      <strong className="prep-hora">{horario(r)}</strong> <EtiquetaActividad actividad={r.actividad} />
                      {r.folio_solicitud && <span className="tenue chico"> · FIQ {r.folio_solicitud}</span>}
                    </div>
                    {p?.preparada && <Etiqueta tono="bien">Preparada</Etiqueta>}
                  </header>
                  <h3><Link to={`/reservaciones/detalle/${r.id}`}>{r.titulo}</Link></h3>
                  <p className="tenue">{r.responsable}{r.asignatura ? ` · ${r.asignatura}` : ''}
                    {(r.num_alumnos || r.num_equipos_trabajo) && <><br />{[r.num_alumnos && `${r.num_alumnos} personas`, r.num_equipos_trabajo && `${r.num_equipos_trabajo} equipos de trabajo`].filter(Boolean).join(' · ')}</>}
                  </p>
                  {nada && <p className="aviso aviso-alerta nota">La reservación no indica materiales, reactivos ni equipos.</p>}
                  {r.materiales && <><h4>Materiales</h4><p className="prep-texto">{r.materiales}</p></>}
                  {r.reactivos && <><h4>Reactivos</h4><p className="prep-texto">{r.reactivos}</p></>}
                  {(r.equipos ?? []).length > 0 && <><h4>Equipos del laboratorio</h4>
                    <ul className="lista-simple">{r.equipos.map((e) => <li key={e}>{equipos[e] ?? 'Equipo'}</li>)}</ul></>}
                  {(r.residuos ?? []).length > 0 && <><h4>Residuos</h4><p className="prep-texto chico">{r.residuos.map((g) => RESIDUOS[g]).join('; ')}</p></>}
                  {r.observaciones && <p className="tenue chico">{r.observaciones}</p>}
                  {diaLocal(r.inicio) <= hoyISO() && (
                    <Asistencia r={r} compacta alCambiar={(a) => setLista((l) => l.map((x) => (x.id === r.id ? { ...x, asistencias_reservacion: a } : x)))} />
                  )}
                  <label className="prep-nota">Nota de preparación
                    <input defaultValue={p?.nota ?? ''} key={p?.nota ?? ''} placeholder="Ej. material en la mesa 2"
                      onBlur={(e) => guardarNota(r, e.target.value)} />
                  </label>
                  <footer>
                    <label className="casilla prep-check">
                      <input type="checkbox" checked={Boolean(p?.preparada)} onChange={(e) => marcar(r, e.target.checked)} />
                      Ya está preparado
                    </label>
                    {p?.preparada && <span className="tenue chico">{personal[p.actualizada_por] ?? ''} · {new Date(p.actualizada_en).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

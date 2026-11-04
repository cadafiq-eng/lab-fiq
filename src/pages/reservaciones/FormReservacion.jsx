import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta } from '../../componentes';
import { diaLocal, fecha, hoyISO } from '../../util';
import { useConfiguracion } from '../prestamos/comun';
import { ACTIVIDADES, EtiquetaActividad, PestanasReservaciones, RESIDUOS, SELECT_RESERVACION, fueraDeHorario, horario, hhmm, mismoDia } from './comun';

const MODOS = {
  uno: 'Un solo día',
  habil: 'Varios días con el mismo horario, de lunes a viernes',
  diaria: 'Varios días con el mismo horario, incluido el fin de semana',
  distintos: 'Varios días con horario distinto',
  semanal: 'Cada semana (el mismo día)',
  continuo: 'Uso continuo: empieza un día y termina otro',
};

const sumarDia = (iso) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + 1); return diaLocal(d); };

// Sesiones que generará la serie (igual que registrar_reservacion en la base)
function contarSesiones(desde, hasta, modo) {
  let n = 0;
  for (let d = new Date(desde + 'T12:00'); diaLocal(d) <= hasta; d.setDate(d.getDate() + (modo === 'semanal' ? 7 : 1))) {
    if (modo !== 'habil' || ![0, 6].includes(d.getDay())) n += 1;
  }
  return n;
}

const VACIO = {
  actividad: 'clase', ocupa_todo: true, titulo: '', responsable: '', responsable_correo: '', responsable_telefono: '',
  usuarios: '', procedencia: 'interno', institucion: '', asignatura: '', programa_educativo: '', semestre: '',
  num_alumnos: '', num_equipos_trabajo: '', materiales: '', reactivos: '', contacto_emergencia: '', observaciones: '',
};

// Alta (y edición de una sola sesión) de una reservación
export default function FormReservacion() {
  const { id } = useParams();
  const [params] = useSearchParams();
  // Datos que llegan de «Importar solicitud FIQ»
  const importada = useLocation().state;
  const navegar = useNavigate();
  const { esAdmin } = useSesion();
  const config = useConfiguracion();

  const [f, setF] = useState(() => {
    if (!importada?.inicial) return VACIO;
    const t = (v) => (v == null ? '' : String(v));
    return { ...VACIO, ...Object.fromEntries(Object.keys(VACIO).filter((k) => k in importada.inicial)
      .map((k) => [k, k === 'ocupa_todo' ? importada.inicial[k] : t(importada.inicial[k])])),
      ocupa_todo: ['clase', 'taller_curso'].includes(importada.inicial.actividad) };
  });
  const [extra] = useState({ folio_solicitud: importada?.inicial?.folio_solicitud ?? null, alumnos_pe: importada?.inicial?.alumnos_pe ?? null });
  const [dia, setDia] = useState(importada?.dia || params.get('fecha') || hoyISO());
  const [horaIni, setHoraIni] = useState(importada?.horaIni || '09:00');
  const [horaFin, setHoraFin] = useState(importada?.horaFin || '11:00');
  // Duración: 'uno' (un día), 'habil' / 'diaria' (varios días, mismo horario),
  // 'semanal' (cada semana) o 'continuo' (empieza un día y termina otro)
  const [modo, setModo] = useState('uno');
  const [hasta, setHasta] = useState('');
  const [diaFin, setDiaFin] = useState('');
  const [filas, setFilas] = useState([]);   // modo 'distintos': [{ dia, ini, fin }]
  const [equiposSel, setEquiposSel] = useState(importada?.equipos ?? []);
  const [residuos, setResiduos] = useState(importada?.residuos ?? []);
  const [equipos, setEquipos] = useState([]);
  const [equipoElegido, setEquipoElegido] = useState('');
  const [delDia, setDelDia] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [cargado, setCargado] = useState(!id);

  useEffect(() => {
    supabase.from('equipos').select('id, codigo, nombre, estado').neq('estado', 'baja').order('nombre')
      .then(({ data }) => setEquipos(data ?? []));
  }, []);

  // Edición: carga la reservación
  useEffect(() => {
    if (!id) return;
    supabase.from('reservaciones').select(SELECT_RESERVACION).eq('id', id).single().then(({ data, error }) => {
      if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
      const t = (v) => (v == null ? '' : String(v));
      setF(Object.fromEntries(Object.keys(VACIO).map((k) => [k, k === 'ocupa_todo' ? data[k] : t(data[k])])));
      setDia(diaLocal(data.inicio)); setHoraIni(hhmm(data.inicio)); setHoraFin(hhmm(data.fin));
      if (diaLocal(data.fin) !== diaLocal(data.inicio)) { setModo('continuo'); setDiaFin(diaLocal(data.fin)); }
      setEquiposSel(data.equipos ?? []); setResiduos(data.residuos ?? []);
      setCargado(true);
    });
  }, [id]);

  const continuo = modo === 'continuo';
  const distintos = modo === 'distintos';
  const ultimoDia = continuo && diaFin > dia ? diaFin : dia;
  // Días que abarca lo que se va a reservar (para ver la ocupación)
  const diasPlan = distintos ? filas.map((x) => x.dia).filter(Boolean).sort() : [dia, ultimoDia];
  const desdeQ = diasPlan[0] || dia;
  const hastaQ = diasPlan[diasPlan.length - 1] || dia;

  // Ocupación de los días elegidos, para ver cruces antes de guardar
  useEffect(() => {
    if (!desdeQ) return;
    const ini = new Date(desdeQ + 'T00:00'); const fin = new Date(hastaQ + 'T00:00'); fin.setDate(fin.getDate() + 1);
    supabase.from('reservaciones').select('id, inicio, fin, actividad, titulo, ocupa_todo, equipos')
      .eq('estado', 'programada').gt('fin', ini.toISOString()).lt('inicio', fin.toISOString()).order('inicio')
      .then(({ data }) => setDelDia((data ?? []).filter((r) => r.id !== id)));
  }, [desdeQ, hastaQ, id]);

  const campo = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const inicio = dia && horaIni ? new Date(`${dia}T${horaIni}`) : null;
  const fin = dia && horaFin ? new Date(`${ultimoDia}T${horaFin}`) : null;
  const repite = ['habil', 'diaria', 'semanal'].includes(modo);
  // Sesiones que se van a guardar (en 'habil', 'diaria' y 'semanal' solo se revisa la primera; la base revisa todas)
  const plan = distintos
    ? filas.filter((x) => x.dia && x.ini && x.fin).map((x) => ({ inicio: new Date(`${x.dia}T${x.ini}`), fin: new Date(`${x.dia}T${x.fin}`) }))
    : inicio && fin ? [{ inicio, fin }] : [];
  const fuera = plan.some((x) => fueraDeHorario(x.inicio, x.fin, config));
  const esClase = f.actividad === 'clase';
  const docencia = esClase || f.actividad === 'taller_curso';
  const ocupaTodo = esClase || f.ocupa_todo;
  const nombreEquipo = (eid) => { const e = equipos.find((x) => x.id === eid); return e ? `${e.codigo} · ${e.nombre}` : 'Equipo'; };

  // Cruces que la base va a rechazar, para avisar antes
  const cruces = useMemo(() => {
    const validas = plan.filter((x) => x.fin > x.inicio);
    return delDia.filter((r) => validas.some((x) => new Date(r.inicio) < x.fin && new Date(r.fin) > x.inicio)).map((r) => {
      const comunes = (r.equipos ?? []).filter((e) => equiposSel.includes(e));
      const motivo = ocupaTodo || r.ocupa_todo ? 'ocupa todo el laboratorio'
        : comunes.length ? `mismo equipo: ${comunes.map(nombreEquipo).join(', ')}` : null;
      return { r, motivo };
    });
  }, [delDia, horaIni, horaFin, dia, ultimoDia, filas, modo, ocupaTodo, equiposSel, equipos]);
  const bloqueantes = cruces.filter((c) => c.motivo);

  function cambiarActividad(e) {
    const a = e.target.value;
    setF({ ...f, actividad: a, ocupa_todo: a === 'clase' || a === 'taller_curso' ? true : (f.actividad === 'clase' || f.actividad === 'taller_curso' ? false : f.ocupa_todo) });
  }

  async function guardar(e) {
    e.preventDefault();
    if (distintos) {
      if (filas.some((x) => !x.dia || !x.ini || !x.fin)) return setMensaje({ tipo: 'error', texto: 'Cada día necesita fecha, hora de inicio y hora de término.' });
      if (plan.some((x) => !(x.fin > x.inicio))) return setMensaje({ tipo: 'error', texto: 'En cada día, la hora de término debe ser posterior a la de inicio.' });
    }
    if (continuo && !(diaFin > dia)) return setMensaje({ tipo: 'error', texto: 'En uso continuo, la fecha de término debe ser posterior a la de inicio.' });
    if (!distintos && !(fin > inicio)) return setMensaje({ tipo: 'error', texto: 'La hora de término debe ser posterior a la de inicio.' });
    setOcupado(true); setMensaje(null);
    const datos = {
      ...f, ocupa_todo: ocupaTodo, inicio: inicio.toISOString(), fin: fin.toISOString(),
      semestre: f.semestre === '' ? null : Number(f.semestre), num_alumnos: f.num_alumnos === '' ? null : Number(f.num_alumnos),
      num_equipos_trabajo: f.num_equipos_trabajo === '' ? null : Number(f.num_equipos_trabajo),
      institucion: f.procedencia === 'externo' ? f.institucion : '', equipos: equiposSel, residuos,
      contacto_emergencia: fuera ? f.contacto_emergencia : '',
    };
    // Los datos de grupo solo aplican a clases, talleres y cursos
    if (!docencia) Object.assign(datos, { asignatura: '', programa_educativo: '', semestre: null, num_alumnos: null, num_equipos_trabajo: null });
    let error; let destino;
    if (id) {
      const fila = Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v === '' ? null : v]));
      ({ error } = await supabase.from('reservaciones').update(fila).eq('id', id));
      destino = `/reservaciones/detalle/${id}`;
    } else {
      let n;
      if (distintos) {
        ({ data: n, error } = await supabase.rpc('registrar_reservacion_sesiones', { p: { ...datos, ...extra },
          p_sesiones: plan.map((x) => ({ inicio: x.inicio.toISOString(), fin: x.fin.toISOString() })) }));
      } else {
        ({ data: n, error } = await supabase.rpc('registrar_reservacion', { p: { ...datos, ...extra }, p_hasta: repite ? hasta : null, p_frecuencia: repite ? modo : 'semanal' }));
      }
      destino = `/reservaciones/calendario?semana=${desdeQ}`;
      if (!error && n > 1) destino += `&series=${n}`;
    }
    setOcupado(false);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    navegar(destino);
  }

  if (!cargado) return <><h1>Reservaciones</h1><Aviso mensaje={mensaje} /><p className="tenue">Cargando…</p></>;
  const sesiones = distintos ? filas.length : repite && hasta >= dia ? contarSesiones(dia, hasta, modo) : 1;

  return (
    <>
      <h1>{id ? 'Editar reservación' : 'Reservaciones'}</h1>
      {id ? <Link className="volver" to={`/reservaciones/detalle/${id}`}>← Volver al detalle</Link> : <PestanasReservaciones />}
      {extra.folio_solicitud && (
        <p className="aviso aviso-ok">Datos tomados de la solicitud FIQ <strong>{extra.folio_solicitud}</strong>
          {extra.alumnos_pe && <> · alumnos por programa: {Object.entries(extra.alumnos_pe).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') || '—'}</>}.
          Revise y pulse «Reservar».</p>
      )}
      <Aviso mensaje={mensaje} />
      <form className="dos-columnas dos-columnas-amplia" onSubmit={guardar}>
        <div className="columna">
          <section className="tarjeta formulario">
            <h2>Actividad</h2>
            <label>Tipo de actividad
              <select value={f.actividad} onChange={cambiarActividad}>
                {Object.entries(ACTIVIDADES).map(([k, a]) => <option key={k} value={k}>{a.texto}</option>)}
              </select>
            </label>
            <label>{docencia ? 'Nombre de la práctica o sesión' : f.actividad === 'vinculacion' ? 'Servicio o análisis' : 'Título del trabajo o proyecto'}
              <input value={f.titulo} onChange={campo('titulo')} required placeholder={esClase ? 'Ej. Evaluación de la calidad del pescado' : ''} />
            </label>
            {docencia && (
              <>
                <label>Asignatura{esClase ? '' : ' (opcional)'}
                  <input value={f.asignatura} onChange={campo('asignatura')} required={esClase} placeholder="Ej. Taller de procesamiento de productos de la pesca" />
                </label>
                <div className="fila-campos fila-3">
                  <label>Programa educativo<input value={f.programa_educativo} onChange={campo('programa_educativo')} placeholder="Ej. Ing. en Alimentos" /></label>
                  <label>Semestre<input type="number" min="1" max="12" value={f.semestre} onChange={campo('semestre')} /></label>
                  <label>Núm. de alumnos<input type="number" min="1" value={f.num_alumnos} onChange={campo('num_alumnos')} /></label>
                </div>
                <label className="angosto-ancho">Equipos (grupos) de alumnos<input type="number" min="1" value={f.num_equipos_trabajo} onChange={campo('num_equipos_trabajo')} /></label>
              </>
            )}
            <label className="casilla">
              <input type="checkbox" checked={ocupaTodo} disabled={esClase} onChange={campo('ocupa_todo')} />
              Ocupa todo el laboratorio {esClase && <span className="tenue">(siempre, en una clase)</span>}
            </label>
            {!esClase && <p className="tenue nota">Si no ocupa todo el laboratorio, puede coincidir con otras actividades que no usen los mismos equipos.</p>}
          </section>

          <section className="tarjeta formulario">
            <h2>¿Quién usa el laboratorio?</h2>
            <label>Responsable (profesor, asesor o responsable del servicio)
              <input value={f.responsable} onChange={campo('responsable')} required />
            </label>
            <div className="fila-campos">
              <label>Correo<input type="email" value={f.responsable_correo} onChange={campo('responsable_correo')} /></label>
              <label>Teléfono<input value={f.responsable_telefono} onChange={campo('responsable_telefono')} /></label>
            </div>
            <label>Usuarios
              <textarea rows={2} value={f.usuarios} onChange={campo('usuarios')} placeholder={docencia ? 'Ej. Grupo de 8.° semestre' : 'Nombres de quienes trabajarán'} />
            </label>
            <fieldset>
              <legend>Procedencia</legend>
              <label className="casilla"><input type="radio" checked={f.procedencia === 'interno'} onChange={() => setF({ ...f, procedencia: 'interno' })} />Interno (FIQ-UADY)</label>
              <label className="casilla"><input type="radio" checked={f.procedencia === 'externo'} onChange={() => setF({ ...f, procedencia: 'externo' })} />Externo (otra dependencia o institución)</label>
            </fieldset>
            {f.procedencia === 'externo' && (
              <label>Institución o dependencia<input value={f.institucion} onChange={campo('institucion')} required /></label>
            )}
          </section>

          <section className="tarjeta formulario">
            <h2>Equipos, materiales y residuos</h2>
            <div className="fila-agregar">
              <label className="crece">Equipo del laboratorio
                <select value={equipoElegido} onChange={(e) => setEquipoElegido(e.target.value)}>
                  <option value="">Elija un equipo…</option>
                  {equipos.filter((e) => !equiposSel.includes(e.id)).map((e) => (
                    <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}{e.estado !== 'disponible' ? ` (${e.estado.replace(/_/g, ' ')})` : ''}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn" disabled={!equipoElegido}
                onClick={() => { setEquiposSel([...equiposSel, equipoElegido]); setEquipoElegido(''); }}>Agregar</button>
            </div>
            {equiposSel.length > 0 && (
              <ul className="lista-renglones">
                {equiposSel.map((eid) => (
                  <li key={eid}><span>{nombreEquipo(eid)}</span>
                    <button type="button" className="btn btn-chico" onClick={() => setEquiposSel(equiposSel.filter((x) => x !== eid))}>Quitar</button></li>
                ))}
              </ul>
            )}
            <p className="tenue nota">Un equipo no puede estar en dos reservaciones a la misma hora. La reservación no revisa capacitación ni mantenimiento:
              eso se verifica al usar el equipo en la terminal.</p>
            <label>Materiales e insumos<textarea rows={2} value={f.materiales} onChange={campo('materiales')} /></label>
            <label>Reactivos, soluciones o medios de cultivo<textarea rows={2} value={f.reactivos} onChange={campo('reactivos')} /></label>
            <fieldset>
              <legend>Residuos peligrosos que se generarán</legend>
              <div className="rejilla-casillas">
                {Object.entries(RESIDUOS).map(([k, t]) => (
                  <label key={k} className="casilla chico">
                    <input type="checkbox" checked={residuos.includes(Number(k))}
                      onChange={(e) => setResiduos(e.target.checked ? [...residuos, Number(k)] : residuos.filter((x) => x !== Number(k)))} />{t}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>Observaciones<textarea rows={2} value={f.observaciones} onChange={campo('observaciones')} /></label>
          </section>
        </div>

        <div className="columna">
          <section className="tarjeta formulario">
            <h2>¿Cuándo?</h2>
            <fieldset>
              <legend>Duración</legend>
              {Object.entries(MODOS).filter(([k]) => !id || ['uno', 'continuo'].includes(k)).map(([k, t]) => (
                <label key={k} className="casilla"><input type="radio" checked={modo === k}
                  onChange={() => {
                    setModo(k);
                    if (k === 'continuo' && !(diaFin > dia)) setDiaFin(sumarDia(dia));
                    if (k === 'distintos' && !filas.length) setFilas([{ dia, ini: horaIni, fin: horaFin }, { dia: sumarDia(dia), ini: horaIni, fin: horaFin }]);
                  }} />{t}</label>
              ))}
            </fieldset>
            {distintos ? (
              <>
                <ul className="lista-renglones lista-sesiones">
                  {filas.map((x, i) => {
                    const cambiar = (k) => (e) => setFilas(filas.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)));
                    return (
                      <li key={i}>
                        <input type="date" aria-label={`Fecha del día ${i + 1}`} value={x.dia} onChange={cambiar('dia')} required />
                        <input type="time" aria-label="De" value={x.ini} step="900" onChange={cambiar('ini')} required />
                        <span>a</span>
                        <input type="time" aria-label="A" value={x.fin} step="900" onChange={cambiar('fin')} required />
                        <button type="button" className="btn btn-chico" disabled={filas.length === 1}
                          onClick={() => setFilas(filas.filter((_, j) => j !== i))}>Quitar</button>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className="btn btn-chico" disabled={filas.length >= 60}
                  onClick={() => { const u = filas[filas.length - 1]; setFilas([...filas, { dia: u?.dia ? sumarDia(u.dia) : dia, ini: u?.ini ?? horaIni, fin: u?.fin ?? horaFin }]); }}>
                  + Agregar día</button>
                <p className="tenue nota">Cada día con su propio horario; se guardan juntos como una serie (máximo 60). Si uno se cruza, no se guarda ninguno.</p>
              </>
            ) : continuo ? (
              <>
                <div className="fila-campos">
                  <label>Empieza el<input type="date" value={dia} onChange={(e) => setDia(e.target.value)} required /></label>
                  <label>a las<input type="time" value={horaIni} step="900" onChange={(e) => setHoraIni(e.target.value)} required /></label>
                </div>
                <div className="fila-campos">
                  <label>Termina el<input type="date" value={diaFin} min={sumarDia(dia)} onChange={(e) => setDiaFin(e.target.value)} required /></label>
                  <label>a las<input type="time" value={horaFin} step="900" onChange={(e) => setHoraFin(e.target.value)} required /></label>
                </div>
              </>
            ) : (
              <>
                <label>{repite ? 'Primer día' : 'Fecha'}<input type="date" value={dia} onChange={(e) => setDia(e.target.value)} required /></label>
                <div className="fila-campos">
                  <label>De<input type="time" value={horaIni} step="900" onChange={(e) => setHoraIni(e.target.value)} required /></label>
                  <label>A<input type="time" value={horaFin} step="900" onChange={(e) => setHoraFin(e.target.value)} required /></label>
                </div>
              </>
            )}
            {repite && (
              <label>Hasta el
                <input type="date" value={hasta} min={dia} onChange={(e) => setHasta(e.target.value)} required />
                <span className="tenue nota">{sesiones} sesión(es) de {horaIni}–{horaFin}{modo === 'habil' ? ', de lunes a viernes' : modo === 'diaria' ? ', todos los días' : ', una por semana'}
                  {' '}(máximo {modo === 'semanal' ? 26 : 60}). Si una se cruza, no se guarda ninguna.
                  {modo === 'diaria' && !esAdmin && ' Las sesiones en sábado o domingo solo las registra el Administrador.'}</span>
              </label>
            )}
            {continuo && (
              <p className="tenue nota">Para un trabajo o equipo que sigue de un día a otro sin interrupción (p. ej., una fermentación o un secado de 48 h).
                Pasa fuera del horario, así que la registra el Administrador con contacto de emergencia. Máximo 14 días.</p>
            )}
            {fuera && (
              esAdmin ? (
                <>
                  <p className="aviso aviso-alerta nota">Fuera del horario ({(config.hora_apertura ?? '08:00').slice(0, 5)}–{(config.hora_cierre ?? '20:00').slice(0, 5)})
                    o en fin de semana{continuo ? ' (uso continuo)' : ''}. Conviene que trabajen al menos dos personas y avisar al Secretario Administrativo (formato de acceso en fin de semana).</p>
                  <label>Contacto de emergencia (nombre y teléfono)
                    <input value={f.contacto_emergencia} onChange={campo('contacto_emergencia')} required />
                  </label>
                </>
              ) : (
                <p className="aviso aviso-error nota">{continuo ? 'Uso continuo de varios días' : 'Fuera del horario del laboratorio o en fin de semana'}: esta reservación la registra el Administrador.</p>
              )
            )}
            {bloqueantes.map(({ r, motivo }) => (
              <p key={r.id} className="aviso aviso-error nota">Se cruza con «{r.titulo}» ({distintos || continuo ? `${fecha(diaLocal(r.inicio))} ` : ''}{horario(r)}): {motivo}.</p>
            ))}
            <button className="btn btn-primario" disabled={ocupado || (fuera && !esAdmin) || bloqueantes.length > 0}>
              {ocupado ? 'Guardando…' : id ? 'Guardar cambios' : sesiones > 1 ? `Reservar ${sesiones} sesiones` : 'Reservar'}
            </button>
          </section>

          <section className="tarjeta">
            <h2>{desdeQ !== hastaQ ? `Esos días · ${fecha(desdeQ)} al ${fecha(hastaQ)}` : `${repite ? 'El primer día' : 'Ese día'} · ${dia ? fecha(dia) : ''}`}</h2>
            {delDia.length === 0 ? <p className="tenue">Sin otras reservaciones.</p> : (
              <ul className="lista-simple lista-dia">
                {delDia.map((r) => {
                  const choque = cruces.find((c) => c.r.id === r.id);
                  return (
                    <li key={r.id}>
                      <strong>{desdeQ !== hastaQ && mismoDia(r) ? `${fecha(diaLocal(r.inicio))} ` : ''}{horario(r)}</strong> <EtiquetaActividad actividad={r.actividad} /> {r.titulo}
                      {r.ocupa_todo && <> <Etiqueta tono="gris">todo el lab</Etiqueta></>}
                      {choque && (choque.motivo ? <> <Etiqueta tono="mal">se cruza</Etiqueta></> : <> <Etiqueta tono="aviso">coincide</Etiqueta></>)}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </form>
    </>
  );
}

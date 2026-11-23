import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha, fechaHora } from '../../util';
import { RESIDUOS } from '../reservaciones/comun';
import { leerSolicitud, piezasEquipo, sugerirEquipos } from './lector';
import { BotonAprobar, enlaceEnTexto } from './aprobacion';

// Solicitudes del sistema de Laboratorios FIQ (aprobaciones de Power Automate).
// «Pendientes»: las que el flujo del laboratorio copia automáticamente a la app.
// «Pegar texto»: importación manual. En ambos casos la app llena la autorización
// de acceso o la reservación; al registrarla con el folio, sale de pendientes.
export default function ImportarSolicitud() {
  const [vista, setVista] = useState('pendientes');
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState(null);   // solicitud entrante en revisión
  const datos = useMemo(() => leerSolicitud(texto), [texto]);
  // Enlace a la aprobación en Power Automate (guardado al recibirla, o dentro del texto pegado)
  const enlace = (vista === 'revisar' ? abierta?.enlace_aprobacion : null) || enlaceEnTexto(texto);

  function abrir(sol) { setAbierta(sol); setTexto(sol.texto); setVista('revisar'); window.scrollTo(0, 0); }

  // Desde «Preparación de material» se puede abrir directo una solicitud pendiente
  const { state } = useLocation();
  useEffect(() => {
    if (!state?.abrir) return;
    supabase.from('solicitudes_entrantes').select('*').eq('id', state.abrir).maybeSingle().then(({ data }) => data && abrir(data));
  }, [state?.abrir]);

  return (
    <>
      <h1>Solicitudes FIQ</h1>
      <nav className="pestanas">
        {[['pendientes', 'Pendientes'], ['pegar', 'Pegar texto'], ['historial', 'Atendidas']].map(([k, t]) => (
          <a key={k} href="#" className={vista === k || (k === 'pendientes' && vista === 'revisar') ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); setVista(k); if (k !== 'revisar') { setAbierta(null); if (k === 'pegar') setTexto(''); } }}>{t}</a>
        ))}
      </nav>

      {vista === 'pendientes' && <Bandeja estado="pendiente" alAbrir={abrir} />}
      {vista === 'historial' && <Bandeja estado="atendidas" alAbrir={abrir} />}

      {vista === 'revisar' && abierta && (
        <Revisar sol={abierta} alTerminar={() => { setAbierta(null); setVista('pendientes'); }} />
      )}

      {(vista === 'pegar' || vista === 'revisar') && (
        <>
          {vista === 'pegar' && (
            <section className="tarjeta formulario una-columna">
              <p className="tenue nota">Si una solicitud no llegó sola a «Pendientes», abra el correo o la aprobación, seleccione todo el texto
                (Ctrl + A), cópielo (Ctrl + C) y péguelo aquí.</p>
              <label>Texto de la aprobación
                <textarea rows={texto ? 5 : 10} value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder="[Aprobación] Solicitud de Practica … Solicitud: 3949 … Asignatura: … Fecha: … Horario: …" />
              </label>
              {texto.trim() && !datos && (
                <p className="aviso aviso-error nota">No se reconoce como solicitud de acceso ni de práctica. Copie el correo completo,
                  desde «[Aprobación]» hasta «Atentamente».</p>
              )}
            </section>
          )}
          {datos && <p className="nota una-columna"><Etiqueta tono="bien">{datos.tipo === 'practica' ? 'Solicitud de práctica' : 'Solicitud de acceso'}</Etiqueta>
            {datos.folio && <> · Folio FIQ <strong>{datos.folio}</strong></>}</p>}
          {vista === 'revisar' && !datos && (
            <p className="aviso aviso-error">No se reconocen los datos de esta solicitud. Revise el texto original abajo y, si no es una solicitud, descártela.</p>
          )}
          {datos?.tipo === 'practica' && <Practica d={datos} enlace={enlace} />}
          {datos?.tipo === 'acceso' && <Acceso d={datos} enlace={enlace} />}
          {vista === 'revisar' && abierta && (
            <details className="tarjeta una-columna"><summary>Texto original recibido</summary>
              <pre className="historial-obs texto-original">{abierta.texto}</pre></details>
          )}
        </>
      )}
    </>
  );
}

const TIPOS_SOL = { practica: ['Práctica', 'act-clase'], acceso: ['Acceso', 'act-investigacion'], desconocido: ['Sin reconocer', 'act-otro'] };

function Bandeja({ estado, alAbrir }) {
  const [lista, setLista] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  useEffect(() => {
    setLista(null);
    let q = supabase.from('solicitudes_entrantes').select('*').order('recibida_en', { ascending: false }).limit(200);
    q = estado === 'pendiente' ? q.eq('estado', 'pendiente') : q.neq('estado', 'pendiente');
    q.then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  }, [estado]);
  const leida = (s) => leerSolicitud(s.texto);

  return (
    <section className="tarjeta una-columna">
      <Aviso mensaje={mensaje} />
      {estado === 'pendiente' && <AvisosNavegador />}
      {!lista ? <p className="tenue">Cargando…</p> : lista.length === 0 ? (
        <p className="tenue">{estado === 'pendiente' ? 'No hay solicitudes pendientes. Las nuevas aparecen aquí en cuanto llegan al correo del laboratorio.' : 'Aún no hay solicitudes atendidas.'}</p>
      ) : (
        <div className="tabla-desplazable"><table>
          <thead><tr><th>Recibida</th><th>Tipo</th><th>Folio</th><th>Solicitud</th><th>{estado === 'pendiente' ? '' : 'Estado'}</th></tr></thead>
          <tbody>{lista.map((s) => {
            const d = leida(s);
            const [t, color] = TIPOS_SOL[s.tipo] ?? TIPOS_SOL.desconocido;
            return (
              <tr key={s.id} className="fila-enlace" onClick={() => alAbrir(s)}>
                <td className="sin-salto">{fechaHora(s.recibida_en)}</td>
                <td><span className={'etiqueta ' + color}>{t}</span></td>
                <td>{s.folio ?? '—'}</td>
                <td>{d?.tipo === 'practica' ? <><strong>{d.titulo}</strong><br /><span className="tenue">{d.responsable} · {d.fecha ? fecha(d.fecha) : ''} {d.hora_inicio}–{d.hora_fin}</span></>
                  : d?.tipo === 'acceso' ? <><strong>{d.personas?.map((x) => x.nombre).join(' y ') || d.nombre}</strong><br /><span className="tenue">{d.titulo || d.actividad} · {fecha(d.inicio)} al {fecha(d.fin)}</span></>
                  : <span className="tenue">{s.asunto}</span>}</td>
                <td>{estado === 'pendiente' ? <button className="btn btn-chico">Revisar</button>
                  : s.estado === 'registrada' ? <><Etiqueta tono="bien">Registrada</Etiqueta><br /><span className="tenue chico">Abrir</span></>
                  : <><Etiqueta tono="gris">Descartada</Etiqueta><br /><span className="tenue chico">{s.motivo_descarte}</span></>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </section>
  );
}

// Aviso del navegador cuando llega una solicitud nueva (con la app abierta)
function AvisosNavegador() {
  const soportado = typeof window !== 'undefined' && 'Notification' in window;
  const [permiso, setPermiso] = useState(soportado ? Notification.permission : 'denied');
  if (!soportado || permiso === 'granted') return null;
  return (
    <p className="tenue nota">
      {permiso === 'denied' ? 'Los avisos del navegador están bloqueados para este sitio; actívelos en la configuración del navegador si los quiere.'
        : <>¿Quiere un aviso en la computadora cuando llegue una solicitud nueva (con la app abierta)?{' '}
          <button className="btn-enlace" onClick={() => Notification.requestPermission().then(setPermiso)}>Activar avisos</button></>}
    </p>
  );
}

function Revisar({ sol, alTerminar }) {
  const [descartar, setDescartar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  async function confirmar(e) {
    e.preventDefault();
    const { error: err } = await supabase.from('solicitudes_entrantes').update({ estado: 'descartada', motivo_descarte: motivo }).eq('id', sol.id);
    if (err) setError(mensajeError(err)); else alTerminar();
  }
  return (
    <section className="tarjeta una-columna">
      <div className="encabezado">
        <div>
          <h2>Solicitud recibida el {fechaHora(sol.recibida_en)}</h2>
          <p className="tenue">{sol.asunto}</p>
        </div>
        <div className="fila-botones">
          <BotonAprobar enlace={sol.enlace_aprobacion} texto={sol.enlace_aprobacion ? 'Ver en Power Automate ↗' : undefined} />
          <button className="btn" onClick={alTerminar}>Volver</button>
          {sol.estado === 'pendiente' && <button className="btn" onClick={() => setDescartar(!descartar)}>Descartar</button>}
        </div>
      </div>
      {sol.estado === 'pendiente' ? (
        <p className="tenue nota">Al registrar la reservación o la autorización con su folio, la solicitud sale sola de pendientes.
          Si la rechazó en Power Automate o no corresponde, descártela con el motivo.</p>
      ) : (
        <p className="tenue nota">Esta solicitud ya fue {sol.estado === 'registrada' ? 'registrada' : `descartada (${sol.motivo_descarte})`}.
          {sol.tipo === 'acceso' && sol.estado === 'registrada' && ' Si no la apartó en el calendario, puede hacerlo abajo en «Apartar en el calendario».'}</p>
      )}
      {descartar && (
        <form className="formulario fila-agregar" onSubmit={confirmar}>
          <label className="crece">Motivo<input value={motivo} onChange={(e) => setMotivo(e.target.value)} required
            placeholder="Ej. Rechazada en Power Automate, duplicada, otro laboratorio" /></label>
          <button className="btn btn-primario">Descartar solicitud</button>
          {error && <p className="aviso aviso-error">{error}</p>}
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Práctica → reservación (se abre el formulario de reservación ya lleno)
// ---------------------------------------------------------------------
function Practica({ d, enlace }) {
  const navegar = useNavigate();
  const [equipos, setEquipos] = useState([]);
  const [elegidos, setElegidos] = useState({});
  const [previa, setPrevia] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecha, setHecha] = useState(null);   // reservación recién registrada

  useEffect(() => {
    supabase.from('equipos').select('id, codigo, nombre, estado, tipos_equipo(nombre)').neq('estado', 'baja').order('nombre')
      .then(({ data }) => setEquipos((data ?? []).map((e) => ({ ...e, tipo: e.tipos_equipo?.nombre }))));
  }, []);
  useEffect(() => {
    if (!d.folio) return setPrevia(null);
    supabase.from('reservaciones').select('id, inicio').eq('folio_solicitud', d.folio).eq('estado', 'programada').limit(1)
      .then(({ data }) => setPrevia(data?.[0] ?? null));
  }, [d.folio]);

  const piezas = piezasEquipo(d.equipos_texto).map((p) => ({ pieza: p, opciones: sugerirEquipos(p, equipos) }));
  // Si solo hay una coincidencia, se propone de una vez
  useEffect(() => {
    const ini = {};
    piezas.forEach(({ pieza, opciones }) => { if (opciones.length === 1) ini[pieza] = opciones[0].id; });
    setElegidos(ini);
  }, [equipos.length, d.equipos_texto]);

  // Datos de la reservación tal como vienen de la solicitud
  function datosReservacion() {
    const sinReservar = piezas.filter(({ pieza }) => !elegidos[pieza]).map(({ pieza }) => pieza);
    return {
      actividad: d.asignatura ? 'clase' : 'taller_curso', titulo: d.titulo, asignatura: d.asignatura,
      responsable: d.responsable, responsable_correo: d.responsable_correo, usuarios: d.num_alumnos ? `${d.num_alumnos} estudiantes` : '',
      procedencia: d.procedencia, institucion: d.procedencia === 'externo' ? `Externos (solicitud FIQ ${d.folio ?? ''})`.trim() : '',
      programa_educativo: d.programa_educativo, num_alumnos: d.num_alumnos ?? '',
      num_equipos_trabajo: d.num_equipos_trabajo ?? '', materiales: d.materiales, reactivos: d.reactivos,
      observaciones: [sinReservar.length ? `Equipo solicitado sin reservar: ${sinReservar.join(', ')}` : '', d.observaciones].filter(Boolean).join('\n'),
      folio_solicitud: d.folio, alumnos_pe: d.alumnos_pe,
    };
  }

  // Registro directo, sin pasar por el formulario
  async function registrar() {
    setOcupado(true); setMensaje(null);
    const x = datosReservacion();
    const vacio = (v) => (v === '' ? null : v);
    const p = {
      ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, vacio(v)])),
      ocupa_todo: x.actividad === 'clase' || x.actividad === 'taller_curso',
      inicio: new Date(`${d.fecha}T${d.hora_inicio}`).toISOString(), fin: new Date(`${d.fecha}T${d.hora_fin}`).toISOString(),
      equipos: [...new Set(Object.values(elegidos).filter(Boolean))], residuos: d.residuos,
    };
    const { error } = await supabase.rpc('registrar_reservacion', { p, p_hasta: null, p_frecuencia: 'semanal' });
    if (error) { setOcupado(false); return setMensaje({ tipo: 'error', texto: `${mensajeError(error)} Puede corregirlo con «Revisar en el formulario».` }); }
    const { data } = await supabase.from('reservaciones').select('id').eq('folio_solicitud', d.folio).eq('estado', 'programada').limit(1);
    setOcupado(false);
    setHecha(data?.[0] ?? { id: null });
  }

  function continuar() {
    navegar('/reservaciones/nueva', {
      state: {
        inicial: datosReservacion(),
        enlace_aprobacion: enlace,
        dia: d.fecha, horaIni: d.hora_inicio, horaFin: d.hora_fin,
        equipos: [...new Set(Object.values(elegidos).filter(Boolean))], residuos: d.residuos,
      },
    });
  }

  const faltan = [!d.fecha && 'fecha', !(d.hora_inicio && d.hora_fin) && 'horario', !d.titulo && 'nombre de la práctica'].filter(Boolean);
  return (
    <div className="dos-columnas">
      <section className="tarjeta">
        <h2>Datos leídos</h2>
        <dl className="datos">
          <dt>Práctica</dt><dd>{d.titulo || '—'}</dd>
          <dt>Asignatura</dt><dd>{d.asignatura || '—'}</dd>
          <dt>Responsable</dt><dd>{d.responsable || '—'} <span className="tenue">{d.responsable_correo}</span></dd>
          <dt>Fecha y horario</dt><dd>{d.fecha ? fecha(d.fecha) : '—'} · {d.hora_inicio || '?'}–{d.hora_fin || '?'}</dd>
          <dt>Alumnos</dt><dd>{d.num_alumnos ?? '—'}{d.programa_educativo && ` (${d.programa_educativo})`} · {d.num_equipos_trabajo ?? '—'} equipos</dd>
          <dt>Residuos</dt><dd>{d.residuos.length ? d.residuos.map((g) => RESIDUOS[g]).join('; ') : 'Ninguno'}</dd>
        </dl>
        {faltan.length > 0 && <p className="aviso aviso-alerta nota">No se encontró: {faltan.join(', ')}. Complételo en el formulario.</p>}
        {previa && <p className="aviso aviso-error nota">Esta solicitud ya tiene una reservación: <Link to={`/reservaciones/detalle/${previa.id}`}>ver reservación</Link>.</p>}
      </section>
      <section className="tarjeta formulario">
        <h2>Equipo solicitado</h2>
        <p className="tenue nota">«{d.equipos_texto || 'sin equipo'}». Elija qué equipo del catálogo se reserva; lo que quede sin reservar se anota en observaciones.</p>
        {piezas.map(({ pieza, opciones }) => (
          <label key={pieza}>{pieza}
            <select value={elegidos[pieza] ?? ''} onChange={(e) => setElegidos({ ...elegidos, [pieza]: e.target.value })}>
              <option value="">No reservar equipo</option>
              {(opciones.length ? opciones : equipos).map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}</option>)}
            </select>
            {opciones.length === 0 && <span className="tenue chico">Sin coincidencias en el catálogo: puede elegir de la lista completa.</span>}
          </label>
        ))}
        <Aviso mensaje={mensaje} />
        {hecha ? (
          <div className="siguiente-paso">
            <p><strong>Reservación registrada</strong> el {fecha(d.fecha)} de {d.hora_inicio} a {d.hora_fin}: ya aparece en el calendario y sus materiales en «Preparación de material».</p>
            <p><strong>Último paso:</strong> apruebe la solicitud en Power Automate.</p>
            <div className="fila-botones">
              <BotonAprobar enlace={enlace} principal />
              {hecha.id && <Link className="btn" to={`/reservaciones/detalle/${hecha.id}`}>Ver reservación</Link>}
              <Link className="btn" to={`/reservaciones/calendario?vista=semana&semana=${d.fecha}`}>Ver calendario</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="fila-botones">
              <button className="btn btn-primario" onClick={registrar} disabled={Boolean(previa) || faltan.length > 0 || !d.folio || ocupado}>
                {ocupado ? 'Registrando…' : 'Registrar reservación'}</button>
              <button className="btn" onClick={continuar} disabled={Boolean(previa)}>Revisar en el formulario</button>
            </div>
            <p className="tenue nota">«Registrar reservación» aparta en el calendario la fecha y el horario pedidos con todo lo de la solicitud (materiales, reactivos, equipos).
              Use «Revisar en el formulario» si quiere cambiar algo antes (otro horario, varios días, etc.).
              {(faltan.length > 0 || !d.folio) && ' Esta solicitud no trae todos los datos: complétela en el formulario.'}</p>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Acceso → autorización de acceso (solo el Administrador)
// ---------------------------------------------------------------------
function Acceso({ d, enlace }) {
  const { esAdmin } = useSesion();
  const [f, setF] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    setMensaje(null);
    const personas = d.personas?.length ? d.personas : [{ nombre: d.nombre, matricula: d.matricula, correo: d.correo, telefono: '' }];
    setF({ personas: personas.map((x) => ({ ...x })), proyecto: d.titulo || d.actividad,
      inicio: d.inicio, fin: d.fin, institucion: d.institucion, contacto: d.contacto });
    if (d.folio) supabase.from('autorizaciones_acceso').select('id').eq('folio_solicitud', d.folio).limit(1)
      .then(({ data }) => setPrevia(data?.length ? data[0] : null));
  }, [d]);
  if (!f) return null;
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const persona = (i, k) => (e) => setF({ ...f, personas: f.personas.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) });
  const otroLab = d.laboratorio && !/tecnolog[ií]a de alimentos/i.test(d.laboratorio);
  const hayExternos = f.personas.some((x) => !x.matricula);
  const varias = f.personas.length > 1;

  async function guardar(e) {
    e.preventDefault();
    setOcupado(true); setMensaje(null);
    const { error } = await supabase.rpc('registrar_acceso_grupo', {
      p_folio: d.folio, p_personas: f.personas.map((x) => ({ nombre: x.nombre, matricula: x.matricula, correo: x.correo, telefono: x.telefono })),
      p_proyecto: f.proyecto, p_inicio: f.inicio, p_fin: f.fin, p_institucion: f.institucion, p_contacto: f.contacto,
    });
    setOcupado(false);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    const nombres = f.personas.map((x) => x.nombre).join(' y ');
    setMensaje({ tipo: 'ok', texto: `Autorización registrada para ${nombres}, del ${fecha(f.inicio)} al ${fecha(f.fin)}. Ya ${varias ? 'pueden identificarse' : 'puede identificarse'} en la terminal.` });
    setPrevia({ id: 'nueva' });
  }

  return (
    <div className="dos-columnas dos-columnas-amplia">
      <form className="tarjeta formulario" onSubmit={guardar}>
        <h2>Autorización de acceso{varias ? ` · ${f.personas.length} personas` : ''}</h2>
        <Aviso mensaje={mensaje} />
        {otroLab && <p className="aviso aviso-alerta nota">La solicitud es para el laboratorio de {d.laboratorio}, no para Tecnología de Alimentos.</p>}
        {previa && !mensaje && <p className="aviso aviso-error nota">La solicitud FIQ {d.folio} ya está registrada en Autorizaciones.</p>}
        {f.personas.map((x, i) => (
          <fieldset key={i} className="persona-solicitud">
            <legend>{varias ? `Persona ${i + 1}` : 'Persona'}</legend>
            <label>Nombre<input value={x.nombre} onChange={persona(i, 'nombre')} required /></label>
            <div className="fila-campos">
              <label>Matrícula (estudiantes UADY)<input value={x.matricula} onChange={persona(i, 'matricula')} placeholder="Vacío para externos" /></label>
              <label>Correo<input type="email" value={x.correo} onChange={persona(i, 'correo')} required={Boolean(x.matricula)} /></label>
            </div>
            {!x.matricula && <label>Teléfono<input value={x.telefono ?? ''} onChange={persona(i, 'telefono')} /></label>}
            {varias && (
              <button type="button" className="btn btn-chico" onClick={() => setF({ ...f, personas: f.personas.filter((_, j) => j !== i) })}>Quitar a esta persona</button>
            )}
          </fieldset>
        ))}
        <button type="button" className="btn btn-chico" onClick={() => setF({ ...f, personas: [...f.personas, { nombre: '', matricula: '', correo: f.personas[0]?.matricula ? '' : (f.personas[0]?.correo ?? ''), telefono: '' }] })}>
          + Agregar persona</button>
        {varias && hayExternos && <p className="tenue nota">La solicitud trae un solo correo y teléfono: se usan como contacto de todas. Corríjalos si conoce los de cada persona.</p>}
        {f.personas.some((x) => x.matricula) && <p className="tenue nota">El correo de estudiantes se propone con el formato institucional; corríjalo si es otro.</p>}
        {hayExternos && <label>Institución o dependencia<input value={f.institucion} onChange={campo('institucion')} /></label>}
        <label>Proyecto o actividad<input value={f.proyecto} onChange={campo('proyecto')} required /></label>
        <div className="fila-campos">
          <label>Desde<input type="date" value={f.inicio} onChange={campo('inicio')} required /></label>
          <label>Hasta<input type="date" value={f.fin} min={f.inicio} onChange={campo('fin')} required /></label>
        </div>
        <label>Contacto de emergencia<input value={f.contacto} onChange={campo('contacto')} /></label>
        {esAdmin ? (
          <button className="btn btn-primario" disabled={ocupado || Boolean(previa)}>{ocupado ? 'Registrando…' : 'Registrar autorización'}</button>
        ) : <p className="aviso aviso-alerta nota">Las autorizaciones de acceso las registra el Administrador.</p>}
        {mensaje?.tipo === 'ok' && (
          <div className="siguiente-paso">
            <p><strong>Último paso:</strong> apruebe la solicitud en Power Automate.</p>
            <div className="fila-botones">
              <BotonAprobar enlace={enlace} principal />
              <Link className="btn" to="/acceso/autorizaciones">Ver autorizaciones</Link>
            </div>
          </div>
        )}
      </form>
      <section className="tarjeta">
        <h2>Detalle de la solicitud</h2>
        <dl className="datos">
          <dt>Laboratorio</dt><dd>{d.laboratorio || '—'}</dd>
          {d.asesor && <><dt>Asesor</dt><dd>{d.asesor}</dd></>}
          {d.tipo_actividad && <><dt>Tipo</dt><dd>{d.tipo_actividad}</dd></>}
          <dt>Actividad</dt><dd>{d.actividad || '—'}</dd>
          {d.proyecto_sistproy && <><dt>Proyecto</dt><dd>{d.proyecto_sistproy}</dd></>}
          <dt>Material</dt><dd>{d.materiales || '—'}</dd>
          <dt>Equipo</dt><dd>{d.equipos_texto || '—'}</dd>
          <dt>Reactivos</dt><dd>{d.reactivos || '—'}</dd>
          <dt>Residuos</dt><dd>{d.residuos.length ? d.residuos.map((g) => RESIDUOS[g]).join('; ') : 'Ninguno'}</dd>
        </dl>
      </section>
      <ApartarCalendario d={d} nombres={f.personas.map((x) => x.nombre).filter(Boolean).join(' y ')} enlace={enlace} />
    </div>
  );
}

// Tipo de actividad de la reservación a partir del «Tipo de actividad» de la solicitud
function actividadDe(tipo) {
  const t = String(tipo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/proyecto/.test(t)) return 'proyecto';
  if (/servicio|vincula/.test(t)) return 'vinculacion';
  if (/curso|taller/.test(t)) return 'taller_curso';
  return 'investigacion';
}

// Apartar en el calendario el periodo de una solicitud de acceso (con sus
// materiales, reactivos y equipos), para que aparezca en Preparación de material
function ApartarCalendario({ d, nombres, enlace }) {
  const [equipos, setEquipos] = useState([]);
  const [elegidos, setElegidos] = useState({});
  const [previa, setPrevia] = useState(undefined);
  const [f, setF] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    supabase.from('equipos').select('id, codigo, nombre, estado, tipos_equipo(nombre)').neq('estado', 'baja').order('nombre')
      .then(({ data }) => setEquipos((data ?? []).map((e) => ({ ...e, tipo: e.tipos_equipo?.nombre }))));
    supabase.from('configuracion').select('hora_apertura, hora_cierre').eq('id', 1).single().then(({ data }) =>
      setF({ ini: (data?.hora_apertura ?? '08:00').slice(0, 5), fin: (data?.hora_cierre ?? '20:00').slice(0, 5), dias: 'habil',
        actividad: actividadDe(d.tipo_actividad), titulo: d.titulo || d.actividad || 'Trabajo en el laboratorio' }));
  }, []);
  useEffect(() => {
    if (!d.folio) return setPrevia(null);
    supabase.from('reservaciones').select('id, inicio').eq('folio_solicitud', d.folio).eq('estado', 'programada').order('inicio').limit(1)
      .then(({ data }) => setPrevia(data?.[0] ?? null));
  }, [d.folio]);
  const piezas = piezasEquipo(d.equipos_texto).map((p) => ({ pieza: p, opciones: sugerirEquipos(p, equipos) }));
  useEffect(() => {
    const ini = {};
    piezas.forEach(({ pieza, opciones }) => { if (opciones.length === 1) ini[pieza] = opciones[0].id; });
    setElegidos(ini);
  }, [equipos.length, d.equipos_texto]);

  if (!f || previa === undefined || !d.inicio) return null;
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const varios = d.fin && d.fin > d.inicio;

  async function apartar() {
    setOcupado(true); setMensaje(null);
    const sinReservar = piezas.filter(({ pieza }) => !elegidos[pieza]).map(({ pieza }) => pieza);
    const p = {
      actividad: f.actividad, ocupa_todo: false, titulo: f.titulo, responsable: nombres || d.nombre,
      responsable_correo: d.correo || null, procedencia: d.institucion && !/uady/i.test(d.institucion) ? 'externo' : 'interno',
      institucion: d.institucion || null, materiales: d.materiales || null, reactivos: d.reactivos || null,
      contacto_emergencia: d.contacto || null, folio_solicitud: d.folio, residuos: d.residuos,
      equipos: [...new Set(Object.values(elegidos).filter(Boolean))],
      observaciones: [`Acceso autorizado (solicitud FIQ ${d.folio ?? ''})`, sinReservar.length ? `Equipo solicitado sin reservar: ${sinReservar.join(', ')}` : '',
        d.proyecto_sistproy ? `Proyecto: ${d.proyecto_sistproy}` : ''].filter(Boolean).join('\n'),
      inicio: new Date(`${d.inicio}T${f.ini}`).toISOString(), fin: new Date(`${d.inicio}T${f.fin}`).toISOString(),
    };
    const { data: n, error } = await supabase.rpc('registrar_reservacion', { p, p_hasta: varios ? d.fin : null, p_frecuencia: f.dias });
    setOcupado(false);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setMensaje({ tipo: 'ok', texto: `Quedó apartado en el calendario (${n} día${n === 1 ? '' : 's'}). Sus materiales ya aparecen en «Preparación de material».` });
    setPrevia({ id: null, inicio: p.inicio });
  }

  return (
    <section className="tarjeta formulario">
      <h2>Apartar en el calendario</h2>
      {previa && !mensaje ? (
        <p className="aviso aviso-ok nota">Esta solicitud ya está apartada en el calendario.{' '}
          {previa.id && <Link to={`/reservaciones/detalle/${previa.id}`}>Ver reservación</Link>}</p>
      ) : mensaje?.tipo === 'ok' ? (
        <div className="siguiente-paso">
          <p>{mensaje.texto}</p>
          <div className="fila-botones">
            <Link className="btn" to={`/reservaciones/calendario?vista=semana&semana=${d.inicio}`}>Ver calendario</Link>
            <Link className="btn" to="/reservaciones/preparacion">Preparación de material</Link>
            <BotonAprobar enlace={enlace} />
          </div>
        </div>
      ) : (
        <>
          <p className="tenue nota">La solicitud de acceso no trae horario. Indique en qué horario usarán el laboratorio
            {varios ? ` del ${fecha(d.inicio)} al ${fecha(d.fin)}` : ` el ${fecha(d.inicio)}`}; se apartan esos días con los materiales, reactivos y equipos que piden.</p>
          <Aviso mensaje={mensaje} />
          <label>Título<input value={f.titulo} onChange={campo('titulo')} /></label>
          <div className="fila-campos">
            <label>Actividad
              <select value={f.actividad} onChange={campo('actividad')}>
                <option value="investigacion">Investigación</option><option value="proyecto">Proyecto</option>
                <option value="vinculacion">Vinculación o servicio</option><option value="taller_curso">Taller o curso</option><option value="otro">Otra</option>
              </select>
            </label>
            {varios && (
              <label>Días
                <select value={f.dias} onChange={campo('dias')}>
                  <option value="habil">Lunes a viernes</option><option value="diaria">Todos (incluye fin de semana)</option>
                </select>
              </label>
            )}
          </div>
          <div className="fila-campos">
            <label>De<input type="time" step="900" value={f.ini} onChange={campo('ini')} /></label>
            <label>A<input type="time" step="900" value={f.fin} onChange={campo('fin')} /></label>
          </div>
          {piezas.map(({ pieza, opciones }) => (
            <label key={pieza}>Equipo: {pieza}
              <select value={elegidos[pieza] ?? ''} onChange={(e) => setElegidos({ ...elegidos, [pieza]: e.target.value })}>
                <option value="">No reservar equipo</option>
                {(opciones.length ? opciones : equipos).map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}</option>)}
              </select>
            </label>
          ))}
          <button type="button" className="btn btn-primario" onClick={apartar} disabled={ocupado || !d.folio}>{ocupado ? 'Apartando…' : 'Apartar en el calendario'}</button>
          <p className="tenue chico">No ocupa todo el laboratorio: otras actividades pueden coincidir, salvo con los equipos reservados.</p>
        </>
      )}
    </section>
  );
}

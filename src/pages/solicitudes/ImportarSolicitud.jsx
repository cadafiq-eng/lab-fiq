import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha, fechaHora } from '../../util';
import { RESIDUOS } from '../reservaciones/comun';
import { leerSolicitud, piezasEquipo, sugerirEquipos } from './lector';

// Solicitudes del sistema de Laboratorios FIQ (aprobaciones de Power Automate).
// «Pendientes»: las que el flujo del laboratorio copia automáticamente a la app.
// «Pegar texto»: importación manual. En ambos casos la app llena la autorización
// de acceso o la reservación; al registrarla con el folio, sale de pendientes.
export default function ImportarSolicitud() {
  const [vista, setVista] = useState('pendientes');
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState(null);   // solicitud entrante en revisión
  const datos = useMemo(() => leerSolicitud(texto), [texto]);

  function abrir(sol) { setAbierta(sol); setTexto(sol.texto); setVista('revisar'); window.scrollTo(0, 0); }

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
          {datos?.tipo === 'practica' && <Practica d={datos} />}
          {datos?.tipo === 'acceso' && <Acceso d={datos} />}
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
              <tr key={s.id} className="fila-enlace" onClick={() => estado === 'pendiente' && alAbrir(s)}>
                <td className="sin-salto">{fechaHora(s.recibida_en)}</td>
                <td><span className={'etiqueta ' + color}>{t}</span></td>
                <td>{s.folio ?? '—'}</td>
                <td>{d?.tipo === 'practica' ? <><strong>{d.titulo}</strong><br /><span className="tenue">{d.responsable} · {d.fecha ? fecha(d.fecha) : ''} {d.hora_inicio}–{d.hora_fin}</span></>
                  : d?.tipo === 'acceso' ? <><strong>{d.personas?.map((x) => x.nombre).join(' y ') || d.nombre}</strong><br /><span className="tenue">{d.titulo || d.actividad} · {fecha(d.inicio)} al {fecha(d.fin)}</span></>
                  : <span className="tenue">{s.asunto}</span>}</td>
                <td>{estado === 'pendiente' ? <button className="btn btn-chico">Revisar</button>
                  : s.estado === 'registrada' ? <Etiqueta tono="bien">Registrada</Etiqueta>
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
          <button className="btn" onClick={alTerminar}>Volver a pendientes</button>
          <button className="btn" onClick={() => setDescartar(!descartar)}>Descartar</button>
        </div>
      </div>
      <p className="tenue nota">Al registrar la reservación o la autorización con su folio, la solicitud sale sola de pendientes.
        Si la rechazó en Power Automate o no corresponde, descártela con el motivo.</p>
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
function Practica({ d }) {
  const navegar = useNavigate();
  const [equipos, setEquipos] = useState([]);
  const [elegidos, setElegidos] = useState({});
  const [previa, setPrevia] = useState(null);

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

  function continuar() {
    const sinReservar = piezas.filter(({ pieza }) => !elegidos[pieza]).map(({ pieza }) => pieza);
    navegar('/reservaciones/nueva', {
      state: {
        inicial: {
          actividad: d.asignatura ? 'clase' : 'taller_curso', titulo: d.titulo, asignatura: d.asignatura,
          responsable: d.responsable, responsable_correo: d.responsable_correo, usuarios: d.num_alumnos ? `${d.num_alumnos} estudiantes` : '',
          procedencia: d.procedencia, programa_educativo: d.programa_educativo, num_alumnos: d.num_alumnos ?? '',
          num_equipos_trabajo: d.num_equipos_trabajo ?? '', materiales: d.materiales, reactivos: d.reactivos,
          observaciones: [sinReservar.length ? `Equipo solicitado sin reservar: ${sinReservar.join(', ')}` : '', d.observaciones].filter(Boolean).join('\n'),
          folio_solicitud: d.folio, alumnos_pe: d.alumnos_pe,
        },
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
        <button className="btn btn-primario" onClick={continuar} disabled={Boolean(previa)}>Continuar a la reservación</button>
        <p className="tenue nota">Se abrirá el formulario de reservación con todo lleno: revise cruces y guarde.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Acceso → autorización de acceso (solo el Administrador)
// ---------------------------------------------------------------------
function Acceso({ d }) {
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
        {mensaje?.tipo === 'ok' && <Link to="/acceso/autorizaciones">Ver autorizaciones</Link>}
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
        <p className="tenue nota">Para apartar días u horarios concretos, registre además una reservación de investigación.</p>
      </section>
    </div>
  );
}

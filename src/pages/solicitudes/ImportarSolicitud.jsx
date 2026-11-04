import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha } from '../../util';
import { RESIDUOS } from '../reservaciones/comun';
import { leerSolicitud, piezasEquipo, sugerirEquipos } from './lector';

// Importa una solicitud del sistema de Laboratorios FIQ (aprobación de Power Automate):
// el personal pega el texto y la app llena la autorización de acceso o la reservación.
export default function ImportarSolicitud() {
  const [texto, setTexto] = useState('');
  const datos = useMemo(() => leerSolicitud(texto), [texto]);

  return (
    <>
      <h1>Importar solicitud FIQ</h1>
      <p className="tenue">Las solicitudes de acceso y de práctica llegan como aprobaciones de Power Automate (Laboratorios FIQ).
        Apruébela o recházela ahí como siempre; para registrarla aquí sin volver a capturar, abra el correo o la aprobación,
        seleccione todo el texto (Ctrl + A), cópielo (Ctrl + C) y péguelo abajo.</p>
      <section className="tarjeta formulario una-columna">
        <label>Texto de la aprobación
          <textarea rows={texto ? 5 : 10} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="[Aprobación] Solicitud de Practica … Solicitud: 3949 … Asignatura: … Fecha: … Horario: …" />
        </label>
        {texto.trim() && !datos && (
          <p className="aviso aviso-error nota">No se reconoce como solicitud de acceso ni de práctica. Copie el correo completo,
            desde «[Aprobación]» hasta «Atentamente».</p>
        )}
        {datos && <p className="nota"><Etiqueta tono="bien">{datos.tipo === 'practica' ? 'Solicitud de práctica' : 'Solicitud de acceso'}</Etiqueta>
          {datos.folio && <> · Folio FIQ <strong>{datos.folio}</strong></>}</p>}
      </section>
      {datos?.tipo === 'practica' && <Practica d={datos} />}
      {datos?.tipo === 'acceso' && <Acceso d={datos} />}
    </>
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
    setF({ nombre: d.nombre, matricula: d.matricula, correo: d.correo, proyecto: d.titulo || d.actividad,
      inicio: d.inicio, fin: d.fin, institucion: d.institucion, contacto: d.contacto });
    if (d.folio) supabase.from('autorizaciones_acceso').select('id').eq('folio_solicitud', d.folio).limit(1)
      .then(({ data }) => setPrevia(data?.length ? data[0] : null));
  }, [d]);
  if (!f) return null;
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const otroLab = d.laboratorio && !/tecnolog[ií]a de alimentos/i.test(d.laboratorio);

  async function guardar(e) {
    e.preventDefault();
    setOcupado(true); setMensaje(null);
    const { error } = await supabase.rpc('registrar_acceso_solicitud', {
      p_folio: d.folio, p_nombre: f.nombre, p_matricula: f.matricula, p_correo: f.correo, p_proyecto: f.proyecto,
      p_inicio: f.inicio, p_fin: f.fin, p_institucion: f.institucion, p_contacto: f.contacto,
    });
    setOcupado(false);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setMensaje({ tipo: 'ok', texto: `Autorización registrada para ${f.nombre}, del ${fecha(f.inicio)} al ${fecha(f.fin)}. Ya puede identificarse en la terminal.` });
    setPrevia({ id: 'nueva' });
  }

  return (
    <div className="dos-columnas dos-columnas-amplia">
      <form className="tarjeta formulario" onSubmit={guardar}>
        <h2>Autorización de acceso</h2>
        <Aviso mensaje={mensaje} />
        {otroLab && <p className="aviso aviso-alerta nota">La solicitud es para el laboratorio de {d.laboratorio}, no para Tecnología de Alimentos.</p>}
        {previa && !mensaje && <p className="aviso aviso-error nota">La solicitud FIQ {d.folio} ya está registrada en Autorizaciones.</p>}
        <label>Nombre<input value={f.nombre} onChange={campo('nombre')} required /></label>
        <div className="fila-campos">
          <label>Matrícula (estudiantes)<input value={f.matricula} onChange={campo('matricula')} placeholder="Vacío para académicos o externos" /></label>
          <label>Correo<input type="email" value={f.correo} onChange={campo('correo')} required={!f.matricula} /></label>
        </div>
        {f.matricula && <p className="tenue nota">El correo se propone con el formato institucional de estudiantes; corríjalo si es otro.</p>}
        {!f.matricula && <label>Institución o dependencia<input value={f.institucion} onChange={campo('institucion')} /></label>}
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

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta, Modal } from '../../componentes';
import { fecha, fechaHora, normalizar } from '../../util';
import { PestanasEquipos } from './comun';

// Solicitudes de mantenimiento: se redactan en la app, se envían por correo
// a los responsables (Edge Function «enviar-solicitud-mantenimiento») y se
// les da seguimiento hasta que se registra el mantenimiento.

export const ESTADOS_SOL = {
  por_enviar: { texto: 'Por enviar', tono: 'aviso' },
  enviada: { texto: 'Enviada', tono: 'gris' },
  en_proceso: { texto: 'En proceso', tono: 'aviso' },
  atendida: { texto: 'Atendida', tono: 'bien' },
  cancelada: { texto: 'Cancelada', tono: 'mal' },
};
export const EstadoSolicitud = ({ estado }) => <Etiqueta tono={ESTADOS_SOL[estado]?.tono}>{ESTADOS_SOL[estado]?.texto ?? estado}</Etiqueta>;
const folioTexto = (n) => `M-${String(n).padStart(4, '0')}`;
export const SERVICIOS = {
  electrico: 'Eléctrico', hidraulico: 'Hidráulico (agua y drenaje)', aire: 'Aire acondicionado y ventilación',
  refrigeracion: 'Refrigeración (cuartos fríos)', gas: 'Gas', vapor: 'Vapor y caldera',
  obra_civil: 'Obra civil (puertas, techos, pisos, mobiliario fijo)', otro: 'Otro',
};
const SERVICIO_VACIO = { area: '', servicio: '', descripcion: '', tipo: 'correctivo', urgente: false };
const RENGLON_VACIO = { equipo_id: '', buscar: '', marca: '', modelo: '', descripcion: '', tipo: 'correctivo', docencia: false, vinculacion: false, investigacion: false };

// Texto del correo (el mismo formato que envía la Edge Function), para «Abrir en Outlook»
function textoCorreo(s, renglones, firma) {
  const plural = renglones.length > 1;
  const pc = (r) => (r.tipo === 'preventivo' ? 'P' : 'C');
  const uso = (r) => [r.docencia && 'docencia', r.vinculacion && 'vinculación', r.investigacion && 'investigación'].filter(Boolean).join(', ') || '—';
  const servicios = s.clase === 'servicios';
  return ['Buen día:', '',
    servicios
      ? `Por medio del presente, solicito de la manera más atenta ${plural ? 'los siguientes servicios' : 'el siguiente servicio'} de mantenimiento en las instalaciones del Laboratorio de Tecnología de Alimentos de la Facultad de Ingeniería Química:`
      : `Por medio del presente, solicito de la manera más atenta el mantenimiento ${plural ? 'de los siguientes equipos' : 'del siguiente equipo'} del Laboratorio de Tecnología de Alimentos de la Facultad de Ingeniería Química:`, '',
    ...renglones.map((r, i) => (servicios
      ? `${i + 1}. ${r.area} · ${SERVICIOS[r.servicio] ?? r.servicio}${r.urgente ? ' · URGENTE' : ''}\n   ${pc(r)} — ${r.descripcion}`
      : `${i + 1}. ${r.equipo} · Inv. ${r.num_inventario} · ${r.marca || '—'} ${r.modelo || ''}\n   ${pc(r)} — ${r.descripcion}\n   Uso: ${uso(r)}`)),
    '', ...(s.observaciones ? [`Observaciones: ${s.observaciones}`, ''] : []),
    'Agradezco de antemano su atención y quedo atento para coordinar la visita.', '', 'Atentamente,', firma, '', `Folio ${folioTexto(s.folio)}`,
  ].join('\n');
}
export function enlaceOutlook(s, renglones, firma) {
  const q = (v) => encodeURIComponent(v);
  return `mailto:${s.para.join(',')}?cc=${q(s.cc.join(','))}&subject=${q(s.asunto)}&body=${q(textoCorreo(s, renglones, firma))}`;
}

// Envía (o reintenta) el correo de una solicitud guardada
async function enviarCorreo(id) {
  const { data, error } = await supabase.functions.invoke('enviar-solicitud-mantenimiento', { body: { solicitud_id: id } });
  if (error) {
    let detalle = error.message;
    try { detalle = (await error.context.json()).error || detalle; } catch { /* sin cuerpo JSON */ }
    if (/Failed to send|not found|404/i.test(detalle)) detalle = 'El servicio de envío de correo aún no está instalado (Edge Function «enviar-solicitud-mantenimiento»).';
    throw new Error(detalle);
  }
  return data;
}

// ---------------------------------------------------------------------
// Recuadro «Solicitar mantenimiento»
// ---------------------------------------------------------------------
export function ModalSolicitudMant({ equipo = null, alCerrar }) {
  const navegar = useNavigate();
  const [equipos, setEquipos] = useState([]);
  const [conf, setConf] = useState(null);
  const [renglones, setRenglones] = useState([equipo ? {
    ...RENGLON_VACIO, equipo_id: equipo.id, buscar: `${equipo.codigo} · ${equipo.nombre}`, marca: equipo.marca ?? '', modelo: equipo.modelo ?? '',
  } : { ...RENGLON_VACIO }]);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    supabase.from('equipos').select('id, codigo, nombre, marca, modelo').neq('estado', 'baja').order('nombre')
      .then(({ data }) => setEquipos(data ?? []));
    supabase.from('configuracion').select('mantenimiento_para, mantenimiento_cc').eq('id', 1).single().then(({ data }) => setConf(data));
  }, []);
  const etiqueta = (e) => `${e.codigo} · ${e.nombre}`;
  const porEtiqueta = useMemo(() => Object.fromEntries(equipos.map((e) => [normalizar(etiqueta(e)), e])), [equipos]);

  function cambiar(i, k, v) {
    setRenglones((rs) => rs.map((r, j) => {
      if (j !== i) return r;
      const n = { ...r, [k]: v };
      if (k === 'buscar') {
        const e = porEtiqueta[normalizar(v)];
        if (e) Object.assign(n, { equipo_id: e.id, marca: e.marca ?? '', modelo: e.modelo ?? '' });
        else n.equipo_id = '';
      }
      return n;
    }));
  }

  async function enviar(ev) {
    ev.preventDefault();
    setError('');
    const sinEquipo = renglones.findIndex((r) => !r.equipo_id);
    if (sinEquipo >= 0) return setError(`Renglón ${sinEquipo + 1}: elija el equipo de la lista.`);
    const sinUso = renglones.findIndex((r) => !r.docencia && !r.vinculacion && !r.investigacion);
    if (sinUso >= 0 && !confirm(`El renglón ${sinUso + 1} no marca docencia, vinculación ni investigación. ¿Enviar así?`)) return;
    setOcupado(true);
    const { data: id, error: e1 } = await supabase.rpc('crear_solicitud_mantenimiento', {
      p_renglones: renglones.map(({ buscar, ...r }) => r), p_observaciones: observaciones,
    });
    if (e1) { setOcupado(false); return setError(mensajeError(e1)); }
    let aviso;
    try { await enviarCorreo(id); aviso = 'enviada'; } catch (e2) { aviso = `noenviada:${e2.message}`; }
    setOcupado(false);
    navegar(`/equipos/solicitudes/${id}`, { state: { aviso } });
  }

  return (
    <Modal titulo="Solicitar mantenimiento" alCerrar={alCerrar} ancho>
      <form className="formulario" onSubmit={enviar}>
        <datalist id="equipos-solicitud">{equipos.map((e) => <option key={e.id} value={etiqueta(e)} />)}</datalist>
        {renglones.map((r, i) => (
          <fieldset key={i} className="persona-solicitud">
            <legend>{renglones.length > 1 ? `Equipo ${i + 1}` : 'Equipo'}</legend>
            <label>Equipo y número de inventario
              <input list="equipos-solicitud" value={r.buscar} onChange={(e) => cambiar(i, 'buscar', e.target.value)} placeholder="Escriba el nombre o el número de inventario" required />
            </label>
            <div className="fila-campos">
              <label>Marca<input value={r.marca} onChange={(e) => cambiar(i, 'marca', e.target.value)} /></label>
              <label>Modelo<input value={r.modelo} onChange={(e) => cambiar(i, 'modelo', e.target.value)} /></label>
            </div>
            <label>Descripción (falla o trabajo que requiere)
              <textarea rows={2} value={r.descripcion} onChange={(e) => cambiar(i, 'descripcion', e.target.value)} required />
            </label>
            <div className="fila-campos">
              <label>P/C
                <select value={r.tipo} onChange={(e) => cambiar(i, 'tipo', e.target.value)}>
                  <option value="preventivo">P · Preventivo</option>
                  <option value="correctivo">C · Correctivo</option>
                </select>
              </label>
              <div className="casillas-uso">
                <span className="tenue chico">Se usa en</span>
                <label className="casilla"><input type="checkbox" checked={r.docencia} onChange={(e) => cambiar(i, 'docencia', e.target.checked)} />Docencia</label>
                <label className="casilla"><input type="checkbox" checked={r.vinculacion} onChange={(e) => cambiar(i, 'vinculacion', e.target.checked)} />Vinculación</label>
                <label className="casilla"><input type="checkbox" checked={r.investigacion} onChange={(e) => cambiar(i, 'investigacion', e.target.checked)} />Investigación</label>
              </div>
            </div>
            {renglones.length > 1 && (
              <button type="button" className="btn btn-chico" onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}>Quitar este equipo</button>
            )}
          </fieldset>
        ))}
        <button type="button" className="btn btn-chico" onClick={() => setRenglones([...renglones, { ...RENGLON_VACIO }])}>+ Agregar otro equipo</button>
        <label>Observaciones (opcional)<textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></label>
        {conf && (
          <p className="tenue nota">Se enviará a <strong>{conf.mantenimiento_para.join(', ')}</strong>
            {conf.mantenimiento_cc.length > 0 && <> con copia a {conf.mantenimiento_cc.join(', ')}</>}.</p>
        )}
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar solicitud'}</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Recuadro «Solicitar mantenimiento de servicios» (instalaciones)
// ---------------------------------------------------------------------
export function ModalSolicitudServicios({ alCerrar }) {
  const navegar = useNavigate();
  const [conf, setConf] = useState(null);
  const [renglones, setRenglones] = useState([{ ...SERVICIO_VACIO }]);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    supabase.from('configuracion').select('servicios_para, servicios_cc').eq('id', 1).single().then(({ data }) => setConf(data));
  }, []);
  const cambiar = (i, k, v) => setRenglones((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function enviar(ev) {
    ev.preventDefault();
    setError(''); setOcupado(true);
    const { data: id, error: e1 } = await supabase.rpc('crear_solicitud_servicios', { p_renglones: renglones, p_observaciones: observaciones });
    if (e1) { setOcupado(false); return setError(mensajeError(e1)); }
    let aviso;
    try { await enviarCorreo(id); aviso = 'enviada'; } catch (e2) { aviso = `noenviada:${e2.message}`; }
    setOcupado(false);
    navegar(`/equipos/solicitudes/${id}`, { state: { aviso } });
  }

  return (
    <Modal titulo="Solicitar mantenimiento de servicios" alCerrar={alCerrar} ancho>
      <form className="formulario" onSubmit={enviar}>
        <p className="tenue nota">Instalaciones del laboratorio: electricidad, agua y drenaje, aire acondicionado, cuartos fríos, gas, vapor, puertas, techos, pisos… Para un equipo use «Solicitar mantenimiento» en su ficha.</p>
        <datalist id="areas-lab">{['Área de trabajo', 'Bodega 1', 'Bodega 2', 'Cuarto frío 1', 'Cuarto frío 2', 'Oficina', 'Baños y vestidores', 'Pasillo'].map((a) => <option key={a} value={a} />)}</datalist>
        {renglones.map((r, i) => (
          <fieldset key={i} className="persona-solicitud">
            <legend>{renglones.length > 1 ? `Servicio ${i + 1}` : 'Servicio'}</legend>
            <div className="fila-campos">
              <label>Área o lugar<input list="areas-lab" value={r.area} onChange={(e) => cambiar(i, 'area', e.target.value)} placeholder="Ej. Cuarto frío 1" required /></label>
              <label>Tipo de servicio
                <select value={r.servicio} onChange={(e) => cambiar(i, 'servicio', e.target.value)} required>
                  <option value="">Elija…</option>
                  {Object.entries(SERVICIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <label>Descripción (falla o trabajo que requiere)
              <textarea rows={2} value={r.descripcion} onChange={(e) => cambiar(i, 'descripcion', e.target.value)} required />
            </label>
            <div className="fila-campos">
              <label>P/C
                <select value={r.tipo} onChange={(e) => cambiar(i, 'tipo', e.target.value)}>
                  <option value="preventivo">P · Preventivo</option>
                  <option value="correctivo">C · Correctivo</option>
                </select>
              </label>
              <div className="casillas-uso">
                <label className="casilla"><input type="checkbox" checked={r.urgente} onChange={(e) => cambiar(i, 'urgente', e.target.checked)} />Urgente (riesgo o producto en juego)</label>
              </div>
            </div>
            {renglones.length > 1 && (
              <button type="button" className="btn btn-chico" onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}>Quitar este servicio</button>
            )}
          </fieldset>
        ))}
        <button type="button" className="btn btn-chico" onClick={() => setRenglones([...renglones, { ...SERVICIO_VACIO }])}>+ Agregar otro servicio</button>
        <label>Observaciones (opcional)<textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></label>
        {conf && (
          <p className="tenue nota">Se enviará a <strong>{conf.servicios_para.join(', ')}</strong>
            {conf.servicios_cc.length > 0 && <> con copia a {conf.servicios_cc.join(', ')}</>}.</p>
        )}
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar solicitud'}</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------
export function ListaSolicitudesMant() {
  const [lista, setLista] = useState(null);
  const [verCerradas, setVerCerradas] = useState(false);
  const [nueva, setNueva] = useState(null);   // 'equipos' | 'servicios'
  const [mensaje, setMensaje] = useState(null);
  const navegar = useNavigate();

  useEffect(() => {
    let q = supabase.from('solicitudes_mantenimiento')
      .select('id, folio, clase, estado, creada_en, enviada_en, envio_error, solicitud_mant_equipos(equipo, num_inventario, tipo, mantenimiento_id), solicitud_mant_servicios(area, servicio, tipo, urgente, atendido)')
      .order('creada_en', { ascending: false }).limit(500);
    if (!verCerradas) q = q.in('estado', ['por_enviar', 'enviada', 'en_proceso']);
    q.then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  }, [verCerradas]);

  return (
    <>
      <div className="encabezado">
        <h1>Equipos</h1>
        <div className="fila-botones">
          <button className="btn btn-primario" onClick={() => setNueva('equipos')}>Solicitar mantenimiento de equipo</button>
          <button className="btn" onClick={() => setNueva('servicios')}>Solicitar mantenimiento de servicios</button>
        </div>
      </div>
      <PestanasEquipos />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="filtros">
          <h2 className="crece">Solicitudes de mantenimiento</h2>
          <label className="casilla"><input type="checkbox" checked={verCerradas} onChange={(e) => setVerCerradas(e.target.checked)} />Incluir atendidas y canceladas</label>
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : lista.length === 0 ? (
          <p className="tenue">{verCerradas ? 'No hay solicitudes.' : 'No hay solicitudes abiertas.'}</p>
        ) : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Folio</th><th>Fecha</th><th>Clase</th><th>Equipos o servicios</th><th>Estado</th></tr></thead>
            <tbody>{lista.map((s) => {
              const serv = s.clase === 'servicios';
              const rs = (serv ? s.solicitud_mant_servicios : s.solicitud_mant_equipos) ?? [];
              const listos = rs.filter((r) => (serv ? r.atendido : r.mantenimiento_id)).length;
              return (
                <tr key={s.id} className="fila-enlace" onClick={() => navegar(`/equipos/solicitudes/${s.id}`)}>
                  <td className="sin-salto"><strong>{folioTexto(s.folio)}</strong></td>
                  <td className="sin-salto">{fecha(s.creada_en.slice(0, 10))}</td>
                  <td>{serv ? <Etiqueta tono="aviso">Servicios</Etiqueta> : <Etiqueta tono="gris">Equipos</Etiqueta>}</td>
                  <td>{rs.map((r) => (serv
                    ? `${r.area}: ${SERVICIOS[r.servicio] ?? r.servicio}${r.urgente ? ' (urgente)' : ''}`
                    : `${r.equipo} (${r.num_inventario}, ${r.tipo === 'preventivo' ? 'P' : 'C'})`)).join('; ')}
                    {rs.length > 1 && listos > 0 && <><br /><span className="tenue chico">{listos} de {rs.length} atendidos</span></>}</td>
                  <td><EstadoSolicitud estado={s.estado} />{s.estado === 'por_enviar' && s.envio_error && <><br /><span className="chico">Falló el envío</span></>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
      {nueva === 'equipos' && <ModalSolicitudMant alCerrar={() => setNueva(null)} />}
      {nueva === 'servicios' && <ModalSolicitudServicios alCerrar={() => setNueva(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------
// Detalle y seguimiento
// ---------------------------------------------------------------------
export function DetalleSolicitudMant() {
  const { id } = useParams();
  const { state } = useLocation();
  const [s, setS] = useState(null);
  const [personal, setPersonal] = useState({});
  const [firma, setFirma] = useState('');
  const [mensaje, setMensaje] = useState(() => {
    const a = state?.aviso;
    if (a === 'enviada') return { tipo: 'ok', texto: 'Solicitud guardada y correo enviado.' };
    if (a?.startsWith('noenviada:')) return { tipo: 'error', texto: 'La solicitud quedó guardada, pero el correo no se envió (vea el motivo abajo).' };
    return null;
  });
  const [nota, setNota] = useState('');
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    const { data, error } = await supabase.from('solicitudes_mantenimiento')
      .select('*, solicitud_mant_equipos(*, mantenimientos(fecha, tipo)), solicitud_mant_servicios(*), solicitud_mant_seguimiento(*)').eq('id', id).single();
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setS(data);
  }
  useEffect(() => {
    cargar();
    supabase.from('perfiles').select('id, nombre').then(({ data }) => setPersonal(Object.fromEntries((data ?? []).map((p) => [p.id, p.nombre]))));
    supabase.auth.getUser().then(({ data }) => data.user && supabase.from('perfiles').select('nombre').eq('id', data.user.id).single()
      .then(({ data: p }) => setFirma(`${p?.nombre ?? ''}\nLaboratorio de Tecnología de Alimentos\nFacultad de Ingeniería Química, UADY`.trim())));
  }, [id]);

  async function reenviar() {
    setOcupado(true); setMensaje(null);
    try { await enviarCorreo(id); setMensaje({ tipo: 'ok', texto: 'Correo enviado.' }); } catch (e) { setMensaje({ tipo: 'error', texto: `No se pudo enviar: ${e.message}` }); }
    setOcupado(false); cargar();
  }

  async function atender(r) {
    const que = prompt(`¿Qué se hizo en «${r.area}: ${r.descripcion}»?`);
    if (!que?.trim()) return;
    setOcupado(true); setMensaje(null);
    const { error } = await supabase.rpc('atender_servicio', { p_renglon: r.id, p_nota: que });
    setOcupado(false);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    cargar();
  }

  async function guardarSeguimiento(e) {
    e.preventDefault();
    setOcupado(true); setMensaje(null);
    const { error } = await supabase.rpc('seguimiento_solicitud_mantenimiento', { p_solicitud: id, p_nota: nota, p_estado: nuevoEstado || null });
    setOcupado(false);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setNota(''); setNuevoEstado(''); cargar();
  }

  if (!s) return <><p><Link to="/equipos/solicitudes" className="volver">← Solicitudes de mantenimiento</Link></p><Aviso mensaje={mensaje} /><p className="tenue">Cargando…</p></>;
  const serv = s.clase === 'servicios';
  const rs = [...(serv ? s.solicitud_mant_servicios : s.solicitud_mant_equipos)].sort((a, b) => a.orden - b.orden);
  const seg = [...s.solicitud_mant_seguimiento].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const abierta = !['atendida', 'cancelada'].includes(s.estado);
  const opciones = Object.entries(ESTADOS_SOL).filter(([k]) => k !== s.estado && k !== 'por_enviar' && (k !== 'enviada' || s.estado === 'por_enviar'));

  return (
    <>
      <p><Link to="/equipos/solicitudes" className="volver">← Solicitudes de mantenimiento</Link></p>
      <div className="encabezado">
        <div>
          <h1>Solicitud {folioTexto(s.folio)} · {serv ? 'servicios' : 'equipos'}</h1>
          <p className="tenue">{fechaHora(s.creada_en)} · {personal[s.creada_por] ?? ''} · <EstadoSolicitud estado={s.estado} /></p>
        </div>
      </div>
      <Aviso mensaje={mensaje} />

      {s.estado === 'por_enviar' && (
        <section className="siguiente-paso">
          <p><strong>El correo no se ha enviado.</strong>{s.envio_error ? ` Último intento: ${s.envio_error}` : ''}</p>
          <div className="fila-botones">
            <button className="btn btn-primario" onClick={reenviar} disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar correo'}</button>
            <a className="btn" href={enlaceOutlook(s, rs, firma)}>Abrir en Outlook</a>
          </div>
          <p className="tenue chico">Si lo envía desde Outlook, después regístrelo abajo como «Enviada».</p>
        </section>
      )}

      <section className="tarjeta una-columna">
        <h2>{serv ? 'Servicios' : 'Equipos'}</h2>
        {serv ? (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Área</th><th>Servicio</th><th>Descripción</th><th>P/C</th><th>Prioridad</th><th>Atención</th></tr></thead>
            <tbody>{rs.map((r) => (
              <tr key={r.id}>
                <td>{r.area}</td><td>{SERVICIOS[r.servicio] ?? r.servicio}</td><td>{r.descripcion}</td>
                <td>{r.tipo === 'preventivo' ? 'P' : 'C'}</td>
                <td>{r.urgente ? <Etiqueta tono="mal">Urgente</Etiqueta> : 'Normal'}</td>
                <td>{r.atendido ? <Etiqueta tono="bien">Atendido</Etiqueta>
                  : abierta ? <button className="btn btn-chico" onClick={() => atender(r)}>Marcar atendido</button> : <span className="tenue chico">Pendiente</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : (
        <div className="tabla-desplazable"><table>
          <thead><tr><th>Equipo</th><th>Núm. de inv.</th><th>Marca</th><th>Modelo</th><th>Descripción</th><th>P/C</th>
            <th>Doc.</th><th>Vinc.</th><th>Inv.</th><th>Atención</th></tr></thead>
          <tbody>{rs.map((r) => (
            <tr key={r.id}>
              <td><Link to={`/equipos/ficha/${r.equipo_id}`}>{r.equipo}</Link></td>
              <td className="sin-salto">{r.num_inventario}</td><td>{r.marca || '—'}</td><td>{r.modelo || '—'}</td>
              <td>{r.descripcion}</td><td>{r.tipo === 'preventivo' ? 'P' : 'C'}</td>
              <td className="centro">{r.docencia ? '✓' : ''}</td><td className="centro">{r.vinculacion ? '✓' : ''}</td><td className="centro">{r.investigacion ? '✓' : ''}</td>
              <td>{r.mantenimientos ? <Etiqueta tono="bien">{fecha(r.mantenimientos.fecha)}</Etiqueta> : <span className="tenue chico">Pendiente</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        )}
        {s.observaciones && <p><strong>Observaciones:</strong> {s.observaciones}</p>}
        <p className="tenue chico">Para: {s.para.join(', ')}{s.cc.length > 0 && <> · CC: {s.cc.join(', ')}</>}<br />Asunto: {s.asunto}</p>
        {abierta && serv && <p className="tenue nota">Cuando se resuelva cada servicio, pulse «Marcar atendido» y anote qué se hizo; con todos atendidos, la solicitud se cierra sola.</p>}
        {abierta && !serv && <p className="tenue nota">Al registrar el mantenimiento de un equipo (en su ficha o en «Mantenimientos»), se marca aquí como atendido; cuando todos lo estén, la solicitud se cierra sola.</p>}
      </section>

      <section className="tarjeta una-columna">
        <h2>Seguimiento</h2>
        <ul className="seguimiento">
          {seg.map((x) => (
            <li key={x.id}>
              <span className="tenue chico">{fechaHora(x.fecha)}{personal[x.registrado_por] ? ` · ${personal[x.registrado_por]}` : ''}</span>
              <span>{x.estado && <><EstadoSolicitud estado={x.estado} />{' '}</>}{x.nota}</span>
            </li>
          ))}
        </ul>
        {abierta && (
          <form className="formulario" onSubmit={guardarSeguimiento}>
            <label>Nota<input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Mariana confirmó visita el lunes" required /></label>
            <label>Cambiar estado (opcional)
              <select value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)}>
                <option value="">Sin cambio</option>
                {opciones.map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
              </select>
            </label>
            <div className="fila-botones"><button className="btn btn-primario btn-chico" disabled={ocupado}>Agregar al seguimiento</button></div>
          </form>
        )}
      </section>
    </>
  );
}

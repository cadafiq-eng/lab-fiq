import { useEffect, useState } from 'react';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta } from '../../componentes';
import { aCampoFechaHora, deCampoFechaHora } from '../../util';
import { hhmm } from './comun';

// Asistencia de una reservación: el personal en turno registra al empezar
// quién dirige la práctica y cuántas personas entraron, y al terminar la salida.

// Propuesta de asistentes a partir de lo que dice la reservación
export function asistentesPropuestos(r) {
  const pe = r.alumnos_pe ?? null;
  if (pe && Object.keys(pe).length) {
    const externos = Number(pe.Externos ?? 0);
    const fiq = Object.entries(pe).filter(([k]) => k !== 'Externos').reduce((s, [, n]) => s + Number(n || 0), 0);
    return { alumnos_fiq: fiq, externos };
  }
  const n = Number(r.num_alumnos ?? 0);
  return r.procedencia === 'externo' ? { alumnos_fiq: 0, externos: n } : { alumnos_fiq: n, externos: 0 };
}

const total = (a) => Number(a.alumnos_fiq || 0) + Number(a.externos || 0);

// Hora propuesta: ahora, salvo que ya pasó la reservación (entonces su inicio o fin)
function horaPropuesta(r, cual) {
  const ahora = new Date();
  const ini = new Date(r.inicio); const fin = new Date(r.fin);
  if (ahora > fin) return cual === 'entrada' ? ini : fin;
  return ahora;
}

export default function Asistencia({ r, alCambiar, compacta = false, abrirCon = null }) {
  const a = r.asistencias_reservacion ?? null;
  const [modo, setModo] = useState(null);   // 'inicio' | 'termino'
  const [f, setF] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const futura = new Date(r.inicio).toDateString() !== new Date().toDateString() && new Date(r.inicio) > new Date();

  // Desde el aviso «¿Desea registrar su entrada?» se abre directo el formulario
  useEffect(() => {
    if (abrirCon === 'inicio' && !a) abrir('inicio');
    if (abrirCon === 'termino' && a && !a.salida) abrir('termino');
  }, [abrirCon, r.id]);

  if (r.estado === 'cancelada') return null;

  function abrir(m) {
    setMensaje(null);
    if (m === 'inicio') {
      const p = a ?? { responsable: r.responsable, ...asistentesPropuestos(r), descripcion: '' };
      setF({ entrada: aCampoFechaHora(a?.entrada ?? horaPropuesta(r, 'entrada')), responsable: p.responsable,
        alumnos_fiq: p.alumnos_fiq, externos: p.externos, descripcion: p.descripcion ?? '' });
    } else {
      setF({ salida: aCampoFechaHora(a?.salida ?? horaPropuesta(r, 'salida')), observaciones: a?.observaciones ?? '' });
    }
    setModo(m);
  }

  async function guardar(e) {
    e.preventDefault();
    setOcupado(true); setMensaje(null);
    const { error } = modo === 'inicio'
      ? await supabase.rpc('registrar_inicio_practica', {
        p_reservacion: r.id, p_responsable: f.responsable, p_alumnos_fiq: Number(f.alumnos_fiq || 0),
        p_externos: Number(f.externos || 0), p_descripcion: f.descripcion, p_entrada: deCampoFechaHora(f.entrada) })
      : await supabase.rpc('registrar_termino_practica', {
        p_reservacion: r.id, p_salida: deCampoFechaHora(f.salida), p_observaciones: f.observaciones });
    setOcupado(false);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setModo(null);
    const { data } = await supabase.from('asistencias_reservacion').select('*').eq('reservacion_id', r.id).maybeSingle();
    alCambiar?.(data);
  }

  const campo = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (modo) {
    return (
      <form className={'asistencia asistencia-form' + (compacta ? ' compacta' : '')} onSubmit={guardar}>
        <Aviso mensaje={mensaje} />
        {modo === 'inicio' ? (
          <>
            <div className="fila-campos">
              <label>Hora de entrada<input type="datetime-local" value={f.entrada} onChange={campo('entrada')} required /></label>
              <label>Dirige la práctica<input value={f.responsable} onChange={campo('responsable')} required /></label>
            </div>
            <div className="fila-campos">
              <label>Alumnos FIQ<input type="number" min="0" value={f.alumnos_fiq} onChange={campo('alumnos_fiq')} /></label>
              <label>Externos<input type="number" min="0" value={f.externos} onChange={campo('externos')} /></label>
            </div>
            <label>¿Quiénes son? (opcional)<input value={f.descripcion} onChange={campo('descripcion')} placeholder="Ej. adultos mayores, alumnos del Tecnológico" /></label>
            <p className="tenue chico">Asistentes: {total(f)} más quien dirige la práctica.</p>
          </>
        ) : (
          <>
            <label>Hora de salida<input type="datetime-local" value={f.salida} onChange={campo('salida')} required /></label>
            <label>Observaciones (opcional)<input value={f.observaciones} onChange={campo('observaciones')} placeholder="Ej. sin incidentes" /></label>
          </>
        )}
        <div className="fila-botones">
          <button className="btn btn-primario btn-chico" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn btn-chico" onClick={() => setModo(null)}>Cancelar</button>
        </div>
      </form>
    );
  }

  if (!a) {
    if (futura) return compacta ? null : <p className="tenue">La asistencia se registra el día de la práctica.</p>;
    const vencida = new Date(r.fin) < new Date();
    return (
      <div className={'asistencia' + (compacta ? ' compacta' : '')}>
        {vencida && <p className="aviso aviso-alerta nota">No se registró la asistencia de esta práctica.</p>}
        <button type="button" className="btn btn-primario btn-chico" onClick={() => abrir('inicio')}>Registrar inicio de la práctica</button>
      </div>
    );
  }

  return (
    <div className={'asistencia' + (compacta ? ' compacta' : '')}>
      <p>
        {a.salida ? <Etiqueta tono="bien">Realizada</Etiqueta> : <Etiqueta tono="aviso">En curso</Etiqueta>}{' '}
        <strong>{hhmm(a.entrada)}–{a.salida ? hhmm(a.salida) : '…'}</strong> · {a.responsable}
        {' '}y {total(a)} asistente(s){a.alumnos_fiq > 0 && a.externos > 0 ? ` (${a.alumnos_fiq} FIQ, ${a.externos} externos)` : a.externos > 0 ? ' externos' : ' FIQ'}
        {a.descripcion ? ` · ${a.descripcion}` : ''}
      </p>
      {a.observaciones && <p className="tenue chico">{a.observaciones}</p>}
      <div className="fila-botones">
        {!a.salida && <button type="button" className="btn btn-primario btn-chico" onClick={() => abrir('termino')}>Registrar término</button>}
        <button type="button" className="btn btn-chico" onClick={() => abrir('inicio')}>Corregir inicio</button>
        {a.salida && <button type="button" className="btn btn-chico" onClick={() => abrir('termino')}>Corregir salida</button>}
      </div>
    </div>
  );
}

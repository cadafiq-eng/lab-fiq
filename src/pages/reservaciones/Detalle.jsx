import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta, Modal } from '../../componentes';
import { diaLocal, fechaHora } from '../../util';
import { useConfiguracion } from '../prestamos/comun';
import { ACTIVIDADES, EstadoReservacion, RESIDUOS, SELECT_RESERVACION, diaTexto, fueraDeHorario, horario } from './comun';

export default function Detalle() {
  const { id } = useParams();
  const { esAdmin } = useSesion();
  const config = useConfiguracion();
  const [r, setR] = useState(null);
  const [equipos, setEquipos] = useState([]);
  const [serie, setSerie] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const [cancelar, setCancelar] = useState(false);

  async function cargar() {
    const { data, error } = await supabase.from('reservaciones').select(SELECT_RESERVACION).eq('id', id).single();
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setR(data);
    if (data.equipos?.length) {
      supabase.from('equipos').select('id, codigo, nombre').in('id', data.equipos).then(({ data: e }) => setEquipos(e ?? []));
    }
    if (data.serie_id) {
      supabase.from('reservaciones').select('id, inicio, fin, estado').eq('serie_id', data.serie_id).order('inicio')
        .then(({ data: s }) => setSerie(s ?? []));
    }
  }
  useEffect(() => { cargar(); }, [id]);

  if (!r) return <><h1>Reservación</h1><Aviso mensaje={mensaje} />{!mensaje && <p className="tenue">Cargando…</p>}</>;
  const fuera = fueraDeHorario(r.inicio, r.fin, config);
  const puedeModificar = r.estado === 'programada' && (!fuera || esAdmin);
  const a = ACTIVIDADES[r.actividad];
  const dato = (etq, v) => (v || v === 0 ? <><dt>{etq}</dt><dd>{v}</dd></> : null);

  return (
    <>
      <Link className="volver" to={`/reservaciones/calendario?semana=${diaLocal(r.inicio)}`}>← Volver al calendario</Link>
      <div className="encabezado">
        <div>
          <h1>{r.titulo}</h1>
          <p className="tenue">{diaTexto(new Date(r.inicio))} {new Date(r.inicio).getFullYear()} · {horario(r)}</p>
        </div>
        {puedeModificar && (
          <div className="fila-botones">
            <Link className="btn" to={`/reservaciones/editar/${r.id}`}>Editar</Link>
            <button className="btn" onClick={() => setCancelar(true)}>Cancelar reservación</button>
          </div>
        )}
      </div>
      <Aviso mensaje={mensaje} />
      {r.estado === 'programada' && fuera && !esAdmin && (
        <p className="aviso aviso-alerta">Es una reservación fuera de horario o en fin de semana: solo el Administrador la modifica.</p>
      )}
      <div className="dos-columnas">
        <section className="tarjeta">
          <h2>Actividad</h2>
          <dl className="datos">
            <dt>Estado</dt><dd><EstadoReservacion r={r} />{r.estado === 'cancelada' && <span className="tenue"> · {r.motivo_cancelacion}</span>}</dd>
            <dt>Tipo</dt><dd>{a?.texto}</dd>
            <dt>Laboratorio</dt><dd>{r.ocupa_todo ? 'Ocupa todo el laboratorio' : 'Uso compartido'}</dd>
            {dato('Asignatura', r.asignatura)}
            {dato('Programa educativo', r.programa_educativo)}
            {dato('Semestre', r.semestre)}
            {dato('Alumnos', r.num_alumnos)}
            {dato('Equipos de alumnos', r.num_equipos_trabajo)}
            {fuera && <>{dato('Contacto de emergencia', r.contacto_emergencia)}<dt>Fuera de horario</dt><dd>Registrada por el Administrador</dd></>}
          </dl>
        </section>
        <section className="tarjeta">
          <h2>Responsable y usuarios</h2>
          <dl className="datos">
            <dt>Responsable</dt><dd>{r.responsable}</dd>
            {dato('Correo', r.responsable_correo)}
            {dato('Teléfono', r.responsable_telefono)}
            {dato('Usuarios', r.usuarios)}
            <dt>Procedencia</dt><dd>{r.procedencia === 'externo' ? <><Etiqueta tono="aviso">Externo</Etiqueta> {r.institucion}</> : 'Interno'}</dd>
            <dt>Registrada</dt><dd>{fechaHora(r.creado_en)}</dd>
          </dl>
        </section>
        <section className="tarjeta">
          <h2>Equipos y materiales</h2>
          {equipos.length === 0 ? <p className="tenue">Sin equipos reservados.</p> : (
            <ul className="lista-simple">{equipos.map((e) => <li key={e.id}><Link to={`/equipos/ficha/${e.id}`}>{e.codigo}</Link> · {e.nombre}</li>)}</ul>
          )}
          {r.materiales && <><h3>Materiales e insumos</h3><p className="historial-obs">{r.materiales}</p></>}
          <h3>Residuos peligrosos</h3>
          {r.residuos?.length ? <ul className="lista-simple">{r.residuos.map((g) => <li key={g}>{RESIDUOS[g]}</li>)}</ul> : <p className="tenue">No se indicaron.</p>}
          {r.observaciones && <><h3>Observaciones</h3><p className="historial-obs">{r.observaciones}</p></>}
        </section>
        {serie.length > 1 && (
          <section className="tarjeta">
            <h2>Sesiones de la serie semanal</h2>
            <ul className="lista-simple lista-dia">
              {serie.map((s) => (
                <li key={s.id}>
                  {s.id === r.id ? <strong>{diaTexto(new Date(s.inicio))}</strong> : <Link to={`/reservaciones/detalle/${s.id}`}>{diaTexto(new Date(s.inicio))}</Link>}
                  {' '}<EstadoReservacion r={s} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {cancelar && (
        <Cancelar r={r} conSerie={serie.filter((s) => s.estado === 'programada' && s.inicio > r.inicio).length}
          alCerrar={() => setCancelar(false)}
          alGuardar={(n) => { setCancelar(false); setMensaje({ tipo: 'ok', texto: n > 1 ? `Se cancelaron ${n} sesiones.` : 'Reservación cancelada.' }); cargar(); }} />
      )}
    </>
  );
}

function Cancelar({ r, conSerie, alCerrar, alGuardar }) {
  const [motivo, setMotivo] = useState('');
  const [todas, setTodas] = useState(false);
  const [error, setError] = useState('');
  async function guardar(e) {
    e.preventDefault();
    const { data, error } = await supabase.rpc('cancelar_reservacion', { p_id: r.id, p_motivo: motivo, p_serie: todas });
    if (error) setError(mensajeError(error)); else alGuardar(data);
  }
  return (
    <Modal titulo="Cancelar reservación" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="tenue nota">La reservación no se borra: queda como cancelada, con el motivo, y el horario se libera.</p>
        <label>Motivo<textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} required /></label>
        {conSerie > 0 && (
          <label className="casilla"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
            Cancelar también las {conSerie} sesiones siguientes de esta serie</label>
        )}
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario">Cancelar reservación</button>
          <button type="button" className="btn" onClick={alCerrar}>Volver</button>
        </div>
      </form>
    </Modal>
  );
}

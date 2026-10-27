import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta, Modal } from '../../componentes';
import { fecha, fechaHora, hoyISO } from '../../util';
import { SELECT_PRESTAMO, SituacionPrestamo, describirRenglon, pendienteRenglon, useConfiguracion } from './comun';

export default function DetallePrestamo() {
  const { id } = useParams();
  const { esAdmin, perfil } = useSesion();
  const config = useConfiguracion();
  const [p, setP] = useState(null);
  const [modal, setModal] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const cargar = () => supabase.from('prestamos').select(SELECT_PRESTAMO).eq('id', id).single()
    .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setP(data));
  useEffect(() => { cargar(); }, [id]);

  const cerrar = (texto) => { setModal(null); if (texto) setMensaje({ tipo: 'ok', texto }); cargar(); };

  if (!p) return <><Aviso mensaje={mensaje} /><p className="tenue">Cargando…</p></>;
  const s = p.solicitantes ?? {};
  const renglones = [...p.prestamo_renglones].sort((a, b) => (a.equipo_id ? 0 : 1) - (b.equipo_id ? 0 : 1));

  return (
    <>
      <p><Link to="/prestamos/abiertos" className="volver">← Préstamos abiertos</Link></p>
      <div className="encabezado">
        <div>
          <h1>Préstamo a {s.nombre}</h1>
          <p className="tenue">{s.externo ? `Persona externa · ${s.adscripcion || ''}` : `Matrícula ${s.matricula}`}
            {s.correo && ` · ${s.correo}`}{s.telefono && ` · ${s.telefono}`}</p>
        </div>
        {p.estado === 'abierto' && <button className="btn" onClick={() => setModal('plazo')}>Ampliar plazo</button>}
      </div>
      <Aviso mensaje={mensaje} />

      <section className="tarjeta una-columna">
        <dl className="datos datos-linea">
          <dt>Situación</dt><dd><SituacionPrestamo p={p} /></dd>
          <dt>Tipo</dt><dd>{p.tipo === 'externo' ? `Externo · oficio ${p.vobo_referencia}` : 'Interno'}</dd>
          <dt>Entregado</dt><dd>{fechaHora(p.fecha_entrega)}</dd>
          <dt>Fecha límite</dt><dd>{fecha(p.fecha_limite)}</dd>
          <dt>Motivo</dt><dd>{p.motivo}</dd>
          {p.autorizado_por && <><dt>Autorización</dt><dd>Autorizado por el Administrador</dd></>}
        </dl>
      </section>

      <section className="tarjeta una-columna">
        <h2>Lo prestado</h2>
        <div className="tabla-desplazable"><table>
          <thead><tr><th>Concepto</th><th>Devuelto</th><th>Perdido o roto</th><th>Estado</th><th></th></tr></thead>
          <tbody>{renglones.map((r) => {
            const pend = pendienteRenglon(r);
            return (
              <tr key={r.id}>
                <td>{r.equipos ? <><Etiqueta tono="aviso">Equipo</Etiqueta> </> : null}{describirRenglon(r)}
                  {r.condicion && <><br /><span className="tenue chico">{r.condicion}</span></>}</td>
                <td>{r.equipos ? (r.devuelto_en ? 'Sí' : '—') : `${Number(r.cantidad_devuelta)} de ${Number(r.cantidad)}`}</td>
                <td>{r.equipos ? '—' : Number(r.cantidad_perdida) || '—'}</td>
                <td>{r.devuelto_en
                  ? <>{r.danado ? <Etiqueta tono="mal">{r.equipos ? 'Devuelto dañado' : 'Cerrado con pérdida'}</Etiqueta> : <Etiqueta tono="bien">Devuelto</Etiqueta>}
                    <br /><span className="tenue chico">{fechaHora(r.devuelto_en)}</span></>
                  : <Etiqueta tono="aviso">Pendiente{r.equipos ? '' : `: ${pend}`}</Etiqueta>}</td>
                <td className="der">{pend > 0 && <button className="btn btn-chico btn-primario" onClick={() => setModal({ renglon: r })}>Registrar devolución</button>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </section>

      {modal?.renglon && <Devolucion renglon={modal.renglon} alCerrar={() => setModal(null)} alGuardar={cerrar} />}
      {modal === 'plazo' && <AmpliarPlazo prestamo={p} esAdmin={esAdmin} miId={perfil.id}
        diasMax={config.dias_prestamo_max ?? 7} alCerrar={() => setModal(null)} alGuardar={cerrar} />}
    </>
  );
}

function Devolucion({ renglon, alCerrar, alGuardar }) {
  const pend = pendienteRenglon(renglon);
  const [devuelta, setDevuelta] = useState(String(pend));
  const [perdida, setPerdida] = useState('0');
  const [danado, setDanado] = useState(false);
  const [condicion, setCondicion] = useState('');
  const [error, setError] = useState('');
  const esEquipo = Boolean(renglon.equipo_id);

  async function guardar(e) {
    e.preventDefault();
    const { data, error } = await supabase.rpc('devolver_renglon', esEquipo
      ? { p_renglon: renglon.id, p_danado: danado, p_condicion: condicion }
      : { p_renglon: renglon.id, p_devuelta: Number(devuelta || 0), p_perdida: Number(perdida || 0), p_condicion: condicion });
    if (error) setError(mensajeError(error)); else alGuardar(data);
  }

  return (
    <Modal titulo="Registrar devolución" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="tenue">{describirRenglon(renglon)}</p>
        {esEquipo ? (
          <>
            <label className="casilla"><input type="checkbox" checked={danado} onChange={(e) => setDanado(e.target.checked)} />El equipo regresó con falla o daño</label>
            {danado && <p className="aviso aviso-error nota">Quedará «fuera de servicio» hasta registrar su reparación.</p>}
            <label>Observaciones{danado && ' (describa el daño)'}
              <textarea rows={2} value={condicion} onChange={(e) => setCondicion(e.target.value)} required={danado} /></label>
          </>
        ) : (
          <>
            <p className="tenue nota">Pendiente: {pend} {renglon.articulos?.unidad}. Puede registrar una devolución parcial.</p>
            <div className="fila-campos">
              <label>Devuelto en buen estado<input type="number" min="0" max={pend} step="any" value={devuelta} onChange={(e) => setDevuelta(e.target.value)} /></label>
              <label>Perdido o roto<input type="number" min="0" max={pend} step="any" value={perdida} onChange={(e) => setPerdida(e.target.value)} /></label>
            </div>
            <p className="tenue nota">Lo devuelto en buen estado regresa a la existencia del inventario; lo perdido o roto no.</p>
            <label>Observaciones{Number(perdida) > 0 && ' (qué ocurrió)'}
              <textarea rows={2} value={condicion} onChange={(e) => setCondicion(e.target.value)} required={Number(perdida) > 0} /></label>
          </>
        )}
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario">Registrar devolución</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

function AmpliarPlazo({ prestamo, esAdmin, miId, diasMax, alCerrar, alGuardar }) {
  const [limite, setLimite] = useState(prestamo.fecha_limite < hoyISO() ? hoyISO(diasMax) : prestamo.fecha_limite);
  const [error, setError] = useState('');
  async function guardar(e) {
    e.preventDefault();
    const cambios = { fecha_limite: limite };
    if (esAdmin) cambios.autorizado_por = miId;
    const { error } = await supabase.from('prestamos').update(cambios).eq('id', prestamo.id);
    if (error) setError(mensajeError(error)); else alGuardar('Plazo actualizado.');
  }
  return (
    <Modal titulo="Ampliar plazo" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <label>Nueva fecha límite<input type="date" value={limite} min={hoyISO()} onChange={(e) => setLimite(e.target.value)} required /></label>
        <p className="tenue nota">{esAdmin
          ? 'Como Administrador, la ampliación queda autorizada por usted.'
          : `El personal puede ampliar préstamos internos hasta ${diasMax} días a partir de hoy. Plazos mayores o préstamos externos los amplía el Administrador.`}</p>
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario">Guardar</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

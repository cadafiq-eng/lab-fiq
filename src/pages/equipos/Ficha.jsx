import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta, Modal } from '../../componentes';
import { duracion, fecha, fechaHora } from '../../util';
import {
  ESTADOS, EstadoEquipo, Mantenimiento, ModalEstado, ModalMantenimiento, TIPOS_MANT, useDiasAlerta,
} from './comun';

export default function Ficha() {
  const { id } = useParams();
  const diasAlerta = useDiasAlerta();
  const [e, setE] = useState(null);
  const [mants, setMants] = useState([]);
  const [usos, setUsos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [capacitados, setCapacitados] = useState([]);
  const [pestana, setPestana] = useState('mant');
  const [modal, setModal] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  async function cargar() {
    const { data, error } = await supabase.from('equipos').select('*, tipos_equipo(*)').eq('id', id).single();
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setE(data);
    const [m, u, h, c] = await Promise.all([
      supabase.from('mantenimientos').select('*').eq('equipo_id', id).order('fecha', { ascending: false }).order('creado_en', { ascending: false }),
      supabase.from('usos_equipo').select('*, solicitantes(nombre, matricula)').eq('equipo_id', id).order('inicio', { ascending: false }).limit(200),
      supabase.from('historial_estados_equipo').select('*').eq('equipo_id', id).order('fecha', { ascending: false }),
      supabase.from('capacitaciones').select('id, fecha, entidad, solicitantes(nombre, matricula)')
        .eq('tipo_equipo_id', data.tipo_equipo_id).eq('activo', true).order('fecha', { ascending: false }),
    ]);
    setMants(m.data ?? []); setUsos(u.data ?? []); setHistorial(h.data ?? []); setCapacitados(c.data ?? []);
  }
  useEffect(() => { cargar(); }, [id]);

  const cerrar = (texto) => { setModal(null); if (texto) setMensaje({ tipo: 'ok', texto }); cargar(); };

  if (!e) return <><Aviso mensaje={mensaje} /><p className="tenue">Cargando…</p></>;
  const usoAbierto = usos.find((u) => !u.fin);
  const ultimoCorrectivo = mants.find((m) => m.tipo === 'correctivo');

  return (
    <>
      <p><Link to="/equipos/catalogo" className="volver">← Catálogo de equipos</Link></p>
      <div className="encabezado">
        <div>
          <h1>{e.nombre}</h1>
          <p className="tenue">{e.codigo} · {e.tipos_equipo?.nombre}</p>
        </div>
        <div className="fila-botones envolver">
          <button className="btn" onClick={() => setModal('estado')}>Cambiar estado</button>
          {e.estado !== 'baja' && <button className="btn btn-primario" onClick={() => setModal('mant')}>Registrar mantenimiento</button>}
          <Link className="btn" to={`/equipos/editar/${e.id}`}>Editar</Link>
          <Link className="btn" to={`/equipos/etiquetas?ids=${e.id}`}>Etiqueta QR</Link>
        </div>
      </div>
      <Aviso mensaje={mensaje} />

      <div className="dos-columnas">
        <section className="tarjeta">
          <h2>Situación</h2>
          <dl className="datos">
            <dt>Estado</dt><dd><EstadoEquipo estado={e.estado} /></dd>
            {usoAbierto && <><dt>En uso por</dt><dd>{usoAbierto.solicitantes?.nombre} desde {fechaHora(usoAbierto.inicio)}
              {' '}<button className="btn btn-chico" onClick={() => setModal({ terminar: usoAbierto })}>Terminar uso</button></dd></>}
            <dt>Próximo preventivo</dt><dd>{e.estado === 'baja' ? '—' : <Mantenimiento proximo={e.proximo_mantenimiento} diasAlerta={diasAlerta} />}</dd>
            <dt>Último preventivo</dt><dd>{fecha(e.ultimo_mantenimiento) || '—'}</dd>
            <dt>Periodicidad</dt><dd>{e.periodicidad_mantenimiento_dias ? `cada ${e.periodicidad_mantenimiento_dias} días` : '—'}</dd>
            <dt>Última reparación</dt><dd>{ultimoCorrectivo ? fecha(ultimoCorrectivo.fecha) : '—'}</dd>
            <dt>Capacitación</dt><dd>{e.requiere_capacitacion
              ? <Etiqueta tono="aviso">Requerida{e.tipos_equipo?.entidad_capacitacion ? ` · ${e.tipos_equipo.entidad_capacitacion}` : ''}</Etiqueta>
              : 'No requerida'}</dd>
          </dl>
        </section>
        <section className="tarjeta">
          <h2>Datos del equipo</h2>
          <dl className="datos">
            <dt>Marca / modelo</dt><dd>{[e.marca, e.modelo].filter(Boolean).join(' · ') || '—'}</dd>
            <dt>Número de serie</dt><dd>{e.numero_serie || '—'}</dd>
            <dt>Ubicación</dt><dd>{e.ubicacion || '—'}</dd>
            <dt>Responsable</dt><dd>{e.responsable || '—'}</dd>
            <dt>Voltaje</dt><dd>{e.voltaje || '—'}</dd>
            <dt>Documentos</dt><dd>
              {e.manual_url && <a href={e.manual_url} target="_blank" rel="noreferrer">Manual</a>}
              {e.manual_url && e.foto_url && ' · '}
              {e.foto_url && <a href={e.foto_url} target="_blank" rel="noreferrer">Foto</a>}
              {!e.manual_url && !e.foto_url && '—'}
            </dd>
          </dl>
        </section>
      </div>

      <nav className="pestanas">
        {[['mant', `Mantenimientos (${mants.length})`], ['uso', `Bitácora de uso (${usos.length})`],
          ['hist', 'Historial de estados'], ['cap', `Personas capacitadas (${capacitados.length})`]].map(([k, t]) => (
          <a key={k} href="#" className={pestana === k ? 'active' : ''} onClick={(ev) => { ev.preventDefault(); setPestana(k); }}>{t}</a>
        ))}
      </nav>
      <section className="tarjeta una-columna">
        {pestana === 'mant' && (mants.length === 0 ? <p className="tenue">Sin mantenimientos registrados.</p> : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Trabajo realizado</th><th>Proveedor</th><th className="der">Costo</th><th>Resultado</th></tr></thead>
            <tbody>{mants.map((m) => (
              <tr key={m.id}>
                <td className="sin-salto">{fecha(m.fecha)}</td>
                <td>{TIPOS_MANT[m.tipo]}</td>
                <td>{m.descripcion}</td>
                <td>{m.proveedor || '—'}</td>
                <td className="der">{m.costo != null ? Number(m.costo).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—'}</td>
                <td>{m.deja_operativo ? <Etiqueta tono="bien">Operativo</Etiqueta> : <Etiqueta tono="mal">No operativo</Etiqueta>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}
        {pestana === 'uso' && (usos.length === 0 ? <p className="tenue">Nadie ha usado este equipo.</p> : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Persona</th><th>Inicio</th><th>Duración</th><th>Observaciones</th></tr></thead>
            <tbody>{usos.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.solicitantes?.nombre}</strong><br /><span className="tenue">{u.solicitantes?.matricula}</span></td>
                <td className="sin-salto">{fechaHora(u.inicio)}</td>
                <td>{u.fin ? duracion(u.inicio, u.fin) : <Etiqueta tono="aviso">En uso</Etiqueta>}</td>
                <td>{u.dano_reportado && <Etiqueta tono="mal">Daño reportado</Etiqueta>} {u.observaciones}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}
        {pestana === 'hist' && (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Fecha</th><th>Cambio</th><th>Motivo</th></tr></thead>
            <tbody>{historial.map((h) => (
              <tr key={h.id}>
                <td className="sin-salto">{fechaHora(h.fecha)}</td>
                <td className="sin-salto">{h.estado_anterior ? `${ESTADOS[h.estado_anterior].texto} → ` : ''}<EstadoEquipo estado={h.estado_nuevo} /></td>
                <td>{h.motivo}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pestana === 'cap' && (!e.requiere_capacitacion ? <p className="tenue">Este equipo no requiere capacitación.</p>
          : capacitados.length === 0 ? <p className="tenue">Nadie tiene capacitación registrada en «{e.tipos_equipo?.nombre}». Se registra en Equipos → Capacitaciones.</p> : (
          <table>
            <thead><tr><th>Persona</th><th>Fecha</th><th>Impartida por</th></tr></thead>
            <tbody>{capacitados.map((c) => (
              <tr key={c.id}><td>{c.solicitantes?.nombre} <span className="tenue">{c.solicitantes?.matricula}</span></td>
                <td>{fecha(c.fecha)}</td><td>{c.entidad}</td></tr>
            ))}</tbody>
          </table>
        ))}
      </section>

      {modal === 'mant' && <ModalMantenimiento equipo={e} alCerrar={() => setModal(null)} alGuardar={cerrar} />}
      {modal === 'estado' && <ModalEstado equipo={e} alCerrar={() => setModal(null)} alGuardar={cerrar} />}
      {modal?.terminar && <TerminarUso uso={modal.terminar} alCerrar={() => setModal(null)} alGuardar={cerrar} />}
    </>
  );
}

// El personal puede cerrar un uso que la persona dejó abierto
function TerminarUso({ uso, alCerrar, alGuardar }) {
  const [obs, setObs] = useState('');
  const [dano, setDano] = useState(false);
  const [error, setError] = useState('');
  async function guardar(ev) {
    ev.preventDefault();
    const { data, error } = await supabase.rpc('terminal_terminar_uso', {
      p_solicitante: uso.solicitante_id, p_uso: uso.id, p_observaciones: obs, p_dano: dano,
    });
    if (error) setError(mensajeError(error)); else alGuardar(data);
  }
  return (
    <Modal titulo="Terminar uso" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="tenue">{uso.solicitantes?.nombre} · desde {fechaHora(uso.inicio)}</p>
        <label className="casilla"><input type="checkbox" checked={dano} onChange={(ev) => setDano(ev.target.checked)} />El equipo presenta falla o daño</label>
        {dano && <p className="aviso aviso-error nota">El equipo quedará «fuera de servicio» hasta registrar su reparación.</p>}
        <label>Observaciones<textarea rows={2} value={obs} onChange={(ev) => setObs(ev.target.value)} required={dano} /></label>
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario">Terminar uso</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

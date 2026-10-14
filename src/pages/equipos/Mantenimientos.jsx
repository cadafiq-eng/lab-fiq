import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta } from '../../componentes';
import { descargarCSV, fecha, hoyISO } from '../../util';
import {
  EstadoEquipo, Mantenimiento, ModalMantenimiento, PestanasEquipos, TIPOS_MANT, situacionMantenimiento, useDiasAlerta,
} from './comun';

export default function Mantenimientos() {
  const diasAlerta = useDiasAlerta();
  const [equipos, setEquipos] = useState(null);
  const [registros, setRegistros] = useState(null);
  const [verTodos, setVerTodos] = useState(false);
  const [desde, setDesde] = useState(hoyISO(-365));
  const [modal, setModal] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  async function cargar() {
    const [e, m] = await Promise.all([
      supabase.from('equipos').select('id, codigo, nombre, estado, proximo_mantenimiento, ultimo_mantenimiento, periodicidad_mantenimiento_dias')
        .neq('estado', 'baja').order('proximo_mantenimiento', { nullsFirst: false }),
      supabase.from('mantenimientos').select('*, equipos(codigo, nombre)').gte('fecha', desde)
        .order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(1000),
    ]);
    if (e.error) return setMensaje({ tipo: 'error', texto: mensajeError(e.error) });
    setEquipos(e.data); setRegistros(m.data ?? []);
  }
  useEffect(() => { cargar(); }, [desde]);

  const agenda = useMemo(() => (equipos ?? []).filter((e) =>
    verTodos || ['vencido', 'proximo'].includes(situacionMantenimiento(e.proximo_mantenimiento, diasAlerta).clave)),
  [equipos, verTodos, diasAlerta]);

  const total = registros?.reduce((s, m) => s + Number(m.costo ?? 0), 0) ?? 0;
  const pesos = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  function exportar() {
    descargarCSV(`mantenimientos_desde_${desde}.csv`,
      ['Fecha', 'Código', 'Equipo', 'Tipo', 'Descripción', 'Proveedor', 'Costo', 'Quedó operativo'],
      registros.map((m) => [fecha(m.fecha), m.equipos?.codigo, m.equipos?.nombre, TIPOS_MANT[m.tipo], m.descripcion,
        m.proveedor ?? '', m.costo ?? '', m.deja_operativo ? 'Sí' : 'No']));
  }

  return (
    <>
      <h1>Equipos</h1>
      <PestanasEquipos />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="encabezado">
          <h2>Agenda de mantenimiento preventivo</h2>
          <label className="casilla"><input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} />Ver todos los equipos</label>
        </div>
        <p className="tenue nota">Vencidos y próximos a vencer en {diasAlerta} días (ajustable en Configuración). Un equipo con
          el mantenimiento vencido no puede usarse ni prestarse.</p>
        {!equipos ? <p className="tenue">Cargando…</p> : agenda.length === 0 ? (
          <p className="tenue">{verTodos ? 'No hay equipos registrados.' : 'Ningún mantenimiento vencido ni próximo. Todo al día.'}</p>
        ) : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Código</th><th>Equipo</th><th>Estado</th><th>Último</th><th>Periodicidad</th><th>Próximo</th><th></th></tr></thead>
            <tbody>{agenda.map((e) => (
              <tr key={e.id}>
                <td className="sin-salto"><Link to={`/equipos/ficha/${e.id}`}><strong>{e.codigo}</strong></Link></td>
                <td>{e.nombre}</td>
                <td><EstadoEquipo estado={e.estado} /></td>
                <td className="sin-salto">{fecha(e.ultimo_mantenimiento) || '—'}</td>
                <td>{e.periodicidad_mantenimiento_dias ? `${e.periodicidad_mantenimiento_dias} días` : '—'}</td>
                <td><Mantenimiento proximo={e.proximo_mantenimiento} diasAlerta={diasAlerta} /></td>
                <td className="der"><button className="btn btn-chico" onClick={() => setModal(e)}>Registrar</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="tarjeta una-columna">
        <div className="filtros">
          <h2 className="crece">Mantenimientos registrados</h2>
          <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <button className="btn" onClick={exportar} disabled={!registros?.length}>Exportar CSV</button>
        </div>
        {!registros ? <p className="tenue">Cargando…</p> : registros.length === 0 ? <p className="tenue">Sin mantenimientos en el periodo.</p> : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Fecha</th><th>Equipo</th><th>Tipo</th><th>Trabajo realizado</th><th>Proveedor</th><th className="der">Costo</th></tr></thead>
            <tbody>{registros.map((m) => (
              <tr key={m.id}>
                <td className="sin-salto">{fecha(m.fecha)}</td>
                <td><Link to={`/equipos/ficha/${m.equipo_id}`}>{m.equipos?.codigo}</Link><br /><span className="tenue">{m.equipos?.nombre}</span></td>
                <td>{TIPOS_MANT[m.tipo]}{!m.deja_operativo && <><br /><Etiqueta tono="mal">No operativo</Etiqueta></>}</td>
                <td>{m.descripcion}</td>
                <td>{m.proveedor || '—'}</td>
                <td className="der">{m.costo != null ? pesos(m.costo) : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {registros?.length > 0 && <p className="tenue nota">{registros.length} mantenimiento(s) · costo total {pesos(total)}</p>}
      </section>

      {modal && <ModalMantenimiento equipo={modal} alCerrar={() => setModal(null)}
        alGuardar={(t) => { setModal(null); setMensaje({ tipo: 'ok', texto: t }); cargar(); }} />}
    </>
  );
}

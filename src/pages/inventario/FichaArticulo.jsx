import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha, fechaHora } from '../../util';
import { Existencia, MOVIMIENTOS, ModalMovimiento, Pictogramas, TIPOS_ARTICULO, num } from './comun';

export default function FichaArticulo() {
  const { id } = useParams();
  const { esAdmin } = useSesion();
  const [a, setA] = useState(null);
  const [movs, setMovs] = useState([]);
  const [prestados, setPrestados] = useState([]);
  const [modal, setModal] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  async function cargar() {
    const { data, error } = await supabase.from('articulos').select('*').eq('id', id).single();
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setA(data);
    const [m, p] = await Promise.all([
      supabase.from('movimientos_inventario').select('*, solicitantes(nombre)').eq('articulo_id', id)
        .order('creado_en', { ascending: false }).limit(500),
      supabase.from('prestamo_renglones').select('id, cantidad, cantidad_devuelta, cantidad_perdida, prestamos(id, fecha_limite, solicitantes(nombre))')
        .eq('articulo_id', id).is('devuelto_en', null),
    ]);
    setMovs(m.data ?? []); setPrestados(p.data ?? []);
  }
  useEffect(() => { cargar(); }, [id]);

  async function alternarActivo() {
    if (!window.confirm(a.activo ? `¿Dar de baja «${a.nombre}»? Ya no podrá registrar entradas, salidas ni préstamos.` : `¿Reactivar «${a.nombre}»?`)) return;
    const { error } = await supabase.from('articulos').update({ activo: !a.activo }).eq('id', id);
    if (error) setMensaje({ tipo: 'error', texto: mensajeError(error) }); else { setMensaje({ tipo: 'ok', texto: a.activo ? 'Artículo dado de baja.' : 'Artículo reactivado.' }); cargar(); }
  }

  if (!a) return <><Aviso mensaje={mensaje} /><p className="tenue">Cargando…</p></>;
  const enPrestamo = prestados.reduce((s, r) => s + Number(r.cantidad) - Number(r.cantidad_devuelta) - Number(r.cantidad_perdida), 0);

  return (
    <>
      <p><Link to="/inventario/articulos" className="volver">← Inventario</Link></p>
      <div className="encabezado">
        <div>
          <h1>{a.nombre}</h1>
          <p className="tenue">{[a.codigo, a.categoria, TIPOS_ARTICULO[a.tipo]].filter(Boolean).join(' · ')}{!a.activo && ' · DADO DE BAJA'}</p>
        </div>
        {a.activo && (
          <div className="fila-botones envolver">
            <button className="btn btn-primario" onClick={() => setModal('entrada')}>Entrada</button>
            {a.tipo === 'consumible' && <button className="btn" onClick={() => setModal('salida')}>Salida</button>}
            <button className="btn" onClick={() => setModal('perdida')}>Pérdida</button>
            {esAdmin && <button className="btn" onClick={() => setModal('ajuste')}>Ajuste</button>}
            <Link className="btn" to={`/inventario/editar/${a.id}`}>Editar</Link>
          </div>
        )}
      </div>
      <Aviso mensaje={mensaje} />

      <div className="dos-columnas">
        <section className="tarjeta">
          <h2>Existencia</h2>
          <p className="existencia-grande"><Existencia a={a} /></p>
          <dl className="datos">
            <dt>Mínimo</dt><dd>{Number(a.stock_minimo) > 0 ? `${num(a.stock_minimo)} ${a.unidad}` : '—'}</dd>
            {a.tipo === 'retornable' && <><dt>En préstamo</dt><dd>{num(enPrestamo)} {a.unidad}</dd></>}
            <dt>Ubicación</dt><dd>{a.ubicacion || '—'}</dd>
          </dl>
          {a.tipo === 'retornable' && <p className="tenue nota">Los retornables salen como préstamo desde el módulo de Préstamos.</p>}
        </section>
        <section className="tarjeta">
          <h2>Seguridad</h2>
          <dl className="datos">
            <dt>Peligros</dt><dd>{a.pictogramas?.length ? <Pictogramas lista={a.pictogramas} /> : 'Sin pictogramas registrados'}</dd>
            <dt>Especial</dt><dd>{a.especial ? <Etiqueta tono="mal">Sí · salida autorizada por el Administrador (Art. 28)</Etiqueta> : 'No'}</dd>
            <dt>Recuperable</dt><dd>{a.recuperable ? 'Sí (Art. 29)' : 'No'}</dd>
            <dt>Hoja de seguridad</dt><dd>{a.hoja_seguridad_url ? <a href={a.hoja_seguridad_url} target="_blank" rel="noreferrer">Abrir</a> : '—'}</dd>
          </dl>
          {esAdmin && <button className="btn btn-chico" onClick={alternarActivo}>{a.activo ? 'Dar de baja' : 'Reactivar'}</button>}
        </section>
      </div>

      {prestados.length > 0 && (
        <section className="tarjeta una-columna">
          <h2>En préstamo ahora</h2>
          <ul className="lista-simple">{prestados.map((r) => (
            <li key={r.id}><Link to={`/prestamos/detalle/${r.prestamos.id}`}>{r.prestamos.solicitantes?.nombre}</Link>
              {' · '}{num(Number(r.cantidad) - Number(r.cantidad_devuelta) - Number(r.cantidad_perdida))} {a.unidad} · hasta {fecha(r.prestamos.fecha_limite)}</li>
          ))}</ul>
        </section>
      )}

      <section className="tarjeta una-columna">
        <h2>Movimientos</h2>
        {movs.length === 0 ? <p className="tenue">Sin movimientos.</p> : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Fecha</th><th>Movimiento</th><th className="der">Cantidad</th><th>Persona</th><th>Lote / caducidad</th><th>Motivo</th></tr></thead>
            <tbody>{movs.map((m) => {
              const t = MOVIMIENTOS[m.tipo];
              const signo = (m.tipo === 'ajuste' ? Number(m.cantidad) > 0 : t.signo > 0) ? '+' : '−';
              return (
                <tr key={m.id}>
                  <td className="sin-salto">{fechaHora(m.creado_en)}</td>
                  <td><Etiqueta tono={t.tono}>{t.texto}</Etiqueta>{m.autorizado_por && <><br /><span className="tenue chico">Autorizado (Art. 28)</span></>}</td>
                  <td className="der sin-salto">{signo}{num(Math.abs(Number(m.cantidad)))} {a.unidad}</td>
                  <td>{m.solicitantes?.nombre ?? '—'}</td>
                  <td>{[m.lote, m.caducidad && `cad. ${fecha(m.caducidad)}`].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{m.motivo}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>

      {modal && <ModalMovimiento articulo={a} tipo={modal} alCerrar={() => setModal(null)}
        alGuardar={(t) => { setModal(null); setMensaje({ tipo: 'ok', texto: t }); cargar(); }} />}
    </>
  );
}

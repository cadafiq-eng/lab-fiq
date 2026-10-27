import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta } from '../../componentes';
import { descargarCSV, fecha, fechaHora, hoyISO, normalizar } from '../../util';
import { MOVIMIENTOS, PestanasInventario, num } from './comun';

export default function Movimientos() {
  const [desde, setDesde] = useState(hoyISO(-30));
  const [hasta, setHasta] = useState(hoyISO());
  const [tipo, setTipo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [lista, setLista] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    setLista(null);
    const fin = new Date(hasta + 'T00:00'); fin.setDate(fin.getDate() + 1);
    supabase.from('movimientos_inventario')
      .select('*, articulos(nombre, codigo, unidad), solicitantes(nombre, matricula)')
      .gte('creado_en', new Date(desde + 'T00:00').toISOString()).lt('creado_en', fin.toISOString())
      .order('creado_en', { ascending: false }).limit(5000)
      .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  }, [desde, hasta]);

  const visibles = useMemo(() => {
    const q = normalizar(buscar.trim());
    return (lista ?? []).filter((m) => !tipo || m.tipo === tipo)
      .filter((m) => !q || normalizar([m.articulos?.nombre, m.articulos?.codigo, m.solicitantes?.nombre, m.motivo, m.lote].join(' ')).includes(q));
  }, [lista, tipo, buscar]);

  const cantidadConSigno = (m) => (m.tipo === 'ajuste' ? Number(m.cantidad) : MOVIMIENTOS[m.tipo].signo * Number(m.cantidad));

  function exportar() {
    descargarCSV(`movimientos_${desde}_a_${hasta}.csv`,
      ['Fecha', 'Artículo', 'Código', 'Movimiento', 'Cantidad', 'Unidad', 'Persona', 'Lote', 'Caducidad', 'Motivo'],
      visibles.map((m) => [fechaHora(m.creado_en), m.articulos?.nombre, m.articulos?.codigo ?? '', MOVIMIENTOS[m.tipo].texto,
        cantidadConSigno(m), m.articulos?.unidad, m.solicitantes?.nombre ?? '', m.lote ?? '', m.caducidad ? fecha(m.caducidad) : '', m.motivo ?? '']));
  }

  return (
    <>
      <h1>Inventario</h1>
      <PestanasInventario />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="filtros">
          <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
          <label>Movimiento
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(MOVIMIENTOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
            </select>
          </label>
          <label className="crece">Buscar<input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Artículo, persona, lote o motivo" /></label>
          <button className="btn" onClick={exportar} disabled={!visibles.length}>Exportar CSV</button>
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? <p className="tenue">Sin movimientos en el periodo.</p> : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Fecha</th><th>Artículo</th><th>Movimiento</th><th className="der">Cantidad</th><th>Persona</th><th>Motivo</th></tr></thead>
            <tbody>{visibles.map((m) => {
              const c = cantidadConSigno(m);
              return (
                <tr key={m.id}>
                  <td className="sin-salto">{fechaHora(m.creado_en)}</td>
                  <td><Link to={`/inventario/articulo/${m.articulo_id}`}>{m.articulos?.nombre}</Link>
                    {m.lote && <><br /><span className="tenue chico">lote {m.lote}{m.caducidad && ` · cad. ${fecha(m.caducidad)}`}</span></>}</td>
                  <td><Etiqueta tono={MOVIMIENTOS[m.tipo].tono}>{MOVIMIENTOS[m.tipo].texto}</Etiqueta></td>
                  <td className="der sin-salto">{c > 0 ? '+' : '−'}{num(Math.abs(c))} {m.articulos?.unidad}</td>
                  <td>{m.solicitantes?.nombre ?? '—'}</td>
                  <td>{m.motivo}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {lista && <p className="tenue nota">{visibles.length} movimiento(s).</p>}
      </section>
    </>
  );
}

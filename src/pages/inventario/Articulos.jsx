import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha, normalizar } from '../../util';
import { Existencia, PestanasInventario, Pictogramas, TIPOS_ARTICULO, num } from './comun';

export default function Articulos() {
  const navegar = useNavigate();
  const [lista, setLista] = useState(null);
  const [caducidades, setCaducidades] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [vista, setVista] = useState('activos');
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    supabase.from('articulos').select('*').order('nombre')
      .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
    supabase.from('v_caducidades').select('*').order('caducidad').then(({ data }) => setCaducidades(data ?? []));
  }, []);

  const categorias = useMemo(() => [...new Set((lista ?? []).map((a) => a.categoria).filter(Boolean))].sort(), [lista]);
  const bajo = (a) => Number(a.stock_minimo) > 0 && Number(a.existencia) <= Number(a.stock_minimo);
  const visibles = useMemo(() => {
    const q = normalizar(buscar.trim());
    return (lista ?? [])
      .filter((a) => vista === 'inactivos' ? !a.activo : a.activo && (vista !== 'bajo' || bajo(a)))
      .filter((a) => !tipo || a.tipo === tipo)
      .filter((a) => !categoria || a.categoria === categoria)
      .filter((a) => !q || normalizar([a.nombre, a.codigo, a.categoria, a.ubicacion].join(' ')).includes(q));
  }, [lista, buscar, tipo, categoria, vista]);
  const nBajo = (lista ?? []).filter((a) => a.activo && bajo(a)).length;

  return (
    <>
      <div className="encabezado">
        <h1>Inventario</h1>
        <Link className="btn btn-primario" to="/inventario/nuevo">Nuevo artículo</Link>
      </div>
      <PestanasInventario />
      <Aviso mensaje={mensaje} />

      {(nBajo > 0 || caducidades.length > 0) && (
        <div className="dos-columnas">
          {nBajo > 0 && (
            <section className="tarjeta alerta-tarjeta">
              <h2>{nBajo} artículo(s) en o bajo el mínimo</h2>
              <p className="tenue nota">Conviene solicitar su reposición.{' '}
                <button className="btn-enlace" onClick={() => setVista('bajo')}>Ver lista</button></p>
            </section>
          )}
          {caducidades.length > 0 && (
            <section className="tarjeta alerta-tarjeta">
              <h2>Caducidades en los próximos 60 días</h2>
              <ul className="lista-simple">{caducidades.slice(0, 6).map((c) => (
                <li key={c.id}><Link to={`/inventario/articulo/${c.articulo_id}`}>{c.nombre}</Link>
                  {c.lote && ` · lote ${c.lote}`} · <Etiqueta tono={c.caducado ? 'mal' : 'aviso'}>{c.caducado ? 'Caducó' : 'Caduca'} {fecha(c.caducidad)}</Etiqueta></li>
              ))}</ul>
              <p className="tenue nota">Según los lotes registrados en las entradas.</p>
            </section>
          )}
        </div>
      )}

      <section className="tarjeta una-columna">
        <div className="filtros">
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, código, categoría o ubicación" />
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Consumibles y retornables</option>
            {Object.entries(TIPOS_ARTICULO).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
          </select>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={vista} onChange={(e) => setVista(e.target.value)}>
            <option value="activos">Activos</option><option value="bajo">Bajo mínimo</option><option value="inactivos">Dados de baja</option>
          </select>
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? (
          <p className="tenue">{lista.length === 0
            ? 'Aún no hay artículos. Puede darlos de alta uno por uno; la carga masiva desde Excel se hará en la fase de carga inicial.'
            : 'Ningún artículo coincide.'}</p>
        ) : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Artículo</th><th>Categoría</th><th>Tipo</th><th>Existencia</th><th>Mínimo</th><th>Ubicación</th><th>Peligros</th></tr></thead>
            <tbody>{visibles.map((a) => (
              <tr key={a.id} className={'fila-enlace' + (a.activo ? '' : ' inactivo')} onClick={() => navegar(`/inventario/articulo/${a.id}`)}>
                <td><strong>{a.nombre}</strong>{a.codigo && <><br /><span className="tenue">{a.codigo}</span></>}
                  {a.especial && <><br /><Etiqueta tono="mal">Especial · Art. 28</Etiqueta></>}</td>
                <td>{a.categoria}</td>
                <td>{TIPOS_ARTICULO[a.tipo]}</td>
                <td className="sin-salto"><Existencia a={a} /></td>
                <td className="sin-salto">{Number(a.stock_minimo) > 0 ? `${num(a.stock_minimo)} ${a.unidad}` : '—'}</td>
                <td>{a.ubicacion}</td>
                <td><Pictogramas lista={a.pictogramas} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {lista && <p className="tenue nota">{visibles.length} artículo(s). Haga clic en uno para registrar entradas, salidas o ajustes.</p>}
      </section>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso } from '../../componentes';
import { descargarCSV, fecha, diaLocal, hoyISO, normalizar } from '../../util';
import { PestanasPrestamos, SELECT_PRESTAMO, SituacionPrestamo, describirRenglon } from './comun';

export default function HistorialPrestamos() {
  const navegar = useNavigate();
  const [desde, setDesde] = useState(hoyISO(-90));
  const [hasta, setHasta] = useState(hoyISO());
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('todos');
  const [lista, setLista] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    setLista(null);
    const fin = new Date(hasta + 'T00:00'); fin.setDate(fin.getDate() + 1);
    supabase.from('prestamos').select(SELECT_PRESTAMO)
      .gte('fecha_entrega', new Date(desde + 'T00:00').toISOString()).lt('fecha_entrega', fin.toISOString())
      .order('fecha_entrega', { ascending: false }).limit(3000)
      .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  }, [desde, hasta]);

  const visibles = useMemo(() => {
    const q = normalizar(buscar.trim());
    return (lista ?? [])
      .filter((p) => estado === 'todos' || p.estado === estado)
      .filter((p) => !q || normalizar([p.solicitantes?.nombre, p.solicitantes?.matricula, p.solicitantes?.adscripcion, p.motivo,
        ...p.prestamo_renglones.map(describirRenglon)].join(' ')).includes(q));
  }, [lista, buscar, estado]);

  function exportar() {
    const filas = [];
    visibles.forEach((p) => p.prestamo_renglones.forEach((r) => filas.push([
      fecha(diaLocal(p.fecha_entrega)), p.solicitantes?.nombre, p.solicitantes?.matricula ?? p.solicitantes?.adscripcion ?? '',
      p.tipo, p.motivo, fecha(p.fecha_limite), p.estado, r.equipos ? `${r.equipos.codigo} ${r.equipos.nombre}` : r.articulos?.nombre,
      Number(r.cantidad), Number(r.cantidad_devuelta), Number(r.cantidad_perdida), r.danado ? 'Sí' : '', r.condicion ?? '',
    ])));
    descargarCSV(`prestamos_${desde}_a_${hasta}.csv`,
      ['Entrega', 'Persona', 'Matrícula o adscripción', 'Tipo', 'Motivo', 'Fecha límite', 'Estado', 'Concepto',
        'Cantidad', 'Devuelto', 'Perdido', 'Daño', 'Observaciones'], filas);
  }

  return (
    <>
      <h1>Préstamos</h1>
      <PestanasPrestamos />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="filtros">
          <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
          <label className="crece">Buscar<input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Persona, equipo, material o motivo" /></label>
          <label>Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="todos">Todos</option><option value="abierto">Abiertos</option><option value="cerrado">Devueltos</option>
            </select>
          </label>
          <button className="btn" onClick={exportar} disabled={!visibles.length}>Exportar CSV</button>
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? <p className="tenue">Sin préstamos en el periodo.</p> : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Entrega</th><th>Persona</th><th>Concepto</th><th>Tipo</th><th>Situación</th></tr></thead>
            <tbody>{visibles.map((p) => (
              <tr key={p.id} className="fila-enlace" onClick={() => navegar(`/prestamos/detalle/${p.id}`)}>
                <td className="sin-salto">{fecha(diaLocal(p.fecha_entrega))}</td>
                <td><strong>{p.solicitantes?.nombre}</strong><br /><span className="tenue">{p.solicitantes?.matricula ?? p.solicitantes?.adscripcion}</span></td>
                <td><ul className="lista-simple">{p.prestamo_renglones.map((r) => <li key={r.id}>{describirRenglon(r)}</li>)}</ul></td>
                <td>{p.tipo === 'externo' ? 'Externo' : 'Interno'}</td>
                <td><SituacionPrestamo p={p} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {lista && <p className="tenue nota">{visibles.length} préstamo(s).</p>}
      </section>
    </>
  );
}

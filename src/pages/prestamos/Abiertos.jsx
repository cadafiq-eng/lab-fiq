import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha, hoyISO, normalizar } from '../../util';
import { PestanasPrestamos, SELECT_PRESTAMO, SituacionPrestamo, describirRenglon, pendienteRenglon } from './comun';

export default function Abiertos() {
  const navegar = useNavigate();
  const [lista, setLista] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [soloVencidos, setSoloVencidos] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    supabase.from('prestamos').select(SELECT_PRESTAMO).eq('estado', 'abierto').order('fecha_limite')
      .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  }, []);

  const hoy = hoyISO();
  const visibles = useMemo(() => {
    const q = normalizar(buscar.trim());
    return (lista ?? [])
      .filter((p) => !soloVencidos || p.fecha_limite < hoy)
      .filter((p) => !q || normalizar([p.solicitantes?.nombre, p.solicitantes?.matricula, p.solicitantes?.adscripcion, p.motivo,
        ...p.prestamo_renglones.map(describirRenglon)].join(' ')).includes(q));
  }, [lista, buscar, soloVencidos, hoy]);
  const vencidos = (lista ?? []).filter((p) => p.fecha_limite < hoy).length;

  return (
    <>
      <div className="encabezado">
        <h1>Préstamos</h1>
        <Link className="btn btn-primario" to="/prestamos/nuevo">Nuevo préstamo</Link>
      </div>
      <PestanasPrestamos />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="filtros">
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar persona, equipo, material o motivo" />
          <label className="casilla"><input type="checkbox" checked={soloVencidos} onChange={(e) => setSoloVencidos(e.target.checked)} />
            Solo vencidos {vencidos > 0 && <Etiqueta tono="mal">{vencidos}</Etiqueta>}</label>
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? (
          <p className="tenue">{lista.length === 0 ? 'No hay préstamos abiertos.' : 'Ningún préstamo coincide.'}</p>
        ) : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Persona</th><th>Pendiente de devolver</th><th>Tipo</th><th>Entregado</th><th>Situación</th></tr></thead>
            <tbody>{visibles.map((p) => (
              <tr key={p.id} className="fila-enlace" onClick={() => navegar(`/prestamos/detalle/${p.id}`)}>
                <td><strong>{p.solicitantes?.nombre}</strong><br />
                  <span className="tenue">{p.solicitantes?.externo ? (p.solicitantes.adscripcion || 'Externo') : p.solicitantes?.matricula}</span></td>
                <td><ul className="lista-simple">{p.prestamo_renglones.filter((r) => pendienteRenglon(r) > 0).map((r) => (
                  <li key={r.id}>{r.equipos ? describirRenglon(r)
                    : `${pendienteRenglon(r)} de ${Number(r.cantidad)} ${r.articulos?.unidad} · ${r.articulos?.nombre}`}</li>
                ))}</ul></td>
                <td>{p.tipo === 'externo' ? <Etiqueta tono="aviso">Externo</Etiqueta> : 'Interno'}</td>
                <td className="sin-salto">{fecha(p.fecha_entrega)}</td>
                <td><SituacionPrestamo p={p} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {lista && <p className="tenue nota">{visibles.length} préstamo(s) abiertos. Haga clic en uno para registrar la devolución.</p>}
      </section>
    </>
  );
}

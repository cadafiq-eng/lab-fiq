import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta } from '../../componentes';
import { descargarCSV, duracion, fecha, diaLocal, hora, hoyISO, normalizar } from '../../util';
import { PestanasEquipos } from './comun';

export default function BitacoraUso() {
  const [desde, setDesde] = useState(hoyISO(-30));
  const [hasta, setHasta] = useState(hoyISO());
  const [buscar, setBuscar] = useState('');
  const [soloDanos, setSoloDanos] = useState(false);
  const [lista, setLista] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    setLista(null);
    const fin = new Date(hasta + 'T00:00'); fin.setDate(fin.getDate() + 1);
    supabase.from('usos_equipo')
      .select('id, inicio, fin, observaciones, dano_reportado, equipo_id, equipos(codigo, nombre), solicitantes(nombre, matricula)')
      .gte('inicio', new Date(desde + 'T00:00').toISOString()).lt('inicio', fin.toISOString())
      .order('inicio', { ascending: false }).limit(5000)
      .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  }, [desde, hasta]);

  const visibles = useMemo(() => {
    const q = normalizar(buscar.trim());
    return (lista ?? [])
      .filter((u) => !soloDanos || u.dano_reportado)
      .filter((u) => !q || normalizar(`${u.equipos?.codigo} ${u.equipos?.nombre} ${u.solicitantes?.nombre} ${u.solicitantes?.matricula}`).includes(q));
  }, [lista, buscar, soloDanos]);

  const horas = visibles.filter((u) => u.fin).reduce((s, u) => s + (new Date(u.fin) - new Date(u.inicio)), 0) / 3600000;

  function exportar() {
    descargarCSV(`uso_equipos_${desde}_a_${hasta}.csv`,
      ['Fecha', 'Código', 'Equipo', 'Persona', 'Matrícula', 'Inicio', 'Fin', 'Minutos', 'Daño reportado', 'Observaciones'],
      visibles.map((u) => [fecha(diaLocal(u.inicio)), u.equipos?.codigo, u.equipos?.nombre, u.solicitantes?.nombre,
        u.solicitantes?.matricula, hora(u.inicio), u.fin ? hora(u.fin) : '',
        u.fin ? Math.round((new Date(u.fin) - new Date(u.inicio)) / 60000) : '', u.dano_reportado ? 'Sí' : '', u.observaciones ?? '']));
  }

  return (
    <>
      <h1>Equipos</h1>
      <PestanasEquipos />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="filtros">
          <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
          <label className="crece">Buscar<input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Equipo o persona" /></label>
          <label className="casilla"><input type="checkbox" checked={soloDanos} onChange={(e) => setSoloDanos(e.target.checked)} />Solo con daño</label>
          <button className="btn" onClick={exportar} disabled={!visibles.length}>Exportar CSV</button>
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? <p className="tenue">Sin usos registrados en el periodo.</p> : (
          <div className="tabla-desplazable"><table>
            <thead><tr><th>Fecha</th><th>Equipo</th><th>Persona</th><th>Horario</th><th>Observaciones</th></tr></thead>
            <tbody>{visibles.map((u) => (
              <tr key={u.id}>
                <td className="sin-salto">{fecha(diaLocal(u.inicio))}</td>
                <td><Link to={`/equipos/ficha/${u.equipo_id}`}>{u.equipos?.codigo}</Link><br /><span className="tenue">{u.equipos?.nombre}</span></td>
                <td>{u.solicitantes?.nombre}<br /><span className="tenue">{u.solicitantes?.matricula}</span></td>
                <td className="sin-salto">{hora(u.inicio)} – {u.fin ? hora(u.fin) : <Etiqueta tono="aviso">en uso</Etiqueta>}
                  {u.fin && <><br /><span className="tenue">{duracion(u.inicio, u.fin)}</span></>}</td>
                <td>{u.dano_reportado && <Etiqueta tono="mal">Daño reportado</Etiqueta>} {u.observaciones}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {lista && visibles.length > 0 && <p className="tenue nota">{visibles.length} uso(s) · {horas.toFixed(1)} horas de uso en total.</p>}
      </section>
    </>
  );
}

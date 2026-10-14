import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso } from '../../componentes';
import { normalizar } from '../../util';
import { ESTADOS, EstadoEquipo, Mantenimiento, PestanasEquipos, useDiasAlerta, situacionMantenimiento } from './comun';

export default function Catalogo() {
  const navegar = useNavigate();
  const diasAlerta = useDiasAlerta();
  const [lista, setLista] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('activos');
  const [tipo, setTipo] = useState('');
  const [seleccion, setSeleccion] = useState(new Set());
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    supabase.from('equipos')
      .select('id, codigo, nombre, marca, modelo, ubicacion, estado, proximo_mantenimiento, requiere_capacitacion, tipo_equipo_id, tipos_equipo(nombre)')
      .order('codigo')
      .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
    supabase.from('tipos_equipo').select('id, nombre').order('nombre').then(({ data }) => setTipos(data ?? []));
  }, []);

  const visibles = useMemo(() => {
    const q = normalizar(buscar.trim());
    return (lista ?? [])
      .filter((e) => estado === 'todos' || (estado === 'activos' ? e.estado !== 'baja' : estado === 'mant_vencido'
        ? e.estado !== 'baja' && situacionMantenimiento(e.proximo_mantenimiento, diasAlerta).clave === 'vencido'
        : e.estado === estado))
      .filter((e) => !tipo || e.tipo_equipo_id === tipo)
      .filter((e) => !q || normalizar([e.codigo, e.nombre, e.marca, e.modelo, e.ubicacion, e.tipos_equipo?.nombre].join(' ')).includes(q));
  }, [lista, buscar, estado, tipo, diasAlerta]);

  function alternar(id) {
    const s = new Set(seleccion);
    s.has(id) ? s.delete(id) : s.add(id);
    setSeleccion(s);
  }
  const todosMarcados = visibles.length > 0 && visibles.every((e) => seleccion.has(e.id));
  const marcarTodos = () => setSeleccion(todosMarcados ? new Set() : new Set(visibles.map((e) => e.id)));

  function etiquetas() {
    const ids = seleccion.size ? [...seleccion] : visibles.map((e) => e.id);
    navegar(`/equipos/etiquetas?ids=${ids.join(',')}`);
  }

  return (
    <>
      <div className="encabezado">
        <h1>Equipos</h1>
        <Link className="btn btn-primario" to="/equipos/nuevo">Nuevo equipo</Link>
      </div>
      <PestanasEquipos />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="filtros">
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar código, nombre, marca, modelo o ubicación" />
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="activos">Todos menos baja</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
            <option value="mant_vencido">Mantenimiento vencido</option>
            <option value="todos">Todos</option>
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <button className="btn" onClick={etiquetas} disabled={!visibles.length}>
            Etiquetas QR {seleccion.size ? `(${seleccion.size})` : ''}
          </button>
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? (
          <p className="tenue">{lista.length === 0
            ? 'Aún no hay equipos. Antes de darlos de alta, registre sus tipos en Administración → Tipos de equipo.'
            : 'Ningún equipo coincide con los filtros.'}</p>
        ) : (
          <div className="tabla-desplazable">
            <table>
              <thead><tr>
                <th><input type="checkbox" checked={todosMarcados} onChange={marcarTodos} aria-label="Seleccionar todos" /></th>
                <th>Código</th><th>Equipo</th><th>Tipo</th><th>Ubicación</th><th>Estado</th><th>Próximo mantenimiento</th>
              </tr></thead>
              <tbody>
                {visibles.map((e) => (
                  <tr key={e.id} className={'fila-enlace' + (e.estado === 'baja' ? ' inactivo' : '')}
                    onClick={() => navegar(`/equipos/ficha/${e.id}`)}>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <input type="checkbox" checked={seleccion.has(e.id)} onChange={() => alternar(e.id)} aria-label={`Seleccionar ${e.codigo}`} />
                    </td>
                    <td className="sin-salto"><strong>{e.codigo}</strong></td>
                    <td>{e.nombre}<br /><span className="tenue">{[e.marca, e.modelo].filter(Boolean).join(' · ')}</span></td>
                    <td>{e.tipos_equipo?.nombre}{e.requiere_capacitacion && <><br /><span className="tenue chico">Requiere capacitación</span></>}</td>
                    <td>{e.ubicacion}</td>
                    <td><EstadoEquipo estado={e.estado} /></td>
                    <td>{e.estado !== 'baja' && <Mantenimiento proximo={e.proximo_mantenimiento} diasAlerta={diasAlerta} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lista && <p className="tenue nota">{visibles.length} equipo(s). Haga clic en un renglón para ver su ficha.</p>}
      </section>
    </>
  );
}

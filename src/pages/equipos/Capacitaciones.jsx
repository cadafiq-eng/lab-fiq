import { useEffect, useMemo, useState } from 'react';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha, hoyISO, normalizar } from '../../util';
import { PestanasEquipos } from './comun';

const VACIO = { persona: '', tipo: '', fecha: hoyISO(), entidad: '' };

export default function Capacitaciones() {
  const { esAdmin } = useSesion();
  const [lista, setLista] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [form, setForm] = useState(VACIO);
  const [mensaje, setMensaje] = useState(null);

  const cargar = () => supabase.from('capacitaciones')
    .select('id, fecha, entidad, activo, solicitante_id, tipo_equipo_id, solicitantes(nombre, matricula), tipos_equipo(nombre)')
    .order('fecha', { ascending: false })
    .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));

  useEffect(() => {
    cargar();
    supabase.from('tipos_equipo').select('id, nombre, requiere_capacitacion, entidad_capacitacion').eq('activo', true)
      .order('requiere_capacitacion', { ascending: false }).order('nombre').then(({ data }) => setTipos(data ?? []));
    if (esAdmin) {
      supabase.from('solicitantes').select('id, nombre, matricula').eq('activo', true).order('nombre')
        .then(({ data }) => setPersonas(data ?? []));
    }
  }, []);

  const etiquetaPersona = (p) => `${p.nombre} — ${p.matricula}`;
  const elegida = personas.find((p) => etiquetaPersona(p) === form.persona);

  const visibles = useMemo(() => {
    const q = normalizar(buscar.trim());
    return (lista ?? []).filter((c) => !q || normalizar(`${c.solicitantes?.nombre} ${c.solicitantes?.matricula} ${c.tipos_equipo?.nombre} ${c.entidad}`).includes(q));
  }, [lista, buscar]);

  function elegirTipo(e) {
    const t = tipos.find((x) => x.id === e.target.value);
    setForm({ ...form, tipo: e.target.value, entidad: form.entidad || t?.entidad_capacitacion || '' });
  }

  async function guardar(e) {
    e.preventDefault();
    if (!elegida) return setMensaje({ tipo: 'error', texto: 'Elija a la persona de la lista (debe tener una autorización capturada).' });
    // Una persona tiene una sola capacitación por tipo: si ya existía, se actualiza y reactiva
    const { error } = await supabase.from('capacitaciones').upsert({
      solicitante_id: elegida.id, tipo_equipo_id: form.tipo, fecha: form.fecha, entidad: form.entidad.trim(), activo: true,
    }, { onConflict: 'solicitante_id,tipo_equipo_id' });
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    const t = tipos.find((x) => x.id === form.tipo);
    setMensaje({ tipo: 'ok', texto: `Capacitación de ${elegida.nombre} en «${t?.nombre}» registrada.` });
    setForm(VACIO); cargar();
  }

  async function alternar(c) {
    if (c.activo && !window.confirm(`¿Retirar la capacitación de ${c.solicitantes?.nombre} en «${c.tipos_equipo?.nombre}»? Ya no podrá usar esos equipos.`)) return;
    const { error } = await supabase.from('capacitaciones').update({ activo: !c.activo }).eq('id', c.id);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    cargar();
  }

  return (
    <>
      <h1>Equipos</h1>
      <PestanasEquipos />
      <Aviso mensaje={mensaje} />
      <div className={esAdmin ? 'dos-columnas dos-columnas-amplia' : 'una-columna'}>
        <section className="tarjeta">
          <p className="tenue nota" style={{ marginTop: 0 }}>Quién puede usar los equipos que requieren capacitación previa (Art. 13).
            Sin ella, la terminal no permite iniciar el uso.</p>
          <div className="filtros">
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar persona, tipo de equipo o quién la impartió" />
          </div>
          {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? (
            <p className="tenue">{lista.length === 0 ? 'No hay capacitaciones registradas.' : 'Ninguna coincide.'}</p>
          ) : (
            <div className="tabla-desplazable"><table>
              <thead><tr><th>Persona</th><th>Tipo de equipo</th><th>Fecha</th><th>Impartida por</th>{esAdmin && <th></th>}</tr></thead>
              <tbody>{visibles.map((c) => (
                <tr key={c.id} className={c.activo ? '' : 'inactivo'}>
                  <td><strong>{c.solicitantes?.nombre}</strong><br /><span className="tenue">{c.solicitantes?.matricula}</span></td>
                  <td>{c.tipos_equipo?.nombre}{!c.activo && <><br /><Etiqueta>Retirada</Etiqueta></>}</td>
                  <td className="sin-salto">{fecha(c.fecha)}</td>
                  <td>{c.entidad}</td>
                  {esAdmin && <td className="der"><button className="btn btn-chico" onClick={() => alternar(c)}>{c.activo ? 'Retirar' : 'Restablecer'}</button></td>}
                </tr>
              ))}</tbody>
            </table></div>
          )}
          {!esAdmin && <p className="tenue nota">Las capacitaciones las registra el Administrador.</p>}
        </section>

        {esAdmin && (
          <form className="tarjeta formulario" onSubmit={guardar}>
            <h2>Registrar capacitación</h2>
            <label>Persona
              <input list="personas-cap" value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })}
                placeholder="Escriba nombre o matrícula" required />
              <datalist id="personas-cap">{personas.map((p) => <option key={p.id} value={etiquetaPersona(p)} />)}</datalist>
            </label>
            <label>Tipo de equipo
              <select value={form.tipo} onChange={elegirTipo} required>
                <option value="">Elija…</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.requiere_capacitacion ? '' : ' (no la requiere)'}</option>)}
              </select>
            </label>
            <div className="fila-campos">
              <label>Fecha<input type="date" value={form.fecha} max={hoyISO()} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required /></label>
              <label>Impartida por
                <input list="entidades-cap" value={form.entidad} onChange={(e) => setForm({ ...form, entidad: e.target.value })} required />
                <datalist id="entidades-cap">
                  {['Responsable del laboratorio', 'Profesor responsable', 'Fabricante', 'Proveedor'].map((x) => <option key={x} value={x} />)}
                </datalist>
              </label>
            </div>
            <button className="btn btn-primario">Registrar</button>
          </form>
        )}
      </div>
    </>
  );
}

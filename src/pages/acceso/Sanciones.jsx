import { useEffect, useMemo, useState } from 'react';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha, hoyISO, normalizar } from '../../util';

// Art. 36 del Reglamento de Laboratorios, incisos a) a e)
export const TIPOS_SANCION = {
  amonestacion_verbal: 'a) Amonestación verbal',
  amonestacion_escrita: 'b) Amonestación por escrito',
  suspension_semana: 'c) Suspensión por una semana',
  suspension_mes: 'd) Suspensión por un mes',
  suspension_semestre: 'e) Suspensión por un semestre',
};
const esSuspension = (t) => t.startsWith('suspension');

function estado(s, hoy) {
  if (!s.activo) return { texto: 'Levantada', tono: 'gris' };
  if (!esSuspension(s.tipo)) return { texto: 'Registrada', tono: 'gris' };
  if (hoy < s.fecha_inicio) return { texto: 'Programada', tono: 'aviso' };
  if (hoy > s.fecha_fin) return { texto: 'Concluida', tono: 'gris' };
  return { texto: 'Vigente', tono: 'mal', nota: 'Bloquea acceso y préstamos' };
}

const VACIO = { persona: '', tipo: 'amonestacion_verbal', inicio: hoyISO(), fin: '', motivo: '' };

export default function Sanciones() {
  const { esAdmin } = useSesion();
  const [lista, setLista] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [form, setForm] = useState(VACIO);
  const [mensaje, setMensaje] = useState(null);
  const hoy = hoyISO();

  const cargar = () => supabase.from('sanciones')
    .select('id, tipo, fecha_inicio, fecha_fin, motivo, activo, solicitantes(nombre, matricula)')
    .order('creado_en', { ascending: false })
    .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));

  useEffect(() => {
    cargar();
    if (esAdmin) {
      supabase.from('solicitantes').select('id, nombre, matricula').eq('activo', true).order('nombre')
        .then(({ data }) => setPersonas(data ?? []));
    }
  }, []);

  const etiquetaPersona = (p) => `${p.nombre} — ${p.matricula}`;
  const elegida = personas.find((p) => etiquetaPersona(p) === form.persona);

  const visibles = useMemo(() => {
    const q = normalizar(buscar.trim());
    return (lista ?? []).filter((s) => !q || normalizar(`${s.solicitantes.nombre} ${s.solicitantes.matricula} ${s.motivo}`).includes(q));
  }, [lista, buscar]);

  async function guardar(e) {
    e.preventDefault();
    if (!elegida) return setMensaje({ tipo: 'error', texto: 'Elija a la persona de la lista.' });
    const { error } = await supabase.from('sanciones').insert({
      solicitante_id: elegida.id, tipo: form.tipo, fecha_inicio: form.inicio,
      fecha_fin: esSuspension(form.tipo) && form.fin ? form.fin : null, motivo: form.motivo,
    });
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setMensaje({ tipo: 'ok', texto: `Sanción registrada a ${elegida.nombre}.` });
    setForm(VACIO); cargar();
  }

  async function levantar(s) {
    if (!window.confirm(`¿Levantar la sanción de ${s.solicitantes.nombre}? Dejará de bloquear su acceso y préstamos.`)) return;
    const { error } = await supabase.from('sanciones').update({ activo: false }).eq('id', s.id);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setMensaje({ tipo: 'ok', texto: 'Sanción levantada.' });
    cargar();
  }

  return (
    <>
      <Aviso mensaje={mensaje} />
      <div className={esAdmin ? 'dos-columnas dos-columnas-amplia' : 'una-columna'}>
        <section className="tarjeta">
          <div className="filtros">
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, matrícula o motivo" />
          </div>
          {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? (
            <p className="tenue">{lista.length === 0 ? 'No hay sanciones registradas.' : 'Ninguna sanción coincide.'}</p>
          ) : (
            <div className="tabla-desplazable">
              <table>
                <thead><tr><th>Persona</th><th>Sanción</th><th>Periodo</th><th>Estado</th>{esAdmin && <th></th>}</tr></thead>
                <tbody>
                  {visibles.map((s) => {
                    const est = estado(s, hoy);
                    return (
                      <tr key={s.id} className={s.activo ? '' : 'inactivo'}>
                        <td><strong>{s.solicitantes.nombre}</strong><br /><span className="tenue">{s.solicitantes.matricula}</span></td>
                        <td>{TIPOS_SANCION[s.tipo]}<br /><span className="tenue">{s.motivo}</span></td>
                        <td className="sin-salto">{fecha(s.fecha_inicio)}{s.fecha_fin && <><br />{fecha(s.fecha_fin)}</>}</td>
                        <td><Etiqueta tono={est.tono}>{est.texto}</Etiqueta>{est.nota && <><br /><span className="tenue chico">{est.nota}</span></>}</td>
                        {esAdmin && (
                          <td className="der">{s.activo && esSuspension(s.tipo) && hoy <= s.fecha_fin && (
                            <button className="btn btn-chico" onClick={() => levantar(s)}>Levantar</button>
                          )}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!esAdmin && <p className="tenue nota">Las sanciones las aplica el Administrador.</p>}
        </section>

        {esAdmin && (
          <form className="tarjeta formulario" onSubmit={guardar}>
            <h2>Aplicar sanción</h2>
            <label>Persona
              <input list="personas" value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })}
                placeholder="Escriba nombre o matrícula" required />
              <datalist id="personas">{personas.map((p) => <option key={p.id} value={etiquetaPersona(p)} />)}</datalist>
            </label>
            <label>Tipo (Art. 36)
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {Object.entries(TIPOS_SANCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div className="fila-campos">
              <label>Inicia<input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} required /></label>
              {esSuspension(form.tipo) && (
                <label>Termina<input type="date" value={form.fin} min={form.inicio}
                  onChange={(e) => setForm({ ...form, fin: e.target.value })} /></label>
              )}
            </div>
            {esSuspension(form.tipo) && <p className="tenue nota">Si deja vacía la fecha final, se calcula según el tipo.
              Mientras esté vigente, la persona no puede entrar ni recibir préstamos.</p>}
            <label>Motivo
              <textarea rows={3} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} required />
            </label>
            <button className="btn btn-primario">Registrar sanción</button>
          </form>
        )}
      </div>
    </>
  );
}

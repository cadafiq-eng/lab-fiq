import { useEffect, useMemo, useState } from 'react';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha, hoyISO, normalizar } from '../../util';

const VACIO = { id: null, nombre: '', matricula: '', correo: '', proyecto: '', inicio: hoyISO(), fin: '' };

const FILTROS = {
  vigentes: 'Vigentes', proximas: 'Próximas', vencidas: 'Vencidas', revocadas: 'Revocadas', todas: 'Todas',
};

function estado(a, hoy) {
  if (!a.activo) return { clave: 'revocadas', texto: 'Revocada', tono: 'gris' };
  if (hoy < a.fecha_inicio) return { clave: 'proximas', texto: 'Próxima', tono: 'aviso' };
  if (hoy > a.fecha_fin) return { clave: 'vencidas', texto: 'Vencida', tono: 'gris' };
  const dias = Math.round((new Date(a.fecha_fin) - new Date(hoy)) / 86400000);
  return { clave: 'vigentes', texto: dias <= 7 ? `Vigente · vence en ${dias} d` : 'Vigente', tono: dias <= 7 ? 'aviso' : 'bien' };
}

export default function Autorizaciones() {
  const { esAdmin } = useSesion();
  const [lista, setLista] = useState(null);
  const [filtro, setFiltro] = useState('vigentes');
  const [buscar, setBuscar] = useState('');
  const [form, setForm] = useState(VACIO);
  const [existente, setExistente] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const hoy = hoyISO();

  const cargar = () => supabase.from('autorizaciones_acceso')
    .select('id, proyecto, fecha_inicio, fecha_fin, activo, solicitante_id, solicitantes(nombre, matricula, correo)')
    .order('fecha_fin', { ascending: false })
    .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  useEffect(() => { cargar(); }, []);

  const visibles = useMemo(() => {
    if (!lista) return [];
    const q = normalizar(buscar.trim());
    return lista
      .map((a) => ({ ...a, est: estado(a, hoy) }))
      .filter((a) => filtro === 'todas' || a.est.clave === filtro)
      .filter((a) => !q || normalizar([a.solicitantes.nombre, a.solicitantes.matricula,
        a.solicitantes.correo, a.proyecto].join(' ')).includes(q));
  }, [lista, filtro, buscar, hoy]);

  const campo = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Al escribir una matrícula ya registrada se precargan su nombre y correo
  async function revisarMatricula() {
    const mat = form.matricula.replace(/\s/g, '').toUpperCase();
    if (!mat || form.id) { setExistente(null); return; }
    const { data } = await supabase.from('solicitantes').select('nombre, correo').eq('matricula', mat).maybeSingle();
    setExistente(data);
    if (data) setForm((f) => ({ ...f, matricula: mat, nombre: f.nombre || data.nombre, correo: f.correo || data.correo }));
  }

  async function guardar(e) {
    e.preventDefault();
    setOcupado(true); setMensaje(null);
    const { error } = await supabase.rpc('guardar_autorizacion', {
      p_nombre: form.nombre, p_matricula: form.matricula, p_correo: form.correo, p_proyecto: form.proyecto,
      p_inicio: form.inicio, p_fin: form.fin, p_id: form.id,
    });
    setOcupado(false);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setMensaje({ tipo: 'ok', texto: form.id ? 'Autorización actualizada.' : `Acceso de ${form.nombre.trim()} autorizado.` });
    setForm(VACIO); setExistente(null); cargar();
  }

  function editar(a) {
    setExistente(null);
    setForm({ id: a.id, nombre: a.solicitantes.nombre, matricula: a.solicitantes.matricula,
      correo: a.solicitantes.correo, proyecto: a.proyecto, inicio: a.fecha_inicio, fin: a.fecha_fin });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function alternar(a) {
    const accion = a.activo ? 'revocar' : 'reactivar';
    if (!window.confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} la autorización de ${a.solicitantes.nombre} (${a.proyecto})?`)) return;
    const { error } = await supabase.from('autorizaciones_acceso').update({ activo: !a.activo }).eq('id', a.id);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setMensaje({ tipo: 'ok', texto: a.activo ? 'Autorización revocada.' : 'Autorización reactivada.' });
    cargar();
  }

  return (
    <>
      <Aviso mensaje={mensaje} />
      <div className={esAdmin ? 'dos-columnas dos-columnas-amplia' : 'una-columna'}>
        <section className="tarjeta">
          <div className="filtros">
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, matrícula, correo o proyecto" />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              {Object.entries(FILTROS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? (
            <p className="tenue">{lista.length === 0 ? 'Aún no hay autorizaciones capturadas.' : 'Ninguna autorización coincide.'}</p>
          ) : (
            <div className="tabla-desplazable">
              <table>
                <thead><tr><th>Persona</th><th>Proyecto</th><th>Periodo</th><th>Estado</th>{esAdmin && <th></th>}</tr></thead>
                <tbody>
                  {visibles.map((a) => (
                    <tr key={a.id} className={a.activo ? '' : 'inactivo'}>
                      <td><strong>{a.solicitantes.nombre}</strong><br />
                        <span className="tenue">{a.solicitantes.matricula} · {a.solicitantes.correo}</span></td>
                      <td>{a.proyecto}</td>
                      <td className="sin-salto">{fecha(a.fecha_inicio)}<br />{fecha(a.fecha_fin)}</td>
                      <td><Etiqueta tono={a.est.tono}>{a.est.texto}</Etiqueta></td>
                      {esAdmin && (
                        <td className="der acciones">
                          <button className="btn btn-chico" onClick={() => editar(a)}>Editar</button>
                          <button className="btn btn-chico" onClick={() => alternar(a)}>{a.activo ? 'Revocar' : 'Reactivar'}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!esAdmin && <p className="tenue nota">Las autorizaciones las captura el Administrador a partir del correo de solicitud.</p>}
        </section>

        {esAdmin && (
          <form className="tarjeta formulario" onSubmit={guardar}>
            <h2>{form.id ? 'Editar autorización' : 'Nueva autorización'}</h2>
            <p className="tenue nota">Datos del correo de solicitud de acceso.</p>
            <label>Matrícula
              <input value={form.matricula} onChange={campo('matricula')} onBlur={revisarMatricula} required />
            </label>
            {existente && <p className="aviso aviso-ok nota">Persona ya registrada: se agregará una nueva autorización a su nombre.</p>}
            <label>Nombre completo
              <input value={form.nombre} onChange={campo('nombre')} required />
            </label>
            <label>Correo electrónico
              <input type="email" value={form.correo} onChange={campo('correo')} required />
            </label>
            <label>Proyecto a realizar
              <input value={form.proyecto} onChange={campo('proyecto')} placeholder="Ej. Tesis de licenciatura, práctica de Bioquímica…" required />
            </label>
            <div className="fila-campos">
              <label>Desde<input type="date" value={form.inicio} onChange={campo('inicio')} required /></label>
              <label>Hasta<input type="date" value={form.fin} min={form.inicio} onChange={campo('fin')} required /></label>
            </div>
            <div className="fila-botones">
              <button className="btn btn-primario" disabled={ocupado}>{form.id ? 'Guardar cambios' : 'Autorizar acceso'}</button>
              {form.id && <button type="button" className="btn" onClick={() => setForm(VACIO)}>Cancelar</button>}
            </div>
          </form>
        )}
      </div>
    </>
  );
}

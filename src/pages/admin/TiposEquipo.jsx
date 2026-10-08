import { useEffect, useState } from 'react';
import { supabase, mensajeError } from '../../supabase';

const VACIO = { id: null, nombre: '', requiere_capacitacion: false, entidad_capacitacion: '' };
const ENTIDADES = ['Responsable del laboratorio', 'Profesor responsable', 'Fabricante', 'Proveedor'];

export default function TiposEquipo() {
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [mensaje, setMensaje] = useState(null);

  const cargar = () => supabase.from('tipos_equipo').select('*').order('nombre')
    .then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  useEffect(() => { cargar(); }, []);

  async function guardar(e) {
    e.preventDefault();
    const fila = {
      nombre: form.nombre.trim(),
      requiere_capacitacion: form.requiere_capacitacion,
      entidad_capacitacion: form.requiere_capacitacion ? (form.entidad_capacitacion || null) : null,
    };
    const { error } = form.id
      ? await supabase.from('tipos_equipo').update(fila).eq('id', form.id)
      : await supabase.from('tipos_equipo').insert(fila);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setMensaje({ tipo: 'ok', texto: form.id ? 'Tipo actualizado.' : 'Tipo agregado.' });
    setForm(VACIO); cargar();
  }

  async function alternarActivo(t) {
    const { error } = await supabase.from('tipos_equipo').update({ activo: !t.activo }).eq('id', t.id);
    if (error) setMensaje({ tipo: 'error', texto: mensajeError(error) }); else cargar();
  }

  return (
    <>
      <h1>Tipos de equipo</h1>
      <p className="tenue">Al dar de alta un equipo, su tipo indica si requiere capacitación previa y quién la imparte (RE-05).</p>
      {mensaje && <p className={'aviso ' + (mensaje.tipo === 'ok' ? 'aviso-ok' : 'aviso-error')}>{mensaje.texto}</p>}
      <div className="dos-columnas dos-columnas-amplia">
        <section className="tarjeta">
          {!lista ? <p className="tenue">Cargando…</p> : lista.length === 0 ? (
            <p className="tenue">Aún no hay tipos registrados. Agregue el primero con el formulario.</p>
          ) : (
            <table>
              <thead><tr><th>Tipo</th><th>Capacitación previa</th><th></th></tr></thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id} className={t.activo ? '' : 'inactivo'}>
                    <td><strong>{t.nombre}</strong></td>
                    <td>{t.requiere_capacitacion
                      ? <span className="etiqueta etq-aviso">Sí · {t.entidad_capacitacion || 'sin entidad'}</span>
                      : <span className="tenue">No</span>}</td>
                    <td className="der acciones">
                      <button className="btn btn-chico" onClick={() => setForm({ ...t, entidad_capacitacion: t.entidad_capacitacion ?? '' })}>Editar</button>
                      <button className="btn btn-chico" onClick={() => alternarActivo(t)}>{t.activo ? 'Desactivar' : 'Reactivar'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <form className="tarjeta formulario" onSubmit={guardar}>
          <h2>{form.id ? 'Editar tipo' : 'Nuevo tipo'}</h2>
          <label>Nombre
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej. Espectrofotómetro UV-Vis" required />
          </label>
          <label className="casilla">
            <input type="checkbox" checked={form.requiere_capacitacion}
              onChange={(e) => setForm({ ...form, requiere_capacitacion: e.target.checked })} />
            Requiere capacitación previa (Art. 13)
          </label>
          {form.requiere_capacitacion && (
            <label>Entidad que imparte la capacitación
              <input list="entidades" value={form.entidad_capacitacion}
                onChange={(e) => setForm({ ...form, entidad_capacitacion: e.target.value })} />
              <datalist id="entidades">{ENTIDADES.map((x) => <option key={x} value={x} />)}</datalist>
            </label>
          )}
          <div className="fila-botones">
            <button className="btn btn-primario">{form.id ? 'Guardar cambios' : 'Agregar'}</button>
            {form.id && <button type="button" className="btn" onClick={() => setForm(VACIO)}>Cancelar</button>}
          </div>
        </form>
      </div>
    </>
  );
}

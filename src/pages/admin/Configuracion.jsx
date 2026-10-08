import { useEffect, useState } from 'react';
import { supabase, mensajeError } from '../../supabase';

export default function Configuracion() {
  const [c, setC] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    supabase.from('configuracion').select('*').eq('id', 1).single().then(({ data }) => setC(data));
  }, []);

  async function guardar(e) {
    e.preventDefault();
    const { id, ...resto } = c;
    const { error } = await supabase.from('configuracion').update(resto).eq('id', 1);
    setMensaje(error ? { tipo: 'error', texto: mensajeError(error) } : { tipo: 'ok', texto: 'Configuración guardada.' });
  }

  if (!c) return <p className="tenue">Cargando…</p>;
  const campo = (k, v) => setC({ ...c, [k]: v });

  return (
    <>
      <h1>Configuración</h1>
      <p className="tenue">Parámetros que aplican las reglas del sistema.</p>
      {mensaje && <p className={'aviso ' + (mensaje.tipo === 'ok' ? 'aviso-ok' : 'aviso-error')}>{mensaje.texto}</p>}
      <form className="tarjeta formulario" style={{ maxWidth: 520 }} onSubmit={guardar}>
        <div className="fila-campos">
          <label>Apertura
            <input type="time" value={c.hora_apertura.slice(0, 5)} onChange={(e) => campo('hora_apertura', e.target.value)} />
          </label>
          <label>Cierre
            <input type="time" value={c.hora_cierre.slice(0, 5)} onChange={(e) => campo('hora_cierre', e.target.value)} />
          </label>
        </div>
        <label>Días máximos de préstamo sin autorización (Art. 17)
          <input type="number" min="1" value={c.dias_prestamo_max} onChange={(e) => campo('dias_prestamo_max', +e.target.value)} />
        </label>
        <label>Días de anticipación para alertar mantenimientos
          <input type="number" min="1" value={c.dias_alerta_mantenimiento} onChange={(e) => campo('dias_alerta_mantenimiento', +e.target.value)} />
        </label>
        <label>Letras mínimas para buscar en la terminal
          <input type="number" min="2" value={c.min_letras_busqueda} onChange={(e) => campo('min_letras_busqueda', +e.target.value)} />
        </label>
        <button className="btn btn-primario">Guardar</button>
      </form>
    </>
  );
}

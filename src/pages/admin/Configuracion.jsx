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
    const lista = (t) => String(t ?? '').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if ('mantenimiento_para' in resto) {
      resto.mantenimiento_para = lista(resto.mantenimiento_para_texto ?? resto.mantenimiento_para.join(','));
      resto.mantenimiento_cc = lista(resto.mantenimiento_cc_texto ?? resto.mantenimiento_cc.join(','));
      resto.servicios_para = lista(resto.servicios_para_texto ?? resto.servicios_para.join(','));
      resto.servicios_cc = lista(resto.servicios_cc_texto ?? resto.servicios_cc.join(','));
      for (const k of ['mantenimiento_para', 'mantenimiento_cc', 'servicios_para', 'servicios_cc']) delete resto[`${k}_texto`];
      if (!resto.servicios_para.length) return setMensaje({ tipo: 'error', texto: 'Indique al menos un destinatario de las solicitudes de servicios.' });
      const malo = [...resto.mantenimiento_para, ...resto.mantenimiento_cc, ...resto.servicios_para, ...resto.servicios_cc].find((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
      if (malo) return setMensaje({ tipo: 'error', texto: `Correo no válido: ${malo}` });
      if (!resto.mantenimiento_para.length) return setMensaje({ tipo: 'error', texto: 'Indique al menos un destinatario de las solicitudes de mantenimiento.' });
    }
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
        {'mantenimiento_para' in c && (
          <fieldset className="persona-solicitud">
            <legend>Solicitudes de mantenimiento por correo</legend>
            <p className="tenue nota"><strong>Equipos</strong></p>
            <label>Enviar a (separe con comas)
              <textarea rows={2} value={c.mantenimiento_para_texto ?? c.mantenimiento_para.join(', ')} onChange={(e) => campo('mantenimiento_para_texto', e.target.value)} />
            </label>
            <label>Con copia a
              <textarea rows={2} value={c.mantenimiento_cc_texto ?? c.mantenimiento_cc.join(', ')} onChange={(e) => campo('mantenimiento_cc_texto', e.target.value)} />
            </label>
            <p className="tenue nota"><strong>Servicios e instalaciones</strong></p>
            <label>Enviar a (separe con comas)
              <textarea rows={2} value={c.servicios_para_texto ?? c.servicios_para.join(', ')} onChange={(e) => campo('servicios_para_texto', e.target.value)} />
            </label>
            <label>Con copia a
              <textarea rows={2} value={c.servicios_cc_texto ?? c.servicios_cc.join(', ')} onChange={(e) => campo('servicios_cc_texto', e.target.value)} />
            </label>
            <div className="fila-campos">
              <label>Correo remitente<input type="email" value={c.correo_remitente} onChange={(e) => campo('correo_remitente', e.target.value)} /></label>
              <label>Nombre del remitente<input value={c.nombre_remitente} onChange={(e) => campo('nombre_remitente', e.target.value)} /></label>
            </div>
            <p className="tenue nota">El remitente debe estar confirmado en Postmark (Sender Signatures).</p>
          </fieldset>
        )}
        <button className="btn btn-primario">Guardar</button>
      </form>
    </>
  );
}

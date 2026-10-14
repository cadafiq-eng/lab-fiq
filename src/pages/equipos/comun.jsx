import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Etiqueta, Modal } from '../../componentes';
import { fecha, hoyISO } from '../../util';

export const ESTADOS = {
  disponible: { texto: 'Disponible', tono: 'bien' },
  en_uso: { texto: 'En uso', tono: 'aviso' },
  prestado: { texto: 'Prestado', tono: 'aviso' },
  en_mantenimiento: { texto: 'En mantenimiento', tono: 'aviso' },
  fuera_de_servicio: { texto: 'Fuera de servicio', tono: 'mal' },
  baja: { texto: 'Baja', tono: 'gris' },
};

export function EstadoEquipo({ estado }) {
  const e = ESTADOS[estado] ?? { texto: estado, tono: 'gris' };
  return <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>;
}

// Días de anticipación para avisar (Configuración)
export function useDiasAlerta() {
  const [dias, setDias] = useState(15);
  useEffect(() => {
    supabase.from('configuracion').select('dias_alerta_mantenimiento').eq('id', 1).maybeSingle()
      .then(({ data }) => data && setDias(data.dias_alerta_mantenimiento));
  }, []);
  return dias;
}

export function situacionMantenimiento(proximo, diasAlerta, hoy = hoyISO()) {
  if (!proximo) return { clave: 'sin', texto: 'Sin programar', tono: 'gris' };
  if (proximo < hoy) return { clave: 'vencido', texto: `Vencido · ${fecha(proximo)}`, tono: 'mal' };
  if (proximo <= hoyISO(diasAlerta)) return { clave: 'proximo', texto: `Próximo · ${fecha(proximo)}`, tono: 'aviso' };
  return { clave: 'ok', texto: fecha(proximo), tono: null };
}

export function Mantenimiento({ proximo, diasAlerta }) {
  const s = situacionMantenimiento(proximo, diasAlerta);
  return s.tono ? <Etiqueta tono={s.tono}>{s.texto}</Etiqueta> : <span>{s.texto}</span>;
}

export function PestanasEquipos() {
  return (
    <nav className="pestanas">
      <NavLink to="/equipos/catalogo">Catálogo</NavLink>
      <NavLink to="/equipos/mantenimientos">Mantenimientos</NavLink>
      <NavLink to="/equipos/capacitaciones">Capacitaciones</NavLink>
      <NavLink to="/equipos/uso">Bitácora de uso</NavLink>
    </nav>
  );
}

export const TIPOS_MANT = { preventivo: 'Preventivo', correctivo: 'Correctivo' };

// Registro de un mantenimiento (preventivo o correctivo)
export function ModalMantenimiento({ equipo, alCerrar, alGuardar }) {
  const [f, setF] = useState({ tipo: 'preventivo', fecha: hoyISO(), proveedor: '', descripcion: '', costo: '', deja_operativo: true });
  const [error, setError] = useState('');
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function guardar(e) {
    e.preventDefault();
    const { error } = await supabase.from('mantenimientos').insert({
      equipo_id: equipo.id, tipo: f.tipo, fecha: f.fecha, proveedor: f.proveedor.trim() || null,
      descripcion: f.descripcion, costo: f.costo === '' ? null : Number(f.costo), deja_operativo: f.deja_operativo,
    });
    if (error) setError(mensajeError(error)); else alGuardar('Mantenimiento registrado.');
  }

  return (
    <Modal titulo="Registrar mantenimiento" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="tenue">{equipo.codigo} · {equipo.nombre}</p>
        <div className="fila-campos">
          <label>Tipo
            <select value={f.tipo} onChange={campo('tipo')}>
              {Object.entries(TIPOS_MANT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Fecha<input type="date" value={f.fecha} max={hoyISO()} onChange={campo('fecha')} required /></label>
        </div>
        <p className="tenue nota">{f.tipo === 'preventivo'
          ? 'El preventivo actualiza el último mantenimiento y recalcula el próximo según la periodicidad del equipo.'
          : 'El correctivo (reparación) no modifica el calendario del mantenimiento preventivo.'}</p>
        <label>Descripción del trabajo realizado
          <textarea rows={3} value={f.descripcion} onChange={campo('descripcion')} required />
        </label>
        <div className="fila-campos">
          <label>Proveedor o responsable<input value={f.proveedor} onChange={campo('proveedor')} /></label>
          <label>Costo (MXN)<input type="number" min="0" step="0.01" value={f.costo} onChange={campo('costo')} /></label>
        </div>
        <label className="casilla">
          <input type="checkbox" checked={f.deja_operativo} onChange={campo('deja_operativo')} />
          El equipo quedó operativo
        </label>
        {!f.deja_operativo && <p className="aviso aviso-error nota">El equipo quedará «fuera de servicio» hasta registrar su reparación.</p>}
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario">Registrar</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

// Cambio manual de estado, con motivo. Las reglas finas las aplica la base.
export function ModalEstado({ equipo, alCerrar, alGuardar }) {
  const { esAdmin } = useSesion();
  const opciones = Object.keys(ESTADOS).filter((k) => {
    if (k === equipo.estado || k === 'en_uso' || k === 'prestado') return false;
    if (k === 'baja' || equipo.estado === 'baja') return esAdmin;
    if (k === 'disponible' && ['en_mantenimiento', 'fuera_de_servicio'].includes(equipo.estado)) return esAdmin;
    return true;
  });
  const [estado, setEstado] = useState(opciones[0] ?? '');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  async function guardar(e) {
    e.preventDefault();
    const { data, error } = await supabase.rpc('cambiar_estado_equipo', { p_equipo: equipo.id, p_estado: estado, p_motivo: motivo });
    if (error) setError(mensajeError(error)); else alGuardar(data);
  }

  return (
    <Modal titulo="Cambiar estado" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="tenue">{equipo.codigo} · {equipo.nombre} · actualmente <EstadoEquipo estado={equipo.estado} /></p>
        {['en_uso', 'prestado'].includes(equipo.estado) ? (
          <p className="aviso aviso-error">{equipo.estado === 'en_uso'
            ? 'El equipo está en uso. Primero termine el uso (en la ficha o en la terminal).'
            : 'El equipo está prestado. Primero registre la devolución.'}</p>
        ) : (
          <>
            <label>Nuevo estado
              <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                {opciones.map((k) => <option key={k} value={k}>{ESTADOS[k].texto}</option>)}
              </select>
            </label>
            {['en_mantenimiento', 'fuera_de_servicio'].includes(equipo.estado) && !esAdmin && (
              <p className="tenue nota">Para que vuelva a «disponible», registre el mantenimiento o la reparación realizada.</p>
            )}
            {estado === 'baja' && <p className="aviso aviso-error nota">Un equipo dado de baja deja de aparecer en la terminal y no puede usarse ni prestarse.</p>}
            <label>Motivo
              <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} required
                placeholder="Ej. Se envía a calibración externa" />
            </label>
          </>
        )}
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          {!['en_uso', 'prestado'].includes(equipo.estado) && opciones.length > 0 &&
            <button className="btn btn-primario">Cambiar estado</button>}
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

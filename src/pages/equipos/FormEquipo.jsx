import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso } from '../../componentes';
import { fecha } from '../../util';
import { ESTADOS, EstadoEquipo } from './comun';

const VACIO = {
  codigo: '', nombre: '', tipo_equipo_id: '', marca: '', modelo: '', numero_serie: '', ubicacion: '',
  responsable: '', voltaje: '', requiere_capacitacion: false, periodicidad_mantenimiento_dias: '',
  ultimo_mantenimiento: '', proximo_mantenimiento: '', manual_url: '', foto_url: '', estado: 'disponible',
};
const OPCIONALES = ['marca', 'modelo', 'numero_serie', 'ubicacion', 'responsable', 'voltaje',
  'ultimo_mantenimiento', 'proximo_mantenimiento', 'manual_url', 'foto_url'];

function sumarDias(iso, dias) {
  const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + Number(dias));
  return d.toISOString().slice(0, 10);
}

export default function FormEquipo() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [f, setF] = useState(id ? null : VACIO);
  const [tipos, setTipos] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    supabase.from('tipos_equipo').select('*').order('nombre').then(({ data }) => setTipos(data ?? []));
    if (id) {
      supabase.from('equipos').select('*').eq('id', id).single().then(({ data, error }) => {
        if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
        const g = { ...VACIO };
        Object.keys(VACIO).forEach((k) => { g[k] = data[k] ?? VACIO[k]; });
        g.periodicidad_mantenimiento_dias = data.periodicidad_mantenimiento_dias ?? '';
        setF(g);
      });
    }
  }, [id]);

  if (!f) return <><Aviso mensaje={mensaje} /><p className="tenue">Cargando…</p></>;

  const tipoSel = tipos.find((t) => t.id === f.tipo_equipo_id);
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const calculado = f.ultimo_mantenimiento && f.periodicidad_mantenimiento_dias
    ? sumarDias(f.ultimo_mantenimiento, f.periodicidad_mantenimiento_dias) : null;

  function elegirTipo(e) {
    const t = tipos.find((x) => x.id === e.target.value);
    setF({ ...f, tipo_equipo_id: e.target.value, requiere_capacitacion: t?.requiere_capacitacion ?? false });
  }

  async function guardar(e) {
    e.preventDefault();
    setOcupado(true); setMensaje(null);
    const fila = { ...f };
    OPCIONALES.forEach((k) => { if (typeof fila[k] === 'string') fila[k] = fila[k].trim() || null; });
    fila.periodicidad_mantenimiento_dias = f.periodicidad_mantenimiento_dias === '' ? null : Number(f.periodicidad_mantenimiento_dias);
    // Con periodicidad y último mantenimiento, el próximo lo calcula la base
    if (calculado) fila.proximo_mantenimiento = calculado;
    if (id) delete fila.estado; // el estado se cambia desde la ficha
    const r = id
      ? await supabase.from('equipos').update(fila).eq('id', id).select('id').single()
      : await supabase.from('equipos').insert(fila).select('id').single();
    setOcupado(false);
    if (r.error) return setMensaje({ tipo: 'error', texto: mensajeError(r.error) });
    navegar(`/equipos/ficha/${r.data.id}`);
  }

  return (
    <>
      <p><Link to={id ? `/equipos/ficha/${id}` : '/equipos/catalogo'} className="volver">← {id ? 'Volver a la ficha' : 'Volver al catálogo'}</Link></p>
      <h1>{id ? 'Editar equipo' : 'Nuevo equipo'}</h1>
      <Aviso mensaje={mensaje} />
      <form className="formulario formulario-ancho" onSubmit={guardar}>
        <section className="tarjeta formulario">
          <h2>Identificación</h2>
          <div className="fila-campos">
            <label>Código único
              <input value={f.codigo} onChange={campo('codigo')} placeholder="Ej. número de inventario UADY" required />
            </label>
            <label>Nombre
              <input value={f.nombre} onChange={campo('nombre')} placeholder="Ej. Espectrofotómetro UV-Vis" required />
            </label>
          </div>
          <label>Tipo de equipo
            <select value={f.tipo_equipo_id} onChange={elegirTipo} required>
              <option value="">Elija un tipo…</option>
              {tipos.filter((t) => t.activo || t.id === f.tipo_equipo_id).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </label>
          {tipos.length === 0 && <p className="aviso aviso-error nota">No hay tipos de equipo. El Administrador los registra en Administración → Tipos de equipo.</p>}
          {tipoSel && (
            <p className={'aviso nota ' + (tipoSel.requiere_capacitacion ? 'aviso-alerta' : 'aviso-ok')}>
              {tipoSel.requiere_capacitacion
                ? `Este tipo requiere capacitación previa${tipoSel.entidad_capacitacion ? `, impartida por: ${tipoSel.entidad_capacitacion}` : ''}.`
                : 'Este tipo no requiere capacitación previa.'}
            </p>
          )}
          <label className="casilla">
            <input type="checkbox" checked={f.requiere_capacitacion} onChange={campo('requiere_capacitacion')} />
            Este equipo requiere capacitación previa para usarse
          </label>
          <div className="fila-campos fila-3">
            <label>Marca<input value={f.marca} onChange={campo('marca')} /></label>
            <label>Modelo<input value={f.modelo} onChange={campo('modelo')} /></label>
            <label>Número de serie<input value={f.numero_serie} onChange={campo('numero_serie')} /></label>
          </div>
          <div className="fila-campos fila-3">
            <label>Ubicación<input value={f.ubicacion} onChange={campo('ubicacion')} placeholder="Ej. Mesa 2" /></label>
            <label>Responsable<input value={f.responsable} onChange={campo('responsable')} /></label>
            <label>Voltaje
              <select value={f.voltaje ?? ''} onChange={campo('voltaje')}>
                <option value="">—</option><option>110 V</option><option>220 V</option><option value="otro">Otro</option>
              </select>
            </label>
          </div>
        </section>

        <section className="tarjeta formulario">
          <h2>Mantenimiento preventivo</h2>
          <div className="fila-campos fila-3">
            <label>Cada cuántos días
              <input type="number" min="1" value={f.periodicidad_mantenimiento_dias} onChange={campo('periodicidad_mantenimiento_dias')} placeholder="Ej. 180" />
            </label>
            <label>Último realizado
              <input type="date" value={f.ultimo_mantenimiento ?? ''} onChange={campo('ultimo_mantenimiento')} />
            </label>
            <label>Próximo programado
              <input type="date" value={calculado ?? f.proximo_mantenimiento ?? ''} onChange={campo('proximo_mantenimiento')} disabled={Boolean(calculado)} />
            </label>
          </div>
          <p className="tenue nota">{calculado
            ? `El próximo se calcula solo: ${fecha(calculado)}. Después se actualiza cada vez que se registra un preventivo.`
            : 'Indique la periodicidad y el último realizado para calcular el próximo, o capture la fecha programada directamente.'}
            {' '}Con el mantenimiento vencido, el equipo no puede usarse ni prestarse.</p>
        </section>

        <section className="tarjeta formulario">
          <h2>Documentos</h2>
          <div className="fila-campos">
            <label>Enlace al manual<input type="url" value={f.manual_url ?? ''} onChange={campo('manual_url')} placeholder="https://drive.google.com/…" /></label>
            <label>Enlace a la foto<input type="url" value={f.foto_url ?? ''} onChange={campo('foto_url')} placeholder="https://…" /></label>
          </div>
          {id ? (
            <p className="tenue nota">Estado actual: <EstadoEquipo estado={f.estado} /> · se cambia desde la ficha del equipo.</p>
          ) : (
            <label>Estado inicial
              <select value={f.estado} onChange={campo('estado')}>
                {['disponible', 'en_mantenimiento', 'fuera_de_servicio'].map((k) => <option key={k} value={k}>{ESTADOS[k].texto}</option>)}
              </select>
            </label>
          )}
        </section>

        <div className="fila-botones">
          <button className="btn btn-primario" disabled={ocupado}>{id ? 'Guardar cambios' : 'Registrar equipo'}</button>
          <Link className="btn" to={id ? `/equipos/ficha/${id}` : '/equipos/catalogo'}>Cancelar</Link>
        </div>
      </form>
    </>
  );
}

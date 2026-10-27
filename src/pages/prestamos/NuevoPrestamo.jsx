import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Aviso, Etiqueta, Modal } from '../../componentes';
import { fecha, hoyISO } from '../../util';
import { PestanasPrestamos, etiquetaPersona, useConfiguracion } from './comun';

export default function NuevoPrestamo() {
  const navegar = useNavigate();
  const { esAdmin } = useSesion();
  const config = useConfiguracion();
  const diasMax = config.dias_prestamo_max ?? 7;
  const hoy = hoyISO();

  const [personas, setPersonas] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [articulos, setArticulos] = useState([]);
  const [textoPersona, setTextoPersona] = useState('');
  const [tipo, setTipo] = useState('interno');
  const [limite, setLimite] = useState(hoyISO(7));
  const [motivo, setMotivo] = useState('');
  const [vobo, setVobo] = useState('');
  const [autorizo, setAutorizo] = useState(false);
  const [renglones, setRenglones] = useState([]);
  const [equipoSel, setEquipoSel] = useState('');
  const [articuloSel, setArticuloSel] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [mensaje, setMensaje] = useState(null);
  const [externoAbierto, setExternoAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function cargarPersonas() {
    const { data } = await supabase.from('solicitantes')
      .select('id, nombre, matricula, externo, adscripcion, autorizaciones_acceso(fecha_inicio, fecha_fin, activo), sanciones(tipo, fecha_inicio, fecha_fin, activo)')
      .eq('activo', true).order('nombre');
    setPersonas((data ?? []).map((p) => ({
      ...p,
      vigente: p.autorizaciones_acceso.some((a) => a.activo && a.fecha_inicio <= hoy && a.fecha_fin >= hoy),
      suspendida: p.sanciones.some((s) => s.activo && s.tipo.startsWith('suspension') && s.fecha_inicio <= hoy && s.fecha_fin >= hoy),
    })).filter((p) => p.externo || p.vigente));
  }

  useEffect(() => {
    cargarPersonas();
    supabase.from('equipos').select('id, codigo, nombre, proximo_mantenimiento').eq('estado', 'disponible').order('codigo')
      .then(({ data }) => setEquipos(data ?? []));
    supabase.from('articulos').select('id, nombre, codigo, unidad, existencia').eq('tipo', 'retornable').eq('activo', true)
      .gt('existencia', 0).order('nombre').then(({ data }) => setArticulos(data ?? []));
  }, []);

  const persona = personas.find((p) => etiquetaPersona(p) === textoPersona);
  const largo = limite > hoyISO(diasMax);
  const requiereAdmin = tipo === 'externo' || largo;

  async function agregarEquipo() {
    const e = equipos.find((x) => x.id === equipoSel);
    if (!e) return;
    if (!persona) return setMensaje({ tipo: 'error', texto: 'Primero elija a la persona: algunos equipos requieren capacitación.' });
    const { data: motivoBloqueo } = await supabase.rpc('motivo_bloqueo_equipo', { p_equipo: e.id, p_solicitante: persona.id });
    if (motivoBloqueo) return setMensaje({ tipo: 'error', texto: `${e.codigo}: ${motivoBloqueo}` });
    setMensaje(null);
    setRenglones([...renglones, { clave: 'e' + e.id, equipo_id: e.id, texto: `${e.codigo} · ${e.nombre}` }]);
    setEquipoSel('');
  }

  function agregarArticulo() {
    const a = articulos.find((x) => x.id === articuloSel);
    const n = Number(cantidad);
    if (!a || !(n > 0)) return;
    const ya = renglones.filter((r) => r.articulo_id === a.id).reduce((s, r) => s + r.cantidad, 0);
    if (n + ya > Number(a.existencia)) {
      return setMensaje({ tipo: 'error', texto: `Solo hay ${Number(a.existencia)} ${a.unidad} de «${a.nombre}».` });
    }
    setMensaje(null);
    setRenglones([...renglones, { clave: 'a' + a.id + Date.now(), articulo_id: a.id, cantidad: n, texto: `${n} ${a.unidad} · ${a.nombre}` }]);
    setArticuloSel(''); setCantidad('1');
  }

  async function registrar(e) {
    e.preventDefault();
    if (!persona) return setMensaje({ tipo: 'error', texto: 'Elija a la persona de la lista.' });
    if (!renglones.length) return setMensaje({ tipo: 'error', texto: 'Agregue al menos un equipo o material.' });
    setOcupado(true); setMensaje(null);
    const { data, error } = await supabase.rpc('registrar_prestamo', {
      p_solicitante: persona.id, p_tipo: tipo, p_fecha_limite: limite, p_motivo: motivo,
      p_vobo: tipo === 'externo' ? vobo : null, p_autorizo: esAdmin && autorizo,
      p_renglones: renglones.map(({ equipo_id, articulo_id, cantidad: c }) =>
        equipo_id ? { equipo_id } : { articulo_id, cantidad: c }),
    });
    setOcupado(false);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    navegar(`/prestamos/detalle/${data}`);
  }

  const equiposLibres = equipos.filter((e) => !renglones.some((r) => r.equipo_id === e.id));

  return (
    <>
      <h1>Préstamos</h1>
      <PestanasPrestamos />
      <Aviso mensaje={mensaje} />
      <form className="dos-columnas dos-columnas-amplia" onSubmit={registrar}>
        <div className="columna">
          <section className="tarjeta formulario">
            <h2>¿Quién recibe?</h2>
            <label>Persona
              <input list="personas-prestamo" value={textoPersona} onChange={(e) => setTextoPersona(e.target.value)}
                placeholder="Nombre, matrícula o adscripción" required />
              <datalist id="personas-prestamo">{personas.map((p) => <option key={p.id} value={etiquetaPersona(p)} />)}</datalist>
            </label>
            {persona?.suspendida && <p className="aviso aviso-error nota">Esta persona tiene una suspensión vigente: no puede recibir préstamos.</p>}
            {persona && !persona.suspendida && (
              <p className="tenue nota">{persona.externo ? `Persona externa · ${persona.adscripcion || 'sin adscripción'}` : 'Con autorización de acceso vigente.'}</p>
            )}
            <p className="tenue nota">Aparecen las personas con acceso vigente y las externas.{' '}
              <button type="button" className="btn-enlace" onClick={() => setExternoAbierto(true)}>Registrar persona externa</button></p>
          </section>

          <section className="tarjeta formulario">
            <h2>¿Qué se presta?</h2>
            <div className="fila-agregar">
              <label className="crece">Equipo disponible
                <select value={equipoSel} onChange={(e) => setEquipoSel(e.target.value)}>
                  <option value="">Elija un equipo…</option>
                  {equiposLibres.map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}</option>)}
                </select>
              </label>
              <button type="button" className="btn" onClick={agregarEquipo} disabled={!equipoSel}>Agregar</button>
            </div>
            <div className="fila-agregar">
              <label className="crece">Material retornable
                <select value={articuloSel} onChange={(e) => setArticuloSel(e.target.value)}>
                  <option value="">Elija un material…</option>
                  {articulos.map((a) => <option key={a.id} value={a.id}>{a.nombre} (hay {Number(a.existencia)} {a.unidad})</option>)}
                </select>
              </label>
              <label className="angosto">Cantidad<input type="number" min="1" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></label>
              <button type="button" className="btn" onClick={agregarArticulo} disabled={!articuloSel}>Agregar</button>
            </div>
            {renglones.length === 0 ? <p className="tenue nota">Aún no agrega nada. Los consumibles no se prestan: se registran como salida en Inventario.</p> : (
              <ul className="lista-renglones">
                {renglones.map((r) => (
                  <li key={r.clave}>
                    <span>{r.equipo_id ? <Etiqueta tono="aviso">Equipo</Etiqueta> : <Etiqueta tono="gris">Material</Etiqueta>} {r.texto}</span>
                    <button type="button" className="btn btn-chico" onClick={() => setRenglones(renglones.filter((x) => x.clave !== r.clave))}>Quitar</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="tarjeta formulario">
          <h2>Condiciones</h2>
          <fieldset>
            <legend>Tipo de préstamo</legend>
            <label className="casilla"><input type="radio" checked={tipo === 'interno'} onChange={() => setTipo('interno')} />Interno (uso dentro de la FIQ)</label>
            <label className="casilla"><input type="radio" checked={tipo === 'externo'} onChange={() => setTipo('externo')} />Externo (sale de la FIQ, Art. 16)</label>
          </fieldset>
          <label>Fecha límite de devolución
            <input type="date" value={limite} min={hoy} onChange={(e) => setLimite(e.target.value)} required />
          </label>
          <label>Motivo o práctica
            <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
          </label>
          {tipo === 'externo' && (
            <label>Oficio de visto bueno del Secretario Administrativo
              <input value={vobo} onChange={(e) => setVobo(e.target.value)} placeholder="Ej. SA/123/2026" required />
            </label>
          )}
          {requiereAdmin && (esAdmin ? (
            <label className="casilla"><input type="checkbox" checked={autorizo} onChange={(e) => setAutorizo(e.target.checked)} required />
              Autorizo este préstamo como Administrador</label>
          ) : (
            <p className="aviso aviso-alerta nota">{tipo === 'externo' ? 'Un préstamo externo' : `Un préstamo de más de ${diasMax} días`} requiere
              autorización del Administrador: debe registrarlo él.</p>
          ))}
          <p className="tenue nota">Plazo máximo sin autorización: {diasMax} días (hasta el {fecha(hoyISO(diasMax))}).</p>
          <button className="btn btn-primario" disabled={ocupado || (requiereAdmin && !esAdmin) || persona?.suspendida}>
            {ocupado ? 'Registrando…' : 'Registrar préstamo'}</button>
        </section>
      </form>

      {externoAbierto && (
        <NuevaPersonaExterna alCerrar={() => setExternoAbierto(false)}
          alGuardar={async (p) => { setExternoAbierto(false); await cargarPersonas(); setTextoPersona(etiquetaPersona(p)); }} />
      )}
    </>
  );
}

function NuevaPersonaExterna({ alCerrar, alGuardar }) {
  const [f, setF] = useState({ nombre: '', adscripcion: '', correo: '', telefono: '' });
  const [error, setError] = useState('');
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function guardar(e) {
    e.preventDefault();
    const fila = { nombre: f.nombre.trim().replace(/\s+/g, ' '), adscripcion: f.adscripcion.trim(), externo: true,
      correo: f.correo.trim().toLowerCase() || null, telefono: f.telefono.trim() || null };
    const { data, error } = await supabase.from('solicitantes').insert(fila).select('id, nombre, matricula, externo, adscripcion').single();
    if (error) setError(mensajeError(error)); else alGuardar(data);
  }
  return (
    <Modal titulo="Registrar persona externa" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="tenue nota">Para profesores u otros laboratorios que reciben un préstamo sin tener autorización de acceso.</p>
        <label>Nombre completo<input value={f.nombre} onChange={campo('nombre')} required /></label>
        <label>Adscripción<input value={f.adscripcion} onChange={campo('adscripcion')} placeholder="Ej. Laboratorio de Alimentos, FIQ" required /></label>
        <div className="fila-campos">
          <label>Correo<input type="email" value={f.correo} onChange={campo('correo')} /></label>
          <label>Teléfono<input value={f.telefono} onChange={campo('telefono')} /></label>
        </div>
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario">Registrar</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

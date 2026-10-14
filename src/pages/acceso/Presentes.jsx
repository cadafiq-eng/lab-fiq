import { useEffect, useRef, useState } from 'react';
import { supabase, mensajeError } from '../../supabase';
import { Aviso } from '../../componentes';
import { hora, duracion } from '../../util';

// Quién está dentro ahora. El personal puede registrar entradas (por ejemplo,
// si la terminal no está disponible) y salidas de quien olvidó marcarla.
export default function Presentes() {
  const [presentes, setPresentes] = useState(null);
  const [usos, setUsos] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState([]);
  const temporizador = useRef(null);

  async function cargar() {
    const [p, u] = await Promise.all([
      supabase.from('v_presentes').select('*').order('entrada'),
      supabase.from('usos_equipo').select('id, inicio, solicitante_id, equipos(codigo, nombre)').is('fin', null),
    ]);
    if (p.error) return setMensaje({ tipo: 'error', texto: mensajeError(p.error) });
    setPresentes(p.data);
    setUsos(u.data ?? []);
  }
  useEffect(() => { cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t); }, []);

  useEffect(() => {
    clearTimeout(temporizador.current);
    if (texto.trim().length < 3) { setResultados([]); return; }
    temporizador.current = setTimeout(async () => {
      const { data } = await supabase.rpc('terminal_buscar', { p_texto: texto });
      setResultados(data ?? []);
    }, 300);
  }, [texto]);

  async function llamar(funcion, params, exito) {
    setMensaje(null);
    const { data, error } = await supabase.rpc(funcion, params);
    if (error) { setMensaje({ tipo: 'error', texto: mensajeError(error) }); return false; }
    setMensaje({ tipo: 'ok', texto: exito ?? data });
    await cargar();
    return true;
  }

  async function entrada(r) {
    if (await llamar('terminal_registrar_entrada', { p_solicitante: r.solicitante_id }, `Entrada de ${r.nombre} registrada.`)) {
      setTexto('');
    }
  }

  function salida(p) {
    const abiertos = usos.filter((u) => u.solicitante_id === p.solicitante_id);
    const aviso = abiertos.length
      ? `\n\nTambién se cerrará el uso de: ${abiertos.map((u) => u.equipos.nombre).join(', ')}.` : '';
    if (!window.confirm(`¿Registrar la salida de ${p.nombre} a esta hora?${aviso}`)) return;
    llamar('corregir_registro', {
      p_registro: p.id, p_entrada: p.entrada, p_salida: new Date().toISOString(),
      p_motivo: 'Salida registrada por el personal en turno',
    }, `Salida de ${p.nombre} registrada.`);
  }

  async function cierre() {
    if (!window.confirm('Se marcará como "salida no registrada" a quien siga dentro desde un día anterior '
      + '(o a todos, si ya pasó la hora de cierre). ¿Continuar?')) return;
    const { data, error } = await supabase.rpc('marcar_salidas_no_registradas');
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setMensaje({ tipo: 'ok', texto: data ? `${data} registro(s) marcados como salida no registrada.` : 'No había registros pendientes.' });
    cargar();
  }

  return (
    <>
      <Aviso mensaje={mensaje} />
      <div className="dos-columnas dos-columnas-amplia">
        <section className="tarjeta">
          <h2>Dentro del laboratorio {presentes && <span className="tenue">({presentes.length})</span>}</h2>
          {!presentes ? <p className="tenue">Cargando…</p> : presentes.length === 0 ? (
            <p className="tenue">Nadie ha registrado entrada.</p>
          ) : (
            <div className="tabla-desplazable">
              <table>
                <thead><tr><th>Persona</th><th>Proyecto</th><th>Entrada</th><th>Equipo en uso</th><th></th></tr></thead>
                <tbody>
                  {presentes.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.nombre}</strong><br /><span className="tenue">{p.matricula}</span></td>
                      <td>{p.proyecto}</td>
                      <td>{hora(p.entrada)}<br /><span className="tenue">{duracion(p.entrada)}</span></td>
                      <td>{usos.filter((u) => u.solicitante_id === p.solicitante_id).map((u) => (
                        <span key={u.id} className="etiqueta etq-aviso" title={`desde ${hora(u.inicio)}`}>{u.equipos.nombre}</span>
                      ))}</td>
                      <td className="der"><button className="btn btn-chico" onClick={() => salida(p)}>Registrar salida</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="columna">
          <section className="tarjeta formulario">
            <h2>Registrar entrada</h2>
            <p className="tenue nota">Para cuando la persona no pueda usar la terminal. Aplica las mismas reglas:
              horario, autorización vigente y sin suspensión.</p>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre (al menos 3 letras)" />
            {texto.trim().length >= 3 && resultados.length === 0 && (
              <p className="tenue nota">Sin coincidencias con autorización vigente.</p>
            )}
            {resultados.map((r) => (
              <div key={r.solicitante_id} className="fila-resultado">
                <span>{r.nombre}</span>
                {r.dentro ? <span className="etiqueta etq-bien">dentro</span>
                  : <button className="btn btn-chico btn-primario" onClick={() => entrada(r)}>Registrar entrada</button>}
              </div>
            ))}
          </section>
          <section className="tarjeta">
            <h2>Cierre de jornada</h2>
            <p className="tenue nota">Se ejecuta solo cada noche. Úselo manualmente solo si el cierre automático no está activo.</p>
            <button className="btn" onClick={cierre}>Marcar salidas no registradas</button>
          </section>
        </div>
      </div>
    </>
  );
}

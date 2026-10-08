import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, mensajeError } from '../supabase';

// Terminal de autoservicio (sesión de Control de Acceso).
// La persona busca su nombre, se selecciona y registra entrada, salida o uso de equipo.
export default function Terminal() {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState([]);
  const [persona, setPersona] = useState(null);
  const [vista, setVista] = useState('inicio'); // inicio | equipos | terminar
  const [equipos, setEquipos] = useState([]);
  const [usos, setUsos] = useState([]);
  const [aviso, setAviso] = useState(null);
  const [presentes, setPresentes] = useState(0);
  const [salirAbierto, setSalirAbierto] = useState(false);
  const temporizador = useRef(null);

  const actualizarPresentes = () => supabase.rpc('terminal_presentes').then(({ data }) => setPresentes(data ?? 0));
  useEffect(() => { actualizarPresentes(); const t = setInterval(actualizarPresentes, 60000); return () => clearInterval(t); }, []);

  // Búsqueda con espera breve mientras se escribe
  useEffect(() => {
    clearTimeout(temporizador.current);
    if (texto.trim().length < 3) { setResultados([]); return; }
    temporizador.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('terminal_buscar', { p_texto: texto });
      setResultados(error ? [] : data);
    }, 300);
  }, [texto]);

  function reiniciar(mensaje) {
    setAviso(mensaje);
    setPersona(null); setTexto(''); setResultados([]); setVista('inicio');
    actualizarPresentes();
    setTimeout(() => setAviso(null), 5000);
  }

  async function llamar(funcion, params, alTerminar = reiniciar) {
    const { data, error } = await supabase.rpc(funcion, params);
    if (error) setAviso({ tipo: 'error', texto: mensajeError(error) });
    else alTerminar({ tipo: 'ok', texto: data });
  }

  async function verEquipos() {
    const { data } = await supabase.rpc('terminal_equipos', { p_solicitante: persona.solicitante_id });
    setEquipos(data ?? []); setVista('equipos'); setAviso(null);
  }

  async function verUsos() {
    const { data } = await supabase.rpc('terminal_usos_abiertos', { p_solicitante: persona.solicitante_id });
    setUsos(data ?? []); setVista('terminar'); setAviso(null);
  }

  function terminarUso(uso) {
    const dano = window.confirm(`¿El equipo "${uso.equipo}" presentó alguna falla o daño?\n\nAceptar = Sí, reportar daño\nCancelar = No, todo bien`);
    const observaciones = dano ? window.prompt('Describa brevemente la falla:') ?? '' : '';
    llamar('terminal_terminar_uso', {
      p_solicitante: persona.solicitante_id, p_uso: uso.uso_id,
      p_observaciones: observaciones, p_dano: dano,
    });
  }

  return (
    <div className="terminal">
      <header className="terminal-cabecera">
        <div className="marca"><span className="marca-sigla">FIQ</span><span>Registro de acceso al laboratorio</span></div>
        <div className="terminal-reloj"><Reloj /><span className="tenue">{presentes} {presentes === 1 ? 'persona dentro' : 'personas dentro'}</span></div>
      </header>

      <main className="terminal-cuerpo">
        {aviso && <div className={'terminal-aviso ' + (aviso.tipo === 'ok' ? 'aviso-ok' : 'aviso-error')}>{aviso.texto}</div>}

        {!persona && (
          <>
            <label className="terminal-etiqueta" htmlFor="buscar">Escribe tu nombre</label>
            <input id="buscar" className="terminal-buscar" value={texto} autoComplete="off" autoFocus
              onChange={(e) => setTexto(e.target.value)} placeholder="Al menos 3 letras" />
            <div className="terminal-resultados">
              {texto.trim().length >= 3 && resultados.length === 0 && (
                <p className="tenue">Sin coincidencias. Si no apareces, acude con el personal en turno.</p>
              )}
              {resultados.map((r) => (
                <button key={r.solicitante_id} className="terminal-persona" onClick={() => { setPersona(r); setAviso(null); }}>
                  {r.nombre}{r.dentro && <span className="etiqueta etq-bien">dentro</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {persona && vista === 'inicio' && (
          <>
            <p className="terminal-etiqueta">¿Eres <strong>{persona.nombre}</strong>?</p>
            <div className="terminal-acciones">
              {!persona.dentro ? (
                <button className="btn-grande btn-entrada"
                  onClick={() => llamar('terminal_registrar_entrada', { p_solicitante: persona.solicitante_id })}>
                  Registrar entrada</button>
              ) : (
                <>
                  <button className="btn-grande" onClick={verEquipos}>Usar un equipo</button>
                  <button className="btn-grande" onClick={verUsos}>Terminar uso de equipo</button>
                  <button className="btn-grande btn-salida"
                    onClick={() => llamar('terminal_registrar_salida', { p_solicitante: persona.solicitante_id })}>
                    Registrar salida</button>
                </>
              )}
            </div>
            <button className="btn btn-enlace" onClick={() => reiniciar(null)}>No soy yo · volver</button>
          </>
        )}

        {persona && vista === 'equipos' && (
          <>
            <p className="terminal-etiqueta">Elige el equipo que vas a usar</p>
            <div className="terminal-equipos">
              {equipos.map((e) => (
                <button key={e.equipo_id} className="terminal-equipo" disabled={!e.puede_usar}
                  onClick={() => llamar('terminal_iniciar_uso', { p_solicitante: persona.solicitante_id, p_equipo: e.equipo_id })}>
                  <strong>{e.nombre}</strong><span className="tenue">{e.codigo} · {e.tipo}</span>
                  {!e.puede_usar && <span className="motivo">{e.motivo}</span>}
                </button>
              ))}
              {equipos.length === 0 && <p className="tenue">No hay equipos registrados.</p>}
            </div>
            <button className="btn btn-enlace" onClick={() => setVista('inicio')}>Volver</button>
          </>
        )}

        {persona && vista === 'terminar' && (
          <>
            <p className="terminal-etiqueta">¿Qué equipo terminaste de usar?</p>
            <div className="terminal-equipos">
              {usos.map((u) => (
                <button key={u.uso_id} className="terminal-equipo" onClick={() => terminarUso(u)}>
                  <strong>{u.equipo}</strong>
                  <span className="tenue">desde las {new Date(u.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              ))}
              {usos.length === 0 && <p className="tenue">No tienes equipos en uso.</p>}
            </div>
            <button className="btn btn-enlace" onClick={() => setVista('inicio')}>Volver</button>
          </>
        )}
      </main>

      <footer className="terminal-pie">
        <button className="btn btn-enlace" onClick={() => setSalirAbierto(true)}>Cerrar terminal (personal)</button>
      </footer>
      {salirAbierto && <SalirTerminal alCerrar={() => setSalirAbierto(false)} />}
    </div>
  );
}

function Reloj() {
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 15000); return () => clearInterval(t); }, []);
  return <strong>{ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</strong>;
}

// Salir del modo terminal exige las credenciales de alguien del personal.
// Se verifican con un cliente aparte para no tocar la sesión de la terminal.
function SalirTerminal({ alCerrar }) {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');

  async function confirmar(e) {
    e.preventDefault();
    setError('');
    const verificador = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'verificacion-terminal' } });
    const { data, error } = await verificador.auth.signInWithPassword({ email: correo.trim(), password: contrasena });
    if (error) return setError('Credenciales incorrectas.');
    const { data: p } = await verificador.from('perfiles').select('roles, activo').eq('id', data.user.id).single();
    await verificador.auth.signOut();
    if (!p?.activo || !(p.roles.includes('admin') || p.roles.includes('gestor'))) {
      return setError('Solo el personal del laboratorio puede cerrar la terminal.');
    }
    await supabase.auth.signOut();
  }

  return (
    <div className="modal-fondo" onClick={alCerrar}>
      <form className="tarjeta formulario modal" onClick={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <h2>Cerrar la terminal</h2>
        <p className="tenue">Ingrese las credenciales de alguien del personal.</p>
        <label>Correo<input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required autoFocus /></label>
        <label>Contraseña<input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required /></label>
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario">Cerrar terminal</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { supabase, mensajeError } from '../supabase';
import { ERROR_ENLACE } from '../auth';

// Dirección a la que vuelve el enlace del correo (la propia app, sin la ruta interna)
const direccionApp = () => window.location.origin + window.location.pathname;

export default function Login() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState(ERROR_ENLACE);
  const [enviando, setEnviando] = useState(false);
  const [olvido, setOlvido] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function recuperar(e) {
    e.preventDefault();
    setError(''); setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), { redirectTo: direccionApp() });
    setEnviando(false);
    if (error) return setError(/rate limit|security purposes/i.test(error.message)
      ? 'Se enviaron demasiados correos. Espere unos minutos e inténtelo de nuevo.' : mensajeError(error));
    setEnviado(true);
  }

  if (olvido) {
    return (
      <div className="centrado fondo-login">
        <form className="tarjeta login" onSubmit={recuperar}>
          <div className="marca marca-login">
            <img className="marca-icono" src={`${import.meta.env.BASE_URL}iconos/icono.svg`} alt="" /><span className="marca-sigla">FIQ</span>
            <span>Laboratorio</span>
          </div>
          <h1>Restablecer contraseña</h1>
          {enviado ? (
            <p className="aviso aviso-ok">Si <strong>{correo.trim()}</strong> tiene una cuenta, le llegará un correo con un enlace para
              definir una contraseña nueva. Revise también la carpeta de correo no deseado.</p>
          ) : (
            <>
              <p className="tenue">Escriba el correo de su cuenta y le enviaremos un enlace.</p>
              <label>Correo
                <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required autoFocus />
              </label>
              {error && <p className="aviso aviso-error">{error}</p>}
              <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace'}</button>
            </>
          )}
          <p className="tenue pie"><button type="button" className="enlace" onClick={() => { setOlvido(false); setEnviado(false); setError(''); }}>Volver a iniciar sesión</button></p>
        </form>
      </div>
    );
  }

  async function entrar(e) {
    e.preventDefault();
    setError(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: contrasena });
    setEnviando(false);
    if (error) setError(mensajeError(error));
  }

  return (
    <div className="centrado fondo-login">
      <form className="tarjeta login" onSubmit={entrar}>
        <div className="marca marca-login">
          <img className="marca-icono" src={`${import.meta.env.BASE_URL}iconos/icono.svg`} alt="" /><span className="marca-sigla">FIQ</span>
          <span>Laboratorio</span>
        </div>
        <h1>Iniciar sesión</h1>
        <p className="tenue">Sistema de Gestión Integral del Laboratorio · UADY</p>
        <label>Correo
          <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required autoFocus />
        </label>
        <label>Contraseña
          <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
        </label>
        {error && <p className="aviso aviso-error">{error}</p>}
        <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <p className="tenue pie"><button type="button" className="enlace" onClick={() => { setOlvido(true); setError(''); }}>¿Olvidó su contraseña?</button></p>
        <p className="tenue pie">Las cuentas las crea el Administrador del laboratorio.</p>
      </form>
    </div>
  );
}

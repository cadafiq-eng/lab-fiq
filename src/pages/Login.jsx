import { useState } from 'react';
import { supabase, mensajeError } from '../supabase';

export default function Login() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

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
          <span className="marca-sigla">FIQ</span>
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
        <p className="tenue pie">Las cuentas las crea el Administrador del laboratorio.</p>
      </form>
    </div>
  );
}

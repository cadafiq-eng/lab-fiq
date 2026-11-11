import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, mensajeError } from '../supabase';
import { useSesion } from '../auth';

// Se muestra al entrar desde el enlace «Restablecer contraseña» (o de invitación) del correo
export default function NuevaContrasena() {
  const { sesion, contrasenaDefinida, salir } = useSesion();
  const navegar = useNavigate();
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    if (nueva.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (nueva !== confirmar) return setError('La confirmación no coincide.');
    setOcupado(true);
    const { error: err } = await supabase.auth.updateUser({ password: nueva });
    setOcupado(false);
    if (err) {
      return setError(/different from the old/i.test(err.message)
        ? 'La contraseña nueva debe ser distinta de la anterior.' : mensajeError(err));
    }
    contrasenaDefinida();
    navegar('/inicio', { replace: true });
  }

  return (
    <div className="centrado fondo-login">
      <form className="tarjeta login" onSubmit={guardar}>
        <div className="marca marca-login">
          <img className="marca-icono" src={`${import.meta.env.BASE_URL}iconos/icono.svg`} alt="" /><span className="marca-sigla">FIQ</span>
          <span>Laboratorio</span>
        </div>
        <h1>Nueva contraseña</h1>
        <p className="tenue">{sesion.user.email}</p>
        <label>Contraseña nueva
          <input type="password" autoComplete="new-password" minLength={8} value={nueva} onChange={(e) => setNueva(e.target.value)} required autoFocus />
        </label>
        <label>Confirmar contraseña nueva
          <input type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />
        </label>
        {error && <p className="aviso aviso-error">{error}</p>}
        <button className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar contraseña'}</button>
        <p className="tenue pie"><button type="button" className="enlace" onClick={salir}>Cancelar y cerrar sesión</button></p>
      </form>
    </div>
  );
}

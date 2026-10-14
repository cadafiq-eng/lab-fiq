import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, mensajeError } from '../supabase';
import { useSesion } from '../auth';
import { Aviso } from '../componentes';
import { nombreRol } from '../App';

export default function MiCuenta() {
  const { sesion, perfil } = useSesion();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function cambiar(e) {
    e.preventDefault();
    setMensaje(null);
    if (nueva.length < 8) return setMensaje({ tipo: 'error', texto: 'La contraseña nueva debe tener al menos 8 caracteres.' });
    if (nueva !== confirmar) return setMensaje({ tipo: 'error', texto: 'La confirmación no coincide.' });
    if (nueva === actual) return setMensaje({ tipo: 'error', texto: 'La contraseña nueva debe ser distinta de la actual.' });
    setOcupado(true);
    // Se comprueba la contraseña actual con un cliente aparte, sin tocar la sesión abierta
    const verificador = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'verificacion-cuenta' } });
    const { error: e1 } = await verificador.auth.signInWithPassword({ email: sesion.user.email, password: actual });
    if (e1) { setOcupado(false); return setMensaje({ tipo: 'error', texto: 'La contraseña actual es incorrecta.' }); }
    await verificador.auth.signOut();
    const { error: e2 } = await supabase.auth.updateUser({ password: nueva });
    setOcupado(false);
    if (e2) return setMensaje({ tipo: 'error', texto: mensajeError(e2) });
    setActual(''); setNueva(''); setConfirmar('');
    setMensaje({ tipo: 'ok', texto: 'Contraseña actualizada. Úsela la próxima vez que inicie sesión.' });
  }

  return (
    <>
      <h1>Mi cuenta</h1>
      <p className="tenue">{perfil.nombre} · {sesion.user.email} · {perfil.roles.map(nombreRol).join(', ')}</p>
      <Aviso mensaje={mensaje} />
      <form className="tarjeta formulario" style={{ maxWidth: 420, marginTop: 20 }} onSubmit={cambiar}>
        <h2>Cambiar contraseña</h2>
        <label>Contraseña actual
          <input type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
        </label>
        <label>Contraseña nueva
          <input type="password" autoComplete="new-password" minLength={8} value={nueva} onChange={(e) => setNueva(e.target.value)} required />
        </label>
        <label>Confirmar contraseña nueva
          <input type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />
        </label>
        <button className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Cambiar contraseña'}</button>
      </form>
    </>
  );
}

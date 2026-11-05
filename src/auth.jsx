import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const Ctx = createContext(null);

// Enlaces de los correos de Supabase (recuperar contraseña o invitación).
// Se leen antes de que supabase-js limpie la dirección.
const hashInicial = typeof window !== 'undefined' ? window.location.hash : '';
const ENLACE_CONTRASENA = /type=(recovery|invite)/.test(hashInicial);
export const ERROR_ENLACE = /error_code=|error=/.test(hashInicial)
  ? (/otp_expired|expired/i.test(hashInicial)
    ? 'El enlace del correo ya venció o ya se usó. Solicite uno nuevo con «¿Olvidó su contraseña?».'
    : 'El enlace del correo no es válido. Solicite uno nuevo con «¿Olvidó su contraseña?».')
  : '';

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(undefined); // undefined = cargando
  const [perfil, setPerfil] = useState(null);
  // true mientras la persona entra desde el enlace del correo y aún no define su contraseña
  const [definirContrasena, setDefinirContrasena] = useState(ENLACE_CONTRASENA);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setDefinirContrasena(true);
      if (evento === 'SIGNED_OUT') setDefinirContrasena(false);
      setSesion(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sesion) { setPerfil(null); return; }
    supabase.from('perfiles').select('id, nombre, roles, activo')
      .eq('id', sesion.user.id).maybeSingle()
      .then(({ data }) => setPerfil(data ?? { sinPerfil: true }));
  }, [sesion?.user?.id]);

  const tiene = (rol) => Boolean(perfil?.activo && perfil.roles?.includes(rol));
  const valor = {
    sesion, perfil, definirContrasena,
    contrasenaDefinida: () => setDefinirContrasena(false),
    cargando: sesion === undefined || (sesion && !perfil),
    esAdmin: tiene('admin'),
    esGestor: tiene('gestor'),
    esPersonal: tiene('admin') || tiene('gestor'),
    esTerminal: tiene('terminal'),
    salir: () => supabase.auth.signOut(),
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useSesion = () => useContext(Ctx);

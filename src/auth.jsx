import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const Ctx = createContext(null);

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(undefined); // undefined = cargando
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
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
    sesion, perfil,
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

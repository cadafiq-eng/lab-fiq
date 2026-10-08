import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && anon);

export const supabase = configurado ? createClient(url, anon) : null;

// Traduce los errores de Supabase/PostgreSQL a un mensaje legible.
// Las reglas del laboratorio ya devuelven sus mensajes en español.
export function mensajeError(e) {
  if (!e) return '';
  const m = e.message || String(e);
  if (m.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('row-level security')) return 'Su rol no tiene permiso para esta acción.';
  if (m.includes('duplicate key')) return 'Ya existe un registro con ese dato.';
  if (m.includes('Failed to fetch')) return 'Sin conexión con el servidor.';
  return m;
}

// Llama a la Edge Function de gestión del personal
export async function gestionarPersonal(cuerpo) {
  const { data, error } = await supabase.functions.invoke('gestionar-personal', { body: cuerpo });
  if (error) {
    let detalle = error.message;
    try {
      const j = await error.context.json();
      detalle = j.error || detalle;
    } catch { /* sin cuerpo JSON */ }
    throw new Error(detalle);
  }
  return data;
}

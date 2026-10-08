-- =====================================================================
-- Migración 0002: el Administrador da de alta perfiles del personal.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- La cuenta de acceso (correo y contraseña) la crea la Edge Function
-- "gestionar-personal"; el perfil se inserta con la sesión del propio
-- Administrador para que la bitácora registre quién dio de alta a quién.
-- =====================================================================
create policy perfiles_crear on perfiles for insert to authenticated
  with check (tiene_rol('admin'));

-- Un Administrador no puede quitarse a sí mismo el rol ni desactivarse,
-- para evitar que el laboratorio se quede sin Administrador.
create or replace function tg_proteger_admin_propio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.id = auth.uid() and (not new.activo or not ('admin' = any (new.roles))) then
    raise exception 'No puede desactivarse ni quitarse el rol de Administrador a sí mismo.';
  end if;
  return new;
end $$;
create trigger perfiles_proteger_admin before update on perfiles
  for each row execute function tg_proteger_admin_propio();

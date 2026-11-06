-- =====================================================================
-- Migración 0014: Preparación de material para las reservaciones
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0013.
--
-- El personal ve en tarjetas lo que cada reservación necesita (materiales,
-- reactivos, equipos) y marca cuando ya está preparado.
--   * Tabla aparte para no tocar la reservación (ni sus validaciones).
--   * Solo se cambia con marcar_preparacion; queda quién y cuándo.
--   * Nada se borra: desmarcar deja la fila con preparada = false.
-- =====================================================================

create table preparacion_reservaciones (
  reservacion_id  uuid primary key references reservaciones (id),
  preparada       boolean not null default false,
  nota            text,
  actualizada_en  timestamptz not null default now(),
  actualizada_por uuid references perfiles (id) default auth.uid()
);
create trigger preparacion_reservaciones_auditoria after insert or update or delete on preparacion_reservaciones
  for each row execute function tg_auditoria();

alter table preparacion_reservaciones enable row level security;
revoke all on preparacion_reservaciones from anon;
create policy preparacion_leer on preparacion_reservaciones for select to authenticated using (es_personal());
-- Sin políticas de escritura: solo con marcar_preparacion.

create or replace function marcar_preparacion(p_reservacion uuid, p_preparada boolean, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado estado_reservacion;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select estado into v_estado from reservaciones where id = p_reservacion;
  if not found then raise exception 'La reservación no existe.'; end if;
  if v_estado = 'cancelada' and p_preparada then
    raise exception 'La reservación está cancelada.';
  end if;
  insert into preparacion_reservaciones (reservacion_id, preparada, nota, actualizada_en, actualizada_por)
  values (p_reservacion, coalesce(p_preparada, false), nullif(trim(coalesce(p_nota, '')), ''), now(), auth.uid())
  on conflict (reservacion_id) do update
    set preparada = excluded.preparada,
        nota = coalesce(excluded.nota, preparacion_reservaciones.nota),
        actualizada_en = now(), actualizada_por = auth.uid();
end $$;

revoke execute on function marcar_preparacion(uuid, boolean, text) from public, anon;
grant execute on function marcar_preparacion(uuid, boolean, text) to authenticated;

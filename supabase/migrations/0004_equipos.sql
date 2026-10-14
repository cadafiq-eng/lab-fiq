-- =====================================================================
-- Migración 0004: Equipos (fase 3)
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de 0003.
--
-- Contenido:
--   1. Historial de estados de cada equipo (quién, cuándo y por qué).
--   2. El estado solo cambia por vías controladas: uso, préstamo,
--      mantenimiento o la función cambiar_estado_equipo (con motivo).
--   3. Mantenimientos: validación; solo el preventivo reinicia el calendario;
--      un mantenimiento que no deja operativo al equipo lo saca de servicio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Historial de estados
-- ---------------------------------------------------------------------
create table historial_estados_equipo (
  id               uuid primary key default gen_random_uuid(),
  equipo_id        uuid not null references equipos (id),
  estado_anterior  estado_equipo,
  estado_nuevo     estado_equipo not null,
  motivo           text,
  fecha            timestamptz not null default now(),
  usuario          uuid references perfiles (id) default auth.uid()
);
create index on historial_estados_equipo (equipo_id, fecha desc);

alter table historial_estados_equipo enable row level security;
revoke all on historial_estados_equipo from anon;
create policy historial_estados_leer on historial_estados_equipo
  for select to authenticated using (es_personal());
-- Lo escriben solo los triggers (security definer); no hay políticas de escritura.

-- Equipos ya registrados antes de esta migración
insert into historial_estados_equipo (equipo_id, estado_nuevo, motivo, fecha, usuario)
select id, estado, 'Registro inicial', creado_en, null from equipos;

create or replace function tg_historial_estado_equipo()
returns trigger language plpgsql security definer set search_path = public as $$
declare m text := nullif(current_setting('lab.motivo_estado', true), '');
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then return null; end if;
  if m is null then
    m := case
      when tg_op = 'INSERT' then 'Alta del equipo'
      when new.estado = 'en_uso' then 'Inicio de uso'
      when old.estado = 'en_uso' and new.estado = 'disponible' then 'Fin de uso'
      when old.estado = 'en_uso' and new.estado = 'fuera_de_servicio' then 'Daño reportado al terminar el uso'
      when new.estado = 'prestado' then 'Salida en préstamo'
      when old.estado = 'prestado' and new.estado = 'disponible' then 'Devolución de préstamo'
      when old.estado = 'prestado' and new.estado = 'fuera_de_servicio' then 'Devuelto con daño'
      when new.estado = 'disponible' then 'Mantenimiento registrado'
      when new.estado = 'fuera_de_servicio' then 'Mantenimiento: el equipo no quedó operativo'
    end;
  end if;
  insert into historial_estados_equipo (equipo_id, estado_anterior, estado_nuevo, motivo)
  values (new.id, case when tg_op = 'UPDATE' then old.estado end, new.estado, m);
  return null;
end $$;
create trigger equipos_historial_estado after insert or update on equipos
  for each row execute function tg_historial_estado_equipo();

-- ---------------------------------------------------------------------
-- 2. Guardia del estado
--   Una edición directa del equipo (desde la app) no puede cambiar su
--   estado. Los triggers de uso, préstamo y mantenimiento sí pueden
--   (corren anidados), y también cambiar_estado_equipo.
-- ---------------------------------------------------------------------
create or replace function tg_equipos_guardia()
returns trigger language plpgsql as $$
begin
  new.codigo := trim(new.codigo);
  if new.codigo = '' or trim(coalesce(new.nombre, '')) = '' then
    raise exception 'El código y el nombre del equipo son obligatorios.';
  end if;
  if tg_op = 'INSERT' then
    if new.estado not in ('disponible', 'en_mantenimiento', 'fuera_de_servicio') then
      raise exception 'Un equipo nuevo se registra como disponible, en mantenimiento o fuera de servicio.';
    end if;
  elsif new.estado is distinct from old.estado and pg_trigger_depth() = 1
        and coalesce(current_setting('lab.cambio_estado', true), '') <> 'on' then
    raise exception 'El estado se cambia con «Cambiar estado» o registrando un mantenimiento, un uso o un préstamo.';
  end if;
  return new;
end $$;
create trigger equipos_guardia before insert or update on equipos
  for each row execute function tg_equipos_guardia();

create or replace function cambiar_estado_equipo(p_equipo uuid, p_estado estado_equipo, p_motivo text)
returns text language plpgsql security definer set search_path = public as $$
declare e equipos%rowtype;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indique el motivo del cambio de estado.';
  end if;
  select * into e from equipos where id = p_equipo for update;
  if not found then raise exception 'El equipo no existe.'; end if;
  if e.estado = p_estado then raise exception 'El equipo ya está en ese estado.'; end if;
  if p_estado in ('en_uso', 'prestado') then
    raise exception 'El uso se registra en la terminal y el préstamo en el módulo de préstamos.';
  end if;
  if e.estado = 'en_uso' then raise exception 'El equipo está en uso: primero termine el uso.'; end if;
  if e.estado = 'prestado' then raise exception 'El equipo está prestado: primero registre la devolución.'; end if;
  if (p_estado = 'baja' or e.estado = 'baja') and not tiene_rol('admin') then
    raise exception 'Solo el Administrador da de baja o reactiva un equipo.';
  end if;
  if p_estado = 'disponible' and e.estado in ('en_mantenimiento', 'fuera_de_servicio')
     and not tiene_rol('admin') then
    raise exception 'Para volver a «disponible», registre el mantenimiento o la reparación realizada.';
  end if;

  perform set_config('lab.cambio_estado', 'on', true);
  perform set_config('lab.motivo_estado', trim(p_motivo), true);
  update equipos set estado = p_estado where id = p_equipo;
  perform set_config('lab.cambio_estado', 'off', true);
  perform set_config('lab.motivo_estado', '', true);
  return 'Estado actualizado.';
end $$;

-- ---------------------------------------------------------------------
-- 3. Mantenimientos
-- ---------------------------------------------------------------------
create or replace function tg_mantenimiento_validar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fecha > hoy_local() then
    raise exception 'La fecha del mantenimiento no puede ser posterior a hoy.';
  end if;
  if coalesce(trim(new.descripcion), '') = '' then
    raise exception 'Describa el mantenimiento realizado.';
  end if;
  new.descripcion := trim(new.descripcion);
  if (select estado from equipos where id = new.equipo_id) = 'baja' then
    raise exception 'El equipo está dado de baja.';
  end if;
  return new;
end $$;
create trigger mantenimiento_validar before insert on mantenimientos
  for each row execute function tg_mantenimiento_validar();

-- Reemplaza la versión de 0001:
--   * Solo el preventivo actualiza "último" y "próximo" mantenimiento
--     (una reparación no pospone el preventivo programado).
--   * Si el mantenimiento deja operativo al equipo, vuelve a "disponible";
--     si no, el equipo queda "fuera de servicio".
create or replace function tg_mantenimiento_registrado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update equipos e set
    ultimo_mantenimiento = case when new.tipo = 'preventivo'
                                then greatest(coalesce(e.ultimo_mantenimiento, new.fecha), new.fecha)
                                else e.ultimo_mantenimiento end,
    proximo_mantenimiento = case when new.tipo = 'preventivo' and e.periodicidad_mantenimiento_dias is not null
                                 then greatest(coalesce(e.ultimo_mantenimiento, new.fecha), new.fecha)
                                      + e.periodicidad_mantenimiento_dias
                                 else e.proximo_mantenimiento end,
    estado = case
      when new.deja_operativo and e.estado in ('en_mantenimiento', 'fuera_de_servicio')
        then 'disponible'::estado_equipo
      when not new.deja_operativo and e.estado in ('disponible', 'en_mantenimiento')
        then 'fuera_de_servicio'::estado_equipo
      else e.estado end
  where e.id = new.equipo_id;
  return new;
end $$;

-- Los mantenimientos son constancia: se registran, no se editan
drop policy if exists mantenimientos_editar on mantenimientos;

-- ---------------------------------------------------------------------
-- 4. Permisos
-- ---------------------------------------------------------------------
revoke execute on function cambiar_estado_equipo(uuid, estado_equipo, text) from public, anon;
grant execute on function cambiar_estado_equipo(uuid, estado_equipo, text) to authenticated;

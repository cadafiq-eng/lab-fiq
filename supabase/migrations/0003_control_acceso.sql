-- =====================================================================
-- Migración 0003: Control de acceso (fase 2)
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de 0001 y 0002.
--
-- Contenido:
--   1. La presencia cuenta solo el día de la entrada (una salida olvidada
--      ayer no impide entrar hoy, aunque el cierre automático no corra).
--   2. Captura de autorizaciones en una sola operación (persona + autorización).
--   3. Correcciones de registros de entrada/salida, siempre con motivo.
--      El personal ya no escribe directo en registros_acceso.
--   4. Sanciones: fecha final calculada según el Art. 36.
--   5. Cierre automático diario de salidas no registradas (pg_cron).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Presencia del día
-- ---------------------------------------------------------------------
create or replace function entrada_es_de_hoy(p timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select (p at time zone (select zona_horaria from configuracion where id = 1))::date = hoy_local();
$$;

create or replace function persona_dentro(p_solicitante uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from registros_acceso
  where solicitante_id = p_solicitante and salida is null and not salida_no_registrada
    and entrada_es_de_hoy(entrada)
  order by entrada desc limit 1;
$$;

create or replace function terminal_presentes()
returns int language plpgsql stable security definer set search_path = public as $$
begin
  perform exigir_terminal_o_personal();
  return (select count(*) from registros_acceso
          where salida is null and not salida_no_registrada and entrada_es_de_hoy(entrada));
end $$;

create or replace view v_presentes with (security_invoker = true) as
  select r.id, s.nombre, s.matricula, r.entrada, r.solicitante_id, a.proyecto
  from registros_acceso r
  join solicitantes s on s.id = r.solicitante_id
  join autorizaciones_acceso a on a.id = r.autorizacion_id
  where r.salida is null and not r.salida_no_registrada and entrada_es_de_hoy(r.entrada);
revoke all on v_presentes from anon;

-- Cierre de jornada: marca como "salida no registrada" a quien sigue dentro
-- al cierre (o desde un día anterior) y cierra sus usos de equipo abiertos,
-- para que el equipo no quede "en uso" indefinidamente.
create or replace function marcar_salidas_no_registradas()
returns int language plpgsql security definer set search_path = public as $$
declare
  c configuracion%rowtype;
  n int;
begin
  if auth.uid() is not null and not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into c from configuracion where id = 1;

  update usos_equipo
     set fin = now(),
         observaciones = concat_ws(' · ', observaciones, 'Cerrado automáticamente al cierre de jornada')
   where fin is null and solicitante_id in (
     select solicitante_id from registros_acceso
     where salida is null and not salida_no_registrada
       and ((entrada at time zone c.zona_horaria)::date < hoy_local()
            or ahora_local()::time >= c.hora_cierre));

  update registros_acceso set salida_no_registrada = true
   where salida is null and not salida_no_registrada
     and ((entrada at time zone c.zona_horaria)::date < hoy_local()
          or ahora_local()::time >= c.hora_cierre);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 2. Autorizaciones de acceso
--   Crea o actualiza a la persona (por matrícula) y su autorización en una
--   sola transacción. Con p_id edita una autorización existente.
--   Desde la app: supabase.rpc('guardar_autorizacion', {...})
-- ---------------------------------------------------------------------
create or replace function guardar_autorizacion(
  p_nombre text, p_matricula text, p_correo text, p_proyecto text,
  p_inicio date, p_fin date, p_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_nombre  text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_mat     text := upper(regexp_replace(coalesce(p_matricula, ''), '\s', '', 'g'));
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_proy    text := trim(coalesce(p_proyecto, ''));
  v_sol     uuid;
  v_aut     uuid;
  v_otro    text;
begin
  if not tiene_rol('admin') then
    raise exception 'Solo el Administrador captura autorizaciones de acceso.' using errcode = '42501';
  end if;
  if v_nombre = '' or v_mat = '' or v_proy = '' then
    raise exception 'Nombre, matrícula y proyecto son obligatorios.';
  end if;
  if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo "%" no es válido.', v_correo;
  end if;
  if p_inicio is null or p_fin is null or p_fin < p_inicio then
    raise exception 'La fecha final debe ser igual o posterior a la inicial.';
  end if;

  if p_id is null then
    select id into v_sol from solicitantes where matricula = v_mat;
    if v_sol is null then
      insert into solicitantes (nombre, matricula, correo)
      values (v_nombre, v_mat, v_correo) returning id into v_sol;
    else
      update solicitantes set nombre = v_nombre, correo = v_correo, activo = true
      where id = v_sol;
    end if;
    insert into autorizaciones_acceso (solicitante_id, proyecto, fecha_inicio, fecha_fin)
    values (v_sol, v_proy, p_inicio, p_fin) returning id into v_aut;
  else
    select solicitante_id into v_sol from autorizaciones_acceso where id = p_id;
    if v_sol is null then raise exception 'La autorización no existe.'; end if;
    select nombre into v_otro from solicitantes where matricula = v_mat and id <> v_sol;
    if v_otro is not null then
      raise exception 'La matrícula % ya pertenece a %.', v_mat, v_otro;
    end if;
    update solicitantes set nombre = v_nombre, matricula = v_mat, correo = v_correo
    where id = v_sol;
    update autorizaciones_acceso set proyecto = v_proy, fecha_inicio = p_inicio, fecha_fin = p_fin
    where id = p_id;
    v_aut := p_id;
  end if;
  return v_aut;
end $$;

-- ---------------------------------------------------------------------
-- 3. Registros de entrada y salida
--   El personal registra entradas con terminal_registrar_entrada (igual que
--   la terminal) y cualquier cambio posterior con corregir_registro, que
--   exige motivo y deja constancia de quién y cuándo.
-- ---------------------------------------------------------------------
drop policy if exists registros_acceso_crear  on registros_acceso;
drop policy if exists registros_acceso_editar on registros_acceso;

create or replace function corregir_registro(p_registro uuid, p_entrada timestamptz,
                                             p_salida timestamptz, p_motivo text)
returns text language plpgsql security definer set search_path = public as $$
declare
  r      registros_acceso%rowtype;
  quien  text;
  otro   uuid;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indique el motivo de la corrección.';
  end if;
  select * into r from registros_acceso where id = p_registro for update;
  if not found then raise exception 'El registro no existe.'; end if;
  if p_entrada is null then raise exception 'La hora de entrada es obligatoria.'; end if;
  if p_entrada > now() + interval '1 minute' or p_salida > now() + interval '1 minute' then
    raise exception 'No se pueden registrar horas futuras.';
  end if;
  if p_salida is not null and p_salida < p_entrada then
    raise exception 'La salida no puede ser anterior a la entrada.';
  end if;
  if p_salida is null then
    if not entrada_es_de_hoy(p_entrada) then
      raise exception 'Para un día anterior indique la hora de salida.';
    end if;
    otro := persona_dentro(r.solicitante_id);
    if otro is not null and otro <> r.id then
      raise exception 'La persona ya tiene otra entrada abierta hoy.';
    end if;
  end if;

  -- Al registrar la salida se cierran los usos de equipo que hayan quedado abiertos
  if p_salida is not null then
    update usos_equipo
       set fin = greatest(inicio, least(p_salida, now())),
           observaciones = concat_ws(' · ', observaciones, 'Cerrado por el personal al registrar la salida')
     where solicitante_id = r.solicitante_id and fin is null;
  end if;

  select nombre into quien from perfiles where id = auth.uid();
  update registros_acceso
     set entrada = p_entrada,
         salida = p_salida,
         salida_no_registrada = case when p_salida is null and not entrada_es_de_hoy(p_entrada)
                                     then salida_no_registrada else false end,
         corregido_por = auth.uid(),
         observaciones = concat_ws(E'\n', observaciones,
                           to_char(ahora_local(), 'DD/MM/YYYY HH24:MI') || ' · '
                           || coalesce(quien, 'Personal') || ': ' || trim(p_motivo))
   where id = r.id;
  return 'Registro corregido.';
end $$;

-- ---------------------------------------------------------------------
-- 4. Sanciones (Art. 36)
--   Si no se indica fecha final, se calcula: una semana, un mes o un
--   semestre a partir de la fecha de inicio. Las amonestaciones no tienen
--   vigencia y no bloquean el acceso; las suspensiones sí.
-- ---------------------------------------------------------------------
create or replace function tg_sancion_defaults()
returns trigger language plpgsql as $$
begin
  if coalesce(trim(new.motivo), '') = '' then
    raise exception 'Indique el motivo de la sanción.';
  end if;
  new.motivo := trim(new.motivo);
  if new.fecha_fin is null then
    new.fecha_fin := case new.tipo
      when 'suspension_semana'   then new.fecha_inicio + 6
      when 'suspension_mes'      then (new.fecha_inicio + interval '1 month')::date - 1
      when 'suspension_semestre' then (new.fecha_inicio + interval '6 months')::date - 1
    end;
  end if;
  return new;
end $$;
create trigger sancion_defaults before insert or update on sanciones
  for each row execute function tg_sancion_defaults();

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
do $$ declare f text; begin
  foreach f in array array[
    'guardar_autorizacion(text,text,text,text,date,date,uuid)',
    'corregir_registro(uuid,timestamptz,timestamptz,text)',
    'marcar_salidas_no_registradas()', 'terminal_presentes()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Cierre automático diario (pg_cron)
--   02:30 UTC = 20:30 en Mérida (30 min después del cierre).
--   Si cambia el horario de cierre en Configuración, ajuste esta hora:
--     select cron.schedule('cierre-jornada', 'MM HH * * *', ...);
--   Si pg_cron no puede activarse aquí, actívelo en Database → Extensions
--   y ejecute de nuevo solo este bloque.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'No se pudo activar pg_cron (%). Actívelo en Database → Extensions y ejecute de nuevo este bloque.', sqlerrm;
    return;
  end;
  perform cron.schedule('cierre-jornada', '30 2 * * *',
                        'select public.marcar_salidas_no_registradas()');
end $$;

-- =====================================================================
-- Migración 0010: Reservaciones de varios días
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0009.
--
-- Dos formas de reservar más de un día:
--   1. Varios días con el mismo horario: serie diaria (de lunes a viernes,
--      o todos los días) además de la semanal que ya existía. Cada día es
--      una sesión de la serie; se cancelan juntas o por separado.
--   2. Uso continuo: la reservación empieza un día y termina otro (p. ej.,
--      un equipo que trabaja toda la noche). Como pasa fuera del horario,
--      solo la registra el Administrador, con contacto de emergencia.
--      Máximo 14 días continuos.
-- =====================================================================

-- Validación: se quita «debe empezar y terminar el mismo día» y se limita
-- la duración. Lo demás queda igual que en 0007.
create or replace function tg_reservacion_validar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  otra record;
  eq record;
  rango text;
begin
  new.titulo := trim(new.titulo);
  new.responsable := trim(new.responsable);
  new.equipos := coalesce((select array_agg(distinct x) from unnest(new.equipos) x), '{}');
  new.residuos := coalesce((select array_agg(distinct x order by x) from unnest(new.residuos) x), '{}');

  -- Cancelación: solo se exige el motivo
  if new.estado = 'cancelada' then
    if tg_op = 'UPDATE' and old.estado = 'cancelada' then
      raise exception 'La reservación ya está cancelada.';
    end if;
    if coalesce(trim(new.motivo_cancelacion), '') = '' then
      raise exception 'Indique el motivo de la cancelación.';
    end if;
    if tg_op = 'UPDATE' and fuera_de_horario(old.inicio, old.fin) and not tiene_rol('admin') then
      raise exception 'Las reservaciones fuera de horario o en fin de semana las modifica el Administrador.';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'cancelada' then
    raise exception 'Una reservación cancelada no se reactiva: registre una nueva.';
  end if;
  if new.fin <= new.inicio then
    raise exception 'La hora de término debe ser posterior a la de inicio.';
  end if;
  if new.fin - new.inicio > interval '14 days' then
    raise exception 'Una reservación de uso continuo dura como máximo 14 días; para periodos más largos use una serie.';
  end if;

  if new.actividad = 'clase' then
    new.ocupa_todo := true;   -- una clase ocupa todo el laboratorio
    if coalesce(trim(new.asignatura), '') = '' then
      raise exception 'Indique la asignatura de la clase.';
    end if;
  end if;
  if new.procedencia = 'externo' and coalesce(trim(new.institucion), '') = '' then
    raise exception 'Indique la institución o dependencia de procedencia (usuario externo).';
  end if;

  -- Horario (Configuración), fin de semana o uso continuo de varios días:
  -- solo el Administrador, con contacto de emergencia
  if fuera_de_horario(new.inicio, new.fin)
     or (tg_op = 'UPDATE' and fuera_de_horario(old.inicio, old.fin)) then
    if not tiene_rol('admin') then
      raise exception 'Fuera del horario del laboratorio (%–%), en fin de semana o de uso continuo de varios días, la reservación la registra el Administrador.',
        (select to_char(hora_apertura, 'HH24:MI') from configuracion where id = 1),
        (select to_char(hora_cierre, 'HH24:MI') from configuracion where id = 1);
    end if;
    if coalesce(trim(new.contacto_emergencia), '') = '' then
      raise exception 'Fuera de horario, en fin de semana o en uso continuo indique un contacto de emergencia.';
    end if;
    new.autorizado_por := auth.uid();
  end if;

  -- Equipos: deben existir y no estar dados de baja
  for eq in select x as id, e.nombre, e.estado from unnest(new.equipos) x left join equipos e on e.id = x loop
    if eq.nombre is null then raise exception 'Uno de los equipos indicados no existe.'; end if;
    if eq.estado = 'baja' then raise exception 'El equipo "%" está dado de baja.', eq.nombre; end if;
  end loop;

  -- Cruces (con bloqueo para que dos registros simultáneos no se encimen)
  perform pg_advisory_xact_lock(hashtext('reservaciones'));
  for otra in
    select r.* from reservaciones r
    where r.estado = 'programada' and r.id <> new.id
      and r.inicio < new.fin and r.fin > new.inicio
    order by r.inicio
  loop
    rango := to_char(a_hora_local(otra.inicio), 'DD/MM/YYYY HH24:MI') || '–' ||
             case when a_hora_local(otra.fin)::date = a_hora_local(otra.inicio)::date
                  then to_char(a_hora_local(otra.fin), 'HH24:MI')
                  else to_char(a_hora_local(otra.fin), 'DD/MM/YYYY HH24:MI') end;
    if new.ocupa_todo or otra.ocupa_todo then
      raise exception 'El horario se cruza con «%» (%), y % ocupa todo el laboratorio.',
        otra.titulo, rango,
        case when otra.ocupa_todo then 'esa reservación' else 'esta reservación' end;
    end if;
    select e.nombre into eq from equipos e
    where e.id = any (new.equipos) and e.id = any (otra.equipos) limit 1;
    if found then
      raise exception 'El equipo "%" ya está reservado para «%» (%).', eq.nombre, otra.titulo, rango;
    end if;
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Alta en una sola operación, ahora con frecuencia:
--   p_frecuencia = 'semanal' (máx. 26 sesiones), 'habil' (lunes a viernes)
--   o 'diaria' (todos los días); estas dos, máx. 60 sesiones.
-- Si una sola sesión se cruza, no se guarda ninguna.
-- Las llamadas anteriores, sin p_frecuencia, siguen siendo semanales.
-- ---------------------------------------------------------------------
drop function if exists registrar_reservacion(jsonb, date);

create or replace function registrar_reservacion(p jsonb, p_hasta date default null, p_frecuencia text default 'semanal')
returns int language plpgsql security invoker set search_path = public as $$
declare
  v_inicio timestamptz := (p ->> 'inicio')::timestamptz;
  v_fin    timestamptz := (p ->> 'fin')::timestamptz;
  v_tz     text := (select zona_horaria from configuracion where id = 1);
  v_paso   int;
  v_max    int;
  v_dia0   date;
  v_dias   int[] := '{}';   -- desplazamientos (en días) de cada sesión
  v_serie  uuid;
  d int;
  n int := 0;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if v_inicio is null or v_fin is null then
    raise exception 'Indique la fecha y el horario.';
  end if;
  if coalesce(p_frecuencia, 'semanal') not in ('semanal', 'habil', 'diaria') then
    raise exception 'Frecuencia de repetición no válida.';
  end if;
  if (p ->> 'folio_solicitud') is not null and exists (
       select 1 from reservaciones where folio_solicitud = (p ->> 'folio_solicitud')::int and estado = 'programada') then
    raise exception 'La solicitud FIQ % ya tiene una reservación programada.', p ->> 'folio_solicitud';
  end if;

  v_dia0 := a_hora_local(v_inicio)::date;
  if p_hasta is null then
    v_dias := array[0];
  else
    if a_hora_local(v_fin)::date > v_dia0 then
      raise exception 'Una reservación de uso continuo (que termina otro día) no se repite.';
    end if;
    if p_hasta < v_dia0 then
      raise exception 'La fecha final de la repetición es anterior a la primera sesión.';
    end if;
    v_paso := case p_frecuencia when 'semanal' then 7 else 1 end;
    v_max  := case p_frecuencia when 'semanal' then 26 else 60 end;
    d := 0;
    while v_dia0 + d <= p_hasta loop
      if p_frecuencia <> 'habil' or extract(isodow from v_dia0 + d) < 6 then
        v_dias := v_dias || d;
      end if;
      d := d + v_paso;
    end loop;
    if cardinality(v_dias) = 0 then
      raise exception 'No hay días hábiles (lunes a viernes) en el periodo indicado.';
    end if;
    if cardinality(v_dias) > v_max then
      raise exception 'Una serie % admite como máximo % sesiones (se pidieron %).',
        case p_frecuencia when 'semanal' then 'semanal' else 'diaria' end, v_max, cardinality(v_dias);
    end if;
    if cardinality(v_dias) > 1 then v_serie := gen_random_uuid(); end if;
  end if;

  foreach d in array v_dias loop
    begin
      insert into reservaciones (serie_id, inicio, fin, actividad, ocupa_todo, titulo, responsable,
        responsable_correo, responsable_telefono, usuarios, procedencia, institucion, asignatura,
        programa_educativo, semestre, num_alumnos, num_equipos_trabajo, equipos, materiales,
        residuos, contacto_emergencia, observaciones, folio_solicitud, reactivos, alumnos_pe)
      values (v_serie,
        (a_hora_local(v_inicio) + make_interval(days => d)) at time zone v_tz,
        (a_hora_local(v_fin) + make_interval(days => d)) at time zone v_tz,
        (p ->> 'actividad')::tipo_actividad, coalesce((p ->> 'ocupa_todo')::boolean, false),
        p ->> 'titulo', p ->> 'responsable',
        nullif(trim(p ->> 'responsable_correo'), ''), nullif(trim(p ->> 'responsable_telefono'), ''),
        nullif(trim(p ->> 'usuarios'), ''), coalesce(nullif(p ->> 'procedencia', ''), 'interno')::procedencia_usuario,
        nullif(trim(p ->> 'institucion'), ''), nullif(trim(p ->> 'asignatura'), ''),
        nullif(trim(p ->> 'programa_educativo'), ''), (p ->> 'semestre')::smallint,
        (p ->> 'num_alumnos')::int, (p ->> 'num_equipos_trabajo')::int,
        coalesce(array(select jsonb_array_elements_text(p -> 'equipos'))::uuid[], '{}'),
        nullif(trim(p ->> 'materiales'), ''),
        coalesce(array(select jsonb_array_elements_text(p -> 'residuos'))::smallint[], '{}'),
        nullif(trim(p ->> 'contacto_emergencia'), ''), nullif(trim(p ->> 'observaciones'), ''),
        (p ->> 'folio_solicitud')::int, nullif(trim(p ->> 'reactivos'), ''),
        case when jsonb_typeof(p -> 'alumnos_pe') = 'object' then p -> 'alumnos_pe' end);
    exception when others then
      if cardinality(v_dias) = 1 then raise; end if;
      raise exception 'Sesión del %: %', to_char(v_dia0 + d, 'DD/MM/YYYY'), sqlerrm;
    end;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Agenda de la terminal: incluye las reservaciones que empezaron antes
-- del periodo y siguen en curso (uso continuo).
-- ---------------------------------------------------------------------
create or replace function terminal_agenda(p_desde date, p_dias int default 7)
returns table (inicio timestamptz, fin timestamptz, actividad tipo_actividad, titulo text,
               asignatura text, ocupa_todo boolean, equipos text[])
language plpgsql stable security definer set search_path = public as $$
declare tz text := (select zona_horaria from configuracion where id = 1);
begin
  perform exigir_terminal_o_personal();
  return query
    select r.inicio, r.fin, r.actividad, r.titulo, r.asignatura, r.ocupa_todo,
           coalesce((select array_agg(e.nombre order by e.nombre) from equipos e where e.id = any (r.equipos)), '{}')
    from reservaciones r
    where r.estado = 'programada'
      and r.fin   >  p_desde::timestamp at time zone tz
      and r.inicio < (p_desde + least(greatest(p_dias, 1), 31))::timestamp at time zone tz
    order by r.inicio;
end $$;

create index if not exists reservaciones_fin on reservaciones (fin);

do $$ declare f text; begin
  foreach f in array array['registrar_reservacion(jsonb,date,text)', 'terminal_agenda(date,int)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

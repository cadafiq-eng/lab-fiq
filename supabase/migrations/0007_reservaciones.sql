-- =====================================================================
-- Migración 0007: Reservaciones del laboratorio
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0006.
--
-- Agenda de uso del laboratorio: quién lo usa, para qué (clase,
-- investigación, proyecto, vinculación…), de qué hora a qué hora, si es
-- interno o externo y qué equipos ocupa. Los datos siguen el formato de
-- solicitud de prácticas (FSP1), la solicitud de acceso al laboratorio, el
-- formato de acceso en fin de semana (FAV) y el reporte trimestral.
--
-- Reglas:
--   * La registra el personal y queda programada (sin paso de aprobación).
--   * Fuera del horario de Configuración o en fin de semana, solo el
--     Administrador, con contacto de emergencia (formato FAV).
--   * Una clase ocupa todo el laboratorio: no puede coincidir con ninguna
--     otra reservación. Las demás actividades pueden coincidir entre sí,
--     salvo que se marquen como «ocupa todo el laboratorio».
--   * Un mismo equipo no puede estar en dos reservaciones que se traslapan.
--   * Las clases semanales se registran como serie (una por semana).
--   * Nada se borra: se cancela con motivo.
-- =====================================================================

create type tipo_actividad     as enum ('clase', 'taller_curso', 'investigacion', 'proyecto',
                                        'vinculacion', 'otro');
create type procedencia_usuario as enum ('interno', 'externo');
create type estado_reservacion as enum ('programada', 'cancelada');

create table reservaciones (
  id                   uuid primary key default gen_random_uuid(),
  serie_id             uuid,                 -- ocurrencias de una misma clase semanal
  inicio               timestamptz not null,
  fin                  timestamptz not null,
  actividad            tipo_actividad not null,
  ocupa_todo           boolean not null default false,
  titulo               text not null check (length(trim(titulo)) > 0),  -- práctica, proyecto o servicio
  responsable          text not null check (length(trim(responsable)) > 0), -- profesor o asesor
  responsable_correo   text,
  responsable_telefono text,
  usuarios             text,                 -- quién usa el laboratorio (grupo o nombres)
  procedencia          procedencia_usuario not null default 'interno',
  institucion          text,                 -- dependencia o institución (externos)
  asignatura           text,
  programa_educativo   text,
  semestre             smallint check (semestre between 1 and 12),
  num_alumnos          int check (num_alumnos > 0),
  num_equipos_trabajo  int check (num_equipos_trabajo > 0),   -- equipos (grupos) de alumnos
  equipos              uuid[] not null default '{}',          -- equipos del laboratorio reservados
  materiales           text,
  residuos             smallint[] not null default '{}'       -- grupos 1–7 del formato; 8 = otros
                       check (residuos <@ '{1,2,3,4,5,6,7,8}'::smallint[]),
  contacto_emergencia  text,
  observaciones        text,
  estado               estado_reservacion not null default 'programada',
  motivo_cancelacion   text,
  autorizado_por       uuid references perfiles (id),
  creado_por           uuid references perfiles (id) default auth.uid(),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  check (fin > inicio)
);
create index reservaciones_inicio on reservaciones (inicio);
create index reservaciones_serie on reservaciones (serie_id);

-- Hora local del laboratorio para una marca de tiempo
create or replace function a_hora_local(t timestamptz)
returns timestamp language sql stable set search_path = public as $$
  select t at time zone (select zona_horaria from configuracion where id = 1);
$$;

-- ¿La reservación cae fuera del horario o en fin de semana?
create or replace function fuera_de_horario(p_inicio timestamptz, p_fin timestamptz)
returns boolean language sql stable set search_path = public as $$
  select extract(isodow from a_hora_local(p_inicio)) in (6, 7)
      or a_hora_local(p_inicio)::time < c.hora_apertura
      or a_hora_local(p_fin)::time > c.hora_cierre
      or a_hora_local(p_fin)::date > a_hora_local(p_inicio)::date
  from configuracion c where c.id = 1;
$$;

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

  if new.actividad = 'clase' then
    new.ocupa_todo := true;   -- una clase ocupa todo el laboratorio
    if coalesce(trim(new.asignatura), '') = '' then
      raise exception 'Indique la asignatura de la clase.';
    end if;
  end if;
  if new.procedencia = 'externo' and coalesce(trim(new.institucion), '') = '' then
    raise exception 'Indique la institución o dependencia de procedencia (usuario externo).';
  end if;

  -- Horario (Configuración) y fin de semana: solo el Administrador
  if fuera_de_horario(new.inicio, new.fin)
     or (tg_op = 'UPDATE' and fuera_de_horario(old.inicio, old.fin)) then
    if not tiene_rol('admin') then
      raise exception 'Fuera del horario del laboratorio (%–%) o en fin de semana, la reservación la registra el Administrador.',
        (select to_char(hora_apertura, 'HH24:MI') from configuracion where id = 1),
        (select to_char(hora_cierre, 'HH24:MI') from configuracion where id = 1);
    end if;
    if a_hora_local(new.fin)::date > a_hora_local(new.inicio)::date then
      raise exception 'La reservación debe empezar y terminar el mismo día.';
    end if;
    if coalesce(trim(new.contacto_emergencia), '') = '' then
      raise exception 'Fuera de horario o en fin de semana indique un contacto de emergencia.';
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
    rango := to_char(a_hora_local(otra.inicio), 'DD/MM/YYYY HH24:MI') || '–' || to_char(a_hora_local(otra.fin), 'HH24:MI');
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
create trigger reservacion_validar before insert or update on reservaciones
  for each row execute function tg_reservacion_validar();

create trigger reservaciones_actualizado before update on reservaciones
  for each row execute function tg_actualizado_en();
create trigger reservaciones_auditoria after insert or update or delete on reservaciones
  for each row execute function tg_auditoria();

alter table reservaciones enable row level security;
revoke all on reservaciones from anon;
create policy reservaciones_leer   on reservaciones for select to authenticated using (es_personal());
create policy reservaciones_crear  on reservaciones for insert to authenticated with check (es_personal());
create policy reservaciones_editar on reservaciones for update to authenticated
  using (es_personal()) with check (es_personal());

-- ---------------------------------------------------------------------
-- Alta en una sola operación. Con p_hasta, repite cada semana hasta esa
-- fecha (máximo 26 sesiones); si una sola se cruza, no se guarda ninguna.
--   p: { inicio, fin, actividad, ocupa_todo, titulo, responsable, ... }
-- ---------------------------------------------------------------------
create or replace function registrar_reservacion(p jsonb, p_hasta date default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  v_inicio timestamptz := (p ->> 'inicio')::timestamptz;
  v_fin    timestamptz := (p ->> 'fin')::timestamptz;
  v_serie  uuid;
  n int := 0;
  k int := 0;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if v_inicio is null or v_fin is null then
    raise exception 'Indique la fecha y el horario.';
  end if;
  if p_hasta is not null then
    if p_hasta < a_hora_local(v_inicio)::date then
      raise exception 'La fecha final de la repetición es anterior a la primera sesión.';
    end if;
    if (p_hasta - a_hora_local(v_inicio)::date) / 7 + 1 > 26 then
      raise exception 'Una serie semanal admite como máximo 26 sesiones.';
    end if;
    v_serie := gen_random_uuid();
  end if;
  loop
    -- La suma de semanas se hace en hora local para respetar cambios de horario
    exit when k > 0 and (p_hasta is null
                         or a_hora_local(v_inicio)::date + 7 * k > p_hasta);
    begin
      insert into reservaciones (serie_id, inicio, fin, actividad, ocupa_todo, titulo, responsable,
        responsable_correo, responsable_telefono, usuarios, procedencia, institucion, asignatura,
        programa_educativo, semestre, num_alumnos, num_equipos_trabajo, equipos, materiales,
        residuos, contacto_emergencia, observaciones)
      values (v_serie,
        (a_hora_local(v_inicio) + make_interval(days => 7 * k)) at time zone (select zona_horaria from configuracion where id = 1),
        (a_hora_local(v_fin) + make_interval(days => 7 * k)) at time zone (select zona_horaria from configuracion where id = 1),
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
        nullif(trim(p ->> 'contacto_emergencia'), ''), nullif(trim(p ->> 'observaciones'), ''));
    exception when others then
      if p_hasta is null then raise; end if;
      raise exception 'Sesión del %: %',
        to_char(a_hora_local(v_inicio)::date + 7 * k, 'DD/MM/YYYY'), sqlerrm;
    end;
    n := n + 1;
    k := k + 1;
  end loop;
  return n;
end $$;

-- Cancela una reservación; con p_serie, también las sesiones siguientes
-- de la misma serie que sigan programadas.
create or replace function cancelar_reservacion(p_id uuid, p_motivo text, p_serie boolean default false)
returns int language plpgsql security invoker set search_path = public as $$
declare
  r reservaciones%rowtype;
  n int;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into r from reservaciones where id = p_id;
  if not found then raise exception 'La reservación no existe.'; end if;
  update reservaciones set estado = 'cancelada', motivo_cancelacion = trim(p_motivo)
  where estado = 'programada'
    and (id = p_id or (p_serie and r.serie_id is not null and serie_id = r.serie_id and inicio >= r.inicio));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'La reservación ya estaba cancelada.'; end if;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Ocupación para la terminal de acceso: sin datos personales.
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
      and r.inicio >= p_desde::timestamp at time zone tz
      and r.inicio <  (p_desde + least(greatest(p_dias, 1), 31))::timestamp at time zone tz
    order by r.inicio;
end $$;

do $$ declare f text; begin
  foreach f in array array['registrar_reservacion(jsonb,date)', 'cancelar_reservacion(uuid,text,boolean)',
                           'terminal_agenda(date,int)', 'fuera_de_horario(timestamptz,timestamptz)',
                           'a_hora_local(timestamptz)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

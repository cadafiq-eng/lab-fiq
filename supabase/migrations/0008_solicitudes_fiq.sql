-- =====================================================================
-- Migración 0008: Solicitudes del sistema de Laboratorios FIQ
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0007.
--
-- Las solicitudes de acceso y de práctica llegan como aprobaciones de
-- Power Automate (Laboratorios FIQ). La app no se conecta a ese sistema:
-- el personal pega el texto de la aprobación y la app llena la
-- autorización o la reservación. Esta migración agrega:
--   1. El folio de la solicitud FIQ, para no registrar dos veces la misma.
--   2. En autorizaciones: institución y contacto de emergencia, y acceso
--      de académicos o personas sin matrícula (como personas externas).
--   3. En reservaciones: reactivos y alumnos por programa educativo
--      (IQI, QA, QI, IA, IB, IIL, otros y externos), como en el reporte
--      trimestral.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 y 2. Autorizaciones de acceso
-- ---------------------------------------------------------------------
alter table autorizaciones_acceso
  add column folio_solicitud     int,
  add column institucion         text,
  add column contacto_emergencia text;
create unique index autorizaciones_folio on autorizaciones_acceso (folio_solicitud) where folio_solicitud is not null;

-- Alta de una autorización a partir de una solicitud FIQ.
--   Con matrícula: misma lógica que guardar_autorizacion (estudiante).
--   Sin matrícula: académico o persona externa; se busca por correo y, si
--   no existe, se registra como persona externa con su institución.
create or replace function registrar_acceso_solicitud(
  p_folio int, p_nombre text, p_matricula text, p_correo text, p_proyecto text,
  p_inicio date, p_fin date, p_institucion text default null, p_contacto text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_mat    text := upper(regexp_replace(coalesce(p_matricula, ''), '\s', '', 'g'));
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_inst   text := nullif(trim(coalesce(p_institucion, '')), '');
  v_sol    uuid;
  v_aut    uuid;
begin
  if not tiene_rol('admin') then
    raise exception 'Solo el Administrador captura autorizaciones de acceso.' using errcode = '42501';
  end if;
  if p_folio is not null and exists (select 1 from autorizaciones_acceso where folio_solicitud = p_folio) then
    raise exception 'La solicitud FIQ % ya está registrada.', p_folio;
  end if;
  if v_mat <> '' then
    v_aut := guardar_autorizacion(v_nombre, v_mat, v_correo, p_proyecto, p_inicio, p_fin, null);
  else
    if v_nombre = '' or trim(coalesce(p_proyecto, '')) = '' then
      raise exception 'Nombre y proyecto son obligatorios.';
    end if;
    if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Indique un correo válido para la persona sin matrícula.';
    end if;
    if p_inicio is null or p_fin is null or p_fin < p_inicio then
      raise exception 'La fecha final debe ser igual o posterior a la inicial.';
    end if;
    select id into v_sol from solicitantes where lower(correo) = v_correo and matricula is null limit 1;
    if v_sol is null then
      insert into solicitantes (nombre, correo, externo, adscripcion)
      values (v_nombre, v_correo, true, v_inst) returning id into v_sol;
    else
      update solicitantes set nombre = v_nombre, adscripcion = coalesce(v_inst, adscripcion), activo = true
      where id = v_sol;
    end if;
    insert into autorizaciones_acceso (solicitante_id, proyecto, fecha_inicio, fecha_fin)
    values (v_sol, trim(p_proyecto), p_inicio, p_fin) returning id into v_aut;
  end if;
  update autorizaciones_acceso
  set folio_solicitud = p_folio, institucion = v_inst,
      contacto_emergencia = nullif(trim(coalesce(p_contacto, '')), '')
  where id = v_aut;
  return v_aut;
end $$;

-- ---------------------------------------------------------------------
-- 1 y 3. Reservaciones
-- ---------------------------------------------------------------------
alter table reservaciones
  add column folio_solicitud int,
  add column reactivos       text,
  add column alumnos_pe      jsonb;   -- {"IQI": 0, "QA": 0, "QI": 0, "IA": 14, "IB": 0, "IIL": 0, "Otros": 0, "Externos": 0}
-- Una misma solicitud no se registra dos veces para la misma sesión
create unique index reservaciones_folio on reservaciones (folio_solicitud, inicio)
  where folio_solicitud is not null and estado = 'programada';

-- Reemplaza la versión de 0007: agrega folio, reactivos y alumnos por programa.
create or replace function registrar_reservacion(p jsonb, p_hasta date default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  v_inicio timestamptz := (p ->> 'inicio')::timestamptz;
  v_fin    timestamptz := (p ->> 'fin')::timestamptz;
  v_tz     text := (select zona_horaria from configuracion where id = 1);
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
  if (p ->> 'folio_solicitud') is not null and exists (
       select 1 from reservaciones where folio_solicitud = (p ->> 'folio_solicitud')::int and estado = 'programada') then
    raise exception 'La solicitud FIQ % ya tiene una reservación programada.', p ->> 'folio_solicitud';
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
    exit when k > 0 and (p_hasta is null or a_hora_local(v_inicio)::date + 7 * k > p_hasta);
    begin
      insert into reservaciones (serie_id, inicio, fin, actividad, ocupa_todo, titulo, responsable,
        responsable_correo, responsable_telefono, usuarios, procedencia, institucion, asignatura,
        programa_educativo, semestre, num_alumnos, num_equipos_trabajo, equipos, materiales,
        residuos, contacto_emergencia, observaciones, folio_solicitud, reactivos, alumnos_pe)
      values (v_serie,
        (a_hora_local(v_inicio) + make_interval(days => 7 * k)) at time zone v_tz,
        (a_hora_local(v_fin) + make_interval(days => 7 * k)) at time zone v_tz,
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
      if p_hasta is null then raise; end if;
      raise exception 'Sesión del %: %', to_char(a_hora_local(v_inicio)::date + 7 * k, 'DD/MM/YYYY'), sqlerrm;
    end;
    n := n + 1;
    k := k + 1;
  end loop;
  return n;
end $$;

do $$ declare f text; begin
  foreach f in array array['registrar_acceso_solicitud(int,text,text,text,text,date,date,text,text)',
                           'registrar_reservacion(jsonb,date)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

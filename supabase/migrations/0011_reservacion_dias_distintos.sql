-- =====================================================================
-- Migración 0011: Reservación en varios días con horario distinto
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0010.
--
-- Para quien reserva, por ejemplo, el lunes de 9 a 13, el miércoles de
-- 14 a 18 y el viernes de 8 a 10: una sola reservación con varias
-- sesiones (misma serie), cada una con su fecha y su horario.
--   * Máximo 60 sesiones; si una se cruza, no se guarda ninguna.
--   * Cada sesión pasa por las mismas reglas (horario, cruces, equipos).
-- =====================================================================

create or replace function registrar_reservacion_sesiones(p jsonb, p_sesiones jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare
  v_serie uuid;
  v_n     int := coalesce(jsonb_array_length(case when jsonb_typeof(p_sesiones) = 'array' then p_sesiones end), 0);
  s       jsonb;
  v_ini   timestamptz;
  v_fin   timestamptz;
  n int := 0;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if v_n = 0 then
    raise exception 'Agregue al menos un día con su horario.';
  end if;
  if v_n > 60 then
    raise exception 'Una reservación admite como máximo 60 sesiones (se pidieron %).', v_n;
  end if;
  if (p ->> 'folio_solicitud') is not null and exists (
       select 1 from reservaciones where folio_solicitud = (p ->> 'folio_solicitud')::int and estado = 'programada') then
    raise exception 'La solicitud FIQ % ya tiene una reservación programada.', p ->> 'folio_solicitud';
  end if;
  if v_n > 1 then v_serie := gen_random_uuid(); end if;

  for s in select x from jsonb_array_elements(p_sesiones) x order by (x ->> 'inicio')::timestamptz loop
    v_ini := (s ->> 'inicio')::timestamptz;
    v_fin := (s ->> 'fin')::timestamptz;
    if v_ini is null or v_fin is null then
      raise exception 'Cada día necesita fecha, hora de inicio y hora de término.';
    end if;
    begin
      insert into reservaciones (serie_id, inicio, fin, actividad, ocupa_todo, titulo, responsable,
        responsable_correo, responsable_telefono, usuarios, procedencia, institucion, asignatura,
        programa_educativo, semestre, num_alumnos, num_equipos_trabajo, equipos, materiales,
        residuos, contacto_emergencia, observaciones, folio_solicitud, reactivos, alumnos_pe)
      values (v_serie, v_ini, v_fin,
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
      if v_n = 1 then raise; end if;
      raise exception 'Sesión del % (%–%): %', to_char(a_hora_local(v_ini), 'DD/MM/YYYY'),
        to_char(a_hora_local(v_ini), 'HH24:MI'), to_char(a_hora_local(v_fin), 'HH24:MI'), sqlerrm;
    end;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function registrar_reservacion_sesiones(jsonb, jsonb) from public, anon;
grant execute on function registrar_reservacion_sesiones(jsonb, jsonb) to authenticated;

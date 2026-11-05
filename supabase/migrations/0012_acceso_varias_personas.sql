-- =====================================================================
-- Migración 0012: Una solicitud de acceso FIQ con varias personas
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0011.
--
-- Algunas solicitudes de acceso (p. ej., «[ALUMNO EXTERNO] Persona A y
-- Persona B - Solicitud de acceso a laboratorio») traen a varias personas.
--   * El folio FIQ deja de ser único por autorización: ahora es único por
--     persona (una autorización por persona y folio).
--   * registrar_acceso_grupo registra a todas en una sola operación: si
--     una falla, no se guarda ninguna.
--   * Las personas externas pueden compartir el correo de contacto de la
--     solicitud o no tener correo; se distinguen por su nombre.
-- =====================================================================

drop index if exists autorizaciones_folio;
create unique index autorizaciones_folio_persona on autorizaciones_acceso (folio_solicitud, solicitante_id)
  where folio_solicitud is not null;

-- p_personas: [{"nombre": "...", "matricula": "...", "correo": "...", "telefono": "..."}, ...]
create or replace function registrar_acceso_grupo(
  p_folio int, p_personas jsonb, p_proyecto text, p_inicio date, p_fin date,
  p_institucion text default null, p_contacto text default null)
returns int language plpgsql security invoker set search_path = public as $$
declare
  v_inst   text := nullif(trim(coalesce(p_institucion, '')), '');
  v_n      int := coalesce(jsonb_array_length(case when jsonb_typeof(p_personas) = 'array' then p_personas end), 0);
  x        jsonb;
  v_nombre text;
  v_mat    text;
  v_correo text;
  v_tel    text;
  v_sol    uuid;
  v_aut    uuid;
  v_vistos text[] := '{}';
begin
  if not tiene_rol('admin') then
    raise exception 'Solo el Administrador captura autorizaciones de acceso.' using errcode = '42501';
  end if;
  if v_n = 0 then
    raise exception 'Indique al menos una persona.';
  end if;
  if v_n > 30 then
    raise exception 'Una solicitud admite como máximo 30 personas.';
  end if;
  if p_folio is not null and exists (select 1 from autorizaciones_acceso where folio_solicitud = p_folio) then
    raise exception 'La solicitud FIQ % ya está registrada.', p_folio;
  end if;
  if trim(coalesce(p_proyecto, '')) = '' then
    raise exception 'Indique el proyecto o actividad.';
  end if;
  if p_inicio is null or p_fin is null or p_fin < p_inicio then
    raise exception 'La fecha final debe ser igual o posterior a la inicial.';
  end if;

  for x in select value from jsonb_array_elements(p_personas) loop
    v_nombre := regexp_replace(trim(coalesce(x ->> 'nombre', '')), '\s+', ' ', 'g');
    v_mat    := upper(regexp_replace(coalesce(x ->> 'matricula', ''), '\s', '', 'g'));
    v_correo := nullif(lower(trim(coalesce(x ->> 'correo', ''))), '');
    v_tel    := nullif(trim(coalesce(x ->> 'telefono', '')), '');
    if v_nombre = '' then
      raise exception 'Falta el nombre de una de las personas.';
    end if;
    if lower(v_nombre) = any (v_vistos) then
      raise exception '«%» aparece dos veces en la solicitud.', v_nombre;
    end if;
    v_vistos := v_vistos || lower(v_nombre);
    if v_correo is not null and v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'El correo de % no es válido.', v_nombre;
    end if;

    if v_mat <> '' then
      -- Estudiante con matrícula: la misma regla que la captura normal
      v_aut := guardar_autorizacion(v_nombre, v_mat, coalesce(v_correo, ''), p_proyecto, p_inicio, p_fin, null);
    else
      -- Persona externa: se reutiliza su registro si ya existe (mismo nombre y correo)
      select id into v_sol from solicitantes
      where matricula is null and lower(nombre) = lower(v_nombre)
        and correo is not distinct from v_correo
      limit 1;
      if v_sol is null then
        insert into solicitantes (nombre, correo, telefono, externo, adscripcion)
        values (v_nombre, v_correo, v_tel, true, v_inst) returning id into v_sol;
      else
        update solicitantes set adscripcion = coalesce(v_inst, adscripcion),
          telefono = coalesce(v_tel, telefono), activo = true
        where id = v_sol;
      end if;
      insert into autorizaciones_acceso (solicitante_id, proyecto, fecha_inicio, fecha_fin)
      values (v_sol, trim(p_proyecto), p_inicio, p_fin) returning id into v_aut;
    end if;

    update autorizaciones_acceso
    set folio_solicitud = p_folio, institucion = v_inst,
        contacto_emergencia = nullif(trim(coalesce(p_contacto, '')), '')
    where id = v_aut;
  end loop;
  return v_n;
end $$;

revoke execute on function registrar_acceso_grupo(int, jsonb, text, date, date, text, text) from public, anon;
grant execute on function registrar_acceso_grupo(int, jsonb, text, date, date, text, text) to authenticated;

-- =====================================================================
-- 0017 · «Ocupa todo el laboratorio» opcional también en clases
--
-- Antes, toda clase ocupaba todo el laboratorio (el trigger lo forzaba).
-- Hay asignaturas (p. ej., DNPA) que usan solo una parte del laboratorio y
-- pueden coincidir con otras actividades. Ahora:
--   * La interfaz sigue marcando «Ocupa todo» por omisión en clases, talleres
--     y cursos, pero el personal puede desmarcarlo.
--   * El cruce de equipos sigue prohibido siempre.
--   * cambiar_ocupacion(): cambia «ocupa todo / uso compartido» de una
--     reservación y, si se pide, de las sesiones siguientes de su serie.
-- =====================================================================

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

  -- Una clase ocupa todo el laboratorio por omisión (lo propone la interfaz),
  -- pero el personal puede indicar uso compartido (0017)
  if new.actividad = 'clase' then
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
-- Cambiar «ocupa todo / uso compartido» (una sesión o las siguientes de la serie).
-- Pasa por el trigger de validación: si al marcar «ocupa todo» hay un cruce,
-- no se cambia ninguna sesión.
-- ---------------------------------------------------------------------
create or replace function cambiar_ocupacion(p_id uuid, p_ocupa_todo boolean, p_serie boolean default false)
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
  if r.estado <> 'programada' then raise exception 'La reservación está cancelada.'; end if;
  update reservaciones set ocupa_todo = coalesce(p_ocupa_todo, false)
  where estado = 'programada'
    and (id = p_id or (p_serie and r.serie_id is not null and serie_id = r.serie_id and inicio >= r.inicio));
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function cambiar_ocupacion(uuid, boolean, boolean) from public, anon;
grant execute on function cambiar_ocupacion(uuid, boolean, boolean) to authenticated;

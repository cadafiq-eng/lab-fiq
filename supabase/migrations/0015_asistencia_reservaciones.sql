-- =====================================================================
-- Migración 0015: Asistencia de las reservaciones (inicio y término reales)
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0014.
--
-- Profesores que dan clase, visitantes en jefe y sus grupos no tienen
-- autorización individual de acceso. El personal en turno registra al
-- empezar la práctica quién la dirige y cuántas personas entraron, y al
-- terminar, la hora de salida. Sirve para la estadística de uso.
--   * Una asistencia por reservación; solo con las funciones de abajo.
--   * Nada se borra; las correcciones quedan en la bitácora.
-- =====================================================================

create table asistencias_reservacion (
  reservacion_id   uuid primary key references reservaciones (id),
  entrada          timestamptz not null,
  salida           timestamptz,
  responsable      text not null check (length(trim(responsable)) > 0),  -- quien dirige (profesor, visitante en jefe)
  alumnos_fiq      int not null default 0 check (alumnos_fiq >= 0),
  externos         int not null default 0 check (externos >= 0),           -- otras instituciones o público
  descripcion      text,                                                    -- p. ej. «adultos mayores»
  observaciones    text,
  registrada_por   uuid references perfiles (id) default auth.uid(),
  registrada_en    timestamptz not null default now(),
  cerrada_por      uuid references perfiles (id),
  check (salida is null or salida > entrada)
);
create trigger asistencias_reservacion_auditoria after insert or update or delete on asistencias_reservacion
  for each row execute function tg_auditoria();

alter table asistencias_reservacion enable row level security;
revoke all on asistencias_reservacion from anon;
create policy asistencias_leer on asistencias_reservacion for select to authenticated using (es_personal());
-- Sin políticas de escritura: solo con las funciones.

-- Inicio de la práctica (o corrección de los datos de inicio)
create or replace function registrar_inicio_practica(
  p_reservacion uuid, p_responsable text, p_alumnos_fiq int, p_externos int,
  p_descripcion text default null, p_entrada timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare r reservaciones%rowtype;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into r from reservaciones where id = p_reservacion;
  if not found then raise exception 'La reservación no existe.'; end if;
  if r.estado = 'cancelada' then raise exception 'La reservación está cancelada.'; end if;
  if p_entrada is null then raise exception 'Indique la hora de entrada.'; end if;
  if p_entrada > now() + interval '15 minutes' then
    raise exception 'La hora de entrada no puede ser futura.';
  end if;
  if a_hora_local(p_entrada)::date not between a_hora_local(r.inicio)::date and a_hora_local(r.fin)::date then
    raise exception 'La hora de entrada debe ser del día de la reservación (%).', to_char(a_hora_local(r.inicio), 'DD/MM/YYYY');
  end if;
  if coalesce(p_alumnos_fiq, 0) < 0 or coalesce(p_externos, 0) < 0 then
    raise exception 'El número de asistentes no puede ser negativo.';
  end if;
  if exists (select 1 from asistencias_reservacion a where a.reservacion_id = p_reservacion
             and a.salida is not null and a.salida <= p_entrada) then
    raise exception 'La entrada debe ser anterior a la salida registrada.';
  end if;

  insert into asistencias_reservacion (reservacion_id, entrada, responsable, alumnos_fiq, externos, descripcion)
  values (p_reservacion, p_entrada, trim(coalesce(p_responsable, '')), coalesce(p_alumnos_fiq, 0),
          coalesce(p_externos, 0), nullif(trim(coalesce(p_descripcion, '')), ''))
  on conflict (reservacion_id) do update
    set entrada = excluded.entrada, responsable = excluded.responsable,
        alumnos_fiq = excluded.alumnos_fiq, externos = excluded.externos, descripcion = excluded.descripcion;
end $$;

-- Término de la práctica (o corrección de la hora de salida)
create or replace function registrar_termino_practica(
  p_reservacion uuid, p_salida timestamptz default now(), p_observaciones text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a asistencias_reservacion%rowtype;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into a from asistencias_reservacion where reservacion_id = p_reservacion;
  if not found then raise exception 'Primero registre el inicio de la práctica.'; end if;
  if p_salida is null or p_salida <= a.entrada then
    raise exception 'La hora de salida debe ser posterior a la entrada (%).', to_char(a_hora_local(a.entrada), 'HH24:MI');
  end if;
  if p_salida > now() + interval '15 minutes' then
    raise exception 'La hora de salida no puede ser futura.';
  end if;
  update asistencias_reservacion
  set salida = p_salida, cerrada_por = auth.uid(),
      observaciones = coalesce(nullif(trim(coalesce(p_observaciones, '')), ''), observaciones)
  where reservacion_id = p_reservacion;
end $$;

-- Una reservación con asistencia no se cancela (ya se realizó)
create or replace function tg_reservacion_con_asistencia()
returns trigger language plpgsql as $$
begin
  if new.estado = 'cancelada' and old.estado <> 'cancelada'
     and exists (select 1 from asistencias_reservacion where reservacion_id = new.id) then
    raise exception 'La práctica ya tiene asistencia registrada: no se puede cancelar.';
  end if;
  return new;
end $$;
create trigger reservacion_con_asistencia before update of estado on reservaciones
  for each row execute function tg_reservacion_con_asistencia();

do $$ declare f text; begin
  foreach f in array array['registrar_inicio_practica(uuid,text,int,int,text,timestamptz)',
                           'registrar_termino_practica(uuid,timestamptz,text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- Migración 0016: Solicitudes de mantenimiento de equipos
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0015.
--
-- El personal llena la solicitud (uno o varios equipos) y la app envía el
-- correo a los responsables de mantenimiento (Edge Function
-- «enviar-solicitud-mantenimiento», con Postmark). La solicitud queda
-- guardada con su seguimiento:
--   por_enviar → enviada → en_proceso → atendida   (o cancelada, con motivo)
--   * Al registrar un mantenimiento de un equipo solicitado, su renglón se
--     liga; cuando todos están atendidos, la solicitud pasa a «atendida».
--   * Destinatarios y remitente se ajustan en Configuración (Administrador).
--   * Nada se borra; el contenido enviado no se modifica.
-- =====================================================================

alter table configuracion
  add column if not exists mantenimiento_para text[] not null default
    '{mariana.martin@correo.uady.mx,franciscoj.dzul@correo.uady.mx}',
  add column if not exists mantenimiento_cc text[] not null default
    '{roger.bargas@correo.uady.mx,janice.chuc@correo.uady.mx,dalmira.rodriguez@correo.uady.mx}',
  add column if not exists correo_remitente text not null default 'lab.tecnologiadealimentos@correo.uady.mx',
  add column if not exists nombre_remitente text not null default 'Laboratorio de Tecnología de Alimentos · FIQ-UADY';

create table solicitudes_mantenimiento (
  id              uuid primary key default gen_random_uuid(),
  folio           int generated always as identity unique,
  observaciones   text,
  estado          text not null default 'por_enviar'
                  check (estado in ('por_enviar', 'enviada', 'en_proceso', 'atendida', 'cancelada')),
  para            text[] not null,
  cc              text[] not null default '{}',
  asunto          text not null,
  enviada_en      timestamptz,
  envio_id        text,          -- identificador del mensaje en Postmark
  envio_error     text,
  creada_en       timestamptz not null default now(),
  creada_por      uuid references perfiles (id) default auth.uid(),
  actualizada_en  timestamptz not null default now()
);
create index solicitudes_mantenimiento_estado on solicitudes_mantenimiento (estado, creada_en desc);

create table solicitud_mant_equipos (
  id              uuid primary key default gen_random_uuid(),
  solicitud_id    uuid not null references solicitudes_mantenimiento (id),
  orden           int not null,
  equipo_id       uuid not null references equipos (id),
  -- Copia de lo que se envió (no cambia si después se edita el equipo)
  equipo          text not null,
  num_inventario  text not null,
  marca           text,
  modelo          text,
  descripcion     text not null check (length(trim(descripcion)) > 0),
  tipo            tipo_mantenimiento not null,   -- P/C
  docencia        boolean not null default false,
  vinculacion     boolean not null default false,
  investigacion   boolean not null default false,
  mantenimiento_id uuid references mantenimientos (id),   -- el mantenimiento que la atendió
  unique (solicitud_id, equipo_id)
);
create index solicitud_mant_equipos_equipo on solicitud_mant_equipos (equipo_id) where mantenimiento_id is null;

create table solicitud_mant_seguimiento (
  id              uuid primary key default gen_random_uuid(),
  solicitud_id    uuid not null references solicitudes_mantenimiento (id),
  fecha           timestamptz not null default now(),
  estado          text,          -- estado al que pasó (null: solo nota)
  nota            text not null,
  registrado_por  uuid references perfiles (id) default auth.uid()
);
create index solicitud_mant_seguimiento_sol on solicitud_mant_seguimiento (solicitud_id, fecha);

do $$ declare t text; begin
  foreach t in array array['solicitudes_mantenimiento', 'solicitud_mant_equipos', 'solicitud_mant_seguimiento'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function tg_auditoria()', t || '_auditoria', t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('create policy %I on %I for select to authenticated using (es_personal())', t || '_leer', t);
  end loop;
end $$;
-- Sin políticas de escritura: solo con las funciones de abajo (y la Edge Function).

-- El contenido de la solicitud no cambia una vez creada
create or replace function tg_solicitud_mant_contenido()
returns trigger language plpgsql as $$
begin
  if new.para is distinct from old.para or new.cc is distinct from old.cc or (new.asunto is distinct from old.asunto and old.asunto <> 'pendiente')
     or new.observaciones is distinct from old.observaciones or new.creada_en is distinct from old.creada_en
     or new.creada_por is distinct from old.creada_por then
    raise exception 'El contenido de la solicitud de mantenimiento no se modifica.';
  end if;
  if old.estado in ('atendida', 'cancelada') and new.estado is distinct from old.estado then
    raise exception 'La solicitud ya está cerrada.';
  end if;
  new.actualizada_en := now();
  return new;
end $$;
create trigger solicitud_mant_contenido before update on solicitudes_mantenimiento
  for each row execute function tg_solicitud_mant_contenido();

-- ---------------------------------------------------------------------
-- Crear la solicitud. p_renglones:
--   [{"equipo_id": "...", "descripcion": "...", "tipo": "preventivo|correctivo",
--     "docencia": true, "vinculacion": false, "investigacion": true,
--     "marca": "...", "modelo": "..."}, ...]
-- Devuelve el id; el correo lo envía después la Edge Function.
-- ---------------------------------------------------------------------
create or replace function crear_solicitud_mantenimiento(p_renglones jsonb, p_observaciones text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c        configuracion%rowtype;
  v_id     uuid;
  v_folio  int;
  r        jsonb;
  e        equipos%rowtype;
  n        int := 0;
  v_tipos  text[] := '{}';
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Agregue al menos un equipo.';
  end if;
  if jsonb_array_length(p_renglones) > 30 then
    raise exception 'Una solicitud admite como máximo 30 equipos.';
  end if;
  select * into c from configuracion where id = 1;
  if coalesce(cardinality(c.mantenimiento_para), 0) = 0 then
    raise exception 'No hay destinatarios configurados para las solicitudes de mantenimiento (Configuración).';
  end if;

  insert into solicitudes_mantenimiento (observaciones, para, cc, asunto)
  values (nullif(trim(coalesce(p_observaciones, '')), ''), c.mantenimiento_para, c.mantenimiento_cc, 'pendiente')
  returning id, folio into v_id, v_folio;

  for r in select value from jsonb_array_elements(p_renglones) loop
    n := n + 1;
    select * into e from equipos where id = (r ->> 'equipo_id')::uuid;
    if not found then raise exception 'Renglón %: el equipo no existe.', n; end if;
    if e.estado = 'baja' then raise exception 'El equipo «%» está dado de baja.', e.nombre; end if;
    if coalesce(trim(r ->> 'descripcion'), '') = '' then
      raise exception 'Describa el mantenimiento que requiere «%».', e.nombre;
    end if;
    if coalesce(r ->> 'tipo', '') not in ('preventivo', 'correctivo') then
      raise exception 'Indique si el mantenimiento de «%» es preventivo o correctivo.', e.nombre;
    end if;
    if exists (select 1 from solicitud_mant_equipos x where x.solicitud_id = v_id and x.equipo_id = e.id) then
      raise exception 'El equipo «%» aparece dos veces en la solicitud.', e.nombre;
    end if;
    insert into solicitud_mant_equipos (solicitud_id, orden, equipo_id, equipo, num_inventario, marca, modelo,
      descripcion, tipo, docencia, vinculacion, investigacion)
    values (v_id, n, e.id, e.nombre, e.codigo,
      coalesce(nullif(trim(r ->> 'marca'), ''), e.marca), coalesce(nullif(trim(r ->> 'modelo'), ''), e.modelo),
      trim(r ->> 'descripcion'), (r ->> 'tipo')::tipo_mantenimiento,
      coalesce((r ->> 'docencia')::boolean, false), coalesce((r ->> 'vinculacion')::boolean, false),
      coalesce((r ->> 'investigacion')::boolean, false));
    v_tipos := v_tipos || (r ->> 'tipo');
  end loop;

  -- El asunto lleva el folio (se escribe una sola vez: solo mientras dice «pendiente»)
  update solicitudes_mantenimiento
  set asunto = format('Solicitud de mantenimiento %s de equipo%s – Laboratorio de Tecnología de Alimentos, FIQ (folio M-%s)',
                      case when 'correctivo' = all (v_tipos) then 'correctivo'
                           when 'preventivo' = all (v_tipos) then 'preventivo' else 'preventivo y correctivo' end,
                      case when n > 1 then 's' else '' end, lpad(v_folio::text, 4, '0'))
  where id = v_id;

  insert into solicitud_mant_seguimiento (solicitud_id, estado, nota)
  values (v_id, 'por_enviar', format('Solicitud creada con %s equipo(s).', n));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Seguimiento: nota y, opcionalmente, cambio de estado.
--   * «enviada» a mano solo desde «por_enviar» (si el correo se mandó por fuera).
--   * «cancelada» y «atendida» exigen nota.
-- ---------------------------------------------------------------------
create or replace function seguimiento_solicitud_mantenimiento(p_solicitud uuid, p_nota text, p_estado text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s solicitudes_mantenimiento%rowtype;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into s from solicitudes_mantenimiento where id = p_solicitud for update;
  if not found then raise exception 'La solicitud no existe.'; end if;
  if coalesce(trim(p_nota), '') = '' then raise exception 'Escriba la nota del seguimiento.'; end if;
  if p_estado is not null and p_estado <> s.estado then
    if s.estado in ('atendida', 'cancelada') then raise exception 'La solicitud ya está cerrada.'; end if;
    if p_estado not in ('enviada', 'en_proceso', 'atendida', 'cancelada') then
      raise exception 'Estado no válido.';
    end if;
    if p_estado = 'enviada' and s.estado <> 'por_enviar' then
      raise exception 'La solicitud ya fue enviada.';
    end if;
    update solicitudes_mantenimiento
    set estado = p_estado,
        enviada_en = case when p_estado = 'enviada' then coalesce(enviada_en, now()) else enviada_en end
    where id = p_solicitud;
  else
    p_estado := null;
  end if;
  insert into solicitud_mant_seguimiento (solicitud_id, estado, nota) values (p_solicitud, p_estado, trim(p_nota));
end $$;

-- ---------------------------------------------------------------------
-- Al registrar un mantenimiento, se liga al renglón abierto de ese equipo.
-- Si ya no quedan renglones sin atender, la solicitud pasa a «atendida».
-- ---------------------------------------------------------------------
create or replace function tg_mantenimiento_atiende_solicitud()
returns trigger language plpgsql security definer set search_path = public as $$
declare x record;
begin
  for x in
    update solicitud_mant_equipos r set mantenimiento_id = new.id
    from solicitudes_mantenimiento s
    where s.id = r.solicitud_id and r.equipo_id = new.equipo_id and r.mantenimiento_id is null
      and s.estado in ('por_enviar', 'enviada', 'en_proceso')
    returning r.solicitud_id, r.equipo
  loop
    insert into solicitud_mant_seguimiento (solicitud_id, nota)
    values (x.solicitud_id, format('Se registró el mantenimiento %s de «%s» (%s).', new.tipo, x.equipo, to_char(new.fecha, 'DD/MM/YYYY')));
    if not exists (select 1 from solicitud_mant_equipos where solicitud_id = x.solicitud_id and mantenimiento_id is null) then
      update solicitudes_mantenimiento set estado = 'atendida' where id = x.solicitud_id;
      insert into solicitud_mant_seguimiento (solicitud_id, estado, nota)
      values (x.solicitud_id, 'atendida', 'Todos los equipos de la solicitud tienen mantenimiento registrado.');
    end if;
  end loop;
  return null;
end $$;
create trigger mantenimiento_atiende_solicitud after insert on mantenimientos
  for each row execute function tg_mantenimiento_atiende_solicitud();

do $$ declare f text; begin
  foreach f in array array['crear_solicitud_mantenimiento(jsonb,text)', 'seguimiento_solicitud_mantenimiento(uuid,text,text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

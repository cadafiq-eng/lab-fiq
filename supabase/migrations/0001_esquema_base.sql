-- =====================================================================
-- Sistema de Gestión Integral del Laboratorio — FIQ-UADY
-- Migración 0001: esquema base (fase 1)
--
-- Cómo usarlo:
--   1. En Supabase: SQL Editor → New query → pegar todo este archivo → Run.
--   2. Crear la primera cuenta en Authentication → Users → Add user
--      (correo y contraseña del Administrador, marcar "Auto Confirm User").
--   3. Ejecutar el bloque "ALTA DEL PRIMER ADMINISTRADOR" (al final
--      de este archivo) con el correo de esa cuenta.
--
-- Principios:
--   * Nada se borra físicamente: no hay políticas DELETE; se usa "activo".
--   * Toda escritura queda en bitacora_auditoria (triggers).
--   * Las reglas del Reglamento de Laboratorios se validan en la base,
--     no solo en la interfaz.
--   * La terminal de acceso no lee tablas: solo llama funciones (RPC).
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Tipos enumerados
-- ---------------------------------------------------------------------
create type rol_usuario        as enum ('admin', 'gestor', 'terminal');
create type estado_equipo      as enum ('disponible', 'en_uso', 'prestado',
                                        'en_mantenimiento', 'fuera_de_servicio', 'baja');
create type tipo_mantenimiento as enum ('preventivo', 'correctivo');
create type tipo_articulo      as enum ('consumible', 'retornable');
create type tipo_movimiento    as enum ('entrada', 'salida', 'ajuste', 'perdida',
                                        'prestamo', 'devolucion');
create type tipo_prestamo      as enum ('interno', 'externo');
create type estado_prestamo    as enum ('abierto', 'cerrado');
-- Art. 36 del Reglamento, incisos a) a e)
create type tipo_sancion       as enum ('amonestacion_verbal', 'amonestacion_escrita',
                                        'suspension_semana', 'suspension_mes',
                                        'suspension_semestre');

-- ---------------------------------------------------------------------
-- 2. Configuración (una sola fila, editable por el Administrador)
-- ---------------------------------------------------------------------
create table configuracion (
  id                          int primary key default 1 check (id = 1),
  hora_apertura               time not null default '08:00',
  hora_cierre                 time not null default '20:00',
  zona_horaria                text not null default 'America/Mexico_City',
  dias_prestamo_max           int  not null default 7,   -- Art. 17
  dias_alerta_mantenimiento   int  not null default 15,  -- RE-03
  min_letras_busqueda         int  not null default 3    -- RA-05
);
insert into configuracion (id) values (1);

-- ---------------------------------------------------------------------
-- 3. Personal y solicitantes
-- ---------------------------------------------------------------------
create table perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nombre         text not null,
  roles          rol_usuario[] not null default '{}',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table solicitantes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (length(trim(nombre)) > 0),
  matricula      text not null unique,
  correo         text not null,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  registrado_por uuid references perfiles (id) default auth.uid()
);

create table autorizaciones_acceso (
  id             uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references solicitantes (id),
  proyecto       text not null,
  fecha_inicio   date not null,
  fecha_fin      date not null,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  registrado_por uuid references perfiles (id) default auth.uid(),
  check (fecha_fin >= fecha_inicio)
);
create index on autorizaciones_acceso (solicitante_id, fecha_inicio, fecha_fin);

create table registros_acceso (
  id                  uuid primary key default gen_random_uuid(),
  autorizacion_id     uuid not null references autorizaciones_acceso (id),
  solicitante_id      uuid not null references solicitantes (id),
  entrada             timestamptz not null default now(),
  salida              timestamptz,
  salida_no_registrada boolean not null default false,
  corregido_por       uuid references perfiles (id),
  observaciones       text,
  check (salida is null or salida >= entrada)
);
create index on registros_acceso (solicitante_id) where salida is null;

create table sanciones (
  id             uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references solicitantes (id),
  tipo           tipo_sancion not null,
  fecha_inicio   date not null default current_date,
  fecha_fin      date,
  motivo         text not null,
  activo         boolean not null default true,  -- false = sanción levantada
  creado_en      timestamptz not null default now(),
  aplicada_por   uuid references perfiles (id) default auth.uid(),
  check (tipo in ('amonestacion_verbal', 'amonestacion_escrita') or fecha_fin is not null),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

-- ---------------------------------------------------------------------
-- 4. Equipos
-- ---------------------------------------------------------------------
create table tipos_equipo (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null unique,
  requiere_capacitacion  boolean not null default false,
  entidad_capacitacion   text,   -- Responsable del lab, profesor, fabricante, proveedor
  activo                 boolean not null default true,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);

create table capacitaciones (
  id              uuid primary key default gen_random_uuid(),
  solicitante_id  uuid not null references solicitantes (id),
  tipo_equipo_id  uuid not null references tipos_equipo (id),
  fecha           date not null default current_date,
  entidad         text not null,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  registrado_por  uuid references perfiles (id) default auth.uid(),
  unique (solicitante_id, tipo_equipo_id)
);

create table equipos (
  id                          uuid primary key default gen_random_uuid(),
  codigo                      text not null unique,     -- ID único / inventario UADY
  nombre                      text not null,
  tipo_equipo_id              uuid not null references tipos_equipo (id),
  marca                       text,
  modelo                      text,
  numero_serie                text,
  ubicacion                   text,
  estado                      estado_equipo not null default 'disponible',
  voltaje                     text check (voltaje in ('110 V', '220 V', 'otro')),
  periodicidad_mantenimiento_dias int check (periodicidad_mantenimiento_dias > 0),
  ultimo_mantenimiento        date,
  proximo_mantenimiento       date,
  requiere_capacitacion       boolean,   -- se precarga desde tipos_equipo
  responsable                 text,
  foto_url                    text,
  manual_url                  text,
  creado_en                   timestamptz not null default now(),
  actualizado_en              timestamptz not null default now()
);

create table mantenimientos (
  id               uuid primary key default gen_random_uuid(),
  equipo_id        uuid not null references equipos (id),
  tipo             tipo_mantenimiento not null,
  fecha            date not null default current_date,
  proveedor        text,
  descripcion      text not null,
  costo            numeric(12,2) check (costo >= 0),
  deja_operativo   boolean not null default true,  -- true: el equipo vuelve a "disponible"
  creado_en        timestamptz not null default now(),
  registrado_por   uuid references perfiles (id) default auth.uid()
);

create table usos_equipo (
  id              uuid primary key default gen_random_uuid(),
  equipo_id       uuid not null references equipos (id),
  solicitante_id  uuid not null references solicitantes (id),
  inicio          timestamptz not null default now(),
  fin             timestamptz,
  observaciones   text,
  dano_reportado  boolean not null default false,
  check (fin is null or fin >= inicio)
);
create unique index usos_equipo_un_abierto on usos_equipo (equipo_id) where fin is null;

-- ---------------------------------------------------------------------
-- 5. Inventario y préstamos
-- ---------------------------------------------------------------------
create table articulos (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  tipo                tipo_articulo not null,
  unidad              text not null,                 -- g, mL, piezas…
  existencia          numeric(14,3) not null default 0 check (existencia >= 0),
  stock_minimo        numeric(14,3) not null default 0,
  ubicacion           text,
  especial            boolean not null default false, -- Art. 28
  recuperable         boolean not null default false, -- Art. 29
  pictogramas         text[] not null default '{}',   -- NOM-018-STPS-2015
  hoja_seguridad_url  text,
  activo              boolean not null default true,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

create table prestamos (
  id               uuid primary key default gen_random_uuid(),
  solicitante_id   uuid not null references solicitantes (id),
  tipo             tipo_prestamo not null default 'interno',
  fecha_entrega    timestamptz not null default now(),
  fecha_limite     date not null,
  estado           estado_prestamo not null default 'abierto',
  motivo           text not null,
  vobo_referencia  text,     -- oficio del Secretario Administrativo (Art. 16)
  autorizado_por   uuid references perfiles (id),
  creado_en        timestamptz not null default now(),
  registrado_por   uuid references perfiles (id) default auth.uid()
);

create table prestamo_renglones (
  id                 uuid primary key default gen_random_uuid(),
  prestamo_id        uuid not null references prestamos (id),
  equipo_id          uuid references equipos (id),
  articulo_id        uuid references articulos (id),
  cantidad           numeric(14,3) not null default 1 check (cantidad > 0),
  cantidad_devuelta  numeric(14,3) not null default 0 check (cantidad_devuelta >= 0),
  cantidad_perdida   numeric(14,3) not null default 0 check (cantidad_perdida >= 0),
  devuelto_en        timestamptz,
  danado             boolean not null default false,
  condicion          text,
  check ((equipo_id is null) <> (articulo_id is null)),
  check (equipo_id is null or cantidad = 1),
  check (cantidad_devuelta + cantidad_perdida <= cantidad)
);

create table movimientos_inventario (
  id               uuid primary key default gen_random_uuid(),
  articulo_id      uuid not null references articulos (id),
  tipo             tipo_movimiento not null,
  cantidad         numeric(14,3) not null,   -- positiva; en "ajuste" puede ser negativa
  lote             text,
  caducidad        date,
  solicitante_id   uuid references solicitantes (id),
  renglon_id       uuid references prestamo_renglones (id),
  motivo           text,
  autorizado_por   uuid references perfiles (id),
  creado_en        timestamptz not null default now(),
  registrado_por   uuid references perfiles (id) default auth.uid(),
  check (tipo = 'ajuste' or cantidad > 0),
  check (cantidad <> 0)
);

-- ---------------------------------------------------------------------
-- 6. Bitácora de auditoría
-- ---------------------------------------------------------------------
create table bitacora_auditoria (
  id          bigint generated always as identity primary key,
  tabla       text not null,
  registro_id uuid,
  accion      text not null,
  antes       jsonb,
  despues     jsonb,
  usuario     uuid,
  fecha       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. Funciones auxiliares
-- ---------------------------------------------------------------------
create or replace function tiene_rol(r rol_usuario)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles
                 where id = auth.uid() and activo and r = any (roles));
$$;

create or replace function es_personal()
returns boolean language sql stable security definer set search_path = public as $$
  select tiene_rol('admin') or tiene_rol('gestor');
$$;

create or replace function es_admin_perfil(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = p and activo and 'admin' = any (roles));
$$;

-- Fecha y hora "locales" del laboratorio
create or replace function ahora_local()
returns timestamp language sql stable set search_path = public as $$
  select now() at time zone (select zona_horaria from configuracion where id = 1);
$$;

create or replace function hoy_local()
returns date language sql stable set search_path = public as $$
  select ahora_local()::date;
$$;

create or replace function autorizacion_vigente(p_solicitante uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select a.id from autorizaciones_acceso a
  join solicitantes s on s.id = a.solicitante_id and s.activo
  where a.solicitante_id = p_solicitante and a.activo
    and hoy_local() between a.fecha_inicio and a.fecha_fin
  order by a.fecha_fin desc limit 1;
$$;

-- RA-02: suspensiones del Art. 36 incisos c), d) y e)
create or replace function tiene_sancion_activa(p_solicitante uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sanciones
                 where solicitante_id = p_solicitante and activo
                   and tipo in ('suspension_semana', 'suspension_mes', 'suspension_semestre')
                   and hoy_local() between fecha_inicio and fecha_fin);
$$;

-- RE-01, RE-04, RE-05 y RA-02 en un solo lugar.
-- Devuelve null si el equipo puede usarse o prestarse; si no, el motivo.
create or replace function motivo_bloqueo_equipo(p_equipo uuid, p_solicitante uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  e equipos%rowtype;
  t tipos_equipo%rowtype;
begin
  select * into e from equipos where id = p_equipo;
  if not found then return 'El equipo no existe.'; end if;
  if e.estado <> 'disponible' then
    return format('El equipo no está disponible (estado: %s).', replace(e.estado::text, '_', ' '));
  end if;
  if e.proximo_mantenimiento is not null and e.proximo_mantenimiento < hoy_local() then
    return 'El equipo tiene el mantenimiento vencido y está bloqueado hasta registrarlo.';
  end if;
  if tiene_sancion_activa(p_solicitante) then
    return 'La persona tiene una suspensión vigente.';
  end if;
  if coalesce(e.requiere_capacitacion, false) and not exists (
       select 1 from capacitaciones
       where solicitante_id = p_solicitante and tipo_equipo_id = e.tipo_equipo_id and activo) then
    select * into t from tipos_equipo where id = e.tipo_equipo_id;
    return format('Requiere capacitación previa en "%s"%s.', t.nombre,
                  coalesce(', impartida por ' || t.entidad_capacitacion, ''));
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 8. Triggers de reglas de negocio
-- ---------------------------------------------------------------------

-- actualizado_en automático
create or replace function tg_actualizado_en()
returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['perfiles','solicitantes','autorizaciones_acceso',
                           'tipos_equipo','equipos','articulos'] loop
    execute format('create trigger %I before update on %I
                    for each row execute function tg_actualizado_en()', t || '_actualizado', t);
  end loop;
end $$;

-- Equipos: precarga "requiere capacitación" desde su tipo y calcula
-- el próximo mantenimiento cuando se captura el último.
create or replace function tg_equipos_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requiere_capacitacion is null
     or (tg_op = 'UPDATE' and new.tipo_equipo_id <> old.tipo_equipo_id
         and new.requiere_capacitacion is not distinct from old.requiere_capacitacion) then
    select requiere_capacitacion into new.requiere_capacitacion
    from tipos_equipo where id = new.tipo_equipo_id;
  end if;
  if new.ultimo_mantenimiento is not null and new.periodicidad_mantenimiento_dias is not null
     and (tg_op = 'INSERT' or new.ultimo_mantenimiento is distinct from old.ultimo_mantenimiento
          or new.periodicidad_mantenimiento_dias is distinct from old.periodicidad_mantenimiento_dias)
     and (tg_op = 'INSERT' or new.proximo_mantenimiento is not distinct from old.proximo_mantenimiento) then
    new.proximo_mantenimiento := new.ultimo_mantenimiento + new.periodicidad_mantenimiento_dias;
  end if;
  return new;
end $$;
create trigger equipos_defaults before insert or update on equipos
  for each row execute function tg_equipos_defaults();

-- RE-02: al registrar un mantenimiento se actualizan fechas y estado
create or replace function tg_mantenimiento_registrado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update equipos e set
    ultimo_mantenimiento  = greatest(coalesce(e.ultimo_mantenimiento, new.fecha), new.fecha),
    proximo_mantenimiento = case when e.periodicidad_mantenimiento_dias is null
                                 then e.proximo_mantenimiento
                                 else greatest(coalesce(e.ultimo_mantenimiento, new.fecha), new.fecha)
                                      + e.periodicidad_mantenimiento_dias end,
    estado = case when new.deja_operativo and e.estado in ('en_mantenimiento', 'fuera_de_servicio')
                  then 'disponible'::estado_equipo else e.estado end
  where e.id = new.equipo_id;
  return new;
end $$;
create trigger mantenimiento_registrado after insert on mantenimientos
  for each row execute function tg_mantenimiento_registrado();

-- RE-06 / RE-07: uso en sitio
create or replace function tg_uso_equipo()
returns trigger language plpgsql security definer set search_path = public as $$
declare motivo text;
begin
  if tg_op = 'INSERT' then
    motivo := motivo_bloqueo_equipo(new.equipo_id, new.solicitante_id);
    if motivo is not null then raise exception '%', motivo using errcode = 'P0001'; end if;
    update equipos set estado = 'en_uso' where id = new.equipo_id;
  elsif new.fin is not null and old.fin is null then
    update equipos set estado = case when new.dano_reportado then 'fuera_de_servicio'
                                     else 'disponible' end::estado_equipo
    where id = new.equipo_id and estado = 'en_uso';
  end if;
  return new;
end $$;
create trigger uso_equipo after insert or update on usos_equipo
  for each row execute function tg_uso_equipo();

-- Movimientos de inventario: actualizan existencia y validan Art. 28
create or replace function tg_movimiento_inventario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a articulos%rowtype;
  delta numeric;
begin
  select * into a from articulos where id = new.articulo_id for update;
  if new.tipo = 'salida' and a.tipo <> 'consumible' then
    raise exception 'Los materiales retornables se entregan como préstamo, no como salida.';
  end if;
  if new.tipo = 'salida' and a.especial
     and not (tiene_rol('admin') or es_admin_perfil(new.autorizado_por)) then
    raise exception 'El reactivo "%" es especial: requiere autorización del Administrador (Art. 28).', a.nombre;
  end if;
  delta := case new.tipo
             when 'entrada'    then new.cantidad
             when 'devolucion' then new.cantidad
             when 'ajuste'     then new.cantidad
             else -new.cantidad end;
  if a.existencia + delta < 0 then
    raise exception 'Existencia insuficiente de "%": hay % %, se piden %.',
      a.nombre, a.existencia, a.unidad, abs(delta);
  end if;
  update articulos set existencia = existencia + delta where id = a.id;
  return new;
end $$;
create trigger movimiento_inventario before insert on movimientos_inventario
  for each row execute function tg_movimiento_inventario();

-- Préstamos: Arts. 16 y 17, RA-02
create or replace function tg_prestamo_validar()
returns trigger language plpgsql security definer set search_path = public as $$
declare dias_max int := (select dias_prestamo_max from configuracion where id = 1);
begin
  -- En una edición solo se revalida si cambian los datos que controlan las reglas
  -- (cerrar un préstamo vencido no debe fallar).
  if tg_op = 'UPDATE'
     and new.solicitante_id = old.solicitante_id and new.tipo = old.tipo
     and new.fecha_limite = old.fecha_limite
     and new.vobo_referencia is not distinct from old.vobo_referencia
     and new.autorizado_por is not distinct from old.autorizado_por then
    return new;
  end if;
  if tg_op = 'INSERT' and tiene_sancion_activa(new.solicitante_id) then
    raise exception 'La persona tiene una suspensión vigente y no puede recibir préstamos.';
  end if;
  if new.fecha_limite < hoy_local() then
    raise exception 'La fecha límite no puede ser anterior a hoy.';
  end if;
  if new.fecha_limite > hoy_local() + dias_max and not es_admin_perfil(new.autorizado_por) then
    raise exception 'Un préstamo de más de % días requiere autorización del Administrador (Art. 17).', dias_max;
  end if;
  if new.tipo = 'externo' and (new.vobo_referencia is null or not es_admin_perfil(new.autorizado_por)) then
    raise exception 'Un préstamo externo requiere el visto bueno del Secretario Administrativo y autorización del Administrador (Art. 16).';
  end if;
  if new.autorizado_por is not null and new.autorizado_por <> auth.uid() and not tiene_rol('admin')
     and (tg_op = 'INSERT' or new.autorizado_por is distinct from old.autorizado_por) then
    raise exception 'Solo el propio Administrador puede registrarse como quien autoriza.';
  end if;
  return new;
end $$;
create trigger prestamo_validar before insert or update on prestamos
  for each row execute function tg_prestamo_validar();

-- Renglones de préstamo: entrega, devolución y cierre automático
create or replace function tg_renglon_prestamo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p prestamos%rowtype;
  motivo text;
  delta_dev numeric;
begin
  select * into p from prestamos where id = new.prestamo_id;
  if tg_op = 'INSERT' then
    if p.estado <> 'abierto' then raise exception 'El préstamo ya está cerrado.'; end if;
    if new.equipo_id is not null then
      motivo := motivo_bloqueo_equipo(new.equipo_id, p.solicitante_id);
      if motivo is not null then raise exception '%', motivo using errcode = 'P0001'; end if;
      update equipos set estado = 'prestado' where id = new.equipo_id;
    else
      if (select tipo from articulos where id = new.articulo_id) <> 'retornable' then
        raise exception 'Los consumibles no se prestan: regístrelos como salida.';
      end if;
      -- la salida de inventario se registra en el trigger AFTER (renglón ya existe)
    end if;
  else  -- UPDATE: devolución
    if new.equipo_id is not null and new.devuelto_en is not null and old.devuelto_en is null then
      update equipos set estado = case when new.danado then 'fuera_de_servicio'
                                       else 'disponible' end::estado_equipo
      where id = new.equipo_id and estado = 'prestado';
    end if;
    if new.articulo_id is not null then
      delta_dev := new.cantidad_devuelta - old.cantidad_devuelta;
      if delta_dev < 0 then raise exception 'No se puede reducir una cantidad ya devuelta.'; end if;
      if delta_dev > 0 then
        insert into movimientos_inventario (articulo_id, tipo, cantidad, solicitante_id,
                                            renglon_id, motivo)
        values (new.articulo_id, 'devolucion', delta_dev, p.solicitante_id, new.id,
                'Devolución de préstamo');
      end if;
      if new.cantidad_devuelta + new.cantidad_perdida >= new.cantidad and new.devuelto_en is null then
        new.devuelto_en := now();
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger renglon_prestamo_antes before insert or update on prestamo_renglones
  for each row execute function tg_renglon_prestamo();

create or replace function tg_renglon_salida_material()
returns trigger language plpgsql security definer set search_path = public as $$
declare p prestamos%rowtype;
begin
  select * into p from prestamos where id = new.prestamo_id;
  insert into movimientos_inventario (articulo_id, tipo, cantidad, solicitante_id,
                                      renglon_id, motivo)
  values (new.articulo_id, 'prestamo', new.cantidad, p.solicitante_id, new.id,
          'Préstamo: ' || p.motivo);
  return null;
end $$;
create trigger renglon_salida_material after insert on prestamo_renglones
  for each row when (new.articulo_id is not null)
  execute function tg_renglon_salida_material();

create or replace function tg_cerrar_prestamo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update prestamos set estado = 'cerrado'
  where id = new.prestamo_id and estado = 'abierto'
    and not exists (select 1 from prestamo_renglones
                    where prestamo_id = new.prestamo_id and devuelto_en is null);
  return null;
end $$;
create trigger renglon_prestamo_cierre after update on prestamo_renglones
  for each row execute function tg_cerrar_prestamo();

-- ---------------------------------------------------------------------
-- 9. Auditoría en todas las tablas
-- ---------------------------------------------------------------------
create or replace function tg_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into bitacora_auditoria (tabla, registro_id, accion, antes, despues, usuario)
  values (tg_table_name,
          case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
               else (to_jsonb(new) ->> 'id')::uuid end,
          tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
          auth.uid());
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['configuracion','perfiles','solicitantes','autorizaciones_acceso',
    'registros_acceso','sanciones','tipos_equipo','capacitaciones','equipos','mantenimientos',
    'usos_equipo','articulos','prestamos','prestamo_renglones','movimientos_inventario'] loop
    execute format('create trigger %I after insert or update or delete on %I
                    for each row execute function tg_auditoria()', t || '_auditoria', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. Seguridad por filas (RLS)
--   admin  : todo excepto borrar
--   gestor : operación diaria (ver matriz de permisos del SRS)
--   terminal: sin acceso a tablas; solo funciones de la sección 11
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['configuracion','perfiles','solicitantes','autorizaciones_acceso',
    'registros_acceso','sanciones','tipos_equipo','capacitaciones','equipos','mantenimientos',
    'usos_equipo','articulos','prestamos','prestamo_renglones','movimientos_inventario',
    'bitacora_auditoria'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- Configuración: todos los del personal la leen; solo admin la cambia
create policy conf_leer   on configuracion for select to authenticated using (es_personal());
create policy conf_editar on configuracion for update to authenticated
  using (tiene_rol('admin')) with check (tiene_rol('admin'));

-- Perfiles: cada quien ve el suyo; el admin ve y edita todos.
-- (La creación de cuentas se hace con la Edge Function, no desde el navegador.)
create policy perfiles_leer on perfiles for select to authenticated
  using (id = auth.uid() or tiene_rol('admin'));
create policy perfiles_editar on perfiles for update to authenticated
  using (tiene_rol('admin')) with check (tiene_rol('admin'));

-- Tablas que opera todo el personal (admin y gestor): leer, crear y editar
do $$ declare t text; begin
  foreach t in array array['solicitantes','registros_acceso','tipos_equipo','equipos',
    'mantenimientos','usos_equipo','articulos','prestamos','prestamo_renglones'] loop
    execute format('create policy %I on %I for select to authenticated using (es_personal())', t || '_leer', t);
    execute format('create policy %I on %I for insert to authenticated with check (es_personal())', t || '_crear', t);
    execute format('create policy %I on %I for update to authenticated using (es_personal()) with check (es_personal())', t || '_editar', t);
  end loop;
end $$;

-- Movimientos: se registran, nunca se editan (corrección = ajuste)
create policy movimientos_leer  on movimientos_inventario for select to authenticated using (es_personal());
create policy movimientos_crear on movimientos_inventario for insert to authenticated with check (es_personal());

-- Solo el Administrador escribe: autorizaciones, sanciones y capacitaciones
do $$ declare t text; begin
  foreach t in array array['autorizaciones_acceso','sanciones','capacitaciones'] loop
    execute format('create policy %I on %I for select to authenticated using (es_personal())', t || '_leer', t);
    execute format('create policy %I on %I for insert to authenticated with check (tiene_rol(''admin''))', t || '_crear', t);
    execute format('create policy %I on %I for update to authenticated using (tiene_rol(''admin'')) with check (tiene_rol(''admin''))', t || '_editar', t);
  end loop;
end $$;

-- Bitácora: solo lectura para el admin; la escriben los triggers
create policy bitacora_leer on bitacora_auditoria for select to authenticated using (tiene_rol('admin'));

-- ---------------------------------------------------------------------
-- 11. Funciones de la terminal de acceso (RPC)
--   La sesión "terminal" solo puede llamar estas funciones.
--   Desde la app: supabase.rpc('terminal_buscar', { p_texto: 'ana' })
-- ---------------------------------------------------------------------
create or replace function exigir_terminal_o_personal()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not (tiene_rol('terminal') or es_personal()) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
end $$;

create or replace function persona_dentro(p_solicitante uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from registros_acceso
  where solicitante_id = p_solicitante and salida is null and not salida_no_registrada
  order by entrada desc limit 1;
$$;

-- RA-05: búsqueda por nombre (mínimo 3 letras, solo devuelve nombres)
create or replace function terminal_buscar(p_texto text)
returns table (solicitante_id uuid, nombre text, dentro boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare minimo int := (select min_letras_busqueda from configuracion where id = 1);
begin
  perform exigir_terminal_o_personal();
  if length(trim(coalesce(p_texto, ''))) < minimo then
    raise exception 'Escribe al menos % letras de tu nombre.', minimo;
  end if;
  return query
    select s.id, s.nombre, persona_dentro(s.id) is not null
    from solicitantes s
    where s.activo
      and autorizacion_vigente(s.id) is not null
      and unaccent(lower(s.nombre)) like '%' || unaccent(lower(trim(p_texto))) || '%'
    order by s.nombre
    limit 10;
end $$;

-- RA-01, RA-02, RA-03
create or replace function terminal_registrar_entrada(p_solicitante uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  c configuracion%rowtype;
  aut uuid;
  hora time;
begin
  perform exigir_terminal_o_personal();
  select * into c from configuracion where id = 1;
  hora := ahora_local()::time;
  if hora < c.hora_apertura or hora >= c.hora_cierre then
    raise exception 'El laboratorio opera de % a %.',
      to_char(c.hora_apertura, 'HH24:MI'), to_char(c.hora_cierre, 'HH24:MI');
  end if;
  aut := autorizacion_vigente(p_solicitante);
  if aut is null or tiene_sancion_activa(p_solicitante) then
    raise exception 'Acude con el personal en turno.';
  end if;
  if persona_dentro(p_solicitante) is not null then
    raise exception 'Ya tienes una entrada registrada.';
  end if;
  insert into registros_acceso (autorizacion_id, solicitante_id) values (aut, p_solicitante);
  return 'Entrada registrada. ¡Bienvenido(a)!';
end $$;

create or replace function terminal_registrar_salida(p_solicitante uuid)
returns text language plpgsql security definer set search_path = public as $$
declare reg uuid;
begin
  perform exigir_terminal_o_personal();
  reg := persona_dentro(p_solicitante);
  if reg is null then raise exception 'No tienes una entrada registrada.'; end if;
  if exists (select 1 from usos_equipo where solicitante_id = p_solicitante and fin is null) then
    raise exception 'Antes de salir, termina el uso de los equipos que tienes abiertos.';
  end if;
  update registros_acceso set salida = now() where id = reg;
  return 'Salida registrada. ¡Hasta pronto!';
end $$;

-- Lista de equipos con la indicación de si esta persona puede usarlos
create or replace function terminal_equipos(p_solicitante uuid)
returns table (equipo_id uuid, codigo text, nombre text, tipo text,
               puede_usar boolean, motivo text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform exigir_terminal_o_personal();
  return query
    select e.id, e.codigo, e.nombre, t.nombre,
           motivo_bloqueo_equipo(e.id, p_solicitante) is null,
           motivo_bloqueo_equipo(e.id, p_solicitante)
    from equipos e join tipos_equipo t on t.id = e.tipo_equipo_id
    where e.estado <> 'baja'
    order by e.nombre;
end $$;

create or replace function terminal_usos_abiertos(p_solicitante uuid)
returns table (uso_id uuid, equipo text, inicio timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform exigir_terminal_o_personal();
  return query
    select u.id, e.nombre, u.inicio
    from usos_equipo u join equipos e on e.id = u.equipo_id
    where u.solicitante_id = p_solicitante and u.fin is null;
end $$;

create or replace function terminal_iniciar_uso(p_solicitante uuid, p_equipo uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform exigir_terminal_o_personal();
  if persona_dentro(p_solicitante) is null then
    raise exception 'Primero registra tu entrada al laboratorio.';
  end if;
  insert into usos_equipo (equipo_id, solicitante_id) values (p_equipo, p_solicitante);
  return 'Uso del equipo registrado.';
end $$;

create or replace function terminal_terminar_uso(p_solicitante uuid, p_uso uuid,
                                                 p_observaciones text default null,
                                                 p_dano boolean default false)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform exigir_terminal_o_personal();
  update usos_equipo
     set fin = now(), observaciones = nullif(trim(p_observaciones), ''),
         dano_reportado = coalesce(p_dano, false)
   where id = p_uso and solicitante_id = p_solicitante and fin is null;
  if not found then raise exception 'Ese uso no está abierto a tu nombre.'; end if;
  return case when p_dano then 'Uso terminado. El daño quedó reportado al personal.'
              else 'Uso terminado. Gracias.' end;
end $$;

create or replace function terminal_presentes()
returns int language plpgsql stable security definer set search_path = public as $$
begin
  perform exigir_terminal_o_personal();
  return (select count(*) from registros_acceso
          where salida is null and not salida_no_registrada);
end $$;

-- RA-04: cierre de jornada. Llamarla a diario (ver pg_cron al final).
create or replace function marcar_salidas_no_registradas()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  update registros_acceso set salida_no_registrada = true
  where salida is null and not salida_no_registrada
    and (entrada at time zone (select zona_horaria from configuracion where id = 1))::date < hoy_local();
  get diagnostics n = row_count;
  return n;
end $$;

-- Permisos de ejecución: nadie anónimo
do $$ declare f text; begin
  foreach f in array array[
    'terminal_buscar(text)', 'terminal_registrar_entrada(uuid)',
    'terminal_registrar_salida(uuid)', 'terminal_equipos(uuid)',
    'terminal_usos_abiertos(uuid)', 'terminal_iniciar_uso(uuid,uuid)',
    'terminal_terminar_uso(uuid,uuid,text,boolean)', 'terminal_presentes()',
    'marcar_salidas_no_registradas()', 'motivo_bloqueo_equipo(uuid,uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 12. Vistas de apoyo para el tablero (respetan RLS del usuario)
-- ---------------------------------------------------------------------
create view v_mantenimientos_alerta with (security_invoker = true) as
  select e.id, e.codigo, e.nombre, e.estado, e.proximo_mantenimiento,
         e.proximo_mantenimiento < hoy_local() as vencido
  from equipos e
  where e.estado <> 'baja' and e.proximo_mantenimiento is not null
    and e.proximo_mantenimiento <= hoy_local()
        + (select dias_alerta_mantenimiento from configuracion where id = 1);

create view v_prestamos_vencidos with (security_invoker = true) as
  select p.id, s.nombre, s.matricula, p.fecha_limite, p.tipo
  from prestamos p join solicitantes s on s.id = p.solicitante_id
  where p.estado = 'abierto' and p.fecha_limite < hoy_local();

create view v_presentes with (security_invoker = true) as
  select r.id, s.nombre, s.matricula, r.entrada
  from registros_acceso r join solicitantes s on s.id = r.solicitante_id
  where r.salida is null and not r.salida_no_registrada;

revoke all on v_mantenimientos_alerta, v_prestamos_vencidos, v_presentes from anon;

-- =====================================================================
-- ALTA DEL PRIMER ADMINISTRADOR
-- Ejecutar DESPUÉS de crear la cuenta en Authentication → Users.
-- Cambie el correo y el nombre, quite los guiones de comentario y ejecute.
-- =====================================================================
-- insert into perfiles (id, nombre, roles)
-- select id, 'Nombre del Responsable del Laboratorio', '{admin}'
-- from auth.users where email = 'correo-del-admin@correo.uady.mx';

-- =====================================================================
-- CIERRE AUTOMÁTICO DE JORNADA (opcional)
-- Requiere activar la extensión pg_cron en Database → Extensions.
-- 02:30 UTC = 20:30 en Mérida.
-- =====================================================================
-- select cron.schedule('cierre-jornada', '30 2 * * *',
--                      $$select public.marcar_salidas_no_registradas()$$);

-- =====================================================================
-- Migración 0005: Préstamos e inventario (fases 4 y 5)
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0004.
--
-- Contenido:
--   1. Personas externas (profesores, otros laboratorios) que pueden recibir
--      préstamos sin tener autorización de acceso.
--   2. Préstamos: alta en una sola operación, devoluciones parciales y
--      ampliación de plazo con las reglas de los Arts. 16 y 17.
--   3. Inventario: código y categoría de artículos; reglas de movimientos
--      (ajustes solo del Administrador, motivo obligatorio en pérdidas y
--      ajustes, Art. 28); vistas de existencias bajas y caducidades.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Personas externas
-- ---------------------------------------------------------------------
alter table solicitantes
  add column externo     boolean not null default false,
  add column adscripcion text,
  add column telefono    text,
  alter column matricula drop not null,
  alter column correo drop not null;
alter table solicitantes add constraint solicitantes_internos_completos
  check (externo or (matricula is not null and correo is not null));

-- ---------------------------------------------------------------------
-- 2. Préstamos
-- ---------------------------------------------------------------------
-- Reemplaza la versión de 0001. Agrega:
--   * Una persona interna debe tener autorización de acceso vigente.
--   * Solo el Administrador amplía un plazo más allá del máximo o el de un
--     préstamo externo.
create or replace function tg_prestamo_validar()
returns trigger language plpgsql security definer set search_path = public as $$
declare dias_max int := (select dias_prestamo_max from configuracion where id = 1);
begin
  if tg_op = 'UPDATE'
     and new.solicitante_id = old.solicitante_id and new.tipo = old.tipo
     and new.fecha_limite = old.fecha_limite
     and new.vobo_referencia is not distinct from old.vobo_referencia
     and new.autorizado_por is not distinct from old.autorizado_por then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if tiene_sancion_activa(new.solicitante_id) then
      raise exception 'La persona tiene una suspensión vigente y no puede recibir préstamos.';
    end if;
    if not (select externo from solicitantes where id = new.solicitante_id)
       and autorizacion_vigente(new.solicitante_id) is null then
      raise exception 'La persona no tiene autorización de acceso vigente. Si es externa al laboratorio, regístrela como persona externa.';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.fecha_limite is distinct from old.fecha_limite and not tiene_rol('admin')
     and (new.fecha_limite > hoy_local() + dias_max or new.tipo = 'externo') then
    raise exception 'Ampliar un préstamo externo o a más de % días requiere al Administrador (Arts. 16 y 17).', dias_max;
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

-- Alta del préstamo con todos sus renglones en una sola transacción.
--   p_renglones: [{"equipo_id": "..."}, {"articulo_id": "...", "cantidad": 3}]
--   p_autorizo: el Administrador que registra el préstamo lo autoriza.
create or replace function registrar_prestamo(
  p_solicitante uuid, p_tipo tipo_prestamo, p_fecha_limite date, p_motivo text,
  p_vobo text, p_autorizo boolean, p_renglones jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  r jsonb;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indique el motivo o la práctica para la que se presta.';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Agregue al menos un equipo o material.';
  end if;
  insert into prestamos (solicitante_id, tipo, fecha_limite, motivo, vobo_referencia, autorizado_por)
  values (p_solicitante, p_tipo, p_fecha_limite, trim(p_motivo), nullif(trim(p_vobo), ''),
          case when p_autorizo then auth.uid() end)
  returning id into v_id;
  for r in select * from jsonb_array_elements(p_renglones) loop
    insert into prestamo_renglones (prestamo_id, equipo_id, articulo_id, cantidad)
    values (v_id, (r ->> 'equipo_id')::uuid, (r ->> 'articulo_id')::uuid,
            coalesce((r ->> 'cantidad')::numeric, 1));
  end loop;
  return v_id;
end $$;

-- Devolución de un renglón. En equipos se devuelve completo (bien o dañado);
-- en materiales, cantidades parciales devueltas y perdidas o rotas.
create or replace function devolver_renglon(
  p_renglon uuid, p_devuelta numeric default 0, p_perdida numeric default 0,
  p_danado boolean default false, p_condicion text default null)
returns text language plpgsql security invoker set search_path = public as $$
declare
  r prestamo_renglones%rowtype;
  pendiente numeric;
begin
  if not es_personal() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into r from prestamo_renglones where id = p_renglon for update;
  if not found then raise exception 'El renglón no existe.'; end if;
  if r.devuelto_en is not null then raise exception 'Este renglón ya se devolvió por completo.'; end if;

  if r.equipo_id is not null then
    if coalesce(p_danado, false) and coalesce(trim(p_condicion), '') = '' then
      raise exception 'Describa el daño del equipo.';
    end if;
    update prestamo_renglones
       set devuelto_en = now(), cantidad_devuelta = 1, danado = coalesce(p_danado, false),
           condicion = nullif(trim(p_condicion), '')
     where id = p_renglon;
    return case when p_danado then 'Devolución registrada. El equipo quedó fuera de servicio.'
                else 'Devolución registrada.' end;
  end if;

  p_devuelta := coalesce(p_devuelta, 0);
  p_perdida := coalesce(p_perdida, 0);
  pendiente := r.cantidad - r.cantidad_devuelta - r.cantidad_perdida;
  if p_devuelta < 0 or p_perdida < 0 or p_devuelta + p_perdida = 0 then
    raise exception 'Indique la cantidad devuelta y, en su caso, la perdida o rota.';
  end if;
  if p_devuelta + p_perdida > pendiente then
    raise exception 'La cantidad excede lo pendiente de devolver (%).', pendiente;
  end if;
  if p_perdida > 0 and coalesce(trim(p_condicion), '') = '' then
    raise exception 'Indique qué ocurrió con el material perdido o roto.';
  end if;
  update prestamo_renglones
     set cantidad_devuelta = cantidad_devuelta + p_devuelta,
         cantidad_perdida = cantidad_perdida + p_perdida,
         danado = danado or p_perdida > 0,
         condicion = concat_ws(' · ', condicion, nullif(trim(p_condicion), ''))
   where id = p_renglon;
  return 'Devolución registrada.';
end $$;

-- ---------------------------------------------------------------------
-- 3. Inventario
-- ---------------------------------------------------------------------
alter table articulos
  add column codigo    text unique,
  add column categoria text;

-- Reemplaza la versión de 0001. Agrega:
--   * Nadie puede registrar a otra persona como quien autoriza.
--   * Los ajustes (conteo físico) los hace solo el Administrador.
--   * Pérdidas y ajustes llevan motivo; un artículo inactivo no se mueve.
create or replace function tg_movimiento_inventario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a articulos%rowtype;
  delta numeric;
begin
  select * into a from articulos where id = new.articulo_id for update;
  if not found then raise exception 'El artículo no existe.'; end if;
  if new.autorizado_por is not null and new.autorizado_por is distinct from auth.uid() then
    raise exception 'Solo el propio Administrador puede registrarse como quien autoriza.';
  end if;
  if not a.activo and new.tipo in ('entrada', 'salida', 'prestamo') then
    raise exception 'El artículo "%" está dado de baja.', a.nombre;
  end if;
  if new.tipo = 'ajuste' and auth.uid() is not null and not tiene_rol('admin') then
    raise exception 'Los ajustes de existencia los registra el Administrador.';
  end if;
  if new.tipo in ('ajuste', 'perdida') and coalesce(trim(new.motivo), '') = '' then
    raise exception 'Indique el motivo.';
  end if;
  if new.tipo = 'salida' and a.tipo <> 'consumible' then
    raise exception 'Los materiales retornables se entregan como préstamo, no como salida.';
  end if;
  if new.tipo = 'salida' and a.especial
     and not (tiene_rol('admin') or es_admin_perfil(new.autorizado_por)) then
    raise exception 'El reactivo "%" es especial: requiere autorización del Administrador (Art. 28).', a.nombre;
  end if;
  if new.tipo = 'entrada' and new.caducidad is not null and new.caducidad < hoy_local() then
    raise exception 'La caducidad indicada ya pasó.';
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

create or replace view v_stock_bajo with (security_invoker = true) as
  select id, nombre, codigo, existencia, stock_minimo, unidad
  from articulos
  where activo and stock_minimo > 0 and existencia <= stock_minimo;

-- Lotes con caducidad próxima, según las entradas registradas
create or replace view v_caducidades with (security_invoker = true) as
  select m.id, m.articulo_id, a.nombre, a.codigo, m.lote, m.caducidad, m.cantidad, a.unidad,
         m.caducidad < hoy_local() as caducado
  from movimientos_inventario m
  join articulos a on a.id = m.articulo_id
  where m.tipo = 'entrada' and m.caducidad is not null and a.activo and a.existencia > 0
    and m.caducidad <= hoy_local() + 60;

revoke all on v_stock_bajo, v_caducidades from anon;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
do $$ declare f text; begin
  foreach f in array array[
    'registrar_prestamo(uuid,tipo_prestamo,date,text,text,boolean,jsonb)',
    'devolver_renglon(uuid,numeric,numeric,boolean,text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

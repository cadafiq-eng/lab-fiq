-- =====================================================================
-- Migración 0006: Carga inicial desde Excel (fase 6)
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0005.
--
-- Dos funciones para el Administrador: importan artículos y equipos en una
-- sola transacción. Si un renglón falla, no se guarda ninguno y el mensaje
-- indica el renglón del archivo de Excel que hay que corregir.
-- =====================================================================

-- Artículos. Cada elemento de p_filas:
--   { renglon, nombre, codigo, categoria, tipo, unidad, existencia_inicial, lote,
--     caducidad, stock_minimo, ubicacion, especial, recuperable, pictogramas[],
--     hoja_seguridad_url }
create or replace function importar_articulos(p_filas jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare
  f jsonb;
  v_id uuid;
  n int := 0;
  cantidad numeric;
begin
  if not tiene_rol('admin') then
    raise exception 'Solo el Administrador realiza la carga inicial.' using errcode = '42501';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El archivo no tiene renglones para importar.';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    begin
      insert into articulos (nombre, codigo, categoria, tipo, unidad, stock_minimo, ubicacion,
                             especial, recuperable, pictogramas, hoja_seguridad_url)
      values (trim(f ->> 'nombre'), nullif(trim(f ->> 'codigo'), ''), nullif(trim(f ->> 'categoria'), ''),
              (f ->> 'tipo')::tipo_articulo, trim(f ->> 'unidad'),
              coalesce((f ->> 'stock_minimo')::numeric, 0), nullif(trim(f ->> 'ubicacion'), ''),
              coalesce((f ->> 'especial')::boolean, false), coalesce((f ->> 'recuperable')::boolean, false),
              coalesce(array(select jsonb_array_elements_text(f -> 'pictogramas')), '{}'),
              nullif(trim(f ->> 'hoja_seguridad_url'), ''))
      returning id into v_id;
      cantidad := coalesce((f ->> 'existencia_inicial')::numeric, 0);
      if cantidad > 0 then
        insert into movimientos_inventario (articulo_id, tipo, cantidad, lote, caducidad, motivo)
        values (v_id, 'entrada', cantidad, nullif(trim(f ->> 'lote'), ''),
                (f ->> 'caducidad')::date, 'Carga inicial');
      end if;
      n := n + 1;
    exception when others then
      raise exception 'Renglón %: %', f ->> 'renglon',
        case when sqlerrm like '%articulos_codigo_key%' then 'ya existe un artículo con ese código'
             else sqlerrm end;
    end;
  end loop;
  return n;
end $$;

-- Equipos. Cada elemento de p_filas:
--   { renglon, codigo, nombre, tipo_equipo, requiere_capacitacion, marca, modelo,
--     numero_serie, ubicacion, responsable, voltaje, periodicidad_dias,
--     ultimo_mantenimiento, proximo_mantenimiento, estado, manual_url }
-- Si el tipo de equipo no existe, se crea (sin capacitación requerida) y se
-- informa para que el Administrador lo revise en Tipos de equipo.
create or replace function importar_equipos(p_filas jsonb)
returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare
  f jsonb;
  v_tipo uuid;
  n int := 0;
  creados text[] := '{}';
begin
  if not tiene_rol('admin') then
    raise exception 'Solo el Administrador realiza la carga inicial.' using errcode = '42501';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El archivo no tiene renglones para importar.';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    begin
      select id into v_tipo from tipos_equipo
      where unaccent(lower(trim(nombre))) = unaccent(lower(trim(f ->> 'tipo_equipo')))
      limit 1;
      if v_tipo is null then
        insert into tipos_equipo (nombre) values (trim(f ->> 'tipo_equipo')) returning id into v_tipo;
        creados := creados || trim(f ->> 'tipo_equipo');
      end if;
      insert into equipos (codigo, nombre, tipo_equipo_id, requiere_capacitacion, marca, modelo,
                           numero_serie, ubicacion, responsable, voltaje,
                           periodicidad_mantenimiento_dias, ultimo_mantenimiento,
                           proximo_mantenimiento, estado, manual_url)
      values (trim(f ->> 'codigo'), trim(f ->> 'nombre'), v_tipo, (f ->> 'requiere_capacitacion')::boolean,
              nullif(trim(f ->> 'marca'), ''), nullif(trim(f ->> 'modelo'), ''),
              nullif(trim(f ->> 'numero_serie'), ''), nullif(trim(f ->> 'ubicacion'), ''),
              nullif(trim(f ->> 'responsable'), ''), nullif(f ->> 'voltaje', ''),
              (f ->> 'periodicidad_dias')::int, (f ->> 'ultimo_mantenimiento')::date,
              (f ->> 'proximo_mantenimiento')::date,
              coalesce(nullif(f ->> 'estado', ''), 'disponible')::estado_equipo,
              nullif(trim(f ->> 'manual_url'), ''));
      n := n + 1;
    exception when others then
      raise exception 'Renglón %: %', f ->> 'renglon',
        case when sqlerrm like '%equipos_codigo_key%' then 'ya existe un equipo con ese código'
             else sqlerrm end;
    end;
  end loop;
  return jsonb_build_object('equipos', n, 'tipos_creados', to_jsonb(creados));
end $$;

do $$ declare f text; begin
  foreach f in array array['importar_articulos(jsonb)', 'importar_equipos(jsonb)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

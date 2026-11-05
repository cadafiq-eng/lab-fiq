-- =====================================================================
-- Migración 0013: Enlace a la aprobación de Power Automate
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0012,
-- y ANTES de volver a desplegar la Edge Function «recibir-solicitud».
--
-- La función receptora guarda el enlace de la aprobación que trae el
-- correo, para que la app muestre el botón «Aprobar en Power Automate»
-- después de registrar la solicitud.
-- =====================================================================

alter table solicitudes_entrantes add column if not exists enlace_aprobacion text
  check (enlace_aprobacion is null or enlace_aprobacion ~ '^https://');

-- El enlace forma parte del contenido recibido: tampoco se modifica después
create or replace function tg_solicitud_entrante()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.texto is distinct from old.texto or new.folio is distinct from old.folio
       or new.tipo is distinct from old.tipo or new.mensaje_id is distinct from old.mensaje_id
       or new.enlace_aprobacion is distinct from old.enlace_aprobacion then
      raise exception 'El contenido de la solicitud recibida no se modifica.';
    end if;
    if old.estado <> 'pendiente' and new.estado is distinct from old.estado then
      raise exception 'La solicitud ya fue atendida.';
    end if;
    if new.estado = 'descartada' and coalesce(trim(new.motivo_descarte), '') = '' then
      raise exception 'Indique el motivo para descartar la solicitud.';
    end if;
    if new.estado <> old.estado then
      new.atendida_en := now();
      new.atendida_por := auth.uid();
    end if;
  end if;
  return new;
end $$;

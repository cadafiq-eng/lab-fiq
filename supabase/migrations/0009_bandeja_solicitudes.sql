-- =====================================================================
-- Migración 0009: Bandeja de solicitudes FIQ
-- Ejecutar UNA sola vez en el SQL Editor de Supabase, después de 0008.
--
-- Las aprobaciones de Power Automate que llegan al correo del laboratorio
-- se copian (flujo propio del laboratorio → Postmark Inbound → Edge Function
-- «recibir-solicitud») a esta bandeja. El personal las abre y registra con
-- «Solicitudes FIQ», o las descarta con motivo.
--   * Solo la Edge Function inserta (con la llave de servicio).
--   * Al registrar una reservación o autorización con el folio, la
--     solicitud pendiente se marca como registrada automáticamente.
--   * Nada se borra: se descarta con motivo.
-- =====================================================================

create table solicitudes_entrantes (
  id                uuid primary key default gen_random_uuid(),
  mensaje_id        text unique,               -- identificador del correo (evita duplicados)
  recibida_en       timestamptz not null default now(),
  remitente         text,
  asunto            text,
  texto             text not null,
  tipo              text not null default 'desconocido' check (tipo in ('practica', 'acceso', 'desconocido')),
  folio             int,
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'registrada', 'descartada')),
  motivo_descarte   text,
  atendida_en       timestamptz,
  atendida_por      uuid references perfiles (id)
);
create index solicitudes_entrantes_estado on solicitudes_entrantes (estado, recibida_en desc);
create index solicitudes_entrantes_folio on solicitudes_entrantes (folio);

-- Cambios de estado: descartar exige motivo; no se reabre lo atendido.
create or replace function tg_solicitud_entrante()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.texto is distinct from old.texto or new.folio is distinct from old.folio
       or new.tipo is distinct from old.tipo or new.mensaje_id is distinct from old.mensaje_id then
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
create trigger solicitud_entrante before update on solicitudes_entrantes
  for each row execute function tg_solicitud_entrante();
create trigger solicitudes_entrantes_auditoria after insert or update or delete on solicitudes_entrantes
  for each row execute function tg_auditoria();

alter table solicitudes_entrantes enable row level security;
revoke all on solicitudes_entrantes from anon;
create policy solicitudes_entrantes_leer on solicitudes_entrantes for select to authenticated using (es_personal());
create policy solicitudes_entrantes_editar on solicitudes_entrantes for update to authenticated
  using (es_personal()) with check (es_personal());
-- Sin política de inserción: solo la Edge Function (llave de servicio) inserta.

-- Registrar con el folio marca la solicitud pendiente como registrada
create or replace function tg_marcar_solicitud_registrada()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tipo text := case tg_table_name when 'reservaciones' then 'practica' else 'acceso' end;
begin
  if new.folio_solicitud is not null then
    update solicitudes_entrantes
    set estado = 'registrada', atendida_en = now(), atendida_por = auth.uid()
    where folio = new.folio_solicitud and tipo = v_tipo and estado = 'pendiente';
  end if;
  return null;
end $$;
create trigger reservacion_marca_solicitud after insert or update of folio_solicitud on reservaciones
  for each row execute function tg_marcar_solicitud_registrada();
create trigger autorizacion_marca_solicitud after insert or update of folio_solicitud on autorizaciones_acceso
  for each row execute function tg_marcar_solicitud_registrada();

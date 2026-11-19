// Edge Function: enviar-solicitud-mantenimiento
// Envía por correo una solicitud de mantenimiento ya guardada en la app
// (crear_solicitud_mantenimiento) a los destinatarios de Configuración.
//
//   * La llama el personal desde la app con su sesión (Verify JWT activado).
//   * El correo sale por Postmark desde el remitente de Configuración, que debe
//     estar confirmado en Postmark como «Sender Signature».
//   * Secretos: POSTMARK_TOKEN (Server API token de Postmark). La llave de
//     servicio la inyecta Supabase; ninguna llega al navegador.
//
// Cuerpo JSON: { solicitud_id: "uuid" }

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respuesta = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const PC: Record<string, string> = { preventivo: "P", correctivo: "C" };

type Renglon = {
  equipo: string; num_inventario: string; marca: string | null; modelo: string | null; descripcion: string;
  tipo: string; docencia: boolean; vinculacion: boolean; investigacion: boolean;
};

function armarCorreo(renglones: Renglon[], observaciones: string | null, firma: string, folio: string) {
  const plural = renglones.length > 1;
  const enc = ["EQUIPO", "NUM DE INV", "MARCA", "MODELO", "DESCRIPCIÓN", "P/C", "DOCENCIA", "VINCULACIÓN", "INVESTIGACIÓN"];
  const celda = "border:1px solid #9aa4b2;padding:6px 8px;font-size:13px;vertical-align:top";
  const filas = renglones.map((r) => [
    r.equipo, r.num_inventario, r.marca || "—", r.modelo || "—", r.descripcion, PC[r.tipo] ?? r.tipo,
    r.docencia ? "X" : "", r.vinculacion ? "X" : "", r.investigacion ? "X" : "",
  ]);
  const intro = `Por medio del presente, solicito de la manera más atenta el mantenimiento ${plural ? "de los siguientes equipos" : "del siguiente equipo"} del Laboratorio de Tecnología de Alimentos de la Facultad de Ingeniería Química:`;
  const cierre = "Agradezco de antemano su atención y quedo atento para coordinar la visita.";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:14px;line-height:1.5">
<p>Buen día:</p>
<p>${esc(intro)}</p>
<table style="border-collapse:collapse;margin:8px 0 14px">
<thead><tr>${enc.map((h) => `<th style="${celda};background:#14284b;color:#fff;text-align:left">${h}</th>`).join("")}</tr></thead>
<tbody>${filas.map((f) => `<tr>${f.map((v, i) => `<td style="${celda}${i >= 5 ? ";text-align:center" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>
</table>
<p style="font-size:12px;color:#5b6472">P/C: preventivo / correctivo. Docencia, vinculación e investigación: actividades en las que se usa el equipo.</p>
${observaciones ? `<p><strong>Observaciones:</strong> ${esc(observaciones)}</p>` : ""}
<p>${esc(cierre)}</p>
<p>Atentamente,<br>${firma.split("\n").map(esc).join("<br>")}</p>
<p style="font-size:11px;color:#8a93a0">Folio ${esc(folio)} · Enviado desde el Sistema de Gestión del Laboratorio.</p>
</div>`;

  const texto = [
    "Buen día:", "", intro, "",
    ...renglones.map((r, i) => `${i + 1}. ${r.equipo} · Inv. ${r.num_inventario} · ${r.marca || "—"} ${r.modelo || ""}\n` +
      `   ${PC[r.tipo] ?? r.tipo} — ${r.descripcion}\n` +
      `   Uso: ${[r.docencia && "docencia", r.vinculacion && "vinculación", r.investigacion && "investigación"].filter(Boolean).join(", ") || "—"}`),
    "", ...(observaciones ? [`Observaciones: ${observaciones}`, ""] : []),
    cierre, "", "Atentamente,", firma, "", `Folio ${folio}`,
  ].join("\n");
  return { html, texto };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respuesta({ error: "Método no permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const sesion = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
  });
  const servicio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return respuesta({ error: "Sesión no válida." }, 401);

  let id = "";
  try { id = String((await req.json()).solicitud_id ?? ""); } catch { /* cuerpo no válido */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respuesta({ error: "Solicitud no válida." }, 400);

  // Se lee con la sesión de quien llama: solo el personal la ve (RLS)
  const { data: s } = await sesion.from("solicitudes_mantenimiento")
    .select("id, folio, estado, para, cc, asunto, observaciones, creada_por, solicitud_mant_equipos(*)").eq("id", id).maybeSingle();
  if (!s) return respuesta({ error: "No se encontró la solicitud o no tiene permiso." }, 404);
  if (s.estado !== "por_enviar") return respuesta({ error: "La solicitud ya fue enviada." }, 409);

  const token = Deno.env.get("POSTMARK_TOKEN") ?? "";
  if (!token) return respuesta({ error: "Falta configurar el envío de correo (secreto POSTMARK_TOKEN en Supabase)." }, 503);

  const [{ data: conf }, { data: perfil }] = await Promise.all([
    servicio.from("configuracion").select("correo_remitente, nombre_remitente").eq("id", 1).single(),
    servicio.from("perfiles").select("nombre").eq("id", user.id).single(),
  ]);
  const folio = `M-${String(s.folio).padStart(4, "0")}`;
  const firma = `${perfil?.nombre ?? ""}\nLaboratorio de Tecnología de Alimentos\nFacultad de Ingeniería Química, UADY`.trim();
  const renglones = [...(s.solicitud_mant_equipos as (Renglon & { orden: number })[])].sort((a, b) => a.orden - b.orden);
  const { html, texto } = armarCorreo(renglones, s.observaciones, firma, folio);

  const envio = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": token },
    body: JSON.stringify({
      From: `"${conf!.nombre_remitente.replace(/"/g, "")}" <${conf!.correo_remitente}>`,
      To: s.para.join(", "), Cc: s.cc.length ? s.cc.join(", ") : undefined,
      ReplyTo: conf!.correo_remitente, Subject: s.asunto, HtmlBody: html, TextBody: texto,
      MessageStream: "outbound", Tag: "solicitud-mantenimiento", TrackOpens: false,
    }),
  });
  const r = await envio.json().catch(() => ({}));

  if (!envio.ok || r.ErrorCode) {
    const motivo = r.ErrorCode === 400
      ? `El remitente ${conf!.correo_remitente} no está confirmado en Postmark (Sender Signatures).`
      : r.ErrorCode === 10 ? "La llave de Postmark (POSTMARK_TOKEN) no es válida."
      : r.ErrorCode === 412 ? "La cuenta de Postmark aún no está aprobada para enviar a estos destinatarios."
      : `Postmark respondió: ${r.Message ?? envio.statusText}`;
    await servicio.from("solicitudes_mantenimiento").update({ envio_error: motivo.slice(0, 500) }).eq("id", id);
    return respuesta({ error: `No se pudo enviar el correo. ${motivo}` }, 502);
  }

  await servicio.from("solicitudes_mantenimiento")
    .update({ estado: "enviada", enviada_en: new Date().toISOString(), envio_id: r.MessageID ?? null, envio_error: null }).eq("id", id);
  await servicio.from("solicitud_mant_seguimiento").insert({
    solicitud_id: id, estado: "enviada", registrado_por: user.id,
    nota: `Correo enviado a ${s.para.join(", ")}${s.cc.length ? ` con copia a ${s.cc.join(", ")}` : ""}.`,
  });
  return respuesta({ ok: true, folio });
});

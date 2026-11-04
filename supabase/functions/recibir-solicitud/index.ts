// Edge Function: recibir-solicitud
// Recibe, desde Postmark Inbound, la copia de las aprobaciones de Power Automate
// (Laboratorios FIQ) que el flujo del laboratorio reenvía, y las guarda en la
// bandeja «solicitudes_entrantes» para que el personal las registre en la app.
//
// Seguridad:
//   * Se despliega SIN verificación de JWT (Postmark no tiene sesión de Supabase).
//   * Exige la clave del secreto RECEPTOR_CLAVE, en la URL del webhook de
//     Postmark: …/recibir-solicitud?clave=CLAVE (también acepta autenticación básica).
//   * Inserta con la llave de servicio, que Supabase inyecta en el servidor;
//     nunca llega al navegador.

import { createClient } from "npm:@supabase/supabase-js@2";

function respuesta(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
}

// Comparación en tiempo constante
function iguales(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let dif = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return dif === 0;
}

function claveRecibida(req: Request): string {
  const aut = req.headers.get("Authorization") ?? "";
  if (aut.startsWith("Basic ")) {
    try {
      const [, clave] = atob(aut.slice(6)).split(/:(.*)/s);
      return clave ?? "";
    } catch { /* cabecera mal formada */ }
  }
  return new URL(req.url).searchParams.get("clave") ?? "";
}

// HTML del correo → texto con saltos de línea
function aTexto(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function clasificar(texto: string, asunto: string) {
  const t = (asunto + "\n" + texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const tipo = /nombre de la practica\s*:|solicitud de practica/.test(t) ? "practica"
    : /solicitando acceso|solicitud de acceso/.test(t) ? "acceso" : "desconocido";
  const m = texto.match(/Solicitud\s*:\s*(\d+)/i);
  return { tipo, folio: m ? Number(m[1]) : null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return respuesta({ error: "Método no permitido." }, 405);
  const esperada = Deno.env.get("RECEPTOR_CLAVE") ?? "";
  if (esperada.length < 16 || !iguales(claveRecibida(req), esperada)) {
    return respuesta({ error: "No autorizado." }, 401);
  }

  let correo: Record<string, unknown>;
  try { correo = await req.json(); } catch { return respuesta({ error: "Cuerpo no válido." }, 400); }

  const asunto = String(correo.Subject ?? "").slice(0, 500);
  const texto = (String(correo.TextBody ?? "").trim() || aTexto(String(correo.HtmlBody ?? ""))).slice(0, 100000);
  if (!texto) return respuesta({ ok: true, ignorado: "sin texto" });
  const { tipo, folio } = clasificar(texto, asunto);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  // Si la misma solicitud ya está en la bandeja (reenvío repetido), no se duplica
  if (folio !== null) {
    const { data: ya } = await db.from("solicitudes_entrantes").select("id")
      .eq("folio", folio).eq("tipo", tipo).limit(1);
    if (ya?.length) return respuesta({ ok: true, duplicada: true });
  }

  const { error } = await db.from("solicitudes_entrantes").insert({
    mensaje_id: String(correo.MessageID ?? "") || null,
    remitente: String((correo.FromFull as { Email?: string })?.Email ?? correo.From ?? "").slice(0, 300),
    asunto, texto, tipo, folio,
  });
  if (error && !error.message.includes("duplicate key")) {
    console.error(error.message);
    return respuesta({ error: "No se pudo guardar." }, 500);  // Postmark reintentará
  }
  return respuesta({ ok: true, tipo, folio });
});

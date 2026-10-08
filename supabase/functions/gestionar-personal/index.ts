// Edge Function: gestionar-personal
// Solo el Administrador puede llamarla. Crea, lista, activa/desactiva
// cuentas del personal y restablece contraseñas. Usa la llave de servicio,
// que Supabase inyecta en el servidor y nunca llega al navegador.
//
// Acciones (cuerpo JSON):
//   { accion: "listar" }
//   { accion: "crear", nombre, correo, contrasena, roles: ["gestor"] }
//   { accion: "activar", id, activo: true|false }
//   { accion: "contrasena", id, contrasena }

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES_VALIDOS = ["admin", "gestor", "terminal"];

function respuesta(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function error(mensaje: string, estado = 400) {
  return respuesta({ error: mensaje }, estado);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido.", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cliente con la sesión de quien llama (respeta RLS y queda en bitácora)
  const sesion = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return error("Sesión no válida.", 401);

  const { data: perfil } = await sesion
    .from("perfiles").select("roles, activo").eq("id", user.id).single();
  if (!perfil?.activo || !perfil.roles.includes("admin")) {
    return error("Solo el Administrador puede gestionar cuentas.", 403);
  }

  // Cliente con privilegios de servicio: solo para auth.admin
  const servidor = createClient(url, servicio, { auth: { persistSession: false } });

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return error("Cuerpo de la petición inválido.");
  }

  switch (cuerpo.accion) {
    case "listar": {
      const { data: perfiles, error: e1 } = await sesion
        .from("perfiles").select("id, nombre, roles, activo, creado_en").order("nombre");
      if (e1) return error(e1.message);
      const { data: cuentas, error: e2 } = await servidor.auth.admin.listUsers({ perPage: 1000 });
      if (e2) return error(e2.message);
      const correos = new Map(cuentas.users.map((u) => [u.id, u.email]));
      return respuesta(perfiles.map((p) => ({ ...p, correo: correos.get(p.id) ?? "" })));
    }

    case "crear": {
      const nombre = String(cuerpo.nombre ?? "").trim();
      const correo = String(cuerpo.correo ?? "").trim().toLowerCase();
      const contrasena = String(cuerpo.contrasena ?? "");
      const roles = Array.isArray(cuerpo.roles) ? cuerpo.roles.map(String) : [];
      if (!nombre || !correo) return error("Nombre y correo son obligatorios.");
      if (contrasena.length < 8) return error("La contraseña debe tener al menos 8 caracteres.");
      if (roles.length === 0 || roles.some((r) => !ROLES_VALIDOS.includes(r))) {
        return error("Seleccione al menos un rol válido.");
      }
      if (roles.includes("terminal") && roles.length > 1) {
        return error("La cuenta de terminal no puede tener otros roles.");
      }

      const { data: creada, error: e1 } = await servidor.auth.admin.createUser({
        email: correo, password: contrasena, email_confirm: true,
      });
      if (e1) {
        return error(e1.message.includes("already") ? "Ya existe una cuenta con ese correo." : e1.message);
      }
      const { error: e2 } = await sesion
        .from("perfiles").insert({ id: creada.user.id, nombre, roles });
      if (e2) {
        await servidor.auth.admin.deleteUser(creada.user.id); // revertir
        return error(e2.message);
      }
      return respuesta({ id: creada.user.id });
    }

    case "activar": {
      const id = String(cuerpo.id ?? "");
      const activo = Boolean(cuerpo.activo);
      const { error: e1 } = await sesion.from("perfiles").update({ activo }).eq("id", id);
      if (e1) return error(e1.message);
      // Una cuenta desactivada tampoco puede iniciar sesión
      const { error: e2 } = await servidor.auth.admin.updateUserById(id, {
        ban_duration: activo ? "none" : "876000h",
      });
      if (e2) return error(e2.message);
      return respuesta({ ok: true });
    }

    case "contrasena": {
      const id = String(cuerpo.id ?? "");
      const contrasena = String(cuerpo.contrasena ?? "");
      if (contrasena.length < 8) return error("La contraseña debe tener al menos 8 caracteres.");
      const { error: e1 } = await servidor.auth.admin.updateUserById(id, { password: contrasena });
      if (e1) return error(e1.message);
      return respuesta({ ok: true });
    }

    default:
      return error("Acción no reconocida.");
  }
});

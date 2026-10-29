# Sistema de Gestión Integral del Laboratorio — FIQ-UADY

Aplicación web para un laboratorio escolar de la Facultad de Ingeniería Química (UADY):
control de acceso, equipos, préstamos e inventario. Debe cumplir el Reglamento de
Laboratorios de la FIQ y su Manual de Seguridad. Responsable: Dr. Luis Antonio Chel Guerrero.

## Pila

- React 18 + Vite 5 + react-router-dom 6 con `HashRouter` (GitHub Pages no resuelve rutas internas).
- Supabase: PostgreSQL + Auth + RLS + una Edge Function (`supabase/functions/gestionar-personal`).
- Publicación: GitHub Actions → GitHub Pages en cada push a `main`
  (variables de repositorio `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`).
- Sin TypeScript, sin librería de componentes: estilos propios en `src/styles.css`.

## Reglas de trabajo

- **Idioma**: toda la interfaz, mensajes de error y comentarios en español institucional.
  Organismos: SECIHTI (no CONACYT), SNII (no SNI).
- **Migraciones**: `supabase/migrations/NNNN_nombre.sql`, numeradas y aplicadas en orden.
  Nunca editar una migración ya entregada: los cambios van en una nueva. Las ejecuta el
  responsable a mano en el SQL Editor de Supabase; avisarle siempre que haya una nueva.
- **Las reglas de negocio viven en la base de datos** (triggers, funciones `security definer`,
  RLS), no solo en la interfaz. La interfaz solo las anticipa y muestra los mensajes de la base.
- **Nada se borra**: no hay políticas DELETE; se usa `activo = false`. Toda escritura queda en
  `bitacora_auditoria`.
- **Secretos**: solo la llave anon/publishable va al navegador. La `service_role` existe únicamente
  dentro de la Edge Function. Nunca pedir ni escribir contraseñas o llaves en el repositorio.
- Antes de entregar: `npm run build` sin errores y, si cambia SQL, probarlo en un PostgreSQL local.

## Roles

- **Administrador** (`admin`): responsable del laboratorio o persona asignada. Acceso total;
  crea cuentas del personal, captura autorizaciones de acceso, sanciones y capacitaciones,
  autoriza préstamos externos o de más de 7 días, salidas de reactivos especiales y ajustes.
- **Gestor de Inventarios** (`gestor`): el personal en turno. Operación diaria.
- **Terminal de acceso** (`terminal`): la computadora de la entrada; no lee tablas, solo llama
  funciones `terminal_*`. Salir de ella exige credenciales del personal.
- Los solicitantes (estudiantes y personas externas) no tienen cuenta.

## Decisiones vigentes

- Acceso: autorización por persona y proyecto con periodo (nombre, matrícula, correo, proyecto,
  fechas), capturada por el Administrador desde el correo de solicitud. Identificación en la
  terminal por nombre (mínimo 3 letras). Horario 08:00–20:00 (en `configuracion`).
  Siempre hay personal en turno. Cierre diario de salidas no registradas con pg_cron.
- Sanciones del Art. 36 (a–e); las suspensiones vigentes bloquean acceso y préstamos.
- Equipos: el estado solo cambia por uso, préstamo, mantenimiento o `cambiar_estado_equipo`
  (con motivo). Mantenimiento vencido bloquea uso y préstamo. Solo el preventivo reinicia el
  calendario. Capacitación previa por tipo de equipo (Art. 13).
- Préstamos: internos (≤ 7 días sin autorización, Art. 17) y externos (oficio de VoBo del
  Secretario Administrativo + Administrador, Art. 16). Pueden recibir personas con acceso
  vigente o personas externas registradas (`solicitantes.externo`).
- Inventario: consumibles (salida) y retornables (préstamo). La existencia solo cambia con
  movimientos. Pictogramas NOM-018-STPS-2015.
- Reservaciones (`0007`): las registra el personal y quedan programadas sin aprobación. Una clase ocupa
  todo el laboratorio; las demás actividades pueden coincidir salvo «ocupa todo»; un mismo equipo nunca
  se traslapa; fuera de horario o fin de semana, solo el Administrador con contacto de emergencia.
  Series semanales (máx. 26). La terminal ve la agenda con `terminal_agenda` (sin datos personales).
- Carga inicial: plantillas Excel en `public/plantillas/` (generadas con openpyxl; sin celdas de texto
  vacío, que `read-excel-file` no acepta). Importación atómica con `importar_articulos` e
  `importar_equipos` (solo Administrador).
- Guía de uso: una sola fuente, `src/pages/ayuda/contenido.js`, para la Ayuda y el manual PDF
  (`public/manual/manual_laboratorio.pdf`, impresión de la página Ayuda). Al cambiar una regla,
  actualizar también la guía y regenerar el PDF.

## Entrega

- Trabajar en una rama y entregar por pull request; el responsable lo acepta y GitHub Pages publica.
- Si hay migración nueva, indicarlo en el PR: debe ejecutarse en Supabase antes de aceptarlo.

## Pendiente

- Fase 6: piloto de una semana con el personal y ajustes.
- Fase 7: aviso de privacidad y liberación formal.

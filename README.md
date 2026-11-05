# Sistema de Gestión Integral del Laboratorio — FIQ-UADY

Aplicación web para el control de acceso, equipos, préstamos e inventario del laboratorio,
conforme al Reglamento de Laboratorios de la FIQ y su Manual de Seguridad.

- **Frontend:** React + Vite, publicado en GitHub Pages.
- **Base de datos y cuentas:** Supabase (PostgreSQL + Auth). Las reglas del laboratorio
  se validan en la base de datos con triggers y políticas RLS.

## Estructura

```
supabase/migrations/   Scripts SQL, se ejecutan en orden en el SQL Editor de Supabase
supabase/functions/    Edge Functions: gestionar cuentas del personal y recibir solicitudes FIQ
src/                   Aplicación web
.github/workflows/     Publicación automática en GitHub Pages
```

## Instalación (una sola vez)

### 1. Base de datos
1. Supabase → SQL Editor: ejecutar `supabase/migrations/0001_esquema_base.sql`
   (si aparece el aviso de RLS, elegir «Run and enable RLS»).
2. Ejecutar `supabase/migrations/0002_alta_perfiles.sql`.
   Después, `0003_control_acceso.sql` (fase 2), `0004_equipos.sql` (fase 3) y
   `0005_prestamos_inventario.sql` (fases 4 y 5), `0006_carga_inicial.sql` (fase 6) y
   `0007_reservaciones.sql` (reservaciones), `0008_solicitudes_fiq.sql` (importar solicitudes FIQ) y
   `0009_bandeja_solicitudes.sql` (bandeja automática) y `0010_reservaciones_varios_dias.sql`
   y `0011_reservacion_dias_distintos.sql` (reservaciones de varios días).
   Cada archivo se ejecuta una sola vez y en orden.
3. Authentication → Users → **Add user**: correo y contraseña del Administrador,
   con «Auto Confirm User».
4. En el SQL Editor, dar de alta su perfil (cambiar nombre y correo):
   ```sql
   insert into perfiles (id, nombre, roles)
   select id, 'Nombre del Responsable', '{admin}' from auth.users
   where email = 'correo-del-admin@correo.uady.mx';
   ```
5. Authentication → Sign In / Providers: desactivar **Allow new users to sign up**.
   En Authentication → URL Configuration: **Site URL** = `https://cadafiq-eng.github.io/lab-fiq/`
   y en **Redirect URLs** agregar `https://cadafiq-eng.github.io/lab-fiq/**`. Así los enlaces de
   «Restablecer contraseña» abren la app (por omisión apuntan a `http://localhost:3000`).

### 2. Función de cuentas del personal
Supabase → Edge Functions → **Deploy a new function** → **Via Editor**:
- Nombre: `gestionar-personal`
- Pegar el contenido de `supabase/functions/gestionar-personal/index.ts` y desplegar.

Supabase le entrega automáticamente las llaves que necesita; no hay que configurar nada más.

### 3. Publicación en GitHub Pages
1. Subir este proyecto al repositorio `lab-fiq`.
2. Repositorio → Settings → Secrets and variables → Actions → pestaña **Variables** →
   crear dos variables con los valores de Supabase → Project Settings → API:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (la llave **anon / publishable**, nunca la service_role)
3. Settings → Pages → Source: **GitHub Actions**.
4. Actions → «Publicar en GitHub Pages» → **Run workflow** (después se publica solo con cada cambio).

La aplicación queda en `https://<usuario>.github.io/lab-fiq/`.

### 4. Cuentas del personal
Inicie sesión como Administrador → **Personal** → cree:
- Las cuentas del personal en turno (rol Gestor de Inventarios).
- Una cuenta de **Terminal de acceso** para la computadora de la entrada
  (por ejemplo `terminal@lab-fiq.uady`): al iniciar sesión con ella solo se ve
  la pantalla de autoservicio, y salir requiere credenciales del personal.

## Uso diario del control de acceso

- **Autorizaciones** (Administrador): al recibir el correo de solicitud, capturar matrícula, nombre,
  correo, proyecto y periodo. Si la matrícula ya existe, se agrega otra autorización a la misma persona.
- **Terminal**: la persona escribe su nombre, se elige y registra entrada, uso de equipo y salida.
- **Presentes** (personal): quién está dentro; registrar entradas sin terminal y salidas olvidadas.
- **Historial** (personal): consultar por fechas, corregir con motivo (queda constancia) y exportar a CSV.
- **Sanciones** (Administrador): Art. 36. Las suspensiones vigentes bloquean acceso y préstamos.
- **Cierre de jornada**: cada noche a las 20:30 se marcan como «salida no registrada» quienes no
  marcaron salida. Si `0003` avisó que no pudo activar pg_cron, actívelo en Database → Extensions
  y ejecute de nuevo el último bloque del archivo.

## Uso del módulo de equipos

- **Catálogo**: alta y edición (código único, tipo, datos técnicos, periodicidad del preventivo).
  Al elegir el tipo se indica si requiere capacitación y quién la imparte.
- **Ficha**: situación, mantenimientos, bitácora de uso, historial de estados y personas capacitadas.
- **Estados**: «en uso» y «prestado» los ponen la terminal y los préstamos. Los demás se cambian con
  «Cambiar estado» y un motivo. Para volver a «disponible» se registra el mantenimiento o la reparación
  (el Administrador puede hacerlo directamente). Solo el Administrador da de baja.
- **Mantenimientos**: el preventivo actualiza el último y recalcula el próximo; el correctivo no mueve
  el calendario. Si no queda operativo, el equipo pasa a «fuera de servicio». Con el preventivo vencido,
  el equipo no puede usarse ni prestarse.
- **Capacitaciones** (Administrador): una por persona y tipo de equipo.
- **Etiquetas QR**: se imprimen desde el catálogo o la ficha; el código abre la ficha del equipo.

## Uso de reservaciones

- **Calendario** semanal por tipo de actividad (clase, taller o curso, investigación, proyecto,
  vinculación, otra); **Lista** con filtros y CSV; **detalle** con edición y cancelación (con motivo).
- Datos según el formato de solicitud de prácticas (FSP1), la solicitud de acceso y el reporte
  trimestral: responsable, usuarios, interno o externo e institución, asignatura, programa, semestre,
  alumnos, equipos, materiales y residuos peligrosos (grupos 1–7).
- Reglas (en la base): una **clase** ocupa todo el laboratorio; las demás actividades pueden coincidir
  salvo que se marquen «ocupa todo el laboratorio»; un **mismo equipo** no puede estar en dos
  reservaciones a la vez; fuera de horario o en fin de semana solo el Administrador, con contacto de
  emergencia (formato FAV). Clases semanales como serie (máximo 26 sesiones; si una se cruza, no se
  guarda ninguna).
- La **terminal** muestra la ocupación de hoy y de la semana sin datos personales, y **Reportes →
  Actividades** resume docencia, investigación y vinculación para el reporte trimestral.

## Solicitudes del sistema de Laboratorios FIQ

Las solicitudes de acceso y de práctica llegan como aprobaciones de Power Automate (Laboratorios FIQ).
El flujo no es del laboratorio, así que la app no se conecta a él: en **Solicitudes FIQ** se pega el texto
de la aprobación y la app llena la **reservación** (práctica) o la **autorización de acceso** (acceso),
con el folio FIQ para no duplicar. Las personas sin matrícula (académicos, externos) quedan como
personas externas con autorización. Se agregan reactivos y alumnos por programa educativo (IQI, QA, QI,
IA, IB, IIL) a las reservaciones, que alimentan el reporte de actividades.

### Recepción automática (bandeja de pendientes)

La cuenta del laboratorio solo tiene conectores estándar de Power Automate (sin HTTP), así que el
correo hace de puente:

```
Aprobación (Laboratorios FIQ) → correo del laboratorio → flujo del laboratorio
  («Cuando llega un nuevo correo (V3)», de flow-noreply@microsoft.com, asunto con «solicitud de
  practica» o «solicitud de acceso» → «Enviar un correo (V2)» a la dirección de Postmark Inbound)
  → Postmark Inbound → Edge Function recibir-solicitud → tabla solicitudes_entrantes
```

1. **Supabase → SQL Editor:** ejecutar `0009_bandeja_solicitudes.sql`.
2. **Supabase → Edge Functions → Secrets:** crear `RECEPTOR_CLAVE` con una clave larga al azar
   (32 caracteres o más). No se guarda en el repositorio.
3. **Supabase → Edge Functions → Deploy a new function → Via Editor:** nombre `recibir-solicitud`,
   pegar `supabase/functions/recibir-solicitud/index.ts`, desplegar y, en su configuración,
   **desactivar «Verify JWT»** (Postmark no tiene sesión de Supabase; la protege la clave).
4. **Postmark** (cuenta del responsable): crear un *Server*; en su *Inbound stream* copiar la
   dirección de entrada (`…@inbound.postmarkapp.com`) y poner como *Webhook URL*
   `https://<PROYECTO>.supabase.co/functions/v1/recibir-solicitud?clave=CLAVE`
   (CLAVE = `RECEPTOR_CLAVE`, solo letras y números; Postmark rechaza la forma `https://usuario:clave@…`).
5. **Power Automate (cuenta del laboratorio):** en el flujo, poner esa dirección de Postmark en «Para».

Las solicitudes llegan a **Solicitudes FIQ → Pendientes** (contador en el menú y aviso en Inicio).
Al registrar la reservación o la autorización con su folio salen solas; las demás se descartan con
motivo. Los datos pasan por Postmark: considerarlo en el aviso de privacidad (fase 7).

## Uso de préstamos e inventario

- **Préstamos**: a personas con acceso vigente o a personas externas (profesores, otros laboratorios),
  que se registran desde el mismo formulario. Un préstamo puede incluir equipos y materiales retornables.
  Los externos (Art. 16) y los de más de 7 días (Art. 17) los registra el Administrador.
- **Devoluciones**: por renglón y parciales. Lo devuelto regresa a la existencia; lo perdido o roto no.
  Un equipo devuelto con daño queda «fuera de servicio».
- **Inventario**: los consumibles salen como «salida»; los retornables, como préstamo. Los reactivos
  especiales (Art. 28) solo los entrega el Administrador. Los ajustes por conteo físico son del
  Administrador. La existencia nunca se edita a mano: cambia solo con movimientos.

## Carga inicial, reportes y guía

- **Carga inicial** (Administrador → Carga inicial): plantillas en `public/plantillas/`. La importación
  valida cada renglón y, si alguno tiene error, no guarda nada.
- **Reportes** (menú Reportes): uso del laboratorio, inventario y consumo, préstamos. «Imprimir o
  guardar PDF» genera el documento con encabezado institucional; cada tabla exporta a CSV.
- **Guía de uso**: menú Ayuda → Guía de uso. El contenido está en `src/pages/ayuda/contenido.js` y es la
  misma fuente del manual `public/manual/manual_laboratorio.pdf`. Si cambia el contenido, regenere el PDF
  abriendo la Guía de uso, «Todas las secciones», y usando Imprimir → Guardar como PDF (tamaño Carta);
  reemplace el archivo en `public/manual/`.

## Trabajo local (opcional)

```bash
cp .env.example .env.local   # poner URL y llave anon
npm install
npm run dev
```

## Estado del desarrollo

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1. Base | Esquema, RLS, auditoría, cuentas, catálogos, tablero, terminal | Listo |
| 2. Control de acceso | Autorizaciones, presentes, historial y correcciones, sanciones, cierre diario, cambio de contraseña | Listo |
| 3. Equipos | Catálogo, ficha, estados con historial, mantenimientos, capacitaciones, bitácora de uso, etiquetas QR | Listo |
| 4. Préstamos | Internos y externos, personas externas, devoluciones parciales, ampliación de plazo | Listo |
| 5. Inventario | Artículos con pictogramas, entradas, salidas, pérdidas, ajustes, alertas de existencia y caducidad | Listo |
| 6. Carga inicial y piloto | Importación desde Excel, reportes imprimibles, guía de uso (app y PDF) | Listo; falta el piloto |
| Reservaciones | Calendario, series semanales, cruces por clase y por equipo, agenda en la terminal, reporte de actividades | Listo |
| Solicitudes FIQ | Importación de aprobaciones de Power Automate a reservaciones y autorizaciones; bandeja automática vía Postmark | Listo |
| 7. Cierre | Aviso de privacidad, liberación formal | Pendiente |

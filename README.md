# Sistema de Gestión Integral del Laboratorio — FIQ-UADY

Aplicación web para el control de acceso, equipos, préstamos e inventario del laboratorio,
conforme al Reglamento de Laboratorios de la FIQ y su Manual de Seguridad.

- **Frontend:** React + Vite, publicado en GitHub Pages.
- **Base de datos y cuentas:** Supabase (PostgreSQL + Auth). Las reglas del laboratorio
  se validan en la base de datos con triggers y políticas RLS.

## Estructura

```
supabase/migrations/   Scripts SQL, se ejecutan en orden en el SQL Editor de Supabase
supabase/functions/    Edge Function para gestionar cuentas del personal
src/                   Aplicación web
.github/workflows/     Publicación automática en GitHub Pages
```

## Instalación (una sola vez)

### 1. Base de datos
1. Supabase → SQL Editor: ejecutar `supabase/migrations/0001_esquema_base.sql`
   (si aparece el aviso de RLS, elegir «Run and enable RLS»).
2. Ejecutar `supabase/migrations/0002_alta_perfiles.sql`.
   Después, `0003_control_acceso.sql` (fase 2), `0004_equipos.sql` (fase 3) y
   `0005_prestamos_inventario.sql` (fases 4 y 5).
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

## Uso de préstamos e inventario

- **Préstamos**: a personas con acceso vigente o a personas externas (profesores, otros laboratorios),
  que se registran desde el mismo formulario. Un préstamo puede incluir equipos y materiales retornables.
  Los externos (Art. 16) y los de más de 7 días (Art. 17) los registra el Administrador.
- **Devoluciones**: por renglón y parciales. Lo devuelto regresa a la existencia; lo perdido o roto no.
  Un equipo devuelto con daño queda «fuera de servicio».
- **Inventario**: los consumibles salen como «salida»; los retornables, como préstamo. Los reactivos
  especiales (Art. 28) solo los entrega el Administrador. Los ajustes por conteo físico son del
  Administrador. La existencia nunca se edita a mano: cambia solo con movimientos.

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
| 6. Carga inicial y piloto | Inventario real, reportes, capacitación | Pendiente |
| 7. Cierre | Aviso de privacidad, liberación formal | Pendiente |

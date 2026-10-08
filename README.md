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
| 2. Control de acceso | Autorizaciones, presentes, correcciones, sanciones | Pendiente |
| 3. Equipos | Alta, mantenimientos, capacitaciones, etiquetas QR | Pendiente |
| 4. Préstamos | Préstamos internos y externos, devoluciones | Pendiente |
| 5. Inventario | Artículos, lotes, entradas y salidas | Pendiente |
| 6. Carga inicial y piloto | Inventario real, reportes, capacitación | Pendiente |
| 7. Cierre | Aviso de privacidad, liberación formal | Pendiente |

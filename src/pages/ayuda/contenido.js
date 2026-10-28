// Contenido de la guía de uso. Es la misma fuente para la sección Ayuda de la
// aplicación y para el manual en PDF (public/manual/manual_laboratorio.pdf).
// Si se cambia, conviene regenerar el PDF (ver README).
//
// Bloques: { p: 'texto' } · { pasos: [...] } · { lista: [...] } · { nota: 'texto' }
//          { tabla: { encabezados: [...], filas: [[...]] } }

export const PUBLICOS = {
  todos: 'Todos',
  usuarios: 'Usuarios del laboratorio',
  personal: 'Personal en turno',
  admin: 'Administrador',
};

export const CAPITULOS = [
  {
    id: 'inicio',
    titulo: 'Primeros pasos',
    para: 'todos',
    secciones: [
      {
        titulo: '¿Qué hace el sistema?',
        bloques: [
          { p: 'El Sistema de Gestión Integral del Laboratorio registra quién entra y sale, el uso y el mantenimiento de los equipos, los préstamos de equipo y material, y el inventario. Aplica automáticamente el Reglamento de Laboratorios de la FIQ: si una acción no está permitida, el sistema no la registra y explica por qué.' },
          { p: 'Nada se borra. Lo que se da de baja queda en el historial y cada cambio queda registrado con la persona y la hora en que se hizo.' },
        ],
      },
      {
        titulo: 'Tipos de cuenta',
        bloques: [
          {
            tabla: {
              encabezados: ['Cuenta', 'Quién la usa', 'Qué puede hacer'],
              filas: [
                ['Administrador', 'Responsable del laboratorio o persona asignada', 'Todo: cuentas del personal, autorizaciones de acceso, sanciones, capacitaciones, préstamos externos o largos, reactivos especiales, ajustes de inventario, bajas y carga inicial.'],
                ['Gestor de Inventarios', 'Personal en turno', 'Operación diaria: entradas y salidas, equipos, mantenimientos, préstamos, devoluciones y movimientos de inventario.'],
                ['Terminal de acceso', 'Computadora de la entrada', 'Solo la pantalla de autoservicio donde los usuarios registran su entrada, el uso de equipo y su salida.'],
              ],
            },
          },
          { p: 'Los estudiantes y demás usuarios del laboratorio no tienen cuenta: se identifican por su nombre en la terminal.' },
        ],
      },
      {
        titulo: 'Entrar, cambiar la contraseña y salir',
        bloques: [
          { pasos: [
            'Abra la dirección del sistema en el navegador y escriba su correo y contraseña.',
            'Para cambiar su contraseña: en el menú lateral, «Mi cuenta» → escriba la actual y la nueva (mínimo 8 caracteres).',
            'Al terminar su turno, use «Cerrar sesión» en el menú lateral, sobre todo en computadoras compartidas.',
          ] },
          { nota: 'Si olvidó su contraseña, pida al Administrador que le asigne una nueva desde «Personal».' },
        ],
      },
    ],
  },
  {
    id: 'terminal',
    titulo: 'Terminal de acceso',
    para: 'usuarios',
    secciones: [
      {
        titulo: 'Registrar la entrada',
        bloques: [
          { pasos: [
            'Escriba al menos 3 letras de su nombre.',
            'Elija su nombre en la lista y confirme que es usted.',
            'Pulse «Registrar entrada».',
          ] },
          { p: 'Solo aparecen las personas con una autorización de acceso vigente. El laboratorio opera de 08:00 a 20:00.' },
          { nota: 'Si no aparece o la terminal le pide acudir con el personal, su autorización venció, aún no inicia o tiene una suspensión vigente. El personal en turno le indicará qué hacer.' },
        ],
      },
      {
        titulo: 'Usar un equipo',
        bloques: [
          { pasos: [
            'Después de registrar su entrada, busque su nombre y elija «Usar un equipo».',
            'Elija el equipo. Los que no puede usar aparecen deshabilitados con el motivo: en uso, en mantenimiento, mantenimiento vencido o falta de capacitación.',
            'Al terminar, busque su nombre, elija «Terminar uso de equipo» y seleccione el equipo.',
            'Si el equipo presentó una falla, indíquelo y descríbala: el equipo queda fuera de servicio hasta su revisión.',
          ] },
        ],
      },
      {
        titulo: 'Registrar la salida',
        bloques: [
          { p: 'Busque su nombre y pulse «Registrar salida». Si tiene equipos en uso, primero termine su uso.' },
          { nota: 'Quien no registra su salida queda marcado como «salida no registrada» al cierre de la jornada.' },
        ],
      },
    ],
  },
  {
    id: 'acceso',
    titulo: 'Control de acceso',
    para: 'personal',
    secciones: [
      {
        titulo: 'Presentes',
        bloques: [
          { p: 'Muestra quién está dentro, desde qué hora, con qué proyecto y qué equipo está usando.' },
          { lista: [
            'Registrar entrada: para quien no pueda usar la terminal. Aplica las mismas reglas de horario, autorización y sanciones.',
            'Registrar salida: para quien olvidó marcarla. También cierra los usos de equipo que dejó abiertos.',
            'Cierre de jornada: se ejecuta solo cada noche. Úselo manualmente solo si el cierre automático no está activo.',
          ] },
        ],
      },
      {
        titulo: 'Historial y correcciones',
        bloques: [
          { p: 'Consulte las entradas y salidas por fechas, filtre solo las incidencias y exporte a CSV (se abre en Excel).' },
          { p: 'Para corregir una hora, use «Corregir». El motivo es obligatorio y queda anotado con su nombre y la fecha de la corrección.' },
        ],
      },
      {
        titulo: 'Autorizaciones de acceso',
        para: 'admin',
        bloques: [
          { pasos: [
            'Al recibir el correo de solicitud, vaya a Control de acceso → Autorizaciones.',
            'Capture la matrícula. Si la persona ya está registrada, se precargan su nombre y correo.',
            'Complete nombre, correo, proyecto a realizar y el periodo (desde, hasta), y pulse «Autorizar acceso».',
          ] },
          { p: 'Una persona puede tener varias autorizaciones (por ejemplo, tesis y servicio social). Las que vencen en 7 días o menos se marcan. «Revocar» retira el acceso de inmediato.' },
        ],
      },
      {
        titulo: 'Sanciones (Art. 36)',
        para: 'admin',
        bloques: [
          { tabla: {
            encabezados: ['Inciso', 'Sanción', 'Efecto en el sistema'],
            filas: [
              ['a)', 'Amonestación verbal', 'Queda registrada; no bloquea.'],
              ['b)', 'Amonestación por escrito', 'Queda registrada; no bloquea.'],
              ['c)', 'Suspensión por una semana', 'Bloquea acceso y préstamos 7 días.'],
              ['d)', 'Suspensión por un mes', 'Bloquea acceso y préstamos 1 mes.'],
              ['e)', 'Suspensión por un semestre', 'Bloquea acceso y préstamos 6 meses.'],
            ],
          } },
          { p: 'La fecha final se calcula sola si se deja vacía. «Levantar» termina una suspensión antes de tiempo. La persona sancionada no ve el motivo en la terminal.' },
        ],
      },
    ],
  },
  {
    id: 'equipos',
    titulo: 'Equipos',
    para: 'personal',
    secciones: [
      {
        titulo: 'Catálogo y ficha',
        bloques: [
          { p: 'El catálogo muestra cada equipo con su estado y la situación de su mantenimiento. Haga clic en un renglón para abrir su ficha: datos, mantenimientos, bitácora de uso, historial de estados y personas capacitadas.' },
          { p: 'Para dar de alta un equipo: «Nuevo equipo». Al elegir el tipo, el sistema indica si requiere capacitación previa y quién la imparte.' },
        ],
      },
      {
        titulo: 'Estados del equipo',
        bloques: [
          { tabla: {
            encabezados: ['Estado', 'Cómo se pone', 'Cómo se quita'],
            filas: [
              ['En uso', 'Al iniciar el uso en la terminal', 'Al terminar el uso'],
              ['Prestado', 'Al registrar un préstamo', 'Al registrar la devolución'],
              ['En mantenimiento', '«Cambiar estado» con motivo', 'Registrando el mantenimiento'],
              ['Fuera de servicio', 'Daño reportado, o mantenimiento que no lo dejó operativo', 'Registrando la reparación (mantenimiento correctivo)'],
              ['Baja', 'Solo el Administrador, con motivo', 'Solo el Administrador puede reactivarlo'],
            ],
          } },
          { nota: 'Un equipo con el mantenimiento preventivo vencido no puede usarse ni prestarse hasta registrar el mantenimiento.' },
        ],
      },
      {
        titulo: 'Registrar un mantenimiento',
        bloques: [
          { pasos: [
            'En la ficha del equipo (o en Equipos → Mantenimientos), pulse «Registrar mantenimiento».',
            'Elija preventivo o correctivo, la fecha, el trabajo realizado, el proveedor y el costo.',
            'Indique si el equipo quedó operativo.',
          ] },
          { p: 'El preventivo actualiza el último mantenimiento y recalcula el próximo según la periodicidad. El correctivo (reparación) no mueve el calendario del preventivo.' },
        ],
      },
      {
        titulo: 'Capacitaciones (Art. 13)',
        para: 'admin',
        bloques: [
          { p: 'En Equipos → Capacitaciones, registre quién está capacitado en cada tipo de equipo, la fecha y quién impartió la capacitación. Sin ella, la terminal no permite usar los equipos de ese tipo ni se pueden prestar a esa persona.' },
        ],
      },
      {
        titulo: 'Etiquetas QR',
        bloques: [
          { p: 'Desde el catálogo (seleccionando equipos) o desde la ficha, «Etiquetas QR» genera una hoja para imprimir en papel adhesivo. Al escanear el código con el celular se abre la ficha del equipo, previo inicio de sesión del personal.' },
        ],
      },
    ],
  },
  {
    id: 'prestamos',
    titulo: 'Préstamos',
    para: 'personal',
    secciones: [
      {
        titulo: 'Registrar un préstamo',
        bloques: [
          { pasos: [
            'Préstamos → Nuevo préstamo.',
            'Elija a la persona: con autorización de acceso vigente o persona externa. Para un profesor u otro laboratorio sin autorización, use «Registrar persona externa».',
            'Agregue los equipos disponibles y los materiales retornables con su cantidad. Si un equipo no se puede prestar a esa persona, el sistema lo indica al agregarlo.',
            'Indique el tipo (interno o externo), la fecha límite y el motivo o práctica, y pulse «Registrar préstamo».',
          ] },
          { lista: [
            'Interno: el material se usa dentro de la FIQ. Hasta 7 días sin autorización (Art. 17).',
            'Externo: sale de la FIQ. Requiere el oficio de visto bueno del Secretario Administrativo y autorización del Administrador (Art. 16).',
            'Préstamos de más de 7 días y externos: los registra el Administrador.',
            'Los consumibles no se prestan: se entregan como salida de inventario.',
          ] },
        ],
      },
      {
        titulo: 'Devoluciones y ampliaciones',
        bloques: [
          { p: 'Abra el préstamo (Préstamos → Abiertos) y use «Registrar devolución» en cada renglón. Los materiales admiten devoluciones parciales: lo devuelto en buen estado regresa a la existencia; lo perdido o roto no regresa y se debe explicar qué ocurrió. Un equipo devuelto con daño queda fuera de servicio.' },
          { p: 'El préstamo se cierra solo cuando se devuelve todo. «Ampliar plazo» permite al personal extender préstamos internos hasta 7 días a partir de hoy; plazos mayores y préstamos externos los amplía el Administrador.' },
        ],
      },
    ],
  },
  {
    id: 'inventario',
    titulo: 'Inventario',
    para: 'personal',
    secciones: [
      {
        titulo: 'Artículos',
        bloques: [
          { p: 'Hay dos tipos: consumibles (reactivos, disolventes; se entregan como salida) y retornables (cristalería, utensilios; se entregan como préstamo). Cada artículo registra su existencia mínima, ubicación, pictogramas de peligro (NOM-018-STPS-2015) y enlace a la hoja de seguridad.' },
          { p: 'La existencia no se edita a mano: cambia solo con movimientos, y cada uno queda en el historial del artículo.' },
        ],
      },
      {
        titulo: 'Movimientos',
        bloques: [
          { tabla: {
            encabezados: ['Movimiento', 'Cuándo', 'Quién'],
            filas: [
              ['Entrada', 'Compra, donación o reposición. Registre lote y caducidad si los tiene.', 'Personal'],
              ['Salida', 'Entrega de consumibles para una práctica o proyecto.', 'Personal; reactivos especiales (Art. 28), solo el Administrador'],
              ['Pérdida', 'Material roto, derramado o extraviado. Motivo obligatorio.', 'Personal'],
              ['Ajuste', 'Corrección tras un conteo físico. Motivo obligatorio.', 'Solo el Administrador'],
            ],
          } },
          { p: 'Inventario → Artículos avisa de los artículos en o bajo su mínimo y de los lotes que caducan en los próximos 60 días.' },
        ],
      },
    ],
  },
  {
    id: 'reportes',
    titulo: 'Reportes',
    para: 'personal',
    secciones: [
      {
        titulo: 'Generar un reporte',
        bloques: [
          { pasos: [
            'Menú → Reportes.',
            'Elija el reporte: uso del laboratorio, inventario y consumo, o préstamos.',
            'Ajuste el periodo (o use «Este mes», «Mes anterior», «Este año»).',
            'Pulse «Imprimir o guardar PDF» para obtener el documento con encabezado institucional, o «CSV» en cada tabla para abrirla en Excel.',
          ] },
        ],
      },
    ],
  },
  {
    id: 'administracion',
    titulo: 'Administración',
    para: 'admin',
    secciones: [
      {
        titulo: 'Cuentas del personal',
        bloques: [
          { p: 'En Personal se crean las cuentas (no hay autorregistro), se asigna el rol, se cambia la contraseña de alguien y se desactiva o reactiva una cuenta. La cuenta de la terminal no admite otros roles. Nadie puede quitarse a sí mismo el rol de Administrador.' },
        ],
      },
      {
        titulo: 'Tipos de equipo y configuración',
        bloques: [
          { p: 'En Tipos de equipo se indica qué tipos requieren capacitación previa y qué entidad la imparte. En Configuración se ajustan el horario, los días máximos de préstamo sin autorización, la anticipación de las alertas de mantenimiento y las letras mínimas de búsqueda en la terminal.' },
        ],
      },
      {
        titulo: 'Carga inicial desde Excel',
        bloques: [
          { pasos: [
            'Administración → Carga inicial → «Descargar plantilla» (inventario o equipos).',
            'Capture en la hoja «Datos» un renglón por artículo o equipo, sin cambiar los encabezados. La hoja «Instrucciones» explica cada columna.',
            'Pulse «Elegir archivo Excel». El sistema muestra una vista previa y marca los renglones con errores.',
            'Corrija en Excel y vuelva a elegir el archivo hasta que no haya errores; entonces pulse «Importar».',
          ] },
          { nota: 'Si un renglón tiene error, no se guarda ninguno. Las existencias iniciales quedan registradas como entradas «Carga inicial». Cargue solo existencias verificadas físicamente.' },
        ],
      },
    ],
  },
  {
    id: 'problemas',
    titulo: 'Preguntas frecuentes',
    para: 'todos',
    secciones: [
      {
        titulo: 'Una persona no aparece en la terminal',
        bloques: [{ p: 'Revise en Control de acceso → Autorizaciones que tenga una autorización activa cuyo periodo incluya el día de hoy, y en Sanciones que no tenga una suspensión vigente.' }],
      },
      {
        titulo: 'Un equipo no se puede usar o prestar',
        bloques: [{ p: 'La ficha del equipo indica la razón: está en uso, prestado, en mantenimiento, fuera de servicio, con el mantenimiento vencido, o la persona no tiene la capacitación requerida.' }],
      },
      {
        titulo: 'No puedo registrar un préstamo de más de 7 días o externo',
        bloques: [{ p: 'Es correcto: los Arts. 16 y 17 requieren autorización del Administrador, que debe registrar el préstamo con su cuenta.' }],
      },
      {
        titulo: 'Alguien cerró la pantalla de la terminal',
        bloques: [{ p: 'Inicie sesión de nuevo en esa computadora con la cuenta de la terminal. Para salir del modo terminal se piden las credenciales de alguien del personal.' }],
      },
      {
        titulo: 'Un mensaje dice que mi rol no tiene permiso',
        bloques: [{ p: 'La acción está reservada al Administrador (por ejemplo, ajustes de inventario, reactivos especiales, bajas o autorizaciones). Solicítela al Administrador.' }],
      },
    ],
  },
];

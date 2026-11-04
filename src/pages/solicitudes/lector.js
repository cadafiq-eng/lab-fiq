// Lectura del texto de las aprobaciones de Power Automate del sistema de
// Laboratorios FIQ («Solicitud de acceso a laboratorio» y «Solicitud de
// Practica»). El personal copia el correo o la aprobación y lo pega; aquí se
// reconocen los campos. Todo lo leído se muestra para revisarlo antes de guardar.

// Quita acentos sin cambiar la longitud del texto (para buscar etiquetas y
// luego recortar el texto original en las mismas posiciones)
const SIN_ACENTO = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N' };
const plano = (t) => t.replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => SIN_ACENTO[c]).toLowerCase();

const ETIQUETAS = [
  'Solicitud', 'Asignatura', 'Nombre de la practica', 'Numero de estudiantes', 'FIQ', 'Externos',
  'Numero de equipos conformados', 'Distribucion del numero de estudiantes por programa educativo',
  'IQI', 'QA', 'QI', 'IA', 'IB', 'IIL', 'Otros PE', 'Fecha', 'Horario', 'Material de laboratorio requerido',
  'Reactivos, soluciones o medios de cultivo requeridos', 'Equipo de laboratorio a utilizar', 'Tipo de residuos que se genera',
  'Otros requerimientos', 'Fecha Inicio', 'Fecha Final', 'Tipo de actividad', 'Actividad a realizar', 'Titulo del trabajo',
  'SISTPROY', 'Proyecto', 'Equipo de Laboratorio', 'Reactivos requeridos', 'Nombre', 'Telefono',
  'Fecha de creacion', 'Creado por', 'Solicitado para', 'Solicitado por',
];
// Textos que cierran el último campo
const CIERRES = ['para realizar la aprobacion', 'al aprobar esta solicitud', 'atentamente', 'detalles y requerimientos de la actividad',
  'contacto de emergencia', 'aprobar >', 'aprobar\n', 'ver esta aprobacion'];

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Devuelve { etiqueta_normalizada: valor } con el texto original
function campos(texto) {
  const p = plano(texto);
  const marcas = [];
  ETIQUETAS.forEach((e) => {
    // La etiqueta debe empezar línea o ir tras un espacio, y terminar en «:»
    const re = new RegExp(`(^|[\\s>])${escapar(plano(e)).replace(/ /g, '\\s+')}\\s*:`, 'g');
    let m;
    while ((m = re.exec(p))) marcas.push({ clave: plano(e), ini: m.index + m[1].length, fin: m.index + m[0].length });
  });
  // Si dos etiquetas empiezan igual («Fecha» y «Fecha Inicio»), gana la más larga
  marcas.sort((a, b) => a.ini - b.ini || b.fin - a.fin);
  const unicas = marcas.filter((m, i) => !marcas.some((o, j) => j !== i && o.ini <= m.ini && o.fin >= m.fin && (o.fin - o.ini) > (m.fin - m.ini)));
  const cierres = CIERRES.flatMap((c) => { const r = []; let i = -1; while ((i = p.indexOf(c, i + 1)) !== -1) r.push(i); return r; });
  const salida = {};
  unicas.forEach((m, i) => {
    const sig = Math.min(unicas[i + 1]?.ini ?? texto.length, ...cierres.filter((c) => c >= m.fin), texto.length);
    const valor = texto.slice(m.fin, sig).replace(/\s+/g, ' ').trim();
    if (!(m.clave in salida)) salida[m.clave] = valor;
  });
  return salida;
}

const entero = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return Number.isNaN(n) ? null : n; };
const fechaISO = (v) => { const m = String(v ?? '').match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  const d = String(v ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : ''; };

// «15:00 a 20:00H», «10:00am-04:00pm», «14:00-18:00h»
export function leerHorario(v) {
  const re = /(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/gi;
  const horas = [];
  let m;
  const t = String(v ?? '').replace(/h(?:rs?)?\b/gi, ' ');
  while ((m = re.exec(t)) && horas.length < 2) {
    let h = Number(m[1]); const min = m[2] ?? '00';
    if (h > 23 || (!m[2] && !m[3])) continue;
    const suf = (m[3] ?? '').toLowerCase().replace(/[.\s]/g, '');
    if (suf === 'pm' && h < 12) h += 12;
    if (suf === 'am' && h === 12) h = 0;
    horas.push(`${String(h).padStart(2, '0')}:${min}`);
  }
  if (horas.length < 2) {
    const b = t.match(/\b(\d{1,2})\s*(?:a|-|–)\s*(\d{1,2})\b/);
    if (b && Number(b[1]) < 24 && Number(b[2]) < 24) return { inicio: `${b[1].padStart(2, '0')}:00`, fin: `${b[2].padStart(2, '0')}:00` };
  }
  return { inicio: horas[0] ?? '', fin: horas[1] ?? '' };
}

// ["Ninguno"] o ["Grupo 1. …", "Grupo 6. …"] → [1, 6]; «Otros» → 8
export function leerResiduos(v) {
  const t = plano(String(v ?? ''));
  const grupos = [...t.matchAll(/grupo\s*(\d)/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 7);
  if (/otro/.test(t)) grupos.push(8);
  return [...new Set(grupos)];
}

const PES = ['IQI', 'QA', 'QI', 'IA', 'IB', 'IIL'];

// Reconoce el tipo de solicitud y devuelve los datos; null si no se reconoce
export function leerSolicitud(texto) {
  if (!texto || !texto.trim()) return null;
  const c = campos(texto);
  const p = plano(texto);
  const folio = entero(c.solicitud);
  const correos = [...texto.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0].toLowerCase())
    .filter((x) => !/flow-noreply|laboratorios\.fiq|lab\.tecnologia/.test(x));

  if (c['nombre de la practica'] !== undefined || /solicitud de practica/.test(p)) {
    const solicitado = texto.match(/Solicitado (?:para|por)\s+([^<\n]+?)\s*<([^>]+)>/i);
    const alumnos_pe = {};
    PES.forEach((k) => { const n = entero(c[plano(k)]); if (n !== null) alumnos_pe[k] = n; });
    const otros = entero(c['otros pe']); if (otros !== null) alumnos_pe.Otros = otros;
    const externos = entero(c.externos); if (externos !== null) alumnos_pe.Externos = externos;
    const fiq = entero(c.fiq);
    const total = (fiq ?? 0) + (externos ?? 0);
    const h = leerHorario(c.horario);
    return {
      tipo: 'practica',
      folio,
      titulo: c['nombre de la practica'] ?? '',
      asignatura: c.asignatura ?? '',
      responsable: solicitado ? solicitado[1].trim() : '',
      responsable_correo: (solicitado ? solicitado[2] : correos[correos.length - 1] ?? '').toLowerCase(),
      num_alumnos: total || null,
      num_equipos_trabajo: entero(c['numero de equipos conformados']),
      alumnos_pe: Object.keys(alumnos_pe).length ? alumnos_pe : null,
      programa_educativo: PES.filter((k) => alumnos_pe[k] > 0).join(', '),
      procedencia: fiq === 0 && externos > 0 ? 'externo' : 'interno',
      fecha: fechaISO(c.fecha),
      hora_inicio: h.inicio,
      hora_fin: h.fin,
      materiales: c['material de laboratorio requerido'] ?? '',
      reactivos: c['reactivos, soluciones o medios de cultivo requeridos'] ?? '',
      equipos_texto: c['equipo de laboratorio a utilizar'] ?? '',
      residuos: leerResiduos(c['tipo de residuos que se genera']),
      observaciones: /^(na|n\/a|ninguno|no)$/i.test(c['otros requerimientos'] ?? '') ? '' : (c['otros requerimientos'] ?? ''),
    };
  }

  if (/solicitando acceso/.test(p) || c['fecha inicio'] !== undefined) {
    const estudiante = texto.match(/usuario\s+(.+?)\s+con\s+Matr[ií]cula\s*:\s*([A-Za-z]?\d+)/i);
    const academico = texto.match(/acad[eé]mico\s+(.+?),\s*de la instituci[oó]n\s+(.+?)\s*,\s*esta solicitando/i);
    const lab = texto.match(/acceso a laboratorio de\s+([^.\n]+)/i);
    const matricula = estudiante ? estudiante[2].toUpperCase() : '';
    const digitos = matricula.replace(/\D/g, '');
    const contactoNombre = c.nombre ?? ''; const contactoTel = c.telefono ?? '';
    return {
      tipo: 'acceso',
      folio,
      nombre: (estudiante?.[1] ?? academico?.[1] ?? '').replace(/\s+/g, ' ').trim(),
      matricula,
      // Correo institucional de estudiantes UADY: a + matrícula @alumnos.uady.mx (se puede corregir)
      correo: matricula ? `a${digitos}@alumnos.uady.mx` : '',
      institucion: academico ? academico[2].trim() : '',
      laboratorio: lab ? lab[1].trim() : '',
      inicio: fechaISO(c['fecha inicio']),
      fin: fechaISO(c['fecha final']) || fechaISO(c['fecha inicio']),
      tipo_actividad: c['tipo de actividad'] ?? '',
      actividad: c['actividad a realizar'] ?? '',
      titulo: (c['titulo del trabajo'] ?? '').replace(/^["“”«»']+|["“”«»']+$/g, '').trim(),
      proyecto_sistproy: [c.sistproy, c.proyecto].filter((x) => x && !/^no$/i.test(x)).join(' · '),
      contacto: [contactoNombre, contactoTel].filter(Boolean).join(' · '),
      materiales: c['material de laboratorio requerido'] ?? '',
      equipos_texto: c['equipo de laboratorio'] ?? '',
      reactivos: c['reactivos requeridos'] ?? '',
      residuos: leerResiduos(c['tipo de residuos que se genera']),
    };
  }
  return null;
}

// Separa «Estufón, 1 balanza granataria y cuarto frío» en piezas sin cantidades
export function piezasEquipo(texto) {
  return String(texto ?? '').split(/,|;|\s+y\s+|\n/).map((s) => s.replace(/^\s*\d+\s*(x|pzas?\.?|piezas?)?\s*/i, '').trim())
    .filter((s) => s.length > 1 && !/^(na|n\/a|ninguno)$/i.test(s));
}

// Equipos del catálogo cuyo nombre empieza con la pieza (sin acentos ni mayúsculas)
export function sugerirEquipos(pieza, equipos) {
  const q = plano(pieza).replace(/\s+/g, ' ').trim();
  if (q.length < 3) return [];
  return equipos.filter((e) => {
    const n = plano(e.nombre);
    return n.startsWith(q) || n.startsWith(q.replace(/s\b/g, '')) || plano(e.tipo ?? '').startsWith(q);
  });
}

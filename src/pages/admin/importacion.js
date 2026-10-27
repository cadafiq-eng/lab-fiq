// Lectura y validación de las plantillas de carga inicial (Excel).
// La base vuelve a validar todo al importar; esto solo adelanta los errores.
import { normalizar, hoyISO } from '../../util';

const clave = (t) => normalizar(String(t ?? '')).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const texto = (v) => (v == null ? '' : String(v).trim());

function numero(v, errores, campo) {
  if (v == null || texto(v) === '') return null;
  // 2,000 o 2,000.5 = miles con coma (uso en México); 2,5 = decimal con coma
  const s = texto(v).replace(/\s/g, '');
  const n = typeof v === 'number' ? v
    : Number(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.'));
  if (Number.isNaN(n)) { errores.push(`${campo}: «${texto(v)}» no es un número`); return null; }
  if (n < 0) { errores.push(`${campo}: no puede ser negativo`); return null; }
  return n;
}

function fecha(v, errores, campo) {
  if (v == null || texto(v) === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Excel guarda la fecha sin zona: se lee en UTC
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  const t = texto(v);
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  errores.push(`${campo}: «${t}» no es una fecha (use dd/mm/aaaa)`);
  return null;
}

function sino(v, errores, campo) {
  const t = clave(v);
  if (t === '') return null;
  if (['si', 's', 'x', 'true', '1', 'verdadero'].includes(t)) return true;
  if (['no', 'n', 'false', '0', 'falso'].includes(t)) return false;
  errores.push(`${campo}: use Sí o No`);
  return null;
}

const PICTOS = {
  explosivo: 'explosivo', inflamable: 'inflamable', comburente: 'comburente', 'gas a presion': 'gas_presion',
  corrosivo: 'corrosivo', 'toxicidad aguda': 'toxico', toxico: 'toxico', irritante: 'irritante', nocivo: 'irritante',
  'irritante / nocivo': 'irritante', 'peligro grave para la salud': 'peligro_salud', 'peligro para la salud': 'peligro_salud',
  'medio ambiente': 'medio_ambiente', 'peligro para el medio ambiente': 'medio_ambiente',
};

// Convierte las filas del Excel (arreglo de arreglos) en objetos por encabezado
function porEncabezado(filas, columnas) {
  const encabezados = (filas[0] ?? []).map(clave);
  const faltan = Object.entries(columnas).filter(([, c]) => c.obligatoria && !encabezados.includes(c.encabezado)).map(([, c]) => c.titulo);
  if (faltan.length) throw new Error(`Al archivo le faltan columnas: ${faltan.join(', ')}. Use la plantilla sin cambiar los encabezados.`);
  return filas.slice(1).map((f, i) => {
    const o = { renglon: i + 2 };
    Object.entries(columnas).forEach(([k, c]) => { o[k] = f[encabezados.indexOf(c.encabezado)]; });
    return o;
  }).filter((o) => Object.keys(columnas).some((k) => texto(o[k]) !== ''));
}

const col = (titulo, obligatoria = false) => ({ titulo, encabezado: clave(titulo), obligatoria });

export const COLUMNAS_ARTICULOS = {
  nombre: col('Nombre', true), codigo: col('Código'), categoria: col('Categoría'), tipo: col('Tipo', true),
  unidad: col('Unidad', true), existencia_inicial: col('Existencia inicial'), lote: col('Lote'), caducidad: col('Caducidad'),
  stock_minimo: col('Existencia mínima'), ubicacion: col('Ubicación'), especial: col('Reactivo especial (Art. 28)'),
  recuperable: col('Recuperable (Art. 29)'), pictogramas: col('Pictogramas'), hoja_seguridad_url: col('Hoja de seguridad (enlace)'),
};

export const COLUMNAS_EQUIPOS = {
  codigo: col('Código', true), nombre: col('Nombre', true), tipo_equipo: col('Tipo de equipo', true),
  requiere_capacitacion: col('Requiere capacitación'), marca: col('Marca'), modelo: col('Modelo'),
  numero_serie: col('Número de serie'), ubicacion: col('Ubicación'), responsable: col('Responsable'), voltaje: col('Voltaje'),
  periodicidad_dias: col('Periodicidad de mantenimiento (días)'), ultimo_mantenimiento: col('Último mantenimiento'),
  proximo_mantenimiento: col('Próximo mantenimiento'), estado: col('Estado inicial'), manual_url: col('Manual (enlace)'),
};

// codigosExistentes: Set de códigos ya registrados (en minúsculas)
export function validarArticulos(filas, codigosExistentes) {
  const vistos = new Map();
  const hoy = hoyISO();
  return porEncabezado(filas, COLUMNAS_ARTICULOS).map((o) => {
    const errores = []; const avisos = [];
    const r = {
      renglon: o.renglon, nombre: texto(o.nombre), codigo: texto(o.codigo), categoria: texto(o.categoria),
      unidad: texto(o.unidad), lote: texto(o.lote), ubicacion: texto(o.ubicacion), hoja_seguridad_url: texto(o.hoja_seguridad_url),
    };
    if (!r.nombre) errores.push('Falta el nombre');
    if (!r.unidad) errores.push('Falta la unidad');
    const tipo = clave(o.tipo);
    if (tipo === 'consumible' || tipo === 'retornable') r.tipo = tipo; else errores.push('Tipo: use Consumible o Retornable');
    r.existencia_inicial = numero(o.existencia_inicial, errores, 'Existencia inicial');
    r.stock_minimo = numero(o.stock_minimo, errores, 'Existencia mínima');
    r.caducidad = fecha(o.caducidad, errores, 'Caducidad');
    if (r.caducidad && r.caducidad < hoy) errores.push('Caducidad vencida: deje la celda vacía y separe el reactivo para su disposición');
    if (r.caducidad && !(r.existencia_inicial > 0)) avisos.push('La caducidad solo se registra si hay existencia inicial');
    r.especial = sino(o.especial, errores, 'Reactivo especial');
    r.recuperable = sino(o.recuperable, errores, 'Recuperable');
    r.pictogramas = [];
    texto(o.pictogramas).split(/[,;]/).map(clave).filter(Boolean).forEach((p) => {
      if (PICTOS[p]) { if (!r.pictogramas.includes(PICTOS[p])) r.pictogramas.push(PICTOS[p]); }
      else errores.push(`Pictograma no reconocido: «${p}»`);
    });
    if (r.codigo) {
      const k = r.codigo.toLowerCase();
      if (codigosExistentes.has(k)) errores.push(`El código ${r.codigo} ya existe en el inventario`);
      if (vistos.has(k)) errores.push(`Código repetido (también en el renglón ${vistos.get(k)})`);
      vistos.set(k, r.renglon);
    }
    return { datos: r, errores, avisos };
  });
}

// tiposExistentes: Set de nombres de tipo normalizados
export function validarEquipos(filas, codigosExistentes, tiposExistentes) {
  const vistos = new Map();
  const ESTADOS = { disponible: 'disponible', 'en mantenimiento': 'en_mantenimiento', 'fuera de servicio': 'fuera_de_servicio' };
  return porEncabezado(filas, COLUMNAS_EQUIPOS).map((o) => {
    const errores = []; const avisos = [];
    const r = {
      renglon: o.renglon, codigo: texto(o.codigo), nombre: texto(o.nombre), tipo_equipo: texto(o.tipo_equipo),
      marca: texto(o.marca), modelo: texto(o.modelo), numero_serie: texto(o.numero_serie), ubicacion: texto(o.ubicacion),
      responsable: texto(o.responsable), manual_url: texto(o.manual_url),
    };
    if (!r.codigo) errores.push('Falta el código');
    if (!r.nombre) errores.push('Falta el nombre');
    if (!r.tipo_equipo) errores.push('Falta el tipo de equipo');
    else if (!tiposExistentes.has(clave(r.tipo_equipo))) avisos.push(`Se creará el tipo «${r.tipo_equipo}» sin capacitación requerida`);
    r.requiere_capacitacion = sino(o.requiere_capacitacion, errores, 'Requiere capacitación');
    const v = clave(o.voltaje);
    r.voltaje = v === '' ? null : v.startsWith('110') ? '110 V' : v.startsWith('220') ? '220 V' : v === 'otro' ? 'otro' : (errores.push('Voltaje: use 110 V, 220 V u Otro'), null);
    const per = numero(o.periodicidad_dias, errores, 'Periodicidad');
    if (per !== null && (!Number.isInteger(per) || per === 0)) errores.push('Periodicidad: use un número entero de días');
    r.periodicidad_dias = per;
    r.ultimo_mantenimiento = fecha(o.ultimo_mantenimiento, errores, 'Último mantenimiento');
    r.proximo_mantenimiento = fecha(o.proximo_mantenimiento, errores, 'Próximo mantenimiento');
    if (r.ultimo_mantenimiento && r.ultimo_mantenimiento > hoyISO()) errores.push('El último mantenimiento no puede ser una fecha futura');
    const e = clave(o.estado);
    r.estado = e === '' ? 'disponible' : ESTADOS[e];
    if (!r.estado) errores.push('Estado inicial: use Disponible, En mantenimiento o Fuera de servicio');
    if (r.codigo) {
      const k = r.codigo.toLowerCase();
      if (codigosExistentes.has(k)) errores.push(`El código ${r.codigo} ya está registrado`);
      if (vistos.has(k)) errores.push(`Código repetido (también en el renglón ${vistos.get(k)})`);
      vistos.set(k, r.renglon);
    }
    return { datos: r, errores, avisos };
  });
}

export { clave as claveTexto };

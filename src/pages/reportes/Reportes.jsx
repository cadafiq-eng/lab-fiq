import { useEffect, useMemo, useState } from 'react';
import { supabase, mensajeError } from '../../supabase';
import { Aviso } from '../../componentes';
import { descargarCSV, diaLocal, fecha, fechaHora, hoyISO } from '../../util';

const TIPOS = {
  uso: 'Uso del laboratorio',
  actividades: 'Actividades (reservaciones)',
  inventario: 'Inventario y consumo',
  prestamos: 'Préstamos',
};

function inicioDeMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const horas = (ms) => ms / 3600000;
const fmt = (n, dec = 1) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: dec, minimumFractionDigits: 0 });

// Rango del periodo en marcas de tiempo (hora local)
function rango(desde, hasta) {
  const fin = new Date(hasta + 'T00:00'); fin.setDate(fin.getDate() + 1);
  return [new Date(desde + 'T00:00').toISOString(), fin.toISOString()];
}

export default function Reportes() {
  const [tipo, setTipo] = useState('uso');
  const [desde, setDesde] = useState(inicioDeMes());
  const [hasta, setHasta] = useState(hoyISO());

  return (
    <>
      <div className="no-imprimir">
        <div className="encabezado">
          <h1>Reportes</h1>
          <button className="btn btn-primario" onClick={() => window.print()}>Imprimir o guardar PDF</button>
        </div>
        <nav className="pestanas">
          {Object.entries(TIPOS).map(([k, v]) => (
            <a key={k} href="#" className={tipo === k ? 'active' : ''} onClick={(e) => { e.preventDefault(); setTipo(k); }}>{v}</a>
          ))}
        </nav>
        <div className="filtros una-columna">
          <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde} max={hoyISO()} onChange={(e) => setHasta(e.target.value)} /></label>
          <div className="fila-botones">
            <button className="btn btn-chico" onClick={() => { setDesde(inicioDeMes()); setHasta(hoyISO()); }}>Este mes</button>
            <button className="btn btn-chico" onClick={() => {
              const d = new Date(); const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1); const fin = new Date(d.getFullYear(), d.getMonth(), 0);
              setDesde(diaLocal(ini)); setHasta(diaLocal(fin));
            }}>Mes anterior</button>
            <button className="btn btn-chico" onClick={() => { setDesde(`${new Date().getFullYear()}-01-01`); setHasta(hoyISO()); }}>Este año</button>
          </div>
        </div>
      </div>

      <header className="solo-impresion encabezado-reporte">
        <p>Universidad Autónoma de Yucatán · Facultad de Ingeniería Química</p>
        <h1>Laboratorio — {TIPOS[tipo]}</h1>
        <p>Periodo: {fecha(desde)} al {fecha(hasta)} · Generado el {fechaHora(new Date())}</p>
      </header>

      {tipo === 'uso' && <ReporteUso desde={desde} hasta={hasta} />}
      {tipo === 'actividades' && <ReporteActividades desde={desde} hasta={hasta} />}
      {tipo === 'inventario' && <ReporteInventario desde={desde} hasta={hasta} />}
      {tipo === 'prestamos' && <ReportePrestamos desde={desde} hasta={hasta} />}
    </>
  );
}

// ---------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------
function Indicadores({ lista }) {
  return (
    <div className="indicadores">
      {lista.map(([valor, etiqueta]) => (
        <div key={etiqueta} className="indicador">
          <span className="indicador-valor">{valor}</span>
          <span className="indicador-etiqueta">{etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

// Tabla con exportación a CSV. filas: arreglos de valores ya formateados.
function Seccion({ titulo, nota, encabezados, filas, archivo, numericas = [], vacio = 'Sin datos en el periodo.' }) {
  return (
    <section className="tarjeta una-columna seccion-reporte">
      <div className="encabezado">
        <h2>{titulo}</h2>
        {filas.length > 0 && <button className="btn btn-chico no-imprimir" onClick={() => descargarCSV(archivo, encabezados, filas)}>CSV</button>}
      </div>
      {nota && <p className="tenue nota">{nota}</p>}
      {filas.length === 0 ? <p className="tenue">{vacio}</p> : (
        <div className="tabla-desplazable"><table>
          <thead><tr>{encabezados.map((h, i) => <th key={h} className={numericas.includes(i) ? 'der' : ''}>{h}</th>)}</tr></thead>
          <tbody>{filas.map((f, j) => (
            <tr key={j}>{f.map((v, i) => <td key={i} className={numericas.includes(i) ? 'der sin-salto' : ''}>{v}</td>)}</tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

function Barras({ datos }) {
  const max = Math.max(1, ...datos.map(([, v]) => v));
  return (
    <div className="barras">
      {datos.map(([etq, v]) => (
        <div key={etq} className="barra-fila">
          <span className="barra-etiqueta">{etq}</span>
          <span className="barra-pista"><span className="barra" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="barra-valor">{v}</span>
        </div>
      ))}
    </div>
  );
}

function useConsulta(fn, deps) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let vigente = true;
    setDatos(null); setError(null);
    fn().then((d) => vigente && setDatos(d)).catch((e) => vigente && setError(mensajeError(e)));
    return () => { vigente = false; };
  }, deps);
  return [datos, error];
}

const exigir = ({ data, error }) => { if (error) throw error; return data; };

// ---------------------------------------------------------------------
// Uso del laboratorio
// ---------------------------------------------------------------------
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function ReporteUso({ desde, hasta }) {
  const [regs, error] = useConsulta(async () => {
    const [a, b] = rango(desde, hasta);
    return exigir(await supabase.from('registros_acceso')
      .select('entrada, salida, salida_no_registrada, solicitante_id, solicitantes(nombre, matricula), autorizaciones_acceso(proyecto)')
      .gte('entrada', a).lt('entrada', b).order('entrada').limit(20000));
  }, [desde, hasta]);

  const r = useMemo(() => {
    if (!regs) return null;
    const dur = (x) => (x.salida ? new Date(x.salida) - new Date(x.entrada) : 0);
    const proyectos = new Map(); const personas = new Map(); const dias = Array(7).fill(0); const franjas = new Map();
    regs.forEach((x) => {
      const p = x.autorizaciones_acceso?.proyecto ?? '—';
      const pr = proyectos.get(p) ?? { visitas: 0, personas: new Set(), ms: 0 };
      pr.visitas += 1; pr.personas.add(x.solicitante_id); pr.ms += dur(x); proyectos.set(p, pr);
      const pe = personas.get(x.solicitante_id) ?? { nombre: x.solicitantes?.nombre, matricula: x.solicitantes?.matricula, visitas: 0, ms: 0, ultima: x.entrada, sinSalida: 0 };
      pe.visitas += 1; pe.ms += dur(x); pe.ultima = x.entrada; if (x.salida_no_registrada) pe.sinSalida += 1; personas.set(x.solicitante_id, pe);
      const d = new Date(x.entrada); dias[d.getDay()] += 1;
      const h = d.getHours(); const franja = `${String(h).padStart(2, '0')}:00`; franjas.set(franja, (franjas.get(franja) ?? 0) + 1);
    });
    const total = regs.reduce((s, x) => s + dur(x), 0);
    const conSalida = regs.filter((x) => x.salida).length;
    return {
      indicadores: [
        [regs.length, 'visitas'], [personas.size, 'personas distintas'], [fmt(horas(total)), 'horas registradas'],
        [conSalida ? fmt(horas(total / conSalida)) : '—', 'horas promedio por visita'],
        [regs.filter((x) => x.salida_no_registrada).length, 'salidas no registradas'],
      ],
      proyectos: [...proyectos.entries()].sort((a, b) => b[1].visitas - a[1].visitas)
        .map(([p, v]) => [p, v.visitas, v.personas.size, fmt(horas(v.ms))]),
      personas: [...personas.values()].sort((a, b) => b.visitas - a.visitas)
        .map((v) => [v.nombre, v.matricula ?? '', v.visitas, fmt(horas(v.ms)), v.sinSalida || '', fecha(diaLocal(v.ultima))]),
      dias: [1, 2, 3, 4, 5, 6, 0].map((i) => [DIAS[i], dias[i]]).filter(([d, v]) => v > 0 || !['Sábado', 'Domingo'].includes(d)),
      franjas: [...franjas.entries()].sort(),
    };
  }, [regs]);

  if (error) return <Aviso mensaje={{ tipo: 'error', texto: error }} />;
  if (!r) return <p className="tenue">Cargando…</p>;
  return (
    <>
      <Indicadores lista={r.indicadores} />
      <div className="dos-columnas">
        <section className="tarjeta seccion-reporte"><h2>Visitas por día de la semana</h2><Barras datos={r.dias} /></section>
        <section className="tarjeta seccion-reporte"><h2>Visitas por hora de entrada</h2>
          {r.franjas.length ? <Barras datos={r.franjas} /> : <p className="tenue">Sin visitas.</p>}</section>
      </div>
      <Seccion titulo="Por proyecto" archivo={`uso_por_proyecto_${desde}_${hasta}.csv`}
        encabezados={['Proyecto', 'Visitas', 'Personas', 'Horas']} numericas={[1, 2, 3]} filas={r.proyectos} />
      <Seccion titulo="Por persona" archivo={`uso_por_persona_${desde}_${hasta}.csv`}
        nota="Las horas solo cuentan visitas con salida registrada."
        encabezados={['Nombre', 'Matrícula', 'Visitas', 'Horas', 'Sin salida', 'Última visita']} numericas={[2, 3, 4]} filas={r.personas} />
    </>
  );
}

// ---------------------------------------------------------------------
// Actividades (reservaciones): sigue las secciones II y III del reporte
// trimestral (docencia; servicios y vinculación) y agrega investigación.
// ---------------------------------------------------------------------
const NOMBRE_ACT = { clase: 'Clase', taller_curso: 'Taller o curso', investigacion: 'Investigación', proyecto: 'Proyecto', vinculacion: 'Vinculación o servicio', otro: 'Otra' };

function ReporteActividades({ desde, hasta }) {
  const [datos, error] = useConsulta(async () => {
    const [a, b] = rango(desde, hasta);
    const [r, e] = await Promise.all([
      supabase.from('reservaciones').select('*').gte('inicio', a).lt('inicio', b).order('inicio').limit(20000),
      supabase.from('equipos').select('id, nombre'),
    ]);
    return { res: exigir(r), equipos: Object.fromEntries(exigir(e).map((x) => [x.id, x.nombre])) };
  }, [desde, hasta]);

  const r = useMemo(() => {
    if (!datos) return null;
    const ahora = new Date();
    const hechas = datos.res.filter((x) => x.estado === 'programada' && new Date(x.inicio) <= ahora);
    const h = (x) => (new Date(x.fin) - new Date(x.inicio)) / 3600000;
    const agrupar = (lista, clave) => {
      const m = new Map();
      lista.forEach((x) => {
        const k = clave(x);
        const g = m.get(k) ?? { x, sesiones: 0, horas: 0, alumnos: 0, equipos: new Set() };
        g.sesiones += 1; g.horas += h(x); g.alumnos = Math.max(g.alumnos, x.num_alumnos ?? 0);
        (x.equipos ?? []).forEach((e) => datos.equipos[e] && g.equipos.add(datos.equipos[e]));
        m.set(k, g);
      });
      return [...m.values()].sort((p, q) => q.horas - p.horas);
    };
    const docencia = hechas.filter((x) => ['clase', 'taller_curso'].includes(x.actividad));
    const investigacion = hechas.filter((x) => ['investigacion', 'proyecto', 'otro'].includes(x.actividad));
    const vinculacion = hechas.filter((x) => x.actividad === 'vinculacion');
    const porAct = Object.keys(NOMBRE_ACT).map((k) => [NOMBRE_ACT[k], hechas.filter((x) => x.actividad === k).length]).filter(([, v]) => v > 0);
    return {
      indicadores: [
        [hechas.length, 'sesiones realizadas'], [fmt(hechas.reduce((s, x) => s + h(x), 0)), 'horas de uso'],
        [docencia.length, 'sesiones de docencia'], [hechas.filter((x) => x.procedencia === 'externo').length, 'sesiones de usuarios externos'],
        [datos.res.filter((x) => x.estado === 'cancelada').length, 'canceladas'],
      ],
      porAct,
      docencia: agrupar(docencia, (x) => [x.responsable, x.actividad, x.asignatura, x.titulo].join('|')).map((g) => [
        g.x.responsable, `${NOMBRE_ACT[g.x.actividad]}: ${g.x.titulo}`, `${g.sesiones} (${fmt(g.horas)} h)`, g.alumnos || '',
        [g.x.semestre && `${g.x.semestre}.º sem`, g.x.asignatura, g.x.programa_educativo].filter(Boolean).join(' / '),
        g.x.procedencia === 'externo' ? `Externo: ${g.x.institucion}` : 'Interno', [...g.equipos].join(', ')]),
      investigacion: agrupar(investigacion, (x) => [x.responsable, x.titulo].join('|')).map((g) => [
        g.x.responsable, NOMBRE_ACT[g.x.actividad], g.x.titulo, g.sesiones, fmt(g.horas),
        g.x.procedencia === 'externo' ? `Externo: ${g.x.institucion}` : 'Interno', [...g.equipos].join(', ')]),
      vinculacion: agrupar(vinculacion, (x) => [x.responsable, x.titulo, x.institucion].join('|')).map((g) => [
        g.x.titulo, g.x.responsable, g.x.procedencia === 'externo' ? `Externo: ${g.x.institucion}` : 'Interno', g.sesiones, fmt(g.horas), [...g.equipos].join(', ')]),
    };
  }, [datos]);

  if (error) return <Aviso mensaje={{ tipo: 'error', texto: error }} />;
  if (!r) return <p className="tenue">Cargando…</p>;
  return (
    <>
      <Indicadores lista={r.indicadores} />
      <p className="tenue nota">Cuenta las reservaciones programadas ya iniciadas en el periodo; las canceladas no suman horas.</p>
      {r.porAct.length > 0 && <section className="tarjeta una-columna seccion-reporte"><h2>Sesiones por tipo de actividad</h2><Barras datos={r.porAct} /></section>}
      <Seccion titulo="Docencia: prácticas, talleres y cursos" archivo={`actividades_docencia_${desde}_${hasta}.csv`}
        nota="Equivale a la sección II del reporte trimestral."
        encabezados={['Profesor', 'Actividad docente', 'Sesiones (horas)', 'Alumnos', 'Semestre y asignatura', 'Procedencia', 'Equipos utilizados']}
        numericas={[3]} filas={r.docencia} />
      <Seccion titulo="Investigación y proyectos" archivo={`actividades_investigacion_${desde}_${hasta}.csv`}
        encabezados={['Responsable', 'Tipo', 'Título', 'Sesiones', 'Horas', 'Procedencia', 'Equipos utilizados']} numericas={[3, 4]} filas={r.investigacion} />
      <Seccion titulo="Vinculación y servicios" archivo={`actividades_vinculacion_${desde}_${hasta}.csv`}
        nota="Corresponde a la sección III del reporte trimestral."
        encabezados={['Servicio', 'Responsable', 'Usuario', 'Sesiones', 'Horas', 'Equipos utilizados']} numericas={[3, 4]} filas={r.vinculacion} />
    </>
  );
}

// ---------------------------------------------------------------------
// Inventario y consumo
// ---------------------------------------------------------------------
function ReporteInventario({ desde, hasta }) {
  const [d, error] = useConsulta(async () => {
    const [a, b] = rango(desde, hasta);
    const [arts, movs, perdPrest] = await Promise.all([
      supabase.from('articulos').select('id, nombre, codigo, categoria, tipo, unidad, existencia, stock_minimo, activo').order('nombre').then(exigir),
      supabase.from('movimientos_inventario').select('articulo_id, tipo, cantidad, motivo, creado_en, solicitantes(nombre)')
        .gte('creado_en', a).lt('creado_en', b).limit(50000).then(exigir),
      supabase.from('prestamo_renglones').select('articulo_id, cantidad_perdida, condicion, prestamos!inner(fecha_entrega, solicitantes(nombre))')
        .gt('cantidad_perdida', 0).gte('prestamos.fecha_entrega', a).lt('prestamos.fecha_entrega', b).then(exigir),
    ]);
    return { arts, movs, perdPrest };
  }, [desde, hasta]);

  const r = useMemo(() => {
    if (!d) return null;
    const porId = new Map(d.arts.map((x) => [x.id, x]));
    const acum = new Map();
    d.movs.forEach((m) => {
      const v = acum.get(m.articulo_id) ?? { entrada: 0, salida: 0, perdida: 0, ajuste: 0, prestamo: 0, devolucion: 0 };
      v[m.tipo] += Number(m.cantidad); acum.set(m.articulo_id, v);
    });
    const u = (id) => porId.get(id)?.unidad ?? '';
    const consumo = [...acum.entries()].map(([id, v]) => ({ a: porId.get(id), ...v }))
      .filter((x) => x.a).sort((x, y) => (y.salida + y.perdida) - (x.salida + x.perdida));
    const activos = d.arts.filter((x) => x.activo);
    const bajos = activos.filter((x) => Number(x.stock_minimo) > 0 && Number(x.existencia) <= Number(x.stock_minimo));
    const perdidas = [
      ...d.movs.filter((m) => m.tipo === 'perdida').map((m) => [fecha(diaLocal(m.creado_en)), porId.get(m.articulo_id)?.nombre, `${fmt(m.cantidad, 3)} ${u(m.articulo_id)}`, 'Inventario', m.motivo ?? '']),
      ...d.perdPrest.map((x) => [fecha(diaLocal(x.prestamos.fecha_entrega)), porId.get(x.articulo_id)?.nombre, `${fmt(x.cantidad_perdida, 3)} ${u(x.articulo_id)}`,
        `Préstamo a ${x.prestamos.solicitantes?.nombre ?? ''}`, x.condicion ?? '']),
    ];
    return {
      indicadores: [
        [activos.length, 'artículos activos'], [bajos.length, 'en o bajo el mínimo'],
        [d.movs.filter((m) => m.tipo === 'entrada').length, 'entradas en el periodo'],
        [d.movs.filter((m) => m.tipo === 'salida').length, 'salidas en el periodo'], [perdidas.length, 'pérdidas registradas'],
      ],
      consumo: consumo.map((x) => [x.a.nombre, x.a.codigo ?? '', fmt(x.entrada, 3), fmt(x.salida, 3), fmt(x.perdida, 3),
        x.ajuste ? `${x.ajuste > 0 ? '+' : ''}${fmt(x.ajuste, 3)}` : '', x.a.unidad]),
      reponer: bajos.map((x) => [x.nombre, x.codigo ?? '', `${fmt(x.existencia, 3)} ${x.unidad}`, `${fmt(x.stock_minimo, 3)} ${x.unidad}`,
        `${fmt(Math.max(0, Number(x.stock_minimo) - Number(x.existencia)), 3)} ${x.unidad}`]),
      existencias: activos.map((x) => [x.nombre, x.codigo ?? '', x.categoria ?? '', x.tipo === 'consumible' ? 'Consumible' : 'Retornable',
        fmt(x.existencia, 3), x.unidad, Number(x.stock_minimo) > 0 ? fmt(x.stock_minimo, 3) : '']),
      perdidas,
    };
  }, [d]);

  if (error) return <Aviso mensaje={{ tipo: 'error', texto: error }} />;
  if (!r) return <p className="tenue">Cargando…</p>;
  return (
    <>
      <Indicadores lista={r.indicadores} />
      <Seccion titulo="Por reponer" archivo="inventario_por_reponer.csv" vacio="Ningún artículo está en o bajo su mínimo."
        nota="Situación actual, sin importar el periodo. «Faltante» es lo necesario para volver al mínimo."
        encabezados={['Artículo', 'Código', 'Existencia', 'Mínimo', 'Faltante']} filas={r.reponer} />
      <Seccion titulo="Consumo y movimientos del periodo" archivo={`consumo_${desde}_${hasta}.csv`}
        nota="Préstamos y devoluciones de retornables no se cuentan como consumo."
        encabezados={['Artículo', 'Código', 'Entradas', 'Salidas', 'Pérdidas', 'Ajustes', 'Unidad']} numericas={[2, 3, 4, 5]} filas={r.consumo} />
      <Seccion titulo="Pérdidas y roturas del periodo" archivo={`perdidas_${desde}_${hasta}.csv`}
        encabezados={['Fecha', 'Artículo', 'Cantidad', 'Origen', 'Motivo']} filas={r.perdidas} />
      <Seccion titulo="Existencias actuales" archivo="existencias.csv"
        encabezados={['Artículo', 'Código', 'Categoría', 'Tipo', 'Existencia', 'Unidad', 'Mínimo']} numericas={[4, 6]} filas={r.existencias} />
    </>
  );
}

// ---------------------------------------------------------------------
// Préstamos
// ---------------------------------------------------------------------
function ReportePrestamos({ desde, hasta }) {
  const [lista, error] = useConsulta(async () => {
    const [a, b] = rango(desde, hasta);
    return exigir(await supabase.from('prestamos')
      .select(`id, tipo, estado, fecha_entrega, fecha_limite, motivo, solicitante_id,
        solicitantes(nombre, matricula, externo, adscripcion),
        prestamo_renglones(cantidad, cantidad_devuelta, cantidad_perdida, devuelto_en, danado, condicion, equipos(codigo, nombre), articulos(nombre, unidad))`)
      .gte('fecha_entrega', a).lt('fecha_entrega', b).order('fecha_entrega').limit(10000));
  }, [desde, hasta]);

  const r = useMemo(() => {
    if (!lista) return null;
    const hoy = hoyISO();
    const tarde = (p) => p.estado === 'cerrado' && p.prestamo_renglones.some((x) => x.devuelto_en && diaLocal(x.devuelto_en) > p.fecha_limite);
    const equipos = new Map(); const materiales = new Map(); const personas = new Map(); const incidencias = [];
    lista.forEach((p) => {
      const quien = p.solicitantes?.nombre ?? '';
      const pe = personas.get(p.solicitante_id) ?? { nombre: quien, id: p.solicitantes?.externo ? (p.solicitantes.adscripcion || 'Externo') : p.solicitantes?.matricula, n: 0, vencidos: 0, tarde: 0 };
      pe.n += 1; if (p.estado === 'abierto' && p.fecha_limite < hoy) pe.vencidos += 1; if (tarde(p)) pe.tarde += 1; personas.set(p.solicitante_id, pe);
      p.prestamo_renglones.forEach((x) => {
        if (x.equipos) { const k = `${x.equipos.codigo} · ${x.equipos.nombre}`; equipos.set(k, (equipos.get(k) ?? 0) + 1); }
        else if (x.articulos) {
          const k = x.articulos.nombre; const v = materiales.get(k) ?? { u: x.articulos.unidad, c: 0, p: 0 };
          v.c += Number(x.cantidad); v.p += Number(x.cantidad_perdida); materiales.set(k, v);
        }
        if (Number(x.cantidad_perdida) > 0 || x.danado) {
          incidencias.push([fecha(diaLocal(p.fecha_entrega)), quien,
            x.equipos ? `${x.equipos.codigo} · ${x.equipos.nombre}` : x.articulos?.nombre,
            x.equipos ? 'Equipo devuelto con daño' : `${fmt(x.cantidad_perdida, 3)} ${x.articulos?.unidad} perdido(s) o roto(s)`, x.condicion ?? '']);
        }
      });
    });
    const vencidos = lista.filter((p) => p.estado === 'abierto' && p.fecha_limite < hoy);
    return {
      indicadores: [
        [lista.length, 'préstamos'], [lista.filter((p) => p.tipo === 'interno').length, 'internos'],
        [lista.filter((p) => p.tipo === 'externo').length, 'externos'], [lista.filter((p) => p.estado === 'abierto').length, 'siguen abiertos'],
        [vencidos.length, 'vencidos sin devolver'], [lista.filter(tarde).length, 'devueltos con retraso'], [incidencias.length, 'pérdidas o daños'],
      ],
      equipos: [...equipos.entries()].sort((a, b) => b[1] - a[1]),
      materiales: [...materiales.entries()].sort((a, b) => b[1].c - a[1].c).map(([k, v]) => [k, fmt(v.c, 3), v.p ? fmt(v.p, 3) : '', v.u]),
      personas: [...personas.values()].sort((a, b) => b.n - a.n).map((v) => [v.nombre, v.id ?? '', v.n, v.vencidos || '', v.tarde || '']),
      vencidos: vencidos.map((p) => [p.solicitantes?.nombre, fecha(diaLocal(p.fecha_entrega)), fecha(p.fecha_limite),
        `${Math.round((new Date(hoy) - new Date(p.fecha_limite)) / 86400000)} d`,
        p.prestamo_renglones.filter((x) => !x.devuelto_en).map((x) => (x.equipos ? x.equipos.codigo : x.articulos?.nombre)).join(', ')]),
      incidencias,
    };
  }, [lista]);

  if (error) return <Aviso mensaje={{ tipo: 'error', texto: error }} />;
  if (!r) return <p className="tenue">Cargando…</p>;
  return (
    <>
      <Indicadores lista={r.indicadores} />
      <Seccion titulo="Vencidos sin devolver" archivo={`prestamos_vencidos_${desde}_${hasta}.csv`} vacio="Ningún préstamo del periodo está vencido."
        encabezados={['Persona', 'Entregado', 'Fecha límite', 'Retraso', 'Pendiente']} numericas={[3]} filas={r.vencidos} />
      <Seccion titulo="Pérdidas y daños" archivo={`prestamos_incidencias_${desde}_${hasta}.csv`} vacio="Sin pérdidas ni daños."
        encabezados={['Entregado', 'Persona', 'Concepto', 'Incidencia', 'Observaciones']} filas={r.incidencias} />
      <div className="dos-columnas">
        <Seccion titulo="Equipos más prestados" archivo={`equipos_prestados_${desde}_${hasta}.csv`}
          encabezados={['Equipo', 'Préstamos']} numericas={[1]} filas={r.equipos} />
        <Seccion titulo="Materiales más prestados" archivo={`materiales_prestados_${desde}_${hasta}.csv`}
          encabezados={['Material', 'Cantidad', 'Perdido', 'Unidad']} numericas={[1, 2]} filas={r.materiales} />
      </div>
      <Seccion titulo="Por persona" archivo={`prestamos_por_persona_${desde}_${hasta}.csv`}
        encabezados={['Persona', 'Matrícula o adscripción', 'Préstamos', 'Vencidos', 'Con retraso']} numericas={[2, 3, 4]} filas={r.personas} />
    </>
  );
}


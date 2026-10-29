import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso } from '../../componentes';
import { diaLocal } from '../../util';
import { useConfiguracion } from '../prestamos/comun';
import { ACTIVIDADES, DIAS_CORTOS, MESES, PestanasReservaciones, horario, lunesDe, sumarDias } from './comun';

const ALTO_HORA = 44; // px por hora

// Acomoda en columnas las reservaciones que se traslapan dentro de un día
function acomodar(lista) {
  const orden = [...lista].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const grupos = []; let grupo = []; let finGrupo = 0;
  orden.forEach((r) => {
    const ini = new Date(r.inicio).getTime();
    if (grupo.length && ini >= finGrupo) { grupos.push(grupo); grupo = []; finGrupo = 0; }
    grupo.push(r); finGrupo = Math.max(finGrupo, new Date(r.fin).getTime());
  });
  if (grupo.length) grupos.push(grupo);
  const salida = [];
  grupos.forEach((g) => {
    const columnas = [];
    g.forEach((r) => {
      let c = columnas.findIndex((finCol) => finCol <= new Date(r.inicio).getTime());
      if (c === -1) { c = columnas.length; columnas.push(0); }
      columnas[c] = new Date(r.fin).getTime();
      salida.push({ r, columna: c });
    });
    salida.filter((x) => g.includes(x.r)).forEach((x) => { x.total = columnas.length; });
  });
  return salida;
}

export default function Calendario() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const config = useConfiguracion();
  const lunes = useMemo(() => lunesDe(params.get('semana') ? params.get('semana') + 'T00:00' : new Date()), [params]);
  const [lista, setLista] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [verCanceladas, setVerCanceladas] = useState(false);

  useEffect(() => {
    setLista(null);
    let q = supabase.from('reservaciones').select('id, inicio, fin, actividad, ocupa_todo, titulo, responsable, asignatura, procedencia, estado, equipos')
      .gte('inicio', lunes.toISOString()).lt('inicio', sumarDias(lunes, 7).toISOString()).order('inicio');
    if (!verCanceladas) q = q.eq('estado', 'programada');
    q.then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  }, [lunes, verCanceladas]);

  // Rango de horas visible: el horario del laboratorio, ampliado si hay reservaciones fuera de él
  const apertura = Number((config.hora_apertura ?? '08:00').slice(0, 2));
  const cierre = Math.ceil(Number((config.hora_cierre ?? '20:00').slice(0, 2)) + Number((config.hora_cierre ?? '20:00').slice(3, 5)) / 60);
  const horaMin = Math.min(apertura, ...(lista ?? []).map((r) => new Date(r.inicio).getHours()));
  const horaMax = Math.max(cierre, ...(lista ?? []).map((r) => { const d = new Date(r.fin); return d.getHours() + (d.getMinutes() ? 1 : 0); }));
  const horas = Array.from({ length: horaMax - horaMin }, (_, i) => horaMin + i);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const conFinDeSemana = (lista ?? []).some((r) => [0, 6].includes(new Date(r.inicio).getDay()));
  const visibles = conFinDeSemana ? dias : dias.slice(0, 5);
  const hoy = diaLocal(new Date());
  const domingo = sumarDias(lunes, 6);
  const titulo = lunes.getMonth() === domingo.getMonth()
    ? `${lunes.getDate()}–${domingo.getDate()} ${MESES[lunes.getMonth()]} ${lunes.getFullYear()}`
    : `${lunes.getDate()} ${MESES[lunes.getMonth()]} – ${domingo.getDate()} ${MESES[domingo.getMonth()]} ${domingo.getFullYear()}`;
  const irA = (d) => setParams(d ? { semana: diaLocal(d) } : {});

  return (
    <>
      <div className="encabezado">
        <h1>Reservaciones</h1>
        <Link className="btn btn-primario" to="/reservaciones/nueva">Nueva reservación</Link>
      </div>
      <PestanasReservaciones />
      <Aviso mensaje={mensaje ?? (params.get('series') ? { tipo: 'ok', texto: `Se reservaron ${params.get('series')} sesiones semanales.` } : null)} />
      <section className="tarjeta una-columna">
        <div className="encabezado calendario-barra">
          <div className="fila-botones">
            <button className="btn btn-chico" onClick={() => irA(sumarDias(lunes, -7))} aria-label="Semana anterior">‹ Anterior</button>
            <button className="btn btn-chico" onClick={() => irA(null)}>Esta semana</button>
            <button className="btn btn-chico" onClick={() => irA(sumarDias(lunes, 7))} aria-label="Semana siguiente">Siguiente ›</button>
          </div>
          <h2>{titulo}</h2>
          <label className="casilla chico"><input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} />Ver canceladas</label>
        </div>
        <div className="leyenda">
          {Object.entries(ACTIVIDADES).map(([k, a]) => <span key={k} className={'etiqueta ' + a.color}>{a.corto}</span>)}
          <span className="tenue chico">Las clases y lo marcado «todo el laboratorio» no admiten otra reservación al mismo tiempo.</span>
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : (
          <div className="tabla-desplazable">
            <div className="calendario" style={{ gridTemplateColumns: `52px repeat(${visibles.length}, minmax(120px, 1fr))` }}>
              <div />
              {visibles.map((d) => (
                <div key={d} className={'cal-dia-titulo' + (diaLocal(d) === hoy ? ' cal-hoy' : '')}>
                  {DIAS_CORTOS[(d.getDay() + 6) % 7]} <strong>{d.getDate()}</strong>
                </div>
              ))}
              <div className="cal-horas" style={{ height: horas.length * ALTO_HORA }}>
                {horas.map((h) => <span key={h} style={{ top: (h - horaMin) * ALTO_HORA }}>{String(h).padStart(2, '0')}:00</span>)}
              </div>
              {visibles.map((d) => {
                const delDia = lista.filter((r) => diaLocal(r.inicio) === diaLocal(d));
                return (
                  <div key={d} className={'cal-columna' + ([0, 6].includes(d.getDay()) ? ' cal-finde' : '')}
                    style={{ height: horas.length * ALTO_HORA, backgroundSize: `100% ${ALTO_HORA}px` }}
                    onDoubleClick={() => navegar(`/reservaciones/nueva?fecha=${diaLocal(d)}`)}>
                    {acomodar(delDia).map(({ r, columna, total }) => {
                      const ini = new Date(r.inicio); const fin = new Date(r.fin);
                      const top = (ini.getHours() + ini.getMinutes() / 60 - horaMin) * ALTO_HORA;
                      const alto = Math.max(22, ((fin - ini) / 3600000) * ALTO_HORA - 2);
                      return (
                        <Link key={r.id} to={`/reservaciones/detalle/${r.id}`}
                          className={'cal-evento ' + (ACTIVIDADES[r.actividad]?.color ?? '') + (r.estado === 'cancelada' ? ' cal-cancelada' : '') + (r.ocupa_todo ? ' cal-exclusiva' : '')}
                          style={{ top, height: alto, left: `calc(${(100 / total) * columna}% + 2px)`, width: `calc(${100 / total}% - 4px)` }}
                          title={`${horario(r)} · ${r.titulo} · ${r.responsable}`}>
                          <strong>{horario(r)}</strong>
                          <span>{r.titulo}</span>
                          {alto > 50 && <span className="cal-detalle">{r.asignatura || r.responsable}{r.procedencia === 'externo' ? ' · externo' : ''}</span>}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="tenue nota">{lista ? `${lista.length} reservación(es) esta semana. ` : ''}Haga clic en una reservación para ver el detalle o cancelarla;
          doble clic en un día para reservarlo.</p>
      </section>
    </>
  );
}

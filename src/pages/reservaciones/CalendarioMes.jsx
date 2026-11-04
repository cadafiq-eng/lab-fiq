import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso } from '../../componentes';
import { diaLocal } from '../../util';
import { ACTIVIDADES, CambiarVista, DIAS_CORTOS, PestanasReservaciones, hhmm, lunesDe, mismoDia, sumarDias } from './comun';

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MAX_POR_DIA = 4;

// Vista mensual: una cuadrícula de lunes a domingo con las reservaciones de cada día
export default function CalendarioMes() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const primero = useMemo(() => {
    const d = params.get('mes') ? new Date(params.get('mes') + '-01T00:00') : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [params]);
  const inicioRejilla = lunesDe(primero);
  const ultimo = new Date(primero.getFullYear(), primero.getMonth() + 1, 0);
  const semanas = Math.ceil(((ultimo - inicioRejilla) / 86400000 + 1) / 7);
  const finRejilla = sumarDias(inicioRejilla, semanas * 7);
  const [lista, setLista] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [verCanceladas, setVerCanceladas] = useState(false);

  useEffect(() => {
    setLista(null);
    let q = supabase.from('reservaciones').select('id, inicio, fin, actividad, ocupa_todo, titulo, responsable, asignatura, estado')
      .gt('fin', inicioRejilla.toISOString()).lt('inicio', finRejilla.toISOString()).order('inicio').limit(3000);
    if (!verCanceladas) q = q.eq('estado', 'programada');
    q.then(({ data, error }) => error ? setMensaje({ tipo: 'error', texto: mensajeError(error) }) : setLista(data));
  }, [primero.getTime(), verCanceladas]);

  const mesClave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const irA = (d) => setParams(d ? { vista: 'mes', mes: mesClave(d) } : { vista: 'mes' });
  const hoy = diaLocal(new Date());
  const dias = Array.from({ length: semanas * 7 }, (_, i) => sumarDias(inicioRejilla, i));
  const delDia = (d) => {
    const a = new Date(d); const b = sumarDias(d, 1);
    return (lista ?? []).filter((r) => new Date(r.inicio) < b && new Date(r.fin) > a);
  };
  const delMes = (lista ?? []).filter((r) => new Date(r.inicio) <= sumarDias(ultimo, 1) && new Date(r.fin) >= primero);

  return (
    <>
      <div className="encabezado">
        <h1>Reservaciones</h1>
        <Link className="btn btn-primario" to="/reservaciones/nueva">Nueva reservación</Link>
      </div>
      <PestanasReservaciones />
      <Aviso mensaje={mensaje} />
      <section className="tarjeta una-columna">
        <div className="encabezado calendario-barra">
          <div className="fila-botones">
            <button className="btn btn-chico" onClick={() => irA(new Date(primero.getFullYear(), primero.getMonth() - 1, 1))} aria-label="Mes anterior">‹ Anterior</button>
            <button className="btn btn-chico" onClick={() => irA(null)}>Este mes</button>
            <button className="btn btn-chico" onClick={() => irA(new Date(primero.getFullYear(), primero.getMonth() + 1, 1))} aria-label="Mes siguiente">Siguiente ›</button>
          </div>
          <h2>{MESES_LARGOS[primero.getMonth()]} {primero.getFullYear()}</h2>
          <div className="fila-botones">
            <CambiarVista vista="mes" fecha={diaLocal(primero.getMonth() === new Date().getMonth() && primero.getFullYear() === new Date().getFullYear() ? new Date() : primero)} />
            <label className="casilla chico"><input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} />Ver canceladas</label>
          </div>
        </div>
        <div className="leyenda">
          {Object.entries(ACTIVIDADES).map(([k, a]) => <span key={k} className={'etiqueta ' + a.color}>{a.corto}</span>)}
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : (
          <div className="tabla-desplazable">
            <div className="cal-mes">
              {DIAS_CORTOS.map((d) => <div key={d} className="cal-mes-titulo">{d}</div>)}
              {dias.map((d) => {
                const clave = diaLocal(d);
                const items = delDia(d);
                const fuera = d.getMonth() !== primero.getMonth();
                return (
                  <div key={clave} className={'cal-mes-dia' + (fuera ? ' cal-mes-fuera' : '') + ([0, 6].includes(d.getDay()) ? ' cal-finde' : '') + (clave === hoy ? ' cal-hoy' : '')}
                    onDoubleClick={() => navegar(`/reservaciones/nueva?fecha=${clave}`)}>
                    <Link className="cal-mes-num" to={`/reservaciones/calendario?semana=${clave}`} title="Ver la semana">{d.getDate()}</Link>
                    {items.slice(0, MAX_POR_DIA).map((r) => (
                      <Link key={r.id} to={`/reservaciones/detalle/${r.id}`}
                        className={'cal-mes-evento ' + (ACTIVIDADES[r.actividad]?.color ?? '') + (r.estado === 'cancelada' ? ' cal-cancelada' : '') + (mismoDia(r) ? '' : ' cal-continua')}
                        title={`${r.titulo} · ${r.responsable}`}>
                        <strong>{mismoDia(r) ? hhmm(r.inicio) : diaLocal(r.inicio) === clave ? `${hhmm(r.inicio)} →` : '→'}</strong> {r.titulo}
                      </Link>
                    ))}
                    {items.length > MAX_POR_DIA && (
                      <Link className="cal-mes-mas" to={`/reservaciones/calendario?semana=${clave}`}>y {items.length - MAX_POR_DIA} más</Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="tenue nota">{lista ? `${delMes.length} reservación(es) en ${MESES_LARGOS[primero.getMonth()]}. ` : ''}Haga clic en el número de un día para ver su semana
          y en una reservación para ver el detalle; doble clic en un día para reservarlo.</p>
      </section>
    </>
  );
}

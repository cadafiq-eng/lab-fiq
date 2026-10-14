import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { useSesion } from '../auth';

export default function Inicio() {
  const { perfil } = useSesion();
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    Promise.all([
      supabase.from('v_presentes').select('*').order('entrada'),
      supabase.from('v_mantenimientos_alerta').select('*').order('proximo_mantenimiento'),
      supabase.from('v_prestamos_vencidos').select('*').order('fecha_limite'),
    ]).then(([p, m, v]) => setDatos({ presentes: p.data ?? [], mant: m.data ?? [], vencidos: v.data ?? [] }));
  }, []);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <>
      <h1>{saludo}, {perfil.nombre.split(' ')[0]}</h1>
      <p className="tenue">Resumen del laboratorio en este momento.</p>
      {!datos ? <p className="tenue">Cargando…</p> : (
        <>
          <div className="indicadores">
            <Indicador valor={datos.presentes.length} etiqueta="personas dentro" />
            <Indicador valor={datos.mant.filter((x) => x.vencido).length} etiqueta="mantenimientos vencidos" alerta />
            <Indicador valor={datos.mant.filter((x) => !x.vencido).length} etiqueta="mantenimientos próximos" />
            <Indicador valor={datos.vencidos.length} etiqueta="préstamos vencidos" alerta />
          </div>
          <div className="dos-columnas">
            <section className="tarjeta">
              <h2>Personas dentro</h2>
              {datos.presentes.length === 0 ? <p className="tenue">Nadie ha registrado entrada.</p> : (
                <table><tbody>
                  {datos.presentes.map((x) => (
                    <tr key={x.id}><td>{x.nombre}</td><td className="tenue">{x.matricula}</td>
                      <td className="der">{hhmm(x.entrada)}</td></tr>
                  ))}
                </tbody></table>
              )}
            </section>
            <section className="tarjeta">
              <h2>Mantenimiento</h2>
              {datos.mant.length === 0 ? <p className="tenue">Sin mantenimientos próximos.</p> : (
                <table><tbody>
                  {datos.mant.map((x) => (
                    <tr key={x.id}><td><Link to={`/equipos/ficha/${x.id}`}>{x.codigo}</Link></td><td>{x.nombre}</td>
                      <td className="der"><span className={'etiqueta ' + (x.vencido ? 'etq-mal' : 'etq-aviso')}>
                        {x.vencido ? 'Vencido' : 'Próximo'} · {x.proximo_mantenimiento}</span></td></tr>
                  ))}
                </tbody></table>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Indicador({ valor, etiqueta, alerta }) {
  return (
    <div className={'indicador' + (alerta && valor > 0 ? ' indicador-alerta' : '')}>
      <span className="indicador-valor">{valor}</span>
      <span className="indicador-etiqueta">{etiqueta}</span>
    </div>
  );
}

const hhmm = (t) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

import { useEffect, useMemo, useState } from 'react';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta, Modal } from '../../componentes';
import {
  aCampoFechaHora, deCampoFechaHora, descargarCSV, diaLocal, duracion, fecha, hora, hoyISO, normalizar,
} from '../../util';

export default function Historial() {
  const [desde, setDesde] = useState(hoyISO(-7));
  const [hasta, setHasta] = useState(hoyISO());
  const [buscar, setBuscar] = useState('');
  const [soloIncidencias, setSoloIncidencias] = useState(false);
  const [lista, setLista] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [corrigiendo, setCorrigiendo] = useState(null);

  async function cargar() {
    setLista(null);
    const fin = new Date(hasta + 'T00:00'); fin.setDate(fin.getDate() + 1);
    const { data, error } = await supabase.from('registros_acceso')
      .select('id, entrada, salida, salida_no_registrada, corregido_por, observaciones, solicitantes(nombre, matricula), autorizaciones_acceso(proyecto)')
      .gte('entrada', new Date(desde + 'T00:00').toISOString())
      .lt('entrada', fin.toISOString())
      .order('entrada', { ascending: false })
      .limit(5000);
    if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
    setLista(data);
  }
  useEffect(() => { cargar(); }, [desde, hasta]);

  const hoy = hoyISO();
  const visibles = useMemo(() => {
    if (!lista) return [];
    const q = normalizar(buscar.trim());
    return lista
      .filter((r) => !soloIncidencias || r.salida_no_registrada || r.corregido_por)
      .filter((r) => !q || normalizar(`${r.solicitantes.nombre} ${r.solicitantes.matricula} ${r.autorizaciones_acceso.proyecto}`).includes(q));
  }, [lista, buscar, soloIncidencias]);

  function exportar() {
    descargarCSV(`accesos_${desde}_a_${hasta}.csv`,
      ['Fecha', 'Nombre', 'Matrícula', 'Proyecto', 'Entrada', 'Salida', 'Salida no registrada', 'Corregido', 'Observaciones'],
      visibles.map((r) => [fecha(diaLocal(r.entrada)), r.solicitantes.nombre, r.solicitantes.matricula,
        r.autorizaciones_acceso.proyecto, hora(r.entrada), r.salida ? hora(r.salida) : '',
        r.salida_no_registrada ? 'Sí' : '', r.corregido_por ? 'Sí' : '', r.observaciones ?? '']));
  }

  return (
    <>
      <Aviso mensaje={mensaje} />
      <section className="tarjeta">
        <div className="filtros">
          <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
          <label className="crece">Buscar<input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre, matrícula o proyecto" /></label>
          <label className="casilla"><input type="checkbox" checked={soloIncidencias} onChange={(e) => setSoloIncidencias(e.target.checked)} />Solo incidencias</label>
          <button className="btn" onClick={exportar} disabled={!visibles.length}>Exportar CSV</button>
        </div>
        {!lista ? <p className="tenue">Cargando…</p> : visibles.length === 0 ? (
          <p className="tenue">Sin registros en este periodo.</p>
        ) : (
          <div className="tabla-desplazable">
            <table>
              <thead><tr><th>Fecha</th><th>Persona</th><th>Proyecto</th><th>Entrada</th><th>Salida</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {visibles.map((r) => (
                  <tr key={r.id}>
                    <td className="sin-salto">{fecha(diaLocal(r.entrada))}</td>
                    <td><strong>{r.solicitantes.nombre}</strong><br /><span className="tenue">{r.solicitantes.matricula}</span></td>
                    <td>{r.autorizaciones_acceso.proyecto}</td>
                    <td>{hora(r.entrada)}</td>
                    <td>{r.salida ? <>{hora(r.salida)}<br /><span className="tenue">{duracion(r.entrada, r.salida)}</span></> : '—'}</td>
                    <td>
                      {r.salida_no_registrada && <Etiqueta tono="mal">Sin salida</Etiqueta>}
                      {!r.salida && !r.salida_no_registrada && diaLocal(r.entrada) === hoy && <Etiqueta tono="bien">Dentro</Etiqueta>}
                      {r.corregido_por && <span title={r.observaciones ?? ''}><Etiqueta tono="aviso">Corregido</Etiqueta></span>}
                    </td>
                    <td className="der"><button className="btn btn-chico" onClick={() => setCorrigiendo(r)}>Corregir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lista && <p className="tenue nota">{visibles.length} registro(s).</p>}
      </section>
      {corrigiendo && (
        <Corregir registro={corrigiendo} alCerrar={() => setCorrigiendo(null)}
          alGuardar={(texto) => { setCorrigiendo(null); setMensaje({ tipo: 'ok', texto }); cargar(); }} />
      )}
    </>
  );
}

function Corregir({ registro, alCerrar, alGuardar }) {
  const [entrada, setEntrada] = useState(aCampoFechaHora(registro.entrada));
  const [salida, setSalida] = useState(aCampoFechaHora(registro.salida));
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  async function guardar(e) {
    e.preventDefault();
    const { data, error } = await supabase.rpc('corregir_registro', {
      p_registro: registro.id, p_entrada: deCampoFechaHora(entrada),
      p_salida: deCampoFechaHora(salida), p_motivo: motivo,
    });
    if (error) setError(mensajeError(error)); else alGuardar(data);
  }

  return (
    <Modal titulo="Corregir registro" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="tenue">{registro.solicitantes.nombre} · {registro.autorizaciones_acceso.proyecto}</p>
        <label>Entrada<input type="datetime-local" value={entrada} onChange={(e) => setEntrada(e.target.value)} required /></label>
        <label>Salida<input type="datetime-local" value={salida} min={entrada} onChange={(e) => setSalida(e.target.value)} /></label>
        <p className="tenue nota">Si registra la salida, también se cierran los usos de equipo que la persona haya dejado abiertos.</p>
        <label>Motivo de la corrección
          <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} required
            placeholder="Ej. Olvidó registrar su salida; salió a las 18:00 según el personal en turno" />
        </label>
        {registro.observaciones && <p className="historial-obs">{registro.observaciones}</p>}
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario">Guardar corrección</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

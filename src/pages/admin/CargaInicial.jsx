import { useState } from 'react';
import readXlsxFile from 'read-excel-file';
import { supabase, mensajeError } from '../../supabase';
import { Aviso, Etiqueta } from '../../componentes';
import { fecha } from '../../util';
import { claveTexto, validarArticulos, validarEquipos } from './importacion';

const base = import.meta.env.BASE_URL;

export default function CargaInicial() {
  return (
    <>
      <h1>Carga inicial</h1>
      <p className="tenue">Importe desde Excel el inventario verificado y los equipos del laboratorio. Descargue la plantilla,
        captúrela sin cambiar los encabezados y súbala aquí. Antes de guardar verá una vista previa; si algún renglón tiene
        errores, no se guarda nada hasta corregirlo.</p>
      <Importador
        titulo="Inventario"
        plantilla={`${base}plantillas/plantilla_inventario.xlsx`}
        preparar={async (filas) => {
          const { data } = await supabase.from('articulos').select('codigo').not('codigo', 'is', null);
          return validarArticulos(filas, new Set((data ?? []).map((a) => a.codigo.toLowerCase())));
        }}
        importar={async (datos) => {
          const { data, error } = await supabase.rpc('importar_articulos', { p_filas: datos });
          if (error) throw error;
          return `${data} artículo(s) importados. Las existencias iniciales quedaron registradas como entradas «Carga inicial».`;
        }}
        columnas={[
          ['Artículo', (r) => <><strong>{r.nombre}</strong>{r.codigo && <><br /><span className="tenue">{r.codigo}</span></>}</>],
          ['Tipo', (r) => r.tipo ?? '—'],
          ['Existencia', (r) => (r.existencia_inicial != null ? `${r.existencia_inicial} ${r.unidad}` : '—')],
          ['Lote / caducidad', (r) => [r.lote, r.caducidad && fecha(r.caducidad)].filter(Boolean).join(' · ') || '—'],
          ['Seguridad', (r) => [r.especial && 'Especial', r.pictogramas.length && `${r.pictogramas.length} pictograma(s)`].filter(Boolean).join(' · ') || '—'],
        ]}
      />
      <Importador
        titulo="Equipos"
        plantilla={`${base}plantillas/plantilla_equipos.xlsx`}
        preparar={async (filas) => {
          const [e, t] = await Promise.all([
            supabase.from('equipos').select('codigo'),
            supabase.from('tipos_equipo').select('nombre'),
          ]);
          return validarEquipos(filas, new Set((e.data ?? []).map((x) => x.codigo.toLowerCase())),
            new Set((t.data ?? []).map((x) => claveTexto(x.nombre))));
        }}
        importar={async (datos) => {
          const { data, error } = await supabase.rpc('importar_equipos', { p_filas: datos });
          if (error) throw error;
          const creados = data.tipos_creados ?? [];
          return `${data.equipos} equipo(s) importados.` + (creados.length
            ? ` Se crearon los tipos: ${creados.join(', ')}. Revise en Tipos de equipo si requieren capacitación.` : '');
        }}
        columnas={[
          ['Equipo', (r) => <><strong>{r.codigo}</strong><br /><span className="tenue">{r.nombre}</span></>],
          ['Tipo', (r) => r.tipo_equipo],
          ['Capacitación', (r) => (r.requiere_capacitacion == null ? 'Según el tipo' : r.requiere_capacitacion ? 'Sí' : 'No')],
          ['Mantenimiento', (r) => [r.periodicidad_dias && `cada ${r.periodicidad_dias} d`, r.ultimo_mantenimiento && `último ${fecha(r.ultimo_mantenimiento)}`,
            r.proximo_mantenimiento && `próximo ${fecha(r.proximo_mantenimiento)}`].filter(Boolean).join(' · ') || '—'],
          ['Estado', (r) => r.estado?.replace(/_/g, ' ') ?? '—'],
        ]}
      />
    </>
  );
}

function Importador({ titulo, plantilla, preparar, importar, columnas }) {
  const [archivo, setArchivo] = useState(null);
  const [filas, setFilas] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [soloErrores, setSoloErrores] = useState(false);

  async function leer(e) {
    const f = e.target.files?.[0];
    setFilas(null); setMensaje(null); setArchivo(f ?? null);
    if (!f) return;
    setOcupado(true);
    try {
      const datos = await readXlsxFile(f, { sheet: 'Datos' }).catch(() => readXlsxFile(f));
      const resultado = await preparar(datos);
      if (!resultado.length) throw new Error('La hoja «Datos» no tiene renglones capturados.');
      setFilas(resultado);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo leer el archivo. Verifique que sea la plantilla en formato .xlsx.' });
    } finally {
      setOcupado(false);
      e.target.value = '';
    }
  }

  async function guardar() {
    setOcupado(true); setMensaje(null);
    try {
      const texto = await importar(filas.map((f) => f.datos));
      setMensaje({ tipo: 'ok', texto });
      setFilas(null); setArchivo(null);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeError(err) });
    } finally { setOcupado(false); }
  }

  const conError = filas?.filter((f) => f.errores.length).length ?? 0;
  const conAviso = filas?.filter((f) => !f.errores.length && f.avisos.length).length ?? 0;
  const visibles = (filas ?? []).filter((f) => !soloErrores || f.errores.length);

  return (
    <section className="tarjeta una-columna">
      <div className="encabezado">
        <h2>{titulo}</h2>
        <div className="fila-botones envolver">
          <a className="btn" href={plantilla} download>Descargar plantilla</a>
          <label className="btn btn-primario boton-archivo">
            {ocupado && !filas ? 'Leyendo…' : 'Elegir archivo Excel'}
            <input type="file" accept=".xlsx" onChange={leer} disabled={ocupado} />
          </label>
        </div>
      </div>
      <Aviso mensaje={mensaje} />
      {filas && (
        <>
          <p className="nota">
            <strong>{archivo?.name}</strong> · {filas.length} renglón(es):{' '}
            <Etiqueta tono="bien">{filas.length - conError} correctos</Etiqueta>{' '}
            {conError > 0 && <Etiqueta tono="mal">{conError} con errores</Etiqueta>}{' '}
            {conAviso > 0 && <Etiqueta tono="aviso">{conAviso} con avisos</Etiqueta>}
          </p>
          {conError > 0 && (
            <p className="aviso aviso-error nota">Corrija en Excel los renglones marcados y vuelva a elegir el archivo. No se guardará nada mientras haya errores.
              {' '}<label className="casilla en-linea"><input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} />Ver solo los renglones con errores</label></p>
          )}
          <div className="tabla-desplazable tabla-alta"><table>
            <thead><tr><th>Renglón</th>{columnas.map(([t]) => <th key={t}>{t}</th>)}<th>Revisión</th></tr></thead>
            <tbody>{visibles.map((f) => (
              <tr key={f.datos.renglon} className={f.errores.length ? 'fila-error' : ''}>
                <td>{f.datos.renglon}</td>
                {columnas.map(([t, fn]) => <td key={t}>{fn(f.datos)}</td>)}
                <td>{f.errores.length ? <ul className="lista-simple texto-error">{f.errores.map((x) => <li key={x}>{x}</li>)}</ul>
                  : f.avisos.length ? <ul className="lista-simple tenue">{f.avisos.map((x) => <li key={x}>{x}</li>)}</ul>
                    : <Etiqueta tono="bien">Correcto</Etiqueta>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="fila-botones" style={{ marginTop: 14 }}>
            <button className="btn btn-primario" onClick={guardar} disabled={ocupado || conError > 0}>
              {ocupado ? 'Importando…' : `Importar ${filas.length} renglón(es)`}</button>
            <button className="btn" onClick={() => { setFilas(null); setArchivo(null); }} disabled={ocupado}>Descartar</button>
          </div>
        </>
      )}
    </section>
  );
}

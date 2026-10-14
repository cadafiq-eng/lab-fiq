import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { supabase, mensajeError } from '../../supabase';
import { Aviso } from '../../componentes';

// Hoja de etiquetas para imprimir. El QR abre la ficha del equipo
// (requiere iniciar sesión con una cuenta del personal).
export default function Etiquetas() {
  const [params] = useSearchParams();
  const [etiquetas, setEtiquetas] = useState(null);
  const [tamano, setTamano] = useState('mediana');
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
    let consulta = supabase.from('equipos').select('id, codigo, nombre, ubicacion').order('codigo');
    consulta = ids.length ? consulta.in('id', ids) : consulta.neq('estado', 'baja');
    consulta.then(async ({ data, error }) => {
      if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
      const base = `${window.location.origin}${window.location.pathname}#/equipos/ficha/`;
      const conQR = await Promise.all(data.map(async (e) => ({
        ...e, svg: await QRCode.toString(base + e.id, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }),
      })));
      setEtiquetas(conQR);
    });
  }, [params]);

  return (
    <>
      <div className="no-imprimir">
        <p><Link to="/equipos/catalogo" className="volver">← Catálogo de equipos</Link></p>
        <div className="encabezado">
          <h1>Etiquetas QR</h1>
          <div className="fila-botones">
            <select value={tamano} onChange={(e) => setTamano(e.target.value)} aria-label="Tamaño">
              <option value="chica">Chica (5 × 2.5 cm)</option>
              <option value="mediana">Mediana (7 × 3.5 cm)</option>
              <option value="grande">Grande (9 × 4.5 cm)</option>
            </select>
            <button className="btn btn-primario" onClick={() => window.print()} disabled={!etiquetas?.length}>Imprimir</button>
          </div>
        </div>
        <p className="tenue">Imprima en papel adhesivo y péguela en un lugar visible del equipo. Al escanear el código con el
          celular se abre la ficha del equipo (pide iniciar sesión con una cuenta del personal).</p>
        <Aviso mensaje={mensaje} />
      </div>
      {!etiquetas ? <p className="tenue">Generando…</p> : (
        <div className={'hoja-etiquetas etq-' + tamano}>
          {etiquetas.map((e) => (
            <div key={e.id} className="etiqueta-qr">
              <div className="etiqueta-qr-codigo" dangerouslySetInnerHTML={{ __html: e.svg }} />
              <div className="etiqueta-qr-texto">
                <span className="etiqueta-qr-lab">FIQ-UADY · Laboratorio</span>
                <strong>{e.codigo}</strong>
                <span>{e.nombre}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

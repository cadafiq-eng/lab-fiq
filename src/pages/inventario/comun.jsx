import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { useSesion } from '../../auth';
import { Etiqueta, Modal } from '../../componentes';
import { hoyISO } from '../../util';

export function PestanasInventario() {
  return (
    <nav className="pestanas">
      <NavLink to="/inventario/articulos">Artículos</NavLink>
      <NavLink to="/inventario/movimientos">Movimientos</NavLink>
    </nav>
  );
}

// Pictogramas del Sistema Globalmente Armonizado (NOM-018-STPS-2015)
export const PICTOGRAMAS = {
  explosivo: 'Explosivo',
  inflamable: 'Inflamable',
  comburente: 'Comburente',
  gas_presion: 'Gas a presión',
  corrosivo: 'Corrosivo',
  toxico: 'Toxicidad aguda',
  irritante: 'Irritante / nocivo',
  peligro_salud: 'Peligro grave para la salud',
  medio_ambiente: 'Peligro para el medio ambiente',
};

export function Pictogramas({ lista }) {
  if (!lista?.length) return null;
  return <span className="pictogramas">{lista.map((p) => <span key={p} className="pictograma" title={PICTOGRAMAS[p]}>{PICTOGRAMAS[p] ?? p}</span>)}</span>;
}

export const TIPOS_ARTICULO = { consumible: 'Consumible', retornable: 'Retornable' };
export const CATEGORIAS = ['Reactivo', 'Disolvente', 'Estándar', 'Medio de cultivo', 'Cristalería', 'Material de laboratorio',
  'Material de limpieza', 'Equipo de protección'];
export const UNIDADES = ['pieza', 'g', 'kg', 'mL', 'L', 'caja', 'paquete', 'frasco', 'rollo'];

export const MOVIMIENTOS = {
  entrada: { texto: 'Entrada', tono: 'bien', signo: 1 },
  salida: { texto: 'Salida', tono: 'aviso', signo: -1 },
  perdida: { texto: 'Pérdida', tono: 'mal', signo: -1 },
  ajuste: { texto: 'Ajuste', tono: 'gris', signo: 1 },
  prestamo: { texto: 'Préstamo', tono: 'aviso', signo: -1 },
  devolucion: { texto: 'Devolución', tono: 'bien', signo: 1 },
};

export const num = (n) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 3 });

export function Existencia({ a }) {
  const bajo = Number(a.stock_minimo) > 0 && Number(a.existencia) <= Number(a.stock_minimo);
  return <span className={bajo ? 'existencia-baja' : ''}>{num(a.existencia)} {a.unidad}{bajo && <> <Etiqueta tono="mal">Bajo mínimo</Etiqueta></>}</span>;
}

// Entradas, salidas, pérdidas y ajustes de un artículo
export function ModalMovimiento({ articulo, tipo, alCerrar, alGuardar }) {
  const { esAdmin, perfil } = useSesion();
  const [f, setF] = useState({ cantidad: '', lote: '', caducidad: '', motivo: '', persona: '', contada: '', autorizo: false });
  const [personas, setPersonas] = useState([]);
  const [error, setError] = useState('');
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    if (tipo === 'salida') {
      supabase.from('solicitantes').select('id, nombre, matricula, adscripcion').eq('activo', true).order('nombre')
        .then(({ data }) => setPersonas(data ?? []));
    }
  }, [tipo]);
  const etiqueta = (p) => `${p.nombre} — ${p.matricula ?? p.adscripcion ?? 'Externo'}`;

  const titulos = { entrada: 'Registrar entrada', salida: 'Registrar salida', perdida: 'Registrar pérdida o rotura', ajuste: 'Ajuste por conteo físico' };
  const diferencia = f.contada === '' ? null : Number(f.contada) - Number(articulo.existencia);

  async function guardar(e) {
    e.preventDefault();
    const fila = { articulo_id: articulo.id, tipo, motivo: f.motivo.trim() || null };
    if (tipo === 'ajuste') {
      if (!diferencia) return setError('La existencia contada es igual a la registrada: no hay nada que ajustar.');
      fila.cantidad = diferencia;
    } else {
      fila.cantidad = Number(f.cantidad);
      if (!(fila.cantidad > 0)) return setError('Indique una cantidad mayor que cero.');
    }
    if (tipo === 'entrada') { fila.lote = f.lote.trim() || null; fila.caducidad = f.caducidad || null; }
    if (tipo === 'salida') {
      const p = personas.find((x) => etiqueta(x) === f.persona);
      if (f.persona && !p) return setError('Elija a la persona de la lista o deje el campo vacío.');
      fila.solicitante_id = p?.id ?? null;
      if (articulo.especial && esAdmin && f.autorizo) fila.autorizado_por = perfil.id;
    }
    const { error } = await supabase.from('movimientos_inventario').insert(fila);
    if (error) setError(mensajeError(error)); else alGuardar({ entrada: 'Entrada registrada.', salida: 'Salida registrada.', perdida: 'Pérdida registrada.', ajuste: 'Ajuste registrado.' }[tipo]);
  }

  return (
    <Modal titulo={titulos[tipo]} alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="tenue">{articulo.nombre} · existencia actual {num(articulo.existencia)} {articulo.unidad}</p>
        {tipo === 'ajuste' ? (
          <>
            <label>Existencia contada ({articulo.unidad})
              <input type="number" min="0" step="any" value={f.contada} onChange={campo('contada')} required autoFocus />
            </label>
            {diferencia !== null && diferencia !== 0 && (
              <p className={'aviso nota ' + (diferencia < 0 ? 'aviso-error' : 'aviso-ok')}>
                Se registrará un ajuste de {diferencia > 0 ? '+' : ''}{num(diferencia)} {articulo.unidad}.</p>
            )}
          </>
        ) : (
          <label>Cantidad ({articulo.unidad})
            <input type="number" min="0" step="any" value={f.cantidad} onChange={campo('cantidad')} required autoFocus />
          </label>
        )}
        {tipo === 'entrada' && (
          <div className="fila-campos">
            <label>Lote<input value={f.lote} onChange={campo('lote')} /></label>
            <label>Caducidad<input type="date" min={hoyISO()} value={f.caducidad} onChange={campo('caducidad')} /></label>
          </div>
        )}
        {tipo === 'salida' && (
          <label>Entregado a (opcional)
            <input list="personas-salida" value={f.persona} onChange={campo('persona')} placeholder="Nombre o matrícula" />
            <datalist id="personas-salida">{personas.map((p) => <option key={p.id} value={etiqueta(p)} />)}</datalist>
          </label>
        )}
        {tipo === 'salida' && articulo.especial && (esAdmin ? (
          <label className="casilla"><input type="checkbox" checked={f.autorizo} onChange={campo('autorizo')} required />
            Autorizo la salida de este reactivo especial (Art. 28)</label>
        ) : (
          <p className="aviso aviso-error nota">Reactivo especial: su salida requiere autorización del Administrador (Art. 28) y debe registrarla él.</p>
        ))}
        <label>{tipo === 'entrada' ? 'Proveedor, factura u origen' : tipo === 'salida' ? 'Uso o práctica' : 'Motivo'}
          <textarea rows={2} value={f.motivo} onChange={campo('motivo')} required={tipo === 'perdida' || tipo === 'ajuste'} />
        </label>
        {error && <p className="aviso aviso-error">{error}</p>}
        <div className="fila-botones">
          <button className="btn btn-primario" disabled={tipo === 'salida' && articulo.especial && !esAdmin}>Registrar</button>
          <button type="button" className="btn" onClick={alCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, mensajeError } from '../../supabase';
import { Aviso } from '../../componentes';
import { hoyISO } from '../../util';
import { CATEGORIAS, PICTOGRAMAS, TIPOS_ARTICULO, UNIDADES } from './comun';

const VACIO = {
  nombre: '', codigo: '', categoria: '', tipo: 'consumible', unidad: '', stock_minimo: '0', ubicacion: '',
  especial: false, recuperable: false, pictogramas: [], hoja_seguridad_url: '',
};

export default function FormArticulo() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [f, setF] = useState(id ? null : VACIO);
  const [inicial, setInicial] = useState({ cantidad: '', lote: '', caducidad: '' });
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from('articulos').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) return setMensaje({ tipo: 'error', texto: mensajeError(error) });
      const g = { ...VACIO };
      Object.keys(VACIO).forEach((k) => { g[k] = data[k] ?? VACIO[k]; });
      g.stock_minimo = String(Number(data.stock_minimo));
      setF(g);
    });
  }, [id]);

  if (!f) return <><Aviso mensaje={mensaje} /><p className="tenue">Cargando…</p></>;
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const alternarPictograma = (p) => setF({ ...f, pictogramas: f.pictogramas.includes(p) ? f.pictogramas.filter((x) => x !== p) : [...f.pictogramas, p] });

  async function guardar(e) {
    e.preventDefault();
    setOcupado(true); setMensaje(null);
    const fila = {
      ...f, nombre: f.nombre.trim(), codigo: f.codigo.trim() || null, categoria: f.categoria.trim() || null,
      unidad: f.unidad.trim(), ubicacion: f.ubicacion.trim() || null, hoja_seguridad_url: f.hoja_seguridad_url.trim() || null,
      stock_minimo: Number(f.stock_minimo || 0),
    };
    const r = id
      ? await supabase.from('articulos').update(fila).eq('id', id).select('id').single()
      : await supabase.from('articulos').insert(fila).select('id').single();
    if (r.error) { setOcupado(false); return setMensaje({ tipo: 'error', texto: mensajeError(r.error) }); }
    // Existencia inicial como primera entrada (queda en el historial de movimientos)
    if (!id && Number(inicial.cantidad) > 0) {
      const { error } = await supabase.from('movimientos_inventario').insert({
        articulo_id: r.data.id, tipo: 'entrada', cantidad: Number(inicial.cantidad), motivo: 'Existencia inicial',
        lote: inicial.lote.trim() || null, caducidad: inicial.caducidad || null,
      });
      if (error) { setOcupado(false); return setMensaje({ tipo: 'error', texto: `El artículo se creó, pero la existencia inicial no: ${mensajeError(error)}` }); }
    }
    navegar(`/inventario/articulo/${r.data.id}`);
  }

  return (
    <>
      <p><Link to={id ? `/inventario/articulo/${id}` : '/inventario/articulos'} className="volver">← {id ? 'Volver al artículo' : 'Volver al inventario'}</Link></p>
      <h1>{id ? 'Editar artículo' : 'Nuevo artículo'}</h1>
      <Aviso mensaje={mensaje} />
      <form className="formulario formulario-ancho" onSubmit={guardar}>
        <section className="tarjeta formulario">
          <h2>Identificación</h2>
          <div className="fila-campos">
            <label>Nombre<input value={f.nombre} onChange={campo('nombre')} placeholder="Ej. Etanol absoluto" required /></label>
            <label>Código (opcional)<input value={f.codigo} onChange={campo('codigo')} placeholder="Ej. RE-ETOH" /></label>
          </div>
          <div className="fila-campos fila-3">
            <label>Categoría
              <input list="categorias" value={f.categoria} onChange={campo('categoria')} />
              <datalist id="categorias">{CATEGORIAS.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label>Unidad
              <input list="unidades" value={f.unidad} onChange={campo('unidad')} placeholder="pieza, g, mL…" required />
              <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
            </label>
            <label>Ubicación<input value={f.ubicacion} onChange={campo('ubicacion')} placeholder="Ej. Anaquel A-3" /></label>
          </div>
          <fieldset>
            <legend>Tipo</legend>
            <label className="casilla"><input type="radio" checked={f.tipo === 'consumible'} onChange={() => setF({ ...f, tipo: 'consumible' })} />
              {TIPOS_ARTICULO.consumible}: se gasta (reactivos, disolventes); se entrega como salida.</label>
            <label className="casilla"><input type="radio" checked={f.tipo === 'retornable'} onChange={() => setF({ ...f, tipo: 'retornable' })} />
              {TIPOS_ARTICULO.retornable}: se devuelve (cristalería, utensilios); se entrega como préstamo.</label>
          </fieldset>
          <label className="angosto-ancho">Existencia mínima (aviso de reposición)
            <input type="number" min="0" step="any" value={f.stock_minimo} onChange={campo('stock_minimo')} />
          </label>
        </section>

        <section className="tarjeta formulario">
          <h2>Seguridad</h2>
          <label className="casilla"><input type="checkbox" checked={f.especial} onChange={campo('especial')} />
            Reactivo especial: su salida requiere autorización del Administrador (Art. 28)</label>
          <label className="casilla"><input type="checkbox" checked={f.recuperable} onChange={campo('recuperable')} />
            Recuperable: el residuo se recupera o se dispone por separado (Art. 29)</label>
          <fieldset>
            <legend>Pictogramas de peligro (NOM-018-STPS-2015)</legend>
            <div className="rejilla-casillas">
              {Object.entries(PICTOGRAMAS).map(([k, v]) => (
                <label key={k} className="casilla"><input type="checkbox" checked={f.pictogramas.includes(k)} onChange={() => alternarPictograma(k)} />{v}</label>
              ))}
            </div>
          </fieldset>
          <label>Enlace a la hoja de datos de seguridad
            <input type="url" value={f.hoja_seguridad_url} onChange={campo('hoja_seguridad_url')} placeholder="https://…" />
          </label>
        </section>

        {!id && (
          <section className="tarjeta formulario">
            <h2>Existencia inicial (opcional)</h2>
            <div className="fila-campos fila-3">
              <label>Cantidad{f.unidad && ` (${f.unidad})`}<input type="number" min="0" step="any" value={inicial.cantidad}
                onChange={(e) => setInicial({ ...inicial, cantidad: e.target.value })} /></label>
              <label>Lote<input value={inicial.lote} onChange={(e) => setInicial({ ...inicial, lote: e.target.value })} /></label>
              <label>Caducidad<input type="date" min={hoyISO()} value={inicial.caducidad}
                onChange={(e) => setInicial({ ...inicial, caducidad: e.target.value })} /></label>
            </div>
            <p className="tenue nota">Se registra como la primera entrada del artículo. Después, la existencia solo cambia con movimientos.</p>
          </section>
        )}

        <div className="fila-botones">
          <button className="btn btn-primario" disabled={ocupado}>{id ? 'Guardar cambios' : 'Registrar artículo'}</button>
          <Link className="btn" to={id ? `/inventario/articulo/${id}` : '/inventario/articulos'}>Cancelar</Link>
        </div>
      </form>
    </>
  );
}

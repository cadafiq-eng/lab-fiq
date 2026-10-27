import { useMemo, useState } from 'react';
import { useSesion } from '../../auth';
import { normalizar } from '../../util';
import { CAPITULOS, PUBLICOS } from './contenido';

const base = import.meta.env.BASE_URL;

function textoDe(bloque) {
  if (bloque.p) return bloque.p;
  if (bloque.nota) return bloque.nota;
  if (bloque.pasos) return bloque.pasos.join(' ');
  if (bloque.lista) return bloque.lista.join(' ');
  if (bloque.tabla) return [...bloque.tabla.encabezados, ...bloque.tabla.filas.flat()].join(' ');
  return '';
}

export function Bloque({ b }) {
  if (b.p) return <p>{b.p}</p>;
  if (b.nota) return <p className="ayuda-nota">{b.nota}</p>;
  if (b.pasos) return <ol className="ayuda-pasos">{b.pasos.map((x) => <li key={x}>{x}</li>)}</ol>;
  if (b.lista) return <ul className="ayuda-lista">{b.lista.map((x) => <li key={x}>{x}</li>)}</ul>;
  if (b.tabla) {
    return (
      <div className="tabla-desplazable"><table className="ayuda-tabla">
        <thead><tr>{b.tabla.encabezados.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{b.tabla.filas.map((f) => <tr key={f[0] + f[1]}>{f.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
      </table></div>
    );
  }
  return null;
}

export default function Ayuda() {
  const { esAdmin } = useSesion();
  const [publico, setPublico] = useState('todo');
  const [buscar, setBuscar] = useState('');

  const capitulos = useMemo(() => {
    const q = normalizar(buscar.trim());
    return CAPITULOS
      .map((c) => ({
        ...c,
        secciones: c.secciones.filter((s) => {
          const para = s.para ?? c.para;
          if (publico !== 'todo' && para !== publico && para !== 'todos') return false;
          return !q || normalizar([c.titulo, s.titulo, ...s.bloques.map(textoDe)].join(' ')).includes(q);
        }),
      }))
      .filter((c) => c.secciones.length);
  }, [publico, buscar]);

  return (
    <div className="ayuda">
      <header className="solo-impresion portada-manual">
        <p>Universidad Autónoma de Yucatán · Facultad de Ingeniería Química</p>
        <h1>Manual de uso</h1>
        <h2>Sistema de Gestión Integral del Laboratorio</h2>
        <p>Control de acceso · Equipos · Préstamos · Inventario</p>
      </header>

      <div className="encabezado no-imprimir">
        <h1>Ayuda</h1>
        <a className="btn" href={`${base}manual/manual_laboratorio.pdf`} target="_blank" rel="noreferrer">Manual en PDF</a>
      </div>
      <p className="tenue no-imprimir">Guía breve de cada pantalla. Las reglas que se mencionan las aplica el sistema por sí mismo.</p>

      <div className="filtros no-imprimir">
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar en la ayuda (ej. préstamo externo, contraseña, QR)" />
        <select value={publico} onChange={(e) => setPublico(e.target.value)}>
          <option value="todo">Todas las secciones</option>
          <option value="personal">Personal en turno</option>
          {esAdmin && <option value="admin">Administrador</option>}
          <option value="usuarios">Usuarios del laboratorio (terminal)</option>
        </select>
      </div>

      {capitulos.length === 0 ? <p className="tenue">Nada coincide con la búsqueda.</p> : (
        <>
          <nav className="tarjeta ayuda-indice">
            <h2>Contenido</h2>
            <ol>{capitulos.map((c) => (
              <li key={c.id}><a href={`#/ayuda`} onClick={(e) => { e.preventDefault(); document.getElementById('cap-' + c.id)?.scrollIntoView({ behavior: 'smooth' }); }}>{c.titulo}</a>
                <span className="tenue chico"> · {PUBLICOS[c.para]}</span></li>
            ))}</ol>
          </nav>
          {capitulos.map((c, i) => (
            <section key={c.id} id={'cap-' + c.id} className="tarjeta una-columna ayuda-capitulo">
              <h2>{i + 1}. {c.titulo} <span className="etiqueta etq-gris">{PUBLICOS[c.para]}</span></h2>
              {c.secciones.map((s) => (
                <article key={s.titulo} className="ayuda-seccion">
                  <h3>{s.titulo}{s.para && s.para !== c.para && <span className="etiqueta etq-aviso">{PUBLICOS[s.para]}</span>}</h3>
                  {s.bloques.map((b, j) => <Bloque key={j} b={b} />)}
                </article>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

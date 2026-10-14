// Piezas de interfaz compartidas

export function Aviso({ mensaje }) {
  if (!mensaje) return null;
  return <p className={'aviso ' + (mensaje.tipo === 'ok' ? 'aviso-ok' : 'aviso-error')}>{mensaje.texto}</p>;
}

export function Modal({ titulo, alCerrar, children, ancho }) {
  return (
    <div className="modal-fondo" onClick={alCerrar}>
      <div className={'tarjeta modal' + (ancho ? ' modal-ancho' : '')} onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Etiqueta({ tono = 'gris', children }) {
  return <span className={'etiqueta etq-' + tono}>{children}</span>;
}

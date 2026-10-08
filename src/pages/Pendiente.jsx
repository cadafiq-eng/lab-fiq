export default function Pendiente({ titulo, fase }) {
  return (
    <>
      <h1>{titulo}</h1>
      <div className="tarjeta vacio">
        <p>Este módulo se construye en la fase {fase} del plan de desarrollo.</p>
        <p className="tenue">La base de datos y sus reglas ya están listas; falta la interfaz.</p>
      </div>
    </>
  );
}

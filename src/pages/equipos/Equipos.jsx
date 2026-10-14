import { Navigate, Route, Routes } from 'react-router-dom';
import Catalogo from './Catalogo';
import FormEquipo from './FormEquipo';
import Ficha from './Ficha';
import Mantenimientos from './Mantenimientos';
import Capacitaciones from './Capacitaciones';
import BitacoraUso from './BitacoraUso';
import Etiquetas from './Etiquetas';

export default function Equipos() {
  return (
    <Routes>
      <Route path="catalogo" element={<Catalogo />} />
      <Route path="mantenimientos" element={<Mantenimientos />} />
      <Route path="capacitaciones" element={<Capacitaciones />} />
      <Route path="uso" element={<BitacoraUso />} />
      <Route path="nuevo" element={<FormEquipo />} />
      <Route path="editar/:id" element={<FormEquipo />} />
      <Route path="ficha/:id" element={<Ficha />} />
      <Route path="etiquetas" element={<Etiquetas />} />
      <Route path="*" element={<Navigate to="catalogo" replace />} />
    </Routes>
  );
}

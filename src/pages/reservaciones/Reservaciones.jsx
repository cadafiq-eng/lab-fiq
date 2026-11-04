import { Navigate, Route, Routes } from 'react-router-dom';
import Calendario from './Calendario';
import FormReservacion from './FormReservacion';
import Lista from './Lista';
import Detalle from './Detalle';

export default function Reservaciones() {
  return (
    <Routes>
      <Route path="calendario" element={<Calendario />} />
      <Route path="nueva" element={<FormReservacion key="nueva" />} />
      <Route path="editar/:id" element={<FormReservacion key="editar" />} />
      <Route path="lista" element={<Lista />} />
      <Route path="detalle/:id" element={<Detalle />} />
      <Route path="*" element={<Navigate to="calendario" replace />} />
    </Routes>
  );
}

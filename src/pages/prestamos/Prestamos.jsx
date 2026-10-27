import { Navigate, Route, Routes } from 'react-router-dom';
import Abiertos from './Abiertos';
import NuevoPrestamo from './NuevoPrestamo';
import HistorialPrestamos from './HistorialPrestamos';
import DetallePrestamo from './DetallePrestamo';

export default function Prestamos() {
  return (
    <Routes>
      <Route path="abiertos" element={<Abiertos />} />
      <Route path="nuevo" element={<NuevoPrestamo />} />
      <Route path="historial" element={<HistorialPrestamos />} />
      <Route path="detalle/:id" element={<DetallePrestamo />} />
      <Route path="*" element={<Navigate to="abiertos" replace />} />
    </Routes>
  );
}

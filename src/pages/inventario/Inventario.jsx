import { Navigate, Route, Routes } from 'react-router-dom';
import Articulos from './Articulos';
import FormArticulo from './FormArticulo';
import FichaArticulo from './FichaArticulo';
import Movimientos from './Movimientos';

export default function Inventario() {
  return (
    <Routes>
      <Route path="articulos" element={<Articulos />} />
      <Route path="movimientos" element={<Movimientos />} />
      <Route path="nuevo" element={<FormArticulo />} />
      <Route path="editar/:id" element={<FormArticulo />} />
      <Route path="articulo/:id" element={<FichaArticulo />} />
      <Route path="*" element={<Navigate to="articulos" replace />} />
    </Routes>
  );
}

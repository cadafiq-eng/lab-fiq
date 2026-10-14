import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import Presentes from './Presentes';
import Autorizaciones from './Autorizaciones';
import Historial from './Historial';
import Sanciones from './Sanciones';

export default function Acceso() {
  return (
    <>
      <h1>Control de acceso</h1>
      <nav className="pestanas">
        <NavLink to="/acceso/presentes">Presentes</NavLink>
        <NavLink to="/acceso/autorizaciones">Autorizaciones</NavLink>
        <NavLink to="/acceso/historial">Historial</NavLink>
        <NavLink to="/acceso/sanciones">Sanciones</NavLink>
      </nav>
      <Routes>
        <Route path="presentes" element={<Presentes />} />
        <Route path="autorizaciones" element={<Autorizaciones />} />
        <Route path="historial" element={<Historial />} />
        <Route path="sanciones" element={<Sanciones />} />
        <Route path="*" element={<Navigate to="presentes" replace />} />
      </Routes>
    </>
  );
}

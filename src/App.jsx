import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useSesion } from './auth';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Terminal from './pages/Terminal';
import Personal from './pages/admin/Personal';
import TiposEquipo from './pages/admin/TiposEquipo';
import Configuracion from './pages/admin/Configuracion';
import Pendiente from './pages/Pendiente';

export default function App() {
  const { sesion, perfil, cargando, esPersonal, esTerminal, esAdmin, salir } = useSesion();

  if (cargando) return <div className="centrado"><p className="tenue">Cargando…</p></div>;
  if (!sesion) return <Login />;

  if (perfil?.sinPerfil || !perfil?.activo) {
    return (
      <div className="centrado">
        <div className="tarjeta" style={{ maxWidth: 460 }}>
          <h1>Cuenta sin acceso</h1>
          <p>Esta cuenta no tiene un perfil activo en el sistema. Solicítelo al Administrador del laboratorio.</p>
          <button className="btn" onClick={salir}>Cerrar sesión</button>
        </div>
      </div>
    );
  }

  // La cuenta de terminal solo ve la pantalla de autoservicio
  if (esTerminal && !esPersonal) return <Terminal />;

  return (
    <div className="marco">
      <aside className="lateral">
        <div className="marca">
          <span className="marca-sigla">FIQ</span>
          <span>Laboratorio</span>
        </div>
        <nav>
          <NavLink to="/inicio">Inicio</NavLink>
          <p className="nav-grupo">Operación</p>
          <NavLink to="/acceso">Control de acceso</NavLink>
          <NavLink to="/equipos">Equipos</NavLink>
          <NavLink to="/prestamos">Préstamos</NavLink>
          <NavLink to="/inventario">Inventario</NavLink>
          {esAdmin && (
            <>
              <p className="nav-grupo">Administración</p>
              <NavLink to="/admin/personal">Personal</NavLink>
              <NavLink to="/admin/tipos-equipo">Tipos de equipo</NavLink>
              <NavLink to="/admin/configuracion">Configuración</NavLink>
            </>
          )}
        </nav>
        <div className="usuario">
          <strong>{perfil.nombre}</strong>
          <span className="tenue">{perfil.roles.map(nombreRol).join(' · ')}</span>
          <button className="btn btn-enlace" onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="contenido">
        <Routes>
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/acceso" element={<Pendiente titulo="Control de acceso" fase={2} />} />
          <Route path="/equipos" element={<Pendiente titulo="Equipos" fase={3} />} />
          <Route path="/prestamos" element={<Pendiente titulo="Préstamos" fase={4} />} />
          <Route path="/inventario" element={<Pendiente titulo="Inventario" fase={5} />} />
          {esAdmin && <Route path="/admin/personal" element={<Personal />} />}
          {esAdmin && <Route path="/admin/tipos-equipo" element={<TiposEquipo />} />}
          {esAdmin && <Route path="/admin/configuracion" element={<Configuracion />} />}
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function nombreRol(r) {
  return { admin: 'Administrador', gestor: 'Gestor de Inventarios', terminal: 'Terminal de acceso' }[r] ?? r;
}

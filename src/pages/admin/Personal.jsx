import { useEffect, useState } from 'react';
import { gestionarPersonal } from '../../supabase';
import { useSesion } from '../../auth';
import { nombreRol } from '../../App';

const VACIO = { nombre: '', correo: '', contrasena: '', roles: ['gestor'] };

export default function Personal() {
  const { perfil } = useSesion();
  const [lista, setLista] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = () => gestionarPersonal({ accion: 'listar' })
    .then(setLista).catch((e) => setMensaje({ tipo: 'error', texto: e.message }));
  useEffect(() => { cargar(); }, []);

  async function ejecutar(cuerpo, exito) {
    setOcupado(true); setMensaje(null);
    try {
      await gestionarPersonal(cuerpo);
      setMensaje({ tipo: 'ok', texto: exito });
      await cargar();
      return true;
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message });
      return false;
    } finally { setOcupado(false); }
  }

  async function crear(e) {
    e.preventDefault();
    if (await ejecutar({ accion: 'crear', ...form }, `Cuenta de ${form.nombre} creada.`)) setForm(VACIO);
  }

  function elegirRol(rol) {
    if (rol === 'terminal') return setForm({ ...form, roles: ['terminal'] });
    const sinTerminal = form.roles.filter((r) => r !== 'terminal');
    const roles = sinTerminal.includes(rol) ? sinTerminal.filter((r) => r !== rol) : [...sinTerminal, rol];
    setForm({ ...form, roles });
  }

  function restablecer(p) {
    const nueva = window.prompt(`Nueva contraseña para ${p.nombre} (mínimo 8 caracteres):`);
    if (nueva) ejecutar({ accion: 'contrasena', id: p.id, contrasena: nueva }, 'Contraseña actualizada.');
  }

  return (
    <>
      <h1>Personal</h1>
      <p className="tenue">Cuentas que pueden iniciar sesión. No hay autorregistro: solo el Administrador las crea.</p>
      {mensaje && <p className={'aviso ' + (mensaje.tipo === 'ok' ? 'aviso-ok' : 'aviso-error')}>{mensaje.texto}</p>}

      <div className="dos-columnas dos-columnas-amplia">
        <section className="tarjeta">
          <h2>Cuentas</h2>
          {!lista ? <p className="tenue">Cargando…</p> : (
            <table>
              <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className={p.activo ? '' : 'inactivo'}>
                    <td><strong>{p.nombre}</strong><br /><span className="tenue">{p.correo}</span></td>
                    <td>{p.roles.map(nombreRol).join(', ')}</td>
                    <td><span className={'etiqueta ' + (p.activo ? 'etq-bien' : 'etq-gris')}>{p.activo ? 'Activa' : 'Desactivada'}</span></td>
                    <td className="der acciones">
                      <button className="btn btn-chico" disabled={ocupado} onClick={() => restablecer(p)}>Contraseña</button>
                      {p.id !== perfil.id && (
                        <button className="btn btn-chico" disabled={ocupado}
                          onClick={() => ejecutar({ accion: 'activar', id: p.id, activo: !p.activo },
                            p.activo ? 'Cuenta desactivada.' : 'Cuenta reactivada.')}>
                          {p.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <form className="tarjeta formulario" onSubmit={crear}>
          <h2>Nueva cuenta</h2>
          <label>Nombre completo
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          </label>
          <label>Correo (para iniciar sesión)
            <input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} required />
          </label>
          <label>Contraseña inicial
            <input type="text" minLength={8} value={form.contrasena}
              onChange={(e) => setForm({ ...form, contrasena: e.target.value })} required />
          </label>
          <fieldset>
            <legend>Rol</legend>
            {['admin', 'gestor', 'terminal'].map((r) => (
              <label key={r} className="casilla">
                <input type="checkbox" checked={form.roles.includes(r)} onChange={() => elegirRol(r)} />
                {nombreRol(r)}
              </label>
            ))}
            <p className="tenue nota">La terminal de acceso es la cuenta que se deja abierta en la computadora
              de la entrada; no admite otros roles.</p>
          </fieldset>
          <button className="btn btn-primario" disabled={ocupado || form.roles.length === 0}>Crear cuenta</button>
        </form>
      </div>
    </>
  );
}

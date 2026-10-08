import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ProveedorSesion } from './auth';
import { configurado } from './supabase';
import './styles.css';

const raiz = ReactDOM.createRoot(document.getElementById('root'));

if (!configurado) {
  raiz.render(
    <div className="centrado">
      <div className="tarjeta" style={{ maxWidth: 520 }}>
        <h1>Falta configurar Supabase</h1>
        <p>Defina <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (ver README).</p>
      </div>
    </div>
  );
} else {
  // HashRouter: GitHub Pages no resuelve rutas internas (#/inicio funciona siempre)
  raiz.render(
    <React.StrictMode>
      <HashRouter>
        <ProveedorSesion>
          <App />
        </ProveedorSesion>
      </HashRouter>
    </React.StrictMode>
  );
}

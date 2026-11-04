import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// Solicitudes FIQ pendientes de registrar. Se consulta cada 2 minutos y, si
// aumentan con la app abierta, se muestra un aviso del navegador (si se permitió).
export function usePendientesFIQ(activo) {
  const [n, setN] = useState(0);
  const anterior = useRef(null);
  useEffect(() => {
    if (!activo) return undefined;
    const revisar = async () => {
      const { count, error } = await supabase.from('solicitudes_entrantes')
        .select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
      if (error) return;
      const total = count ?? 0;
      if (anterior.current !== null && total > anterior.current && 'Notification' in window
          && Notification.permission === 'granted') {
        try {
          new Notification('Nueva solicitud FIQ', {
            body: `Hay ${total} solicitud(es) por registrar en el laboratorio.`, tag: 'solicitudes-fiq',
          });
        } catch { /* algunos navegadores solo permiten avisos desde un service worker */ }
      }
      anterior.current = total;
      setN(total);
    };
    revisar();
    const t = setInterval(revisar, 120000);
    const alVolver = () => document.visibilityState === 'visible' && revisar();
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [activo]);
  return n;
}

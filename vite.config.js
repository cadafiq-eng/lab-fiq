import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages publica en https://<usuario>.github.io/lab-fiq/
export default defineConfig({
  plugins: [react()],
  base: '/lab-fiq/',
});

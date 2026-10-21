import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Desktop (Electron) builds load files from disk, so asset paths must be relative.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'desktop' ? './' : '/',
  server: { port: 5173 },
}));

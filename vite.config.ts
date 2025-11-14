import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  define: {
    'import.meta.env.VITE_AUTH_MODE': JSON.stringify(process.env.VITE_AUTH_MODE || 'php'),
  },
});

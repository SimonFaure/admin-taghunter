import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    base: '/',
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      proxy: {
        '/backend': {
          target: env.VITE_BACKEND_PROXY || 'http://admin-taghunter.test',
          changeOrigin: true,
          secure: false,
        },
        '/media': {
          target: env.VITE_BACKEND_PROXY || 'http://admin-taghunter.test',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
          },
        },
      },
    },
    define: {
      'import.meta.env.VITE_AUTH_MODE': JSON.stringify(env.VITE_AUTH_MODE || 'php'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || '/backend/api'),
      'import.meta.env.VITE_MEDIA_BASE_URL': JSON.stringify(env.VITE_MEDIA_BASE_URL || ''),
      'import.meta.env.VITE_DEV_AUTO_LOGIN': JSON.stringify(env.VITE_DEV_AUTO_LOGIN || 'false'),
      'import.meta.env.VITE_DEV_ADMIN_EMAIL': JSON.stringify(env.VITE_DEV_ADMIN_EMAIL || ''),
      'import.meta.env.VITE_DEV_ADMIN_PASSWORD': JSON.stringify(env.VITE_DEV_ADMIN_PASSWORD || ''),
    },
  };
});

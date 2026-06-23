import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    cacheDir: 'node_modules/.vite_final_stable',
    server: {
      port: 3002,
      host: '0.0.0.0',
      strictPort: false,
      allowedHosts: ['208.87.133.212', 'localhost'],
      cors: true,
      hmr: false,
      watch: {
        ignored: [
          '**/datos/**',
          '**/proveedores/**',
          '**/usuarios/**',
          '**/media/**',
          '**/server.log',
          '**/dev.log',
          '**/*.db',
          '**/*.db-shm',
          '**/*.db-wal',
          '**/node_modules/**'
        ]
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3005',
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 120000,
          proxyTimeout: 120000
        }
      },
      // watch: file watching enabled for HMR
    },
    preview: {
      port: 3002,
      host: '0.0.0.0',
      strictPort: true,
      allowedHosts: true,
      cors: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3005',
          changeOrigin: true,
          secure: false,
          ws: true,
          timeout: 120000,
          proxyTimeout: 120000
        }
      }
    },
    optimizeDeps: {
      force: false, // Don't force every time once stable
      include: ['react', 'react-dom', 'lucide-react', 'framer-motion']
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_ODOO_DB': JSON.stringify(env.VITE_ODOO_DB),
      'import.meta.env.VITE_ODOO_USERNAME': JSON.stringify(env.VITE_ODOO_USERNAME),
      'import.meta.env.VITE_ODOO_PASSWORD': JSON.stringify(env.VITE_ODOO_PASSWORD),
      'import.meta.env.VITE_ODOO_SERVER': JSON.stringify(env.VITE_ODOO_SERVER)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});

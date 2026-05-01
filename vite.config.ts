import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.PUBLIC_URL || '/';
  const pkgPath = path.resolve(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  return {
    base,
    define: {
      __GFC_APP_VERSION__: JSON.stringify(pkg.version),
      __GFC_COMING_SOON__: JSON.stringify(env.VITE_COMING_SOON === 'true'),
      __GFC_BETA_MODE__: JSON.stringify(env.VITE_BETA_MODE === 'true'),
      __GFC_BETA_INVITE_PATH__: JSON.stringify(env.VITE_BETA_INVITE_PATH ?? ''),
      __GFC_FIREBASE_API_KEY__: JSON.stringify(env.VITE_FIREBASE_API_KEY ?? ''),
      __GFC_FIREBASE_AUTH_DOMAIN__: JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN ?? ''),
      __GFC_FIREBASE_PROJECT_ID__: JSON.stringify(env.VITE_FIREBASE_PROJECT_ID ?? ''),
      __GFC_FIREBASE_APP_ID__: JSON.stringify(env.VITE_FIREBASE_APP_ID ?? ''),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'build',
      emptyOutDir: true,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3006',
          changeOrigin: false,
        },
      },
    },
  };
});

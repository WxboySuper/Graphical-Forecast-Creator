import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.PUBLIC_URL || '/';

  return {
    base,
    define: {
      __GFC_COMING_SOON__: JSON.stringify(env.VITE_COMING_SOON === 'true'),
      __GFC_FIREBASE_CONFIG__: JSON.stringify({
        apiKey: env.VITE_FIREBASE_API_KEY ?? '',
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
        projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
        appId: env.VITE_FIREBASE_APP_ID ?? '',
      }),
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
    },
  };
});

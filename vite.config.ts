/**
 * Defines the Vite development and production build configuration for GFC.
 * This file owns bundler plugins, aliases, environment loading, and build-time policy; application runtime behavior belongs to src/.
 */
import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { resolveBuildTarget } from './src/config/buildTarget';

/** Vendor chunk families matched by package substrings, in priority order. */
const VENDOR_CHUNK_RULES: Array<{ family: string; markers: string[] }> = [
  { family: 'openlayers', markers: ['node_modules/ol/', 'node_modules/ol-mapbox-style/'] },
  { family: 'turf', markers: ['node_modules/@turf/'] },
  { family: 'firebase', markers: ['node_modules/firebase/', 'node_modules/@firebase/'] },
  { family: 'react', markers: ['node_modules/react/', 'node_modules/react-dom/'] },
  { family: 'redux', markers: ['node_modules/@reduxjs/', 'node_modules/redux/'] },
];

/** Maps an import module id to a named vendor chunk family, or undefined to leave it in the default chunk. */
const vendorChunkFor = (id: string): string | undefined =>
  VENDOR_CHUNK_RULES.find(({ markers }) => markers.some((marker) => id.includes(marker)))?.family;
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildTarget = resolveBuildTarget(env.VITE_BUILD_TARGET);
  if (buildTarget === 'beta' && env.VITE_BETA_AUTH_BACKEND === 'clerk-d1' && !env.VITE_CLERK_PUBLISHABLE_KEY?.trim()) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required for beta Clerk+D1 builds.');
  }
  const base = env.PUBLIC_URL || '/';
  const pkgPath = path.resolve(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const releaseName = `graphical-forecast-creator@${pkg.version}`;
  const uploadSourceMaps = Boolean(
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT
  );
  const sentryPlugins =
    uploadSourceMaps
      ? [
          sentryVitePlugin({
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            authToken: env.SENTRY_AUTH_TOKEN,
            release: { name: releaseName },
            // Local sourcemaps are deliberately NOT deleted here. The
            // verify-sentry-sourcemaps script confirms publication against the
            // Sentry API first, then deletes maps only on verified success so a
            // failed upload preserves recovery artifacts and fails the deploy.
            sourcemaps: {
              assets: ['**/*.js', '**/*.map'],
            },
          }),
        ]
      : [];

  return {
    base,
    define: {
      __GFC_APP_VERSION__: JSON.stringify(pkg.version),
      __GFC_BUILD_TARGET__: JSON.stringify(buildTarget),
      __GFC_FEEDBACK_API_URL__: JSON.stringify(env.VITE_FEEDBACK_API_URL ?? 'https://feedback.gfcweather.com'),
      __MESOSCALE_WORKER_URLS__: JSON.stringify({
        local: env.VITE_MESOSCALE_WORKER_URL_LOCAL || env.VITE_MESOSCALE_WORKER_URL || '',
        beta: env.VITE_MESOSCALE_WORKER_URL_BETA || env.VITE_MESOSCALE_WORKER_URL || '',
        staging: env.VITE_MESOSCALE_WORKER_URL_STAGING || env.VITE_MESOSCALE_WORKER_URL || '',
        production: env.VITE_MESOSCALE_WORKER_URL_PRODUCTION || env.VITE_MESOSCALE_WORKER_URL || '',
      }),
      __MESOSCALE_FIXTURES__: JSON.stringify(env.VITE_MESOSCALE_FIXTURES === 'true'),
      __MESOSCALE_DEMO__: JSON.stringify(env.VITE_MESOSCALE_DEMO === 'true' && buildTarget === 'local'),
      __GFC_DEV_MODE__: JSON.stringify(mode === 'development'),
      __GFC_FIREBASE_API_KEY__: JSON.stringify(env.VITE_FIREBASE_API_KEY ?? ''),
      __GFC_FIREBASE_AUTH_DOMAIN__: JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN ?? ''),
      __GFC_FIREBASE_PROJECT_ID__: JSON.stringify(env.VITE_FIREBASE_PROJECT_ID ?? ''),
      __GFC_FIREBASE_APP_ID__: JSON.stringify(env.VITE_FIREBASE_APP_ID ?? ''),
      __GFC_BETA_CLERK_D1__: JSON.stringify(buildTarget === 'beta' && env.VITE_BETA_AUTH_BACKEND === 'clerk-d1'),
      __GFC_CLERK_PUBLISHABLE_KEY__: JSON.stringify(env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? ''),
      __GFC_SENTRY_DSN__: JSON.stringify(env.VITE_SENTRY_DSN ?? ''),
      __GFC_SENTRY_ENVIRONMENT__: JSON.stringify(env.VITE_SENTRY_ENVIRONMENT ?? ''),
      __GFC_TELEMETRY_BASE_URL__: JSON.stringify(env.VITE_TELEMETRY_BASE_URL ?? ''),
    },
    plugins: [
      react(),
      {
        name: 'gfc-emit-version-json',
        closeBundle() {
          const outPath = path.resolve(__dirname, 'build', 'version.json');
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, `${JSON.stringify({ version: pkg.version })}\n`);
        },
      },
      ...sentryPlugins,
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'build',
      emptyOutDir: true,
      sourcemap: uploadSourceMaps ? 'hidden' : false,
      // Separate the heaviest third-party families into their own chunks so the
      // application shell stays independent of map/editor and utility bundles.
      rollupOptions: {
        output: {
          manualChunks: (id: string) => vendorChunkFor(id),
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3006',
          changeOrigin: false,
          // E2E runs have no API server on 3006; keep the same 500 response but skip the per-request ECONNREFUSED log spam.
          configure: env.GFC_E2E_QUIET_PROXY === '1'
            ? (proxy) => {
                proxy.on('error', (_err, _req, res) => {
                  // Websocket upgrades pass a raw socket (or nothing) instead of a ServerResponse.
                  if (!res) return;
                  if (!('writeHead' in res)) {
                    res.destroy();
                    return;
                  }
                  if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
                  res.end('API unavailable in e2e');
                });
                // Vite registers its own logging 'error' listener right after configure(); ignore that one.
                const registerListener = proxy.on.bind(proxy);
                proxy.on = ((event: string, listener: (...args: unknown[]) => void) => (event === 'error' ? proxy : registerListener(event, listener))) as typeof proxy.on;
              }
            : undefined,
        },
      },
    },
  };
});

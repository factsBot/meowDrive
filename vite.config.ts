import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const target = process.env.MEOW_TARGET ?? 'electron';
const isWeb = target === 'web';
const base = process.env.MEOW_BASE ?? (isWeb ? '/meowDrive/' : './');

export default defineConfig({
  base,
  plugins: [
    react(),
    ...(isWeb
      ? []
      : [
          electron({
            main: {
              entry: 'electron/main.ts',
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: {
                    external: ['better-sqlite3', 'electron'],
                  },
                },
              },
            },
            preload: {
              input: path.join(__dirname, 'electron/preload.ts'),
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: {
                    external: ['electron'],
                  },
                },
              },
            },
            renderer: {},
          }),
        ]),
    ...(isWeb
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
              name: 'meowDrive',
              short_name: 'meowDrive',
              description:
                'Local-first time capture for Deltek Vision timesheets',
              theme_color: '#0f1115',
              background_color: '#0f1115',
              display: 'standalone',
              start_url: base,
              scope: base,
              icons: [
                {
                  src: 'favicon.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                  purpose: 'any maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
              navigateFallback: base + 'index.html',
            },
          }),
        ]
      : []),
  ],
  build: {
    outDir: 'dist',
    rollupOptions: isWeb
      ? undefined
      : {
          input: {
            main: path.join(__dirname, 'index.html'),
            quicklog: path.join(__dirname, 'quicklog.html'),
          },
        },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});

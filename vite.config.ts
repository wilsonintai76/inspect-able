import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { cloudflare } from "@cloudflare/vite-plugin";

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

export default defineConfig((configEnv) => {
    const { mode, ssrBuild } = configEnv as any;
    const env = loadEnv(mode, '.', '');
    const isSSR = ssrBuild || process.env.VITE_SSR_BUILD === 'true';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      build: {
        // Output worker to 'dist' and client to 'dist/client' to avoid conflicts
        outDir: isSSR ? 'dist' : 'dist/client',
        emptyOutDir: false,
        rollupOptions: isSSR ? {} : {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            kiosk: path.resolve(__dirname, 'kiosk.html'),
          },
        },
      },
      plugins: [
        react(), 
        tailwindcss(), 
        isSSR ? cloudflare() : null,
        {
          name: 'dev-kiosk-rewrite',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.headers.host && req.headers.host.startsWith('kiosk.') && (req.url === '/' || req.url === '/index.html')) {
                req.url = '/kiosk.html';
              }
              next();
            });
          }
        },
        {
          name: 'generate-version-json',
          buildStart() {
            const versionData = JSON.stringify({ 
              version: packageJson.version,
              buildTime: new Date().toISOString()
            }, null, 2);
            
            if (!fs.existsSync('public')) {
              fs.mkdirSync('public', { recursive: true });
            }
            fs.writeFileSync('public/version.json', versionData);
          },
          closeBundle() {
            const clientDist = path.resolve(__dirname, 'dist/client');
            if (fs.existsSync(clientDist)) {
              const versionData = { 
                version: packageJson.version,
                buildTime: new Date().toISOString()
              };
              fs.writeFileSync(path.join(clientDist, 'version.json'), JSON.stringify(versionData, null, 2));
              console.log('✅ Generated version.json in dist/client/');
            }
          }
        }
      ].filter(Boolean),
      define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src/client'),
          '@shared': path.resolve(__dirname, './src/shared'),
        }
      }
    };
});
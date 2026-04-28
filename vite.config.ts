import { reactRouter } from '@react-router/dev/vite';
import { cloudflareDevProxy } from '@react-router/dev/vite/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: { port: parseInt(env.PORT ?? '', 10) || 6712 },
    ssr: {
      resolve: {
        conditions: ['workerd', 'worker', 'browser'],
      },
      noExternal: [],
      external: ['leaflet', 'leaflet.markercluster', 'react-leaflet', 'react-leaflet-cluster'],
    },
    esbuild: {
      keepNames: false,
    },
    plugins: [cloudflareDevProxy(), reactRouter(), tailwindcss(), tsconfigPaths()],
  };
});

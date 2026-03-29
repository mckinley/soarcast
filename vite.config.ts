import { reactRouter } from '@react-router/dev/vite';
import { cloudflareDevProxy } from '@react-router/dev/vite/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
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
});

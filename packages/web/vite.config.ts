import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    // The UI talks only to the OpenBurn server; the server talks to the laser.
    proxy: {
      '/api': 'http://localhost:8321',
      '/ws': { target: 'ws://localhost:8321', ws: true },
    },
  },
});

import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: '0.0.0.0', // Exposes your dev server to the network
    port: 3000, // Set a port, or change it as needed
    open: true, // Opens the browser automatically
    https: true, // Explicitly enable HTTPS
  },
  publicDir: 'public', // Ensure public directory is served correctly
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER = process.env.VITE_DEV_SERVER_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on the LAN so phones on the same Wi-Fi can join during local testing.
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: SERVER, ws: true },
    },
  },
});

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  plugins: [
    tanstackStart(),
  ],
});

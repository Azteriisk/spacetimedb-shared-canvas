import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { nitro } from 'nitro/vite';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    nitro({
      preset: 'vercel',
    }),
  ],
});

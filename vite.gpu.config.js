import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(root, 'game-gpu'),
  base: './',
  publicDir: path.resolve(root, 'public'),
  build: {
    outDir: path.resolve(root, 'dist/game-gpu'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
  resolve: {
    alias: [
      {
        find: /^three$/,
        replacement: path.resolve(root, 'node_modules/three/build/three.webgpu.js'),
      },
    ],
  },
});

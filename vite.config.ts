import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.fbx', '**/*.bvh'],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
  },
});

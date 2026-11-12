import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the built site works from any static-host sub-path (or opened from a folder).
  base: './',
  plugins: [react()],
});

import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

const alias = { '@shared': resolve('src/shared') };

/** Production builds get a strict Content-Security-Policy; dev needs inline scripts for HMR. */
function cspPlugin(): Plugin {
  const policy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'";
  return {
    name: 'tbh-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig({
  main: { resolve: { alias } },
  preload: { resolve: { alias } },
  renderer: { resolve: { alias }, plugins: [react(), cspPlugin()] },
});

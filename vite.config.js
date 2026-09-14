import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Two targets from one source:
//   default (`npm run build`)     -> dist/, normal chunked assets, served by Vercel
//   `--mode gas` (`build:gas`)    -> dist-gas/, everything inlined into one HTML
//                                    file, because Apps Script's HtmlService can
//                                    only serve a single file.
export default defineConfig(({ mode }) => {
  const gas = mode === 'gas'
  return {
    plugins: [svelte(), ...(gas ? [viteSingleFile()] : [])],
    build: { outDir: gas ? 'dist-gas' : 'dist' },
  }
})

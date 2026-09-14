import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Apps Script's HtmlService serves a single HTML file, so all JS and CSS is inlined.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
})

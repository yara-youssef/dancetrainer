import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// Phones only allow camera access over HTTPS. `npm run cert` creates a local
// self-signed certificate; when it exists the dev server uses it.
const certDir = fileURLToPath(new URL('./.cert', import.meta.url))
const https = existsSync(`${certDir}/key.pem`)
  ? { key: readFileSync(`${certDir}/key.pem`), cert: readFileSync(`${certDir}/cert.pem`) }
  : undefined

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; set BASE_PATH there.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    vue(),
    vueDevTools(),
  ],
  server: { https },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

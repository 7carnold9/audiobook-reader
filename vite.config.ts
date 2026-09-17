import { createRequire } from 'node:module'
import { cpSync, createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'))
const PDFJS_ASSET_FOLDERS = ['standard_fonts', 'cmaps']

/**
 * pdf.js loads the standard 14 font metrics and the CJK character maps from
 * separate files at runtime. Without them, documents that rely on non-embedded
 * or CJK fonts extract badly (or not at all), so they are served in dev and
 * copied into the build.
 */
function pdfjsAssets(): Plugin {
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      for (const folder of PDFJS_ASSET_FOLDERS) {
        const root = path.join(pdfjsRoot, folder)
        server.middlewares.use(`/${folder}`, (request, response, next) => {
          const requested = (request.url ?? '').split('?')[0]
          const file = path.join(root, path.normalize(requested).replace(/^[/\\]+/, ''))
          if (!file.startsWith(root) || !existsSync(file)) return next()
          response.setHeader('Content-Type', 'application/octet-stream')
          createReadStream(file).pipe(response)
        })
      }
    },
    closeBundle() {
      for (const folder of PDFJS_ASSET_FOLDERS) {
        cpSync(path.join(pdfjsRoot, folder), path.join('dist', folder), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  // pdf.js is shipped as pre-bundled ESM with a separate worker; pre-bundling it
  // in dev rewrites the worker import and breaks text extraction.
  optimizeDeps: { exclude: ['pdfjs-dist'] },
})

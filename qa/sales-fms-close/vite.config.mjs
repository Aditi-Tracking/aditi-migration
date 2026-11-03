// Dev-only Vite config for the Sales FMS close regression page (qa/sales-fms-close). It serves fms.html from THIS folder and borrows the app's own plugins,
// React copy and source tree (../../src), so the real components run unmodified. Never used by `npm run build` (that builds the repo root only).
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const mod = (...p) => pathToFileURL(path.join(REPO, 'node_modules', ...p)).href
const react = (await import(mod('@vitejs', 'plugin-react', 'dist', 'index.js'))).default
const tailwindcss = (await import(mod('@tailwindcss', 'vite', 'dist', 'index.mjs'))).default
const nm = (...p) => path.join(REPO, 'node_modules', ...p)

export default {
  root: HERE,
  plugins: [react(), tailwindcss()],
  // supabaseClient.js reads these at import time; the fake data layer (fms.jsx) answers every request, nothing leaves the machine
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"http://rb.test"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"anon-test-key"' },
  server: { port: 5299, fs: { strict: false } },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      // the real AuthContext needs the whole login flow: the pages under test only need "who is signed in"
      { find: /^(\.\.?\/)+context\/AuthContext(\.jsx)?$|^\.\/AuthContext(\.jsx)?$/, replacement: path.join(HERE, 'authstub.jsx') },
      { find: /^react-dom\/client$/, replacement: nm('react-dom', 'client.js') },
      { find: /^react-dom$/, replacement: nm('react-dom', 'index.js') },
      { find: /^react$/, replacement: nm('react', 'index.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: nm('react', 'jsx-dev-runtime.js') },
      { find: /^react\/jsx-runtime$/, replacement: nm('react', 'jsx-runtime.js') },
    ],
  },
}

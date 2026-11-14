// Dev-only harness for the Field Sales Visit Form . Serves visit.html from THIS folder, borrows the app's own plugins/React/source, and replaces the real
// AuthContext. Every request goes to a fake backend in visit.jsx (host rb.test); nothing leaves the machine.
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
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"http://rb.test"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"anon-test-key"' },
  server: { port: 5311, fs: { strict: false }, hmr: false, watch: null },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^(\.\.?\/)+context\/AuthContext(\.jsx)?$|^\.\/AuthContext(\.jsx)?$/, replacement: path.join(HERE, 'authstub.jsx') },
      { find: /^react-dom\/client$/, replacement: nm('react-dom', 'client.js') },
      { find: /^react-dom$/, replacement: nm('react-dom', 'index.js') },
      { find: /^react$/, replacement: nm('react', 'index.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: nm('react', 'jsx-dev-runtime.js') },
      { find: /^react\/jsx-runtime$/, replacement: nm('react', 'jsx-runtime.js') },
    ],
  },
}

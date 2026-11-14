// Stand-in for src/context/AuthContext (aliased in vite.config.mjs): the pages under test only need "who is signed in".
/* eslint-disable react-refresh/only-export-components -- a test stub exporting a hook and a provider together, never hot-reloaded */
export const useAuth = () => ({ permissions: {}, currentUser: { email: 'admin@rb.test', rawRole: 'mis', role: 'mis', name: 'admin' } })
export const AuthProvider = ({ children }) => children
